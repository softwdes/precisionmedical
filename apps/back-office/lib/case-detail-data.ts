import { db, segurosMedicosDeclarados } from '@precision-medical/database';
import type { ComponentProps } from 'react';
import type { CaseDetailClient } from '@/app/(admin)/front-office/[id]/case-detail-client';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';
import { fotosConRespaldo } from '@/lib/fotos-identidad';
import { membresiaDePaciente } from '@/lib/membresias';

/**
 * Carga del detalle de caso — compartida por las CUATRO superficies que lo
 * muestran: la página completa de admin (/front-office/[id]), su versión modal
 * interceptada desde Pacientes, la página del doctor (/doctor/case/[id]) y su
 * modal desde Mis Pacientes. Una sola query: si el detalle gana un campo, lo
 * ganan las cuatro a la vez.
 */

type CaseDetailClientProps = ComponentProps<typeof CaseDetailClient>;

export interface CaseDetailData {
  caseInfo: CaseDetailClientProps['caseInfo'];
  auditEvents: CaseDetailClientProps['auditEvents'];
  /** `users.id` de quien mira — para el tab de Mensajes. Ver abajo. */
  currentUserId: string | null;
}

/**
 * ─── providerHasCase, borrada el 2026-09-16 ────────────────────────────────
 *
 * Contestaba "¿este doctor puede ver este caso?" y ya no hay recorte que
 * contestar: el portal ve toda la clínica, igual que el back-office (Erick).
 *
 * Vale guardar su historia porque es la TERCERA vuelta del mismo callejón. Su
 * propio comentario lo describía en septiembre: el alcance era por CASO, la
 * ficha listaba los casos con la regla del PACIENTE, y "el resultado era un
 * callejón: veía la lista completa y ninguno de los ajenos abría". Se arregló
 * ensanchando el guard de caso a paciente. Hoy la lista se ensanchó a la
 * clínica y el mismo guard volvió a quedar corto.
 *
 * La lección, si alguien vuelve a poner un recorte acá: el guard y la lista que
 * lleva a él tienen que salir de la MISMA regla, o las filas no abren.
 */

/**
 * Los casos de este paciente, para el selector del modal del doctor.
 *
 * Ordenados por fecha de creación descendente — el más nuevo primero, que es el
 * que casi siempre está mirando.
 */
/**
 * Un campo de texto de `consentsData`, limpio, o `null` si no hay nada.
 *
 * Existe para no repetir el casteo en cada campo: ese JSON no tiene tipo y
 * leerlo a mano en varios lugares es cómo se cuelan los `undefined` que la
 * pantalla después imprime como "undefined".
 */
