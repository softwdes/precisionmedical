/**
 * "Generar orden" — emite la hoja de requisición de un grupo de estudios.
 *
 * GET  ?groupId=…  → estado: si ya se generó, con qué número y qué documento
 * POST             → emite el número, arma el PDF, lo guarda y lo deja en
 *                    Documentos del paciente y del caso (si la cita tiene caso
 *                    — ver el bloque de la fila de documento)
 *
 * El flujo que describió Erick: termina la cita, el doctor y el asistente ven el
 * Resumen, **le consultan al paciente si está de acuerdo con los estudios**, y
 * recién ahí se aprieta el botón. Por eso la requisición no existe antes: hasta
 * ese momento los estudios son un borrador que se edita, y un número emitido
 * para algo que todavía cambia no identifica nada.
 *
 * **No se vuelve a emitir.** Si ya hay requisición para ese grupo, se devuelve
 * la que hay: ese número es lo que casa la muestra con la orden en el
 * laboratorio, y si cambiara, el tubo ya etiquetado dejaría de corresponder.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db, writeAuditLog } from '@precision-medical/database';
import { resolveActor } from '@/lib/actor';
import { checkAppointmentAccess } from '@/lib/appointment-access';
import { npiValido } from '@/lib/npi';
import { configLab, edadDetallada } from '@/lib/lab-config';
import { siguienteNumeroRequisicion, contenidoCodigoBarras } from '@/lib/lab-requisition';
import { construirHojaRequisicion } from '@/lib/lab-order-pdf';
import { construirCargaEreq } from '@/lib/ereq-payload';
import { pdf417Base64 } from '@/lib/pdf417';

type Ctx = { params: Promise<{ appointmentId: string }> };

const SUPABASE_URL = (process.env.SUPABASE_STORAGE_URL
  ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE_KEY = (process.env.SUPABASE_STORAGE_SERVICE_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
const BUCKET = 'case-documents';

const BodySchema = z.object({ groupId: z.string().min(1) });

/** `C` = a la clínica · `X` = al seguro. Ver `lib/ereq-payload.ts`. */
function letraFacturacion(billingType: string | null): 'C' | 'X' {
  return billingType === 'CLIENT' || billingType === null ? 'C' : 'X';
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** `MM/DD/YYYY HHMM`, como lo imprime la hoja de LabCorp. */
function fechaHojaLabCorp(d: Date): string {
  return `${dosDigitos(d.getMonth() + 1)}/${dosDigitos(d.getDate())}/${d.getFullYear()}`
    + ` ${dosDigitos(d.getHours())}${dosDigitos(d.getMinutes())}`;
}

const fechaCorta = (d: Date) =>
  `${dosDigitos(d.getMonth() + 1)}/${dosDigitos(d.getDate())}/${d.getFullYear()}`;

async function estadoDeGrupo(groupId: string) {
  return db.labRequisition.findUnique({
    where: { groupId },
    select: {
      number: true, generatedAt: true, generatedByName: true,
      documentId: true, billingType: true, providerName: true, providerNpi: true,
    },
  });
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  const groupId = req.nextUrl.searchParams.get('groupId');
  if (!groupId) return NextResponse.json({ error: 'MISSING_GROUP' }, { status: 400 });

  return NextResponse.json({ requisicion: await estadoDeGrupo(groupId) });
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;
  const actor = await resolveActor(req.headers);

  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  const { groupId } = body.data;

  // Ya emitida: se devuelve la misma. Idempotente a propósito — dos clics
  // seguidos no pueden producir dos números para el mismo grupo.
  const yaEsta = await estadoDeGrupo(groupId);
  if (yaEsta) return NextResponse.json({ requisicion: yaEsta, yaExistia: true });

  const estudios = await db.labOrder.findMany({
    where: { appointmentId, groupId, status: { not: 'VOIDED' } },
    orderBy: { studyName: 'asc' },
    select: {
      studyCode: true, studyName: true, clinicalIndication: true,
      icd10Codes: true, billingType: true, sampleDate: true,
    },
  });
  if (estudios.length === 0) return NextResponse.json({ error: 'GRUPO_VACIO' }, { status: 404 });

  const cita = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      scheduledFor: true,
      clinic:   { select: { name: true, address: true, city: true, state: true, zipCode: true, phone: true } },
      provider: { select: { id: true, firstName: true, lastName: true, npi: true } },
      patient:  {
        select: {
          id: true, patientCode: true, firstName: true, lastName: true, dateOfBirth: true, sex: true,
          addressLine1: true, addressCity: true, addressState: true, addressZip: true, phone: true,
          socialSecurityNumber: true,
        },
      },
      case: {
        select: {
          id: true,
          // Para el bloque de seguro del codigo. Va SIEMPRE, tambien en las
          // ordenes CLIENT: la hoja lleva el seguro y la letra decide quien paga.
          primaryPolicyNumber: true,
          primaryInsurance: {
            select: { name: true, claimsAddress: true },
          },
        },
      },
    },
  });
  if (!cita?.patient) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  /*
   * SIN NPI VÁLIDO NO SE EMITE.
   *
   * LabCorp identifica la orden por el NPI del prescriptor: una hoja sin él —o
   * con uno inventado— se rechaza o, peor, se procesa contra un prescriptor que
   * no existe. Es mejor frenar acá, con el paciente todavía en el mostrador,
   * que entregarle un papel que el laboratorio va a devolver.
   *
   * Se valida el dígito verificador y no solo que haya texto: en esta misma
   * base había un `9906372145` que tiene diez dígitos y es falso.
   */
  const npi = (cita.provider?.npi ?? '').trim();
  if (!npiValido(npi)) {
    return NextResponse.json({
      error: 'PROVIDER_SIN_NPI',
      providerName: cita.provider ? `${cita.provider.firstName} ${cita.provider.lastName}`.trim() : null,
    }, { status: 409 });
  }

  const cfg = await configLab();
  const numero = await siguienteNumeroRequisicion();
  const ahora = new Date();
  const p = cita.patient;
  const edad = p.dateOfBirth ? edadDetallada(p.dateOfBirth, ahora) : null;

  // La fecha de colección sale del estudio si está cargada; si no, la de ahora.
  const fechaColeccion = estudios.find((e) => e.sampleDate)?.sampleDate ?? ahora;

  const icd10 = [...new Set(estudios.flatMap((e) => e.icd10Codes))];
  const indicacion = estudios.find((e) => e.clinicalIndication?.trim())?.clinicalIndication ?? '';
  const facturacion = letraFacturacion(estudios[0]?.billingType ?? null);

  /*
   * El seguro del caso para el código. `claimsAddress` es un texto libre de una
   * sola línea, así que va entero en el campo de dirección y los de ciudad,
   * estado y ZIP quedan vacios: partirlo por comas seria adivinar donde termina
   * la calle, y una direccion mal partida es peor que una sin partir.
   */
  const seguroDelCaso = cita.case?.primaryInsurance
    ? {
        nombre: cita.case.primaryInsurance.name,
        direccion: cita.case.primaryInsurance.claimsAddress ?? '',
        ciudad: '', estado: '', zip: '',
        poliza: cita.case.primaryPolicyNumber ?? '',
      }
    : undefined;

  /*
   * La CARGA del código: la orden entera en el formato `MEDUSAP2.1` que
   * escanea el laboratorio. Varios campos van vacíos porque no los tenemos
   * (SSN en el 4,8% de los pacientes, póliza en el 4,6% de los casos, dirección
   * de la aseguradora en el 22%) — decisión de Erick, 2026-09-11: se genera
   * igual con lo que hay. Los que van vacíos están dichos en `ereq-payload.ts`.
   */
  const soloDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
  const carga = construirCargaEreq({
    fecha: `${ahora.getFullYear()}${dosDigitos(ahora.getMonth() + 1)}${dosDigitos(ahora.getDate())}`,
    hora: `${dosDigitos(fechaColeccion.getHours())}${dosDigitos(fechaColeccion.getMinutes())}00`,
    facturacion,
    cuenta: cfg.cuenta,
    requisicion: numero.replace(`-${cfg.sufijo}`, ''),
    sufijo: cfg.sufijo,
    paciente: {
      id: p.patientCode,
      // Sin Alt Patient ID propio: en las hojas de MedUSA es su numeración
      // interna, que nosotros no emitimos. Se manda el mismo código de paciente.
      altId: p.patientCode,
      apellido: p.lastName.toUpperCase(),
      nombre: p.firstName.toUpperCase(),
      nacimiento: p.dateOfBirth
        ? `${p.dateOfBirth.getFullYear()}${dosDigitos(p.dateOfBirth.getMonth() + 1)}${dosDigitos(p.dateOfBirth.getDate())}`
        : '',
      genero: p.sex ?? '',
      ssn: soloDigitos(p.socialSecurityNumber),
      direccion: p.addressLine1 ?? '',
      ciudad: p.addressCity ?? '',
      estado: p.addressState ?? '',
      zip: p.addressZip ?? '',
      telefono: soloDigitos(p.phone),
      edadAnios: edad?.anios ?? 0,
      edadMeses: edad?.meses ?? 0,
      edadDias: edad?.dias ?? 0,
    },
    seguro: seguroDelCaso,
    provider: {
      apellido: cita.provider!.lastName,
      nombre: cita.provider!.firstName,
      npi,
    },
    telefonoContacto: soloDigitos(p.phone),
    estudios: estudios.map((e) => e.studyCode ?? '').filter(Boolean),
    diagnosticos: icd10,
  });

  const pdf = await construirHojaRequisicion({
    numero,
    cuentaLabCorp: cfg.cuenta,
    codigoPdf417: await pdf417Base64(carga),
    codigoLeyenda: contenidoCodigoBarras(cfg.cuenta, numero),
    fechaColeccion: fechaHojaLabCorp(fechaColeccion),
    billTypeImpreso: facturacion === 'C' ? 'CLIENT' : 'THIRD PARTY',
    practica: {
      nombre: cita.clinic?.name ?? 'Precision Medical',
      direccion: cita.clinic?.address ?? '',
      ciudadEstadoZip: [cita.clinic?.city, cita.clinic?.state, cita.clinic?.zipCode].filter(Boolean).join(', '),
      telefono: cita.clinic?.phone ?? '',
    },
    provider: {
      nombre: `${cita.provider!.lastName}, ${cita.provider!.firstName}`,
      npi,
    },
    paciente: {
      nombre: `${p.lastName}, ${p.firstName}`.toUpperCase(),
      nacimiento: p.dateOfBirth ? fechaCorta(p.dateOfBirth) : '',
      genero: p.sex ?? '',
      edad: edad ? `${edad.anios}/${edad.meses}/${edad.dias}` : '',
      id: p.patientCode,
      direccion: p.addressLine1 ?? '',
      ciudadEstadoZip: [p.addressCity, p.addressState, p.addressZip].filter(Boolean).join(', '),
      telefono: p.phone ?? '',
    },
    estudios: estudios.map((e) => ({ codigo: e.studyCode ?? '', nombre: e.studyName })),
    indicacion,
    icd10,
  });

  /*
   * El PDF se guarda como DOCUMENTO del paciente, con `caseId`: así la misma
   * hoja aparece en los archivos del paciente y en el tab Documentos del caso
   * sin generarla dos veces ni duplicar el archivo.
   *
   * ── SIN CASO NO SE CREA LA FILA DE DOCUMENTO ──────────────────────────────
   * Decisión de Erick (2026-09-11): *"generalmente la cita sí debería tener
   * caso; si no lo tiene, que no aparezca en documentos"*.
   *
   * Y no se crea la fila en vez de crearla con `caseId: null`, por algo que
   * medí: **el `caseId` de una cita se fija al crearla y NUNCA se reasigna** —
   * la ruta de edición de la cita solo lo lee. O sea que una fila con el caso en
   * null no aparecería "hasta que tenga caso": no aparecería nunca, y quedaría
   * como documento huérfano. De esos ya hay 1.323 en la base por un problema
   * viejo; no se suman más a propósito.
   *
   * La hoja NO se pierde: el PDF queda en el bucket y la requisición guarda su
   * número, y el visor de impresión del Resumen la arma en vivo desde la base,
   * así que se sigue imprimiendo igual.
   */
  const caseId = cita.case?.id ?? null;
  const nombreArchivo = `Orden de laboratorio ${numero}.pdf`;
  const destino = `cases/${caseId ?? 'sin-caso'}/${Date.now()}-orden-lab-${numero}.pdf`;
  const subida = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${destino}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': 'application/pdf',
    },
    body: new Uint8Array(pdf),
  });
  if (!subida.ok) {
    console.error('[requisition] no se pudo guardar la hoja: %s', await subida.text());
    return NextResponse.json({ error: 'STORAGE_FALLO' }, { status: 502 });
  }

  const doc = caseId
    ? await db.patientDocument.create({
        data: {
          name: nombreArchivo,
          s3Key: destino,
          isFolder: false,
          size: pdf.byteLength,
          mimeType: 'application/pdf',
          patientId: p.id,
          caseId,
          createdByUserId: actor.actorUserId,
        },
        select: { id: true },
      })
    : null;

  const req0 = await db.labRequisition.create({
    data: {
      groupId,
      number: numero,
      billingType: facturacion === 'C' ? 'CLIENT' : 'PRIVATE',
      providerId: cita.provider!.id,
      providerName: `${cita.provider!.lastName}, ${cita.provider!.firstName}`,
      providerNpi: npi,
      generatedById: actor.actorUserId,
      generatedByName: actor.actorName,
      documentId: doc?.id ?? null,
    },
    select: {
      number: true, generatedAt: true, generatedByName: true,
      documentId: true, billingType: true, providerName: true, providerNpi: true,
    },
  });

  await writeAuditLog(db, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorRole: actor.actorRole,
    action: 'GENERATE_LAB_REQUISITION',
    entityType: 'lab_requisitions',
    entityId: groupId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      numero, billType: facturacion, estudios: estudios.length,
      documentId: doc?.id ?? null, appointmentId,
      // Deja constancia de por que esa hoja no esta en Documentos.
      sinCaso: caseId === null,
    },
  });

  return NextResponse.json({ requisicion: req0, yaExistia: false }, { status: 201 });
}
