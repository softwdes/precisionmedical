/**
 * F1 — Confirmación de cita · página pública que abre el QR
 *
 * Ruta: /confirmar/[token]
 *
 * El paciente llega a la clínica, recepción le muestra el QR del panel de la
 * cita, él lo escanea, revisa sus datos y FIRMA — antes de pasar a triaje.
 * Reemplaza el `/appointment-sign?token=…` del v2.
 *
 * Server component: valida el token acá y le pasa al cliente solo lo que se
 * muestra. Tres cosas que decide esta página y no el cliente:
 *
 *  · **El token vence y se valida.** No repetir lo de `cases.portalToken`, que
 *    anuncia 24 h y no vence nunca. Es la única puerta a la ficha completa.
 *  · **Los campos migrados vienen cifrados** (`e:…`) — `decryptFieldOrOriginal`
 *    o el paciente ve basura en lugar de su teléfono.
 *  · **La fecha de nacimiento se lee sin zona.** Con `America/Denver` un nacido
 *    el 1-ene sale 31-dic.
 */

import { headers } from 'next/headers';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal } from '@/lib/decrypt';
import { rateLimit, claveDeIp } from '@/lib/rate-limit';
import { ConfirmarClient, type DatosConfirmacion } from './confirm-client';
import { PantallaTokenInvalido } from './estados';

type Props = { params: Promise<{ token: string }> };

export const metadata = {
  title: 'Precision Medical · Confirmación de cita',
};

/**
 * Dirección de la clínica en una línea, sin repetir lo que ya trae `address`.
 *
 * `Clinic.address` de las clínicas cargadas ya viene completo ("75 S 200 E
 * Suite 202, Provo, UT 84606") y además existen las columnas city/state/zipCode
 * con lo mismo. Pegarlas siempre daba "…Provo, UT 84606, Provo, Utah, 84606".
 * El v2 imprime esa duplicación; acá cada parte se agrega solo si falta.
 */
function direccionClinica(c: {
  address: string | null; city: string | null; state: string | null; zipCode: string | null;
}): string | null {
  const base = c.address?.trim() ?? '';

  // El CÓDIGO POSTAL es el corte: si ya está en `address`, la dirección está
  // completa y no hay nada que agregar. Comparar ciudad/estado por texto no
  // alcanza — el address dice "UT" y la columna dice "Utah", así que "Utah"
  // se colaba al final igual.
  if (base && c.zipCode?.trim() && base.includes(c.zipCode.trim())) return base;

  const yaEsta = (v: string | null) =>
    !!v?.trim() && base.toLowerCase().includes(v.trim().toLowerCase());

  const partes = [base, c.city, c.state, c.zipCode]
    .filter((v, i) => !!v?.trim() && (i === 0 || !yaEsta(v)))
    .map(v => v!.trim());

  return partes.length ? partes.join(', ') : null;
}

/**
 * Freno por IP — LOS LÍMITES SON GENEROSOS A PROPÓSITO.
 *
 * Esta página se abre en la clínica: media sala de espera puede estar en el
 * mismo WiFi, o sea detrás de UNA sola IP pública. Un límite pensado para "una
 * persona" bloquearía al octavo paciente real del día.
 *
 * Y el freno acá no es lo que protege el dato: el token es de 192 bits, así que
 * adivinarlo no es un ataque viable ni sin freno. Esto es contra el ruido y
 * contra un script que insista, no la primera línea de defensa.
 */
const FRENO_PAGINA = { max: 60, ventanaMs: 5 * 60_000 };

