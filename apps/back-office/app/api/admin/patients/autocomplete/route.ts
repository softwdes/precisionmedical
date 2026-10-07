/**
 * Autocomplete de pacientes — para elegir el padre/apoderado de un menor en B.2.
 *
 * GET /api/admin/patients/autocomplete?q=...&excludeId=<id>
 *
 * Se separa de `/api/admin/patients/search` a propósito: ese endpoint alimenta
 * el PreCall y NO devuelve `dateOfBirth`, que acá es indispensable por dos
 * razones —
 *   1. autocompletar los campos del apoderado al seleccionarlo, y
 *   2. mostrar su edad, porque un apoderado menor de edad no puede firmar
 *      consentimientos y el UI lo tiene que marcar antes de que se elija.
 *
 * `excludeId` saca al propio paciente de los resultados: nadie es su propio
 * apoderado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, calcAge, isMinor as esMenor } from '@precision-medical/database';
import { telefonoDe } from '@/lib/telefono-paciente';
import { checkPatientStaff, alcanceDePacientes } from '@/lib/patient-access';
import { separarFecha, clausulasDeFecha } from '@/lib/fecha-buscada';
import { idsPorTelefono } from '@/lib/telefono-buscado';

function fullNameOR(q: string) {
  const parts = q.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [];
  const first = parts[0]!, last = parts[parts.length - 1]!;
  return [
    { firstName: { contains: first, mode: 'insensitive' as const }, lastName: { contains: last, mode: 'insensitive' as const } },
    { firstName: { contains: last,  mode: 'insensitive' as const }, lastName: { contains: first, mode: 'insensitive' as const } },
  ];
}

/**
 * El filtro del término, con la FECHA DE NACIMIENTO separada del texto.
 *
 * Acá pesa más que en otros buscadores: de este endpoint sale el apoderado de
 * un menor, y lo que distingue a dos personas con el mismo apellido es
 * justamente la fecha. La fecha va en `AND` —acota— y el resto del texto en el
 * `OR` de siempre. Ver `lib/fecha-buscada.ts`.
 */
