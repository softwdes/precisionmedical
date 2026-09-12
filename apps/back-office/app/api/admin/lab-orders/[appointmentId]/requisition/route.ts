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

const BodySchema = z.object({
  groupId: z.string().min(1),
  /**
   * El seguro con el que se emite ESTA hoja, cuando no es el del caso.
   *
   * El paciente puede querer pagar la orden con su seguro médico, o con una
   * membresía de otra clínica que funciona como seguro (Erick, 2026-09-12), y el
   * encargado se lo pregunta con el paciente delante. Si no viene, se usa el del
   * caso — que es lo que pasaba siempre hasta ahora, solo que ahora se ve antes
   * de emitir en vez de descubrirse en el papel.
   *
   * Texto libre: LabCorp no valida contra catálogo y una membresía no es una
   * aseguradora. Ver el comentario del modelo `LabRequisition`.
   */
  seguro: z.object({
    nombre: z.string().trim().min(1).max(120),
    poliza: z.string().trim().max(60).default(''),
    direccion: z.string().trim().max(200).default(''),
  }).optional(),
});

export interface SeguroHoja {
  nombre: string;
  poliza: string;
  direccion: string;
}

/**
 * Con qué seguro saldría la hoja si se emitiera ahora, y de dónde sale.
 *
 * `ULTIMA` gana sobre `CASO` a propósito: si la orden anterior de este caso se
 * facturó a la membresía del paciente, la próxima arranca igual en vez de
 * volver al seguro del accidente y obligar a re-tipear (Erick, 2026-09-12).
 * Es una sugerencia, no una decisión: el encargado la ve y la confirma.
 */
async function seguroSugerido(
  caseId: string | null,
  delCaso: SeguroHoja | null,
): Promise<{ seguro: SeguroHoja | null; origen: 'CASO' | 'ULTIMA' | null }> {
  if (caseId) {
    /*
     * `lab_requisitions` no tiene caso: se llega por el grupo → los estudios →
     * la cita. El join multiplica filas por estudio, pero con ORDER BY + LIMIT 1
     * da igual: se quiere la más reciente, no contarlas.
     */
    const ultima = await db.$queryRaw<Array<{ nombre: string; poliza: string | null; direccion: string | null }>>`
      SELECT lr."insuranceName" AS nombre,
             lr."insurancePolicy" AS poliza,
             lr."insuranceAddress" AS direccion
        FROM lab_requisitions lr
        JOIN lab_orders lo   ON lo."groupId" = lr."groupId"
        JOIN appointments a  ON a.id = lo."appointmentId"
       WHERE a."caseId" = ${caseId}
         AND lr."insuranceName" IS NOT NULL
         AND lr."insuranceName" <> ''
         -- Las anuladas NO sugieren: si una hoja se anuló justamente porque el
         -- seguro estaba mal, repetirlo sería volver a proponer el error.
         AND lr."voidedAt" IS NULL
       ORDER BY lr."generatedAt" DESC
       LIMIT 1`;
    const u = ultima[0];
    if (u) return {
      seguro: { nombre: u.nombre, poliza: u.poliza ?? '', direccion: u.direccion ?? '' },
      origen: 'ULTIMA',
    };
  }
  return delCaso ? { seguro: delCaso, origen: 'CASO' } : { seguro: null, origen: null };
}

/** El seguro del caso, en la forma que espera la hoja. */
function seguroDeCase(c: {
  primaryPolicyNumber: string | null;
  primaryInsurance: { name: string; claimsAddress: string | null } | null;
} | null): SeguroHoja | null {
  if (!c?.primaryInsurance) return null;
  return {
    nombre: c.primaryInsurance.name,
    poliza: c.primaryPolicyNumber ?? '',
    // `claimsAddress` es un texto libre de una sola línea: va entero y ciudad,
    // estado y ZIP quedan vacíos. Partirlo por comas sería adivinar dónde
    // termina la calle, y una dirección mal partida es peor que una sin partir.
    direccion: c.primaryInsurance.claimsAddress ?? '',
  };
}

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