function textoDeConsent(consentsData: unknown, clave: string): string | null {
  const v = (consentsData as Record<string, unknown> | null)?.[clave];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function casesOfPatientByCase(caseId: string): Promise<Array<{
  id: string; caseCode: string; caseType: string; status: string; createdAt: string;
}>> {
  const c = await db.case.findFirst({
    where: { id: caseId, deletedAt: null },
    select: { patientId: true },
  });
  if (!c) return [];

  const rows = await db.case.findMany({
    where: { patientId: c.patientId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, caseCode: true, caseType: true, status: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    caseCode: r.caseCode,
    caseType: String(r.caseType),
    status: String(r.status),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getCaseDetailData(id: string): Promise<CaseDetailData | null> {
  const caseRecord = await db.case.findFirst({
    where: { id, deletedAt: null },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          // El celular. Sin él, el detalle del caso no mostraba teléfono ni
          // dejaba llamar a más de la mitad de los pacientes, que lo tienen
          // cargado acá y no en `phone` (ver `lib/telefono-paciente`).
          phone2: true,
          email: true,
          dateOfBirth: true,
          // Decide en qué idioma sale el SMS del portal desde el detalle del caso.
          preferredLanguage: true,
          patientCode: true,
          addressLine1: true,
          addressCity: true,
          addressState: true,
          addressZip: true,
          socialSecurityNumber: true,
          /**
           * El contacto compartido en familia — para el cartel "es el correo de
           * X · su esposo" debajo del campo. Se trae el VÍNCULO, no una copia:
           * `email`/`phone` de arriba siguen siendo los propios del paciente.
           */
          contactRelation: true,
          sharesEmail: true,
          sharesPhone: true,
          contactAuthorizedAt: true,
          contactOwner: {
            select: { firstName: true, lastName: true, email: true, phone: true },
          },
        },
      },
      lawFirm: {
        select: {
          id: true,
          firmName: true,
          email: true,
          phone: true,
          city: true,
          state: true,
          paymentSpeed: true,
          caseflowFlags: true,
        },
      },
      attorney: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          memberRole: true,
        },
      },
      primaryInsurance: {
        select: {
          id: true,
          name: true,
          shortCode: true,
          color: true,
          type: true,
          responseSpeed: true,
          claimsPhone: true,
          hcfaChannel: true,
          preauthRequired: true,
        },
      },
      secondaryInsurance: {
        select: {
          id: true,
          name: true,
          shortCode: true,
          color: true,
          type: true,
        },
      },
      /**
       * El seguro de AUTO, que vive en su propia tabla desde que se promovió
       * fuera del JSON (`CaseAutoInsurance`).
       *
       * Faltaba acá, y por eso la portada decía "sin aseguradora primaria" en
       * **230 casos que tenían el seguro cargado**: las dos fuentes que miraba
       * —`primaryInsuranceId` y los declarados— excluyen el de auto a propósito
       * (`segurosMedicosDeclarados` filtra `insType === 'MEDICAL'`). Medido el
       * 2026-10-01 a partir del caso de Veronica Contreras.
       *
       * Es el mismo callejón que describe `seguro-declarado.ts`: el dato se
       * mudó de lugar y la pantalla que lo mostraba no se enteró.
       */
      autoInsurance: {
        select: {
          policyId: true,
          lossDate: true,
          pipAvailable: true,
          claimNum: true,
          carrierNameRaw: true,
          carrier: {
            select: { id: true, name: true, shortCode: true, color: true, type: true },
          },
        },
      },
      specialty: {
        select: { id: true, name: true, color: true, workflowType: true },
      },
      notes: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          content: true,
          isPrivate: true,
          authorName: true,
          authorUserId: true,
          createdAt: true,
        },
      },
      appointments: {
        orderBy: { scheduledFor: 'asc' },
        take: 20,
        select: {
          id: true,
          scheduledFor: true,
          durationMinutes: true,
          status: true,
          type: true,
        },
      },
      lienSignatures: {
        orderBy: { signedAt: 'asc' },
        select: {
          id: true,
          signerType: true,
          signerName: true,
          signerEmail: true,
          signatureSvg: true,
          signedAt: true,
        },
      },
    },
  });

  if (!caseRecord) return null;

  // Audit log del caso para el timeline (created, portal sent, intake complete…)
  const auditEvents = await db.auditLog.findMany({
    where: { entityType: 'cases', entityId: id },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: {
      id: true,
      action: true,
      actorType: true,
      actorUserId: true,
      createdAt: true,
      metadata: true,
    },
  });

  /**
   * Las cuatro fotos de identidad, completadas con las que el paciente trae del
   * v2 cuando el caso no las tiene.
   *
   * Sin esto, la ficha de un paciente migrado decía "faltan la foto, la licencia
   * y la tarjeta del seguro" teniendo las cuatro guardadas: el aviso y el avatar
   * leen de acá, y las del v2 no viven en `consentsData` sino colgando de la
   * PERSONA (ver `lib/fotos-identidad.ts`).
   */
  const fotosDelCaso = (() => {
    const cd = caseRecord.consentsData as Record<string, unknown> | null;
    return (cd?.photos as Record<string, string> | undefined) ?? {};
  })();
  const fotos = await fotosConRespaldo(caseRecord.patient.id, fotosDelCaso);

  /**
   * Si el paciente es socio de la clínica, y hasta cuándo.
   *
   * Se resuelve acá —y no en la pantalla— por la misma razón que el resto de
   * este archivo: son CUATRO superficies las que montan el detalle del caso, y
   * un dato que cada una pida por su cuenta termina apareciendo en dos y
   * faltando en las otras dos.
   */
  const membresia = await membresiaDePaciente(caseRecord.patient.id);
  /**
   * Las que están en la papelera. Van al cliente para que el recuadro vacío
   * pueda ofrecer "recuperar" también acá, y no solo en la sesión en la que se
   * borró la foto.
   */
  const fotosEliminadas = (() => {
    const cd = caseRecord.consentsData as Record<string, unknown> | null;
    return (cd?.photosEliminadas as Record<string, { url: string; at: string; by: string | null }> | undefined) ?? {};
  })();

  return {
    caseInfo: {
      id: caseRecord.id,
      caseCode: caseRecord.caseCode,
      status: caseRecord.status,
      caseType: caseRecord.caseType,
      source: caseRecord.source,
      accidentDate: caseRecord.accidentDate,
      accidentType: caseRecord.accidentType,
      accidentLocation: caseRecord.accidentLocation,
      accidentNotes: caseRecord.accidentNotes,
      primaryPolicyNumber: caseRecord.primaryPolicyNumber,
      secondaryPolicyNumber: caseRecord.secondaryPolicyNumber,
      intakeFormSentAt: caseRecord.intakeFormSentAt,
      intakeFormSentVia: caseRecord.intakeFormSentVia,
      intakeFormCompletedAt: caseRecord.intakeFormCompletedAt,
      pipVerifiedAt: caseRecord.pipVerifiedAt,
      firstAppointmentConfirmedAt: caseRecord.firstAppointmentConfirmedAt,
      createdAt: caseRecord.createdAt,
      updatedAt: caseRecord.updatedAt,
      patient: {
        ...caseRecord.patient,
        /**
         * Las cuatro fotos de identificación del caso (selfie, tarjeta de
         * seguro frente y dorso, licencia). Van enteras y no solo el selfie
         * porque el diálogo que las administra se abre desde esta pantalla y
         * necesita saber cuáles ya existen para no mostrarlas como vacías.
         *
         * ⚠️ Las del intake de v3 viven en `Case.consentsData` (`Patient` no tiene
         * columna de foto), así que un paciente con dos casos ve las de ESTE
         * caso. Las migradas del v2 cuelgan de la PERSONA y entran como
         * respaldo — resuelto arriba con `fotosConRespaldo`.
         */
        fotos,
        fotosEliminadas,
        membresia,
        photoUrl: fotos.selfie ?? null,
      },
      lawFirm: caseRecord.lawFirm,
      attorney: caseRecord.attorney,
      primaryInsurance: caseRecord.primaryInsurance,
      secondaryInsurance: caseRecord.secondaryInsurance,
      /**
       * El de auto va con `lossDate` ya serializada: el resto de `caseInfo`
       * viaja así y la tarjeta solo la formatea.
       *
       * ⚠️ Las fechas anteriores a 1900 se descartan acá. **Son 65 de 269**
       * (medido el 2026-10-01) y TODAS son el mismo `0001-01-01`: basura que
       * dejó la migración del v2, no una fecha que alguien cargó. Sin este
       * filtro la tarjeta anunciaba un accidente el 1 de enero del año 1.
       *
       * No se reemplazan por `Case.accidentDate` —que 57 de esas 65 sí tienen—
       * porque `lossDate` es, por schema, un *override* de ese campo: la fecha
       * del accidente ya se muestra en su propia fila de la portada, y repetirla
       * acá como si fuera un dato del seguro sería inventar una confirmación que
       * nadie dio.
       */
      autoInsurance: caseRecord.autoInsurance
        ? {
            ...caseRecord.autoInsurance,
            lossDate:
              caseRecord.autoInsurance.lossDate && caseRecord.autoInsurance.lossDate.getUTCFullYear() >= 1900
                ? caseRecord.autoInsurance.lossDate.toISOString()
                : null,
          }
        : null,
      /**
       * El seguro que DECLARÓ el paciente en su formulario.
       *
       * La tarjeta de seguros miraba solo la aseguradora enlazada al catálogo, y
       * cuando no hay ninguna decía "sin seguro principal" aunque el paciente
       * hubiera cargado el suyo: Erick, 21-sep-2026, mirando a Alexander Lutz
       * —su intake impreso muestra "BlueCrossBlueShiled (declared), póliza
       * 901639254" y el caso salía vacío—.
       *
       * Pasa cuando el nombre no coincide con el catálogo, que es seguido: ahí
       * está escrito de memoria y con un dedazo ("BlueCrossBlueShiled"), así que
       * la promoción automática del intake no lo enlaza y el dato se queda en el
       * JSON sin que nadie lo vea. El PDF ya lo imprimía; la pantalla no.
       *
       * Va SIEMPRE, no solo cuando falta el enlazado: la tarjeta decide qué
       * mostrar. Y rotulado como declarado en la pantalla, porque no es lo mismo
       * que lo que el staff verificó contra la tarjeta.
       */
      segurosDeclarados: segurosMedicosDeclarados(caseRecord.consentsData),
      /**
       * El array `insurances` TAL CUAL está en el JSON, sin filtrar ni reordenar.
       *
       * Es lo que necesita el editor de seguros para guardar: `SegurosDialog`
       * reescribe el array entero, así que si recibiera la versión de arriba
       * —que saca los de AUTO y sube la principal al frente— guardar sin tocar
       * nada reordenaría las pólizas y cambiaría en silencio cuál es la
       * principal.
       *
       * Se manda solo esta clave del `consentsData` y no el objeto completo: ahí
       * adentro también viven las firmas en base64, que pesan y que esta
       * pantalla no usa.
       */
      insurancesCrudas: Array.isArray((caseRecord.consentsData as { insurances?: unknown } | null)?.insurances)
        ? ((caseRecord.consentsData as { insurances: unknown[] }).insurances as Record<string, unknown>[])
        : [],
      /**
       * El abogado y el quiropráctico que se escribieron a mano en el alta.
       *
       * El formulario de caso nuevo los guarda como TEXTO en `consentsData`, y
       * la portada leía otra cosa: `attorneyId`, que es la relación al catálogo
       * y solo la llena el diálogo de "Legal". Resultado medido el 2026-10-03:
       * **20 casos tienen el nombre del abogado escrito y la portada dice "Not
       * specified"**, y los 36 con quiropráctico no lo mostraban nunca —esa fila
       * estaba cableada al texto de "sin especificar"—.
       *
       * Lo reportó Erick con Paige Schanze (MVA-3469): cargó los dos en el alta
       * y la ficha salió vacía.
       */
      attorneyDeclarado:     textoDeConsent(caseRecord.consentsData, 'attorney'),
      chiropractorDeclarado: textoDeConsent(caseRecord.consentsData, 'chiropractor'),
      specialty: caseRecord.specialty,
      notes: caseRecord.notes,
      appointments: caseRecord.appointments,
      // La tabla es append-only por diseño (documento legal, nunca se actualiza
      // ni borra). Re-firmar crea una fila nueva, así que un caso reabierto
      // varias veces acumula firmas del mismo tipo. Se reduce a la ÚLTIMA por
      // signerType para la vista — el historial completo sigue en la DB.
      lienSignatures: (() => {
        const porTipo = new Map<string, (typeof caseRecord.lienSignatures)[number]>();
        const conteoPorTipo = new Map<string, number>();
        // El query ya viene ordenado por signedAt asc → la última iteración de
        // cada tipo es la más reciente.
        for (const s of caseRecord.lienSignatures) {
          porTipo.set(s.signerType, s);
          conteoPorTipo.set(s.signerType, (conteoPorTipo.get(s.signerType) ?? 0) + 1);
        }
        return [...porTipo.values()].map((s) => ({
          id: s.id,
          signerType: s.signerType,
          signerName: s.signerName,
          signerEmail: s.signerEmail,
          signatureSvg: s.signatureSvg,
          signedAt: s.signedAt,
          previousCount: (conteoPorTipo.get(s.signerType) ?? 1) - 1,
        }));
      })(),
    },
    auditEvents: auditEvents.map((e) => ({
      id: e.id,
      action: e.action,
      actorType: e.actorType,
      actorUserId: e.actorUserId,
      createdAt: e.createdAt,
      metadata: e.metadata as Record<string, unknown> | null,
    })),
    /**
     * Quién está mirando — lo necesita el tab de Mensajes (qué entradas son
     * mías, qué puedo editar).
     *
     * Va acá y no como prop de cada página porque hay TRES lugares que montan
     * `CaseDetailClient` (front-office, el portal médico y el modal de caso), y
     * este loader es el único punto por el que pasan los tres. Threadearlo por
     * separado garantizaba que uno se quedara sin el dato y el tab se rompiera
     * solo ahí.
     */
    currentUserId: await (async () => {
      const user = await getSessionUser();
      if (!user?.email) return null;
      const dbUser = await getDbUserByEmail(user.email);
      return dbUser?.id ?? null;
    })(),
  };
}