async function filtroDelTermino(q: string) {
  const { fechas, resto } = separarFecha(q);
  const porFecha = fechas.length ? [{ OR: clausulasDeFecha(fechas) }] : [];

  // Sólo la fecha: no queda texto que buscar.
  if (porFecha.length && !resto) return { AND: porFecha };

  // El teléfono, comparado por dígitos — ver `lib/telefono-buscado.ts`.
  const idsTelefono = await idsPorTelefono(resto);

  return {
    AND: [
      ...porFecha,
      {
        OR: [
          ...fullNameOR(resto),
          { firstName:   { contains: resto, mode: 'insensitive' as const } },
          { lastName:    { contains: resto, mode: 'insensitive' as const } },
          { phone:       { contains: resto } },
          { phone2:      { contains: resto } },
          { email:       { contains: resto, mode: 'insensitive' as const } },
          { patientCode: { contains: resto, mode: 'insensitive' as const } },
          ...(idsTelefono.length ? [{ id: { in: idsTelefono } }] : []),
        ],
      },
    ],
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const excludeId = searchParams.get('excludeId');
  /**
   * `allowEmpty=1` devuelve los pacientes más recientes cuando todavía no se
   * escribió nada — así el campo muestra opciones al abrirse en vez de un
   * vacío. Es OPT-IN a propósito: el selector de tutor legal usa este mismo
   * endpoint y ahí sí conviene exigir búsqueda (nadie elige un apoderado de
   * una lista arbitraria).
   */
  const allowEmpty = searchParams.get('allowEmpty') === '1';
  /**
   * `canal=sms` agrega los dos datos que hacen falta para MANDAR un SMS y que
   * ninguna otra pantalla necesita: a qué número saldría de verdad, y si esa
   * persona se dio de baja.
   *
   * Es OPT-IN para no cambiarle la respuesta al selector de apoderados ni al
   * compositor del portal, que usan este mismo endpoint. Y va acá en vez de en
   * un buscador nuevo a propósito: ya hay dos (`search` y este), y un tercero
   * sería una tercera forma de encontrar al mismo paciente, lista para
   * divergir.
   */
  const paraSms = searchParams.get('canal') === 'sms';

  const acceso = await checkPatientStaff();
  if (acceso.deny) return acceso.deny;
  const { portalOnly } = acceso.actor;

  if (q.length < 2 && !allowEmpty) {
    return NextResponse.json({ results: [] });
  }

  /**
   * `allowEmpty` sin término devuelve "los más recientes", y el compositor de
   * mensajes del portal médico lo usa: al abrirlo, un provider recibía ocho
   * pacientes de la clínica —con teléfono y correo en el subtítulo— sin haber
   * buscado a nadie. Buscar POR NOMBRE sigue viendo todo (así puede agendar a
   * quien le derivan), pero la lista que aparece sola es la SUYA.
   */
  const alcance = !q && portalOnly ? await alcanceDePacientes('1') : null;
  if (alcance && !alcance.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const recorte = alcance?.ok && alcance.providerId
    ? { appointments: { some: { providerId: alcance.providerId } } }
    : {};

  const patients = await db.patient.findMany({
    where: {
      ...recorte,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      // Sin término de búsqueda no hay filtro: son "los más recientes".
      ...(q.length > 0 ? await filtroDelTermino(q) : {}),
    },
    take: 8,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, patientCode: true, firstName: true, lastName: true,
      phone: true, phone2: true, email: true, dateOfBirth: true,
      addressLine1: true, addressCity: true, addressState: true, addressZip: true,
      // Mensajería interna: un mensaje siempre pertenece a un caso, así que un
      // paciente sin casos no es elegible. Se muestra igual, pero bloqueado.
      _count: { select: { cases: { where: { deletedAt: null } } } },
      // Igual que en `/search`: sin esto el llamador no puede distinguir a un
      // paciente dado de baja de uno activo.
      status: true,
      /**
       * El teléfono del APODERADO. A un menor el SMS NO le llega a él: la ruta
       * de envío manda a la ficha del apoderado. Sin esto la pantalla mostraría
       * un número y el mensaje saldría a otro.
       */
      ...(paraSms ? { guardianPatient: { select: { phone: true, phone2: true, firstName: true, lastName: true } } } : {}),
    },
  });

  /**
   * Quién se dio de baja, en UNA consulta para todos los resultados.
   *
   * El 21610 es el código de Twilio para "este número mandó STOP". Hoy no hay
   * ninguno (medido 2026-10-06), pero el día que aparezca tiene que verse
   * ANTES de escribir: enterarse después de redactar es el caso que esta
   * pantalla viene a evitar.
   */
  const numerosDeBaja = new Map<string, Date>();
  if (paraSms) {
    const destinos = patients
      // Mismo criterio que arriba: el resolvedor compartido, no una copia.
      .map((p) => {
        const g = (p as { guardianPatient?: { phone: string | null; phone2?: string | null } | null }).guardianPatient;
        return telefonoDe(g) ?? telefonoDe(p);
      })
      .filter((t): t is string => !!t && t.trim() !== '');
    if (destinos.length > 0) {
      const bajas = await db.messageLog.findMany({
        where: { errorCode: 21610, toAddress: { in: destinos } },
        select: { toAddress: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      for (const b of bajas) if (!numerosDeBaja.has(b.toAddress)) numerosDeBaja.set(b.toAddress, b.createdAt);
    }
  }

  return NextResponse.json({
    results: patients.map((p) => {
      const age = calcAge(p.dateOfBirth);
      return {
        id:       p.id,
        // `label` y `subtitle` son el contrato que espera el <Autocomplete>
        label:    `${p.firstName} ${p.lastName}`.trim(),
        subtitle: [p.patientCode, p.phone ?? p.phone2, p.email].filter(Boolean).join(' · '),
        // Campos extra para autocompletar el formulario del apoderado
        patientCode:  p.patientCode,
        firstName:    p.firstName,
        lastName:     p.lastName,
        phone:        p.phone ?? p.phone2 ?? '',
        email:        p.email ?? '',
        // ISO corto (YYYY-MM-DD) para que entre directo en un <input type="date">
        dateOfBirth:  p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : '',
        /**
         * El domicilio viaja solo para el formulario del APODERADO, que es una
         * pantalla de mostrador (alta de caso y edición de la ficha). El portal
         * médico usa este mismo endpoint para elegir destinatario en el
         * compositor de mensajes, donde la dirección no se muestra ni se usa:
         * no hay por qué mandarla.
         */
        addressLine1: portalOnly ? '' : p.addressLine1 ?? '',
        addressCity:  portalOnly ? '' : p.addressCity ?? '',
        addressState: portalOnly ? '' : p.addressState ?? '',
        addressZip:   portalOnly ? '' : p.addressZip ?? '',
        age,
        // El UI usa esto para marcar en rose y bloquear la selección
        isMinor: age !== null && age < 18,
        caseCount: p._count.cases,
        isArchived: p.status === 'INACTIVE',
        ...(paraSms ? (() => {
          const tutor = (p as { guardianPatient?: { phone: string | null; phone2: string | null; firstName: string; lastName: string } | null }).guardianPatient;
          // El menor cobra el teléfono del apoderado, igual que hace el envío.
          const porTutor = esMenor(p.dateOfBirth) && telefonoDe(tutor) ? tutor : null;
          /**
           * El MISMO resolvedor que usa la ruta de envío, no una copia.
           *
           * Acá hubo un ida y vuelta que vale dejar escrito. Primero puse
           * `p.phone ?? p.phone2` y medí contra la regla del envío sobre 3.000
           * fichas: **divergían 1.432**, porque el envío miraba solo `phone`.
           * Lo alineé a `phone` a secas. Después Erick decidió que el envío
           * usara el celular cuando no hay principal, así que la regla de allá
           * cambió — y si esto fuera una copia, volvería a divergir.
           *
           * Por eso ahora los dos llaman a `telefonoDe`. Lo que la pantalla
           * promete no puede salir de una regla paralela a la que manda.
           */
          const destino  = (porTutor ? telefonoDe(porTutor) : telefonoDe(p)) ?? '';
          const baja     = destino ? numerosDeBaja.get(destino) ?? null : null;
          return {
            /** El número al que SALDRÍA el mensaje. Vacío = no se puede mandar. */
            smsPhone: destino,
            /** Cuando el SMS va al apoderado, su nombre, para poder decirlo. */
            smsVia: porTutor ? `${porTutor.firstName} ${porTutor.lastName}`.trim() : null,
            /** Fecha del STOP, o null. */
            smsOptOutSince: baja ? baja.toISOString() : null,
          };
        })() : {}),
      };
    }),
  });
}