/**
 * La requisición VIGENTE de un grupo, o `null`.
 *
 * `findFirst` y no `findUnique`: un grupo puede tener varias requisiciones a lo
 * largo del tiempo —las anuladas se quedan como constancia— pero una sola sin
 * anular. Esa unicidad la garantiza un índice parcial en la base; ver el
 * comentario del modelo `LabRequisition`.
 */
async function estadoDeGrupo(groupId: string) {
  return db.labRequisition.findFirst({
    where: { groupId, voidedAt: null },
    select: {
      number: true, generatedAt: true, generatedByName: true,
      documentId: true, billingType: true, providerName: true, providerNpi: true,
      insuranceName: true, insurancePolicy: true,
    },
  });
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { appointmentId } = await ctx.params;
  const { deny } = await checkAppointmentAccess(appointmentId);
  if (deny) return deny;

  const groupId = req.nextUrl.searchParams.get('groupId');
  if (!groupId) return NextResponse.json({ error: 'MISSING_GROUP' }, { status: 400 });

  const yaEsta = await estadoDeGrupo(groupId);
  if (yaEsta) return NextResponse.json({ requisicion: yaEsta });

  /*
   * Todavía no emitida: se dice CON QUÉ saldría.
   *
   * Hasta hoy la hoja usaba el seguro del caso en silencio y nadie veía cuál
   * hasta que el papel estaba impreso. Devolverlo acá es lo que le permite a la
   * pantalla mostrarlo ANTES, que es cuando el encargado todavía puede
   * preguntarle al paciente.
   */
  const estudios = await db.labOrder.findMany({
    where: { appointmentId, groupId, status: { not: 'VOIDED' } },
    select: { billingType: true },
  });
  const cita = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      case: {
        select: {
          id: true, primaryPolicyNumber: true,
          primaryInsurance: { select: { name: true, claimsAddress: true } },
        },
      },
    },
  });
  const caso = cita?.case ?? null;
  const { seguro, origen } = await seguroSugerido(caso?.id ?? null, seguroDeCase(caso));

  return NextResponse.json({
    requisicion: null,
    facturacion: letraFacturacion(estudios[0]?.billingType ?? null),
    seguro,
    origen,
    tieneCaso: !!caso,
  });
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

  /*
   * QUIÉN PAGA — y el freno cuando el que paga es un tercero.
   *
   * La letra sale del primer estudio, y eso solo vale mientras el grupo entero
   * comparta el tipo. Hoy lo comparte: el diálogo pone uno solo para toda la
   * tanda y no hay ni un grupo mezclado en los 245 que existen. Pero nada lo
   * impide en la base —basta agregar un estudio a un grupo ya creado— y una
   * hoja que le factura al seguro estudios que el paciente tenía que pagar es
   * un error que nadie ve hasta que llega la factura. Si viene mezclado no se
   * adivina: se frena.
   */
  const tiposDelGrupo = new Set(estudios.map((e) => e.billingType ?? null));
  if (tiposDelGrupo.size > 1) {
    return NextResponse.json({ error: 'GRUPO_MIXTO' }, { status: 409 });
  }
  const facturacion = letraFacturacion(estudios[0]?.billingType ?? null);

  /*
   * SIN PÓLIZA NO SE EMITE UNA ORDEN QUE PAGA UN TERCERO.
   *
   * `X` significa que la cuenta le llega a la aseguradora, y sin número de
   * póliza no hay contra qué facturar: el laboratorio la rechaza, o la cobra
   * después contra el paciente. Frena por el mismo motivo que el NPI —mejor
   * acá, con el paciente todavía en el mostrador, que con un papel que vuelve.
   *
   * Va ANTES de `siguienteNumeroRequisicion()` a propósito: ese número sale de
   * una secuencia y el que se consume no vuelve. Un chequeo después de pedirlo
   * frenaría la hoja igual, pero dejando un hueco en la numeración que el
   * laboratorio ve como una requisición perdida.
   *
   * De 834 casos con seguro, 829 tienen la aseguradora cargada y solo 17 la
   * póliza (medido 2026-09-11): lo que falta es el número, casi nunca el
   * nombre. Por eso la pantalla pide UN campo y no un formulario de seguro.
   */
  /*
   * El seguro ELEGIDO manda sobre el del caso.
   *
   * Si el encargado eligió otro —el seguro médico del paciente, o una membresía
   * de otra clínica— se valida y se imprime ESE. El del caso sigue intacto: lo
   * leen el HCFA, el libro mayor y el settlement, y cambiarlo desde acá movería
   * plata en módulos que nadie está mirando en este momento.
   */
  const elegido: SeguroHoja | null = body.data.seguro
    ? {
        nombre: body.data.seguro.nombre,
        poliza: body.data.seguro.poliza,
        direccion: body.data.seguro.direccion,
      }
    : seguroDeCase(cita.case ?? null);

  if (facturacion === 'X') {
    const poliza = (elegido?.poliza ?? '').trim();
    const aseguradora = (elegido?.nombre ?? '').trim();
    if (!poliza || !aseguradora) {
      return NextResponse.json({
        error: 'SEGURO_INCOMPLETO',
        // `null` cuando la cita no tiene caso: ahí no hay dónde GUARDAR la
        // póliza en el caso, y la pantalla lo dice en vez de ofrecer el campo.
        // (Elegir otro seguro solo para esta hoja sigue siendo posible: eso no
        // se guarda en el caso sino en la requisición.)
        caseId: cita.case?.id ?? null,
        aseguradora: aseguradora || null,
        faltaPoliza: !poliza,
        faltaAseguradora: !aseguradora,
      }, { status: 409 });
    }
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

  /*
   * El seguro que va al código de barras: el ELEGIDO, que por defecto es el del
   * caso. Ciudad, estado y ZIP quedan vacíos porque la dirección es un texto
   * libre de una sola línea y partirla por comas sería adivinar dónde termina
   * la calle — una dirección mal partida es peor que una sin partir.
   */
  const seguroDeLaHoja = elegido
    ? {
        nombre: elegido.nombre,
        direccion: elegido.direccion,
        ciudad: '', estado: '', zip: '',
        poliza: elegido.poliza,
      }
    : undefined;

  /*
   * La CARGA del código: la orden entera en el formato `MEDUSAP2.1` que
   * escanea el laboratorio. Varios campos van vacíos porque no los tenemos
   * (SSN en el 4,8% de los pacientes, dirección de la aseguradora en el 22%) —
   * decisión de Erick, 2026-09-11: se genera igual con lo que hay. Los que van
   * vacíos están dichos en `ereq-payload.ts`.
   *
   * La póliza es la excepción: acá abajo puede ir vacía, pero solo en las
   * órdenes `C`. Si paga un tercero, el freno de arriba ya no dejó llegar.
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
    seguro: seguroDeLaHoja,
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
      // La foto del seguro con el que salió esta hoja. Se guarda aunque sea el
      // del caso: mañana el caso puede cambiar de aseguradora y este papel ya
      // está en la calle con el nombre viejo adentro del código de barras.
      insuranceName: elegido?.nombre || null,
      insurancePolicy: elegido?.poliza || null,
      insuranceAddress: elegido?.direccion || null,
      generatedById: actor.actorUserId,
      generatedByName: actor.actorName,
      documentId: doc?.id ?? null,
    },
    select: {
      number: true, generatedAt: true, generatedByName: true,
      documentId: true, billingType: true, providerName: true, providerNpi: true,
      insuranceName: true, insurancePolicy: true,
    },
  });

  /*
   * Cierra el círculo con las anuladas: desde la hoja vieja se llega a la que la
   * reemplazó sin tener que buscar por fecha. `updateMany` y no `update` porque
   * un grupo puede haberse anulado más de una vez, y todas las que todavía no
   * tienen reemplazo apuntan a esta.
   */
  await db.labRequisition.updateMany({
    where: { groupId, voidedAt: { not: null }, replacedByNumber: null },
    data: { replacedByNumber: numero },
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
      // Con qué seguro salió, y si fue el del caso o uno elegido a mano. Sin
      // esto no hay forma de reconstruir por qué una hoja se facturó a alguien
      // que no figura en el caso.
      seguro: elegido?.nombre ?? null,
      seguroElegidoAMano: !!body.data.seguro,
    },
  });

  return NextResponse.json({ requisicion: req0, yaExistia: false }, { status: 201 });
}