export default async function ConfirmarCitaPage({ params }: Props) {
  const { token } = await params;

  const freno = rateLimit(claveDeIp(await headers(), 'confirmar'), FRENO_PAGINA);
  if (!freno.ok) return <PantallaTokenInvalido motivo="DEMASIADOS_INTENTOS" />;

  const appt = await db.appointment.findUnique({
    where: { signToken: token },
    select: {
      id:                 true,
      scheduledFor:       true,
      durationMinutes:    true,
      status:             true,
      type:               true,
      notes:              true,
      checkedInAt:        true,
      attendanceSignedAt: true,
      signTokenExpiresAt: true,
      clinic:   { select: { name: true, address: true, city: true, state: true, zipCode: true, phone: true, email: true } },
      provider: { select: { firstName: true, lastName: true, specialty: true } },
      case: {
        select: {
          id: true, caseCode: true, caseType: true, status: true, createdAt: true,
          accidentDate: true, consentsData: true,
          specialty: { select: { name: true, workflowType: true } },
        },
      },
      patient: {
        select: {
          firstName: true, lastName: true, patientCode: true, status: true,
          dateOfBirth: true, phone: true, phone2: true, email: true,
          addressLine1: true, addressCity: true, addressState: true, addressZip: true,
          sex: true, maritalStatus: true, race: true, ethnicity: true,
          preferredLanguage: true, communicationPreference: true,
          preferredPharmacy: true, employer: true,
          emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
          emergency2Name: true, emergency2Phone: true, emergency2Relation: true,
        },
      },
    },
  });

  // Un token que no existe y uno revocado dan el mismo mensaje a propósito: al
  // paciente le sirve igual, y así no se confirma si el link alguna vez existió.
  if (!appt) return <PantallaTokenInvalido motivo="INVALIDO" />;

  if (!appt.signTokenExpiresAt || appt.signTokenExpiresAt <= new Date()) {
    return <PantallaTokenInvalido motivo="VENCIDO" />;
  }

  if (appt.status === 'CANCELLED' || appt.status === 'NO_SHOW') {
    return <PantallaTokenInvalido motivo="CITA_INACTIVA" />;
  }

  const p = appt.patient;
  const consents = (appt.case?.consentsData ?? null) as Record<string, unknown> | null;

  /** Un consentimiento cuenta como aceptado si su llave trae algo veraz. */
  const aceptado = (llave: string): boolean => {
    const v = consents?.[llave];
    if (v == null) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.trim().length > 0 && v !== 'false';
    if (typeof v === 'object') return Object.keys(v as object).length > 0;
    return !!v;
  };

  const datos: DatosConfirmacion = {
    appointmentId: appt.id,
    token,
    expiresAt: appt.signTokenExpiresAt.toISOString(),
    yaFirmada: !!appt.attendanceSignedAt,
    firmadaEl: appt.attendanceSignedAt?.toISOString() ?? null,

    cita: {
      scheduledFor:    appt.scheduledFor.toISOString(),
      durationMinutes: appt.durationMinutes,
      status:          appt.status,
      type:            appt.type,
      notes:           appt.notes,
      ingresoHecho:    !!appt.checkedInAt,
    },

    clinica: {
      nombre:    appt.clinic.name,
      direccion: direccionClinica(appt.clinic),
      telefono:  appt.clinic.phone,
      email:     appt.clinic.email,
    },

    provider: appt.provider
      ? {
          nombre: `${appt.provider.firstName} ${appt.provider.lastName}`.trim(),
          // La especialidad del CASO es la que manda: es la que el calendario
          // pinta en la tarjeta. La del provider es su rubro, no el de esta
          // visita. El v2 imprime "Specialty: N/D" teniéndola en pantalla.
          especialidad: appt.case?.specialty?.name ?? appt.provider.specialty ?? null,
        }
      : null,

    paciente: {
      nombre:      `${p.firstName} ${p.lastName}`.trim(),
      codigo:      p.patientCode,
      estado:      p.status,
      // ISO corto (YYYY-MM-DD): así el cliente no vuelve a pasar por Date con
      // zona. La fecha de nacimiento no tiene hora ni zona.
      nacimiento:  p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
      telefono:    decryptFieldOrOriginal(p.phone),
      movil:       decryptFieldOrOriginal(p.phone2),
      email:       p.email,
      direccion:   decryptFieldOrOriginal(p.addressLine1),
      ciudad:      decryptFieldOrOriginal(p.addressCity),
      estadoUS:    decryptFieldOrOriginal(p.addressState),
      zip:         decryptFieldOrOriginal(p.addressZip),
      sexo:        p.sex,
      estadoCivil: p.maritalStatus,
      raza:        p.race,
      etnia:       p.ethnicity,
      idioma:      p.preferredLanguage,
      contactoPref: p.communicationPreference,
      farmacia:    decryptFieldOrOriginal(p.preferredPharmacy),
      empleador:   decryptFieldOrOriginal(p.employer),
    },

    emergencia: [
      {
        nombre:   decryptFieldOrOriginal(p.emergencyContactName),
        telefono: decryptFieldOrOriginal(p.emergencyContactPhone),
        relacion: decryptFieldOrOriginal(p.emergencyContactRelation),
      },
      {
        nombre:   decryptFieldOrOriginal(p.emergency2Name),
        telefono: decryptFieldOrOriginal(p.emergency2Phone),
        relacion: decryptFieldOrOriginal(p.emergency2Relation),
      },
    ],

    caso: appt.case
      ? {
          codigo:      appt.case.caseCode,
          tipo:        appt.case.specialty?.workflowType ?? (appt.case.caseType === 'GENERAL' ? 'GM' : 'MVA'),
          estado:      appt.case.status,
          creado:      appt.case.createdAt.toISOString(),
          accidenteEl: appt.case.accidentDate?.toISOString() ?? null,
        }
      : null,

    // Los mismos cinco del v2, mapeados a las llaves reales de `consentsData`.
    consentimientos: [
      { llave: 'hipaa',           aceptado: aceptado('hipaa') },
      { llave: 'assignedParties', aceptado: aceptado('assignedParties') },
      { llave: 'treatment',       aceptado: aceptado('treatment') },
      { llave: 'financial',       aceptado: aceptado('financial') },
      { llave: 'medicalHistory',  aceptado: aceptado('medicalHistory') },
    ],
  };

  return <ConfirmarClient datos={datos} />;
}
