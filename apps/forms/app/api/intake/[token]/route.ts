/**
 * B.6 — Portal Intake · GET + PATCH step data
 *
 * GET  /api/intake/[token]  → retorna datos del caso para pre-llenar wizard
 * PATCH /api/intake/[token] → guarda datos de un paso específico (autosave)
 *
 * Phase 1A: guarda en Patient + Case directamente.
 * Phase 2: guardará en IntakeSubmission (PHI encriptada, tras BAA).
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  db, writeAuditLog, promoverSeguroDeclarado,
  esSlotFoto, clavesDeFotosDelPaciente,
} from '@precision-medical/database';
import { decryptFieldOrOriginal } from '@/lib/decrypt';
// `MAYBE_CIPHER` y `protegerCifrados` vivían acá. Se mudaron a `lib/` cuando la
// pantalla de confirmación de cita empezó a escribir los mismos campos del
// paciente: la protección tiene que ser UNA, no una copia por ruta.
import { protegerCifrados } from '@/lib/campos-cifrados';
import { rateLimit, claveDeIp, cabeceras429 } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ token: string }> };

/**
 * ¿Este caso ya tiene respaldo legal como MVA?
 *
 * Es la pregunta que decide si el paciente puede degradarlo a visita general.
 * Un MVA con bufete, abogado, paralegal, asistente legal o una firma de lien ya
 * registrada NO es una opinión: alguien del staff lo armó a partir del referido
 * y del reporte del accidente, y puede haber un despacho trabajándolo.
 *
 * Alcanza con UNA de esas señales. Ninguna aparece sola por accidente.
 */
function tieneRespaldoLegal(c: {
  lawFirmId: string | null; attorneyId: string | null; attorneyNameRaw: string | null;
  paralegalId: string | null; legalAssistantId: string | null;
  _count: { lienSignatures: number };
}): boolean {
  return c._count.lienSignatures > 0
    || !!c.lawFirmId || !!c.attorneyId || !!c.attorneyNameRaw
    || !!c.paralegalId || !!c.legalAssistantId;
}

// Parsea "YYYY-MM-DD" como fecha local (noon) para evitar el off-by-one de UTC midnight
function parseDateLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date((y ?? 1970), (m ?? 1) - 1, (d ?? 1), 12, 0, 0, 0);
}

// ─── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;

  // El `portalToken` es la única puerta a la ficha completa del paciente y hoy
  // se genera con `Date.now()` + `Math.random()` (ver `generate-portal-token` en
  // el back-office), que no es criptográfico: el tiempo se adivina y el resto es
  // un generador predecible. Mientras ese token siga así, el freno es lo que
  // separa "débil" de "se rompe a fuerza bruta".
  //
  // 30 cada 10 minutos: el wizard recarga esta ruta unas pocas veces por sesión
  // —al abrir, al volver de una foto, al reabrir el link— y no se acerca.
  const freno = rateLimit(claveDeIp(req, 'intake'), { max: 30, ventanaMs: 10 * 60_000 });
  if (!freno.ok) {
    return NextResponse.json(
      { ok: false, error: 'TOO_MANY_REQUESTS' },
      { status: 429, headers: cabeceras429(freno) },
    );
  }

  const rec = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true, caseCode: true, status: true, caseType: true,
      accidentDate: true, accidentType: true,
      accidentNotes: true, accidentLocation: true,
      primaryPolicyNumber: true,
      intakeFormCompletedAt: true,
      consentsData: true,
      // Evidencia de respaldo legal — para `accident.typeLocked`.
      lawFirmId: true, attorneyId: true, attorneyNameRaw: true,
      paralegalId: true, legalAssistantId: true,
      _count: { select: { lienSignatures: true } },
      patient: {
        select: {
          id: true, firstName: true, lastName: true,
          dateOfBirth: true,
          phone: true, phone2: true, email: true,
          addressLine1: true, addressCity: true, addressState: true, addressZip: true,
          referralSource: true, referralSourceOther: true, communicationPreference: true,
          preferredPharmacy: true, employer: true,
          race: true, ethnicity: true, sex: true, maritalStatus: true,
          emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
          emergency2Name: true, emergency2Phone: true, emergency2Relation: true,
          guardianName: true, guardianPhone: true, guardianRelation: true,
          insuranceCarrier: true, policyNumber: true,
        },
      },
      intakeSubmission: {
        select: {
          healthStatus: true, hasMedications: true, medications: true,
          hasAllergies: true, allergies: true,
          hasPreviousInjuries: true, previousInjuries: true,
        },
      },
      lienSignatures: {
        where: { signerType: 'PATIENT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { signatureSvg: true, signerName: true, signerEmail: true },
      },
    },
  });

  if (!rec) {
    return NextResponse.json({ error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }

  const cd = (rec.consentsData ?? {}) as Record<string, unknown>;
  const lienSig = rec.lienSignatures[0] ?? null;

  return NextResponse.json({
    caseId:    rec.id,
    caseCode:  rec.caseCode,
    status:    rec.status,
    completed: !!rec.intakeFormCompletedAt,
    patient: {
      id:                       rec.patient.id,
      firstName:                rec.patient.firstName,
      lastName:                 rec.patient.lastName,
      dob:                      rec.patient.dateOfBirth?.toISOString() ?? null,
      phone:                    decryptFieldOrOriginal(rec.patient.phone),
      cellPhone:                rec.patient.phone2 ?? null,
      email:                    rec.patient.email,
      addressLine1:             rec.patient.addressLine1 ?? null,
      addressCity:              decryptFieldOrOriginal(rec.patient.addressCity),
      addressState:             decryptFieldOrOriginal(rec.patient.addressState),
      addressZip:               decryptFieldOrOriginal(rec.patient.addressZip),
      referralSource:           rec.patient.referralSource ?? null,
      referralSourceOther:      rec.patient.referralSourceOther ?? null,
      communicationPreference:  rec.patient.communicationPreference ?? null,
      preferredPharmacy:        decryptFieldOrOriginal(rec.patient.preferredPharmacy),
      employer:                 decryptFieldOrOriginal(rec.patient.employer),
      race:                     rec.patient.race ?? null,
      ethnicity:                rec.patient.ethnicity ?? null,
      sex:                      rec.patient.sex ?? null,
      maritalStatus:            rec.patient.maritalStatus ?? null,
      emergencyContactName:     decryptFieldOrOriginal(rec.patient.emergencyContactName),
      emergencyContactPhone:    decryptFieldOrOriginal(rec.patient.emergencyContactPhone),
      emergencyContactRelation: decryptFieldOrOriginal(rec.patient.emergencyContactRelation),
      emergency2Name:           rec.patient.emergency2Name ?? null,
      emergency2Phone:          rec.patient.emergency2Phone ?? null,
      emergency2Relation:       decryptFieldOrOriginal(rec.patient.emergency2Relation),
      guardianName:             rec.patient.guardianName ?? null,
      guardianPhone:            rec.patient.guardianPhone ?? null,
      guardianRelation:         decryptFieldOrOriginal(rec.patient.guardianRelation),
    },
    accident: {
      date:         rec.accidentDate?.toISOString() ?? null,
      // OJO: para el wizard `accident.type` es el TIPO DE CASO (MVA | GM), no
      // el mecanismo del accidente. El POST del step 5 lo guarda en la columna
      // `caseType` (GM → GENERAL), asi que hay que leerlo de ahi. Antes se leia
      // de `accidentType` — otra columna, que guarda AUTO/FALL/etc — y por eso
      // un caso GM se reabria siempre como MVA y arrastraba el lien.
      type:         rec.caseType === 'GENERAL' ? 'GM' : 'MVA',
      /**
       * true cuando el tipo ya está decidido y el paciente no puede cambiarlo:
       * un MVA con bufete, abogado o lien firmado. El wizard lo usa para NO
       * hacer la pregunta — preguntar algo cuya respuesta se va a ignorar es
       * peor que no preguntarlo, porque el paciente cree que eligió.
       *
       * El freno de verdad está en el PATCH; esto es solo para la pantalla.
       */
      typeLocked:   rec.caseType === 'MVA' && tieneRespaldoLegal(rec),
      // Mecanismo real del accidente, por si se necesita mas adelante.
      mechanism:    rec.accidentType,
      location:     rec.accidentLocation,
      notes:        rec.accidentNotes,
      lawFirm:      (cd.lawFirm as string) ?? null,
      attorney:     (cd.attorney as string) ?? null,
      chiropractor: (cd.chiropractor as string) ?? null,
    },
    insurance: {
      carrier:      rec.patient.insuranceCarrier,
      policyNumber: rec.primaryPolicyNumber ?? rec.patient.policyNumber,
    },
    insurances:   Array.isArray(cd.insurances) ? cd.insurances : [],
    health:       rec.intakeSubmission ?? null,
    consents: {
      hipaa:                  cd.hipaa ?? null,
      assignedParties:        cd.assignedParties ?? null,
      authRecords:            cd.authRecords ?? null,
      financialSignatureSvg:  (cd.financialSignatureSvg as string) ?? null,
      authVoicemail:     cd.authVoicemail ?? null,
      authNotifications: cd.authNotifications ?? null,
      treatment:         cd.treatment ?? null,
      financial:         cd.financial ?? null,
      medicalHistory:    cd.medicalHistory ?? null,
      authorizedPersons: Array.isArray(cd.authorizedPersons) ? cd.authorizedPersons : [],
    },
    saved: {
      referredBy:        (cd.referredBy as string) ?? null,
      guardianLastName:  (cd.guardianLastName as string) ?? null,
      guardianEmail:     (cd.guardianEmail as string) ?? null,
      guardianDOB:       (cd.guardianDOB as string) ?? null,
      guardianCellPhone: (cd.guardianCellPhone as string) ?? null,
      guardianAddress:   (cd.guardianAddress as string) ?? null,
    },
    lienSignature: lienSig ? {
      signatureSvg: lienSig.signatureSvg ?? null,
      signerName:   lienSig.signerName,
      signerEmail:  lienSig.signerEmail ?? null,
    } : null,
    photos: (cd.photos ?? null) as {
      selfie?: string; insuranceCardFront?: string;
      insuranceCardBack?: string; dlFront?: string;
    } | null,
  });
}

// ─── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { token } = await ctx.params;

  const rec = await db.case.findUnique({
    where: { portalToken: token },
    select: {
      id: true, caseCode: true,
      // Para el freno de `caseType` del paso 5 — ver `tieneRespaldoLegal()`.
      caseType: true,
      lawFirmId: true, attorneyId: true, attorneyNameRaw: true,
      paralegalId: true, legalAssistantId: true,
      _count: { select: { lienSignatures: true } },
      patient: {
        select: {
          id: true, email: true,
          // Valores tal como están en la DB (sin descifrar) para saber cuáles
          // siguen cifrados y no pisarlos con vacío — ver protegerCifrados().
          employer: true, preferredPharmacy: true,
          addressCity: true, addressState: true, addressZip: true,
          emergencyContactName: true, emergencyContactPhone: true,
          emergencyContactRelation: true, emergency2Relation: true,
          guardianRelation: true,
        },
      },
    },
  });

  if (!rec) {
    return NextResponse.json({ error: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }

  const guardado = rec.patient as unknown as Record<string, string | null>;

  const body = await req.json() as {
    step: number;
    data: {
      personal?:  {
        firstName?: string; lastName?: string; dateOfBirth?: string;
        phone?: string; cellPhone?: string; email?: string; preferredLanguage?: string;
        addressLine1?: string; addressCity?: string; addressState?: string; addressZip?: string;
        referralSource?: string; referralSourceOther?: string; communicationPreference?: string;
      };
      additional?: {
        emergencyContactName?: string; emergencyContactPhone?: string; emergencyContactRelation?: string;
        emergency2Name?: string; emergency2Phone?: string; emergency2Relation?: string;
        guardianName?: string; guardianPhone?: string; guardianRelation?: string;
        referredBy?: string; preferredPharmacy?: string; employer?: string;
        race?: string; ethnicity?: string; sex?: string; maritalStatus?: string;
      };
      guardian?: {
        guardianName?: string; guardianLastName?: string; guardianEmail?: string;
        guardianDOB?: string; guardianPhone?: string; guardianCellPhone?: string;
        guardianAddress?: string; guardianRelation?: string;
      };
      accident?:  {
        date?: string; type?: string; notes?: string;
        lawFirm?: string; attorney?: string; chiropractor?: string;
      };
      insurances?: object[];
      health?: {
        healthStatus?: string;
        hasMedications?: boolean; medications?: string;
        hasAllergies?: boolean; allergies?: string;
        hasPreviousInjuries?: boolean; previousInjuries?: string;
        preferredLanguage?: string;
      };
      /**
       * Paso 8 — las fotos que el paciente NO volvió a sacar porque ya las
       * tenía de antes. Solo viajan los recuadros; la clave del archivo la
       * resuelve el servidor contra los documentos de esa persona, porque un
       * `s3Key` que manda el cliente es un `s3Key` que el cliente elige.
       */
      fotos?: {
        reusadas?: string[];
        /** `null` = no se le preguntó (no heredó ninguna tarjeta de seguro). */
        tarjetaSeguroVigente?: boolean | null;
      };
      consents?: {
        hipaa?: boolean;
        assignedParties?: boolean;
        authRecords?: boolean; authVoicemail?: boolean; authNotifications?: boolean;
        authorizedPersons?: { name: string; relation: string }[];
        treatment?: boolean; financial?: boolean; financialSignatureSvg?: string;
        medicalHistory?: boolean;
      };
    };
  };

  const { step, data } = body;

  try {

  if (step === 2 && data.personal) {
    const p = data.personal;
    const patientData: Record<string, unknown> = {};
    if (p.firstName)              patientData.firstName                  = p.firstName;
    if (p.lastName)               patientData.lastName                   = p.lastName;
    /**
     * Los dos teléfonos se tratan IGUAL: `!== undefined`, no `if (p.phone)`.
     *
     * Con la condición de verdad, un teléfono vacío no se guardaba nunca: el
     * paciente que entraba a corregir su ficha para sacar un número viejo que
     * ya no es suyo lo borraba en pantalla, guardaba, y el número seguía ahí.
     * El celular sí se podía borrar, en la línea de abajo, con la forma
     * correcta — la asimetría no estaba justificada en ningún lado.
     *
     * Borrar acá es seguro: `phone` no está en `MAYBE_CIPHER`, así que el
     * formulario siempre mostró el valor real y un vacío es una decisión del
     * paciente, no un dato que no se pudo descifrar.
     */
    if (p.phone !== undefined)     patientData.phone                     = p.phone || null;
    if (p.cellPhone !== undefined) patientData.phone2                    = p.cellPhone || null;
    // Solo actualiza email si realmente cambió (evita conflicto unique en mismo paciente)
    if (p.email !== undefined && p.email !== rec.patient.email) patientData.email = p.email || null;
    if (p.dateOfBirth)            patientData.dateOfBirth                = parseDateLocal(p.dateOfBirth);
    if (p.preferredLanguage)      patientData.preferredLanguage          = p.preferredLanguage;
    if (p.addressLine1 !== undefined) patientData.addressLine1           = p.addressLine1 || null;
    if (p.addressCity !== undefined)  patientData.addressCity            = p.addressCity || null;
    if (p.addressState !== undefined) patientData.addressState           = p.addressState || null;
    if (p.addressZip !== undefined)   patientData.addressZip             = p.addressZip || null;
    if (p.referralSource)         patientData.referralSource             = p.referralSource;
    if (p.referralSource === 'OTHER') patientData.referralSourceOther    = p.referralSourceOther?.trim() || null;
    else if (p.referralSource)   patientData.referralSourceOther        = null;
    if (p.communicationPreference) patientData.communicationPreference   = p.communicationPreference;

    protegerCifrados(patientData, guardado);

    if (Object.keys(patientData).length > 0) {
      await db.patient.update({
        where: { id: rec.patient.id },
        data:  patientData,
      });
    }
  }

  if (step === 3 && data.additional) {
    const a = data.additional;
    const patientData: Record<string, unknown> = {};
    if (a.emergencyContactName !== undefined) patientData.emergencyContactName = a.emergencyContactName || null;
    if (a.emergencyContactPhone !== undefined) patientData.emergencyContactPhone = a.emergencyContactPhone || null;
    if (a.emergencyContactRelation !== undefined) patientData.emergencyContactRelation = a.emergencyContactRelation || null;
    if (a.emergency2Name !== undefined) patientData.emergency2Name = a.emergency2Name || null;
    if (a.emergency2Phone !== undefined) patientData.emergency2Phone = a.emergency2Phone || null;
    if (a.emergency2Relation !== undefined) patientData.emergency2Relation = a.emergency2Relation || null;
    if (a.preferredPharmacy !== undefined) patientData.preferredPharmacy = a.preferredPharmacy || null;
    if (a.employer !== undefined) patientData.employer = a.employer || null;
    if (a.race) patientData.race = a.race;
    if (a.ethnicity) patientData.ethnicity = a.ethnicity;
    if (a.sex) patientData.sex = a.sex;
    if (a.maritalStatus) patientData.maritalStatus = a.maritalStatus;

    protegerCifrados(patientData, guardado);

    if (Object.keys(patientData).length > 0) {
      await db.patient.update({ where: { id: rec.patient.id }, data: patientData });
    }
    if (a.referredBy !== undefined) {
      const existingCase = await db.case.findUnique({ where: { id: rec.id }, select: { consentsData: true } });
      const prev = (existingCase?.consentsData ?? {}) as Record<string, unknown>;
      await db.case.update({ where: { id: rec.id }, data: { consentsData: { ...prev, referredBy: a.referredBy || null } } });
    }
  }

  if (step === 4 && data.guardian) {
    const g = data.guardian;
    const patientData: Record<string, unknown> = {};
    if (g.guardianName !== undefined) patientData.guardianName = g.guardianName || null;
    if (g.guardianPhone !== undefined) patientData.guardianPhone = g.guardianPhone || null;
    if (g.guardianRelation !== undefined) patientData.guardianRelation = g.guardianRelation || null;

    protegerCifrados(patientData, guardado);

    if (Object.keys(patientData).length > 0) {
      await db.patient.update({ where: { id: rec.patient.id }, data: patientData });
    }
    // Extra fields (lastName, email, dob, cellPhone, address) → consentsData JSON
    const extraFields = {
      ...(g.guardianLastName !== undefined ? { guardianLastName: g.guardianLastName || null } : {}),
      ...(g.guardianEmail !== undefined ? { guardianEmail: g.guardianEmail || null } : {}),
      ...(g.guardianDOB !== undefined ? { guardianDOB: g.guardianDOB || null } : {}),
      ...(g.guardianCellPhone !== undefined ? { guardianCellPhone: g.guardianCellPhone || null } : {}),
      ...(g.guardianAddress !== undefined ? { guardianAddress: g.guardianAddress || null } : {}),
    };
    if (Object.keys(extraFields).length > 0) {
      const existing = await db.case.findUnique({ where: { id: rec.id }, select: { consentsData: true } });
      const prev = (existing?.consentsData ?? {}) as Record<string, unknown>;
      await db.case.update({ where: { id: rec.id }, data: { consentsData: { ...prev, ...extraFields } } });
    }
  }

  /**
   * Tipo de caso que quedó vigente después del paso 5.
   *
   * Viaja en la respuesta para que el wizard adopte lo que el servidor decidió
   * y no lo que el paciente pidió. Sin esto, un pedido bloqueado dejaba a las
   * dos mitades en desacuerdo: la pantalla seguía en modo GM y cerraba con
   * "Enviar registro", mientras `/sign` —que lee la DB— seguía exigiendo el
   * lien. El paciente llegaba al final del formulario y ahí recibía un error,
   * que es el peor lugar posible para enterarse.
   */
  let caseTypeEfectivo: 'MVA' | 'GM' | null = null;

  if (step === 5 && data.accident) {
    const a = data.accident;
    const caseData: Record<string, unknown> = {};
    /** Parches al JSON `consentsData`. Se juntan acá y se aplican de una sola
     *  vez sobre lo guardado: escribirlos por separado hace que el último pise
     *  a los anteriores, porque cada escritura reemplaza el JSON entero. */
    const consents: Record<string, unknown> = {};

    if (a.type) {
      // 'MVA' → caseType=MVA, 'GM' → caseType=GENERAL (CaseTypeWorkflow enum)
      const pedido = a.type === 'GM' ? 'GENERAL' : 'MVA';

      /**
       * El paciente NO puede degradar un MVA con respaldo legal.
       *
       * Antes esta línea era `caseData.caseType = …` a secas, y ese era el
       * agujero más caro del intake: un toque en "GM" reescribía la columna, y
       * como `/sign` decide el lien leyendo esa misma columna —bien, para que
       * no se pueda falsear desde el body— el lien simplemente dejaba de
       * pedirse. El control del servidor era real contra un flag manipulado,
       * pero no contra el paciente habiendo reescrito la columna un paso antes.
       *
       * El sentido contrario (GM → MVA) sí pasa: solo AGREGA requisitos, nunca
       * saca uno. Y un MVA sin nada legal encima todavía es una suposición del
       * alta, así que el paciente puede corregirla.
       *
       * Cuando se bloquea no se pierde: queda declarado en `consentsData` y en
       * el audit log, para que Edson resuelva la discrepancia con el paciente
       * delante. Mismo criterio que los seguros: entra como declarado, no pisa.
       */
      const degrada = rec.caseType === 'MVA' && pedido === 'GENERAL';

      if (degrada && tieneRespaldoLegal(rec)) {
        consents.caseTypeDeclarado = {
          valor:       'GM',
          declaradoEn: new Date().toISOString(),
          motivo:      'El paciente declaró visita general en un MVA con respaldo legal',
        };
        await writeAuditLog(db, {
          actorType:   'SYSTEM',
          actorUserId: null,
          action:      'INTAKE_CASE_TYPE_DECLARADO',
          // 'cases', NO 'Case'. En la tabla conviven las tres grafías —'cases'
          // (34 escrituras), 'case' (7) y 'Case' (7)— y la única vista que lee
          // historial de un caso filtra por 'cases'. Escribirlo como 'Case'
          // deja el registro guardado pero invisible, que para una discrepancia
          // que alguien tiene que resolver es lo mismo que no guardarlo.
          entityType:  'cases',
          entityId:    rec.id,
          metadata: {
            caseCode:    rec.caseCode,
            enLaDb:      rec.caseType,
            declarado:   pedido,
            aplicado:    false,
            lienFirmado: rec._count.lienSignatures > 0,
            tieneBufete: !!rec.lawFirmId || !!rec.attorneyId || !!rec.attorneyNameRaw,
            token:       token.slice(0, 8) + '…',
          },
        }).catch(() => undefined);
      } else {
        caseData.caseType = pedido;
      }
    }

    if (a.date)     caseData.accidentDate     = parseDateLocal(a.date);
    if (a.notes)    caseData.accidentNotes    = a.notes;

    if (a.lawFirm      !== undefined) consents.lawFirm      = a.lawFirm || null;
    if (a.attorney     !== undefined) consents.attorney     = a.attorney || null;
    if (a.chiropractor !== undefined) consents.chiropractor = a.chiropractor || null;

    if (Object.keys(consents).length > 0) {
      const existing = await db.case.findUnique({ where: { id: rec.id }, select: { consentsData: true } });
      const prev = (existing?.consentsData ?? {}) as Record<string, unknown>;
      caseData.consentsData = { ...prev, ...consents };
    }

    if (Object.keys(caseData).length > 0) {
      await db.case.update({ where: { id: rec.id }, data: caseData });
    }

    const vigente = (caseData.caseType as string | undefined) ?? rec.caseType;
    caseTypeEfectivo = vigente === 'MVA' ? 'MVA' : 'GM';
  }

  if (step === 6 && data.insurances !== undefined) {
    const existingCase = await db.case.findUnique({ where: { id: rec.id }, select: { consentsData: true } });
    const prev = (existingCase?.consentsData ?? {}) as Record<string, unknown>;
    await db.case.update({ where: { id: rec.id }, data: { consentsData: { ...prev, insurances: data.insurances as object[] } } });

    /**
     * Y de ahí al CASO, que es donde lo lee el resto del sistema.
     *
     * Hasta hoy el guardado terminaba en la línea de arriba: el seguro quedaba
     * dentro del JSON y la portada del caso seguía diciendo "sin aseguradora
     * primaria" con la póliza cargada. Nadie miraba ese array (Erick,
     * 2026-09-15 — tuvo que volver a llamar a una paciente por un dato que ella
     * ya había puesto).
     *
     * Conservadora por diseño: solo completa lo que está vacío, así que el
     * autosave del wizard la puede disparar en cada tecleo sin pisar lo que
     * cargó el staff. Ver `seguro-declarado.ts`.
     */
    await promoverSeguroDeclarado(db, rec.id).catch((e) => {
      // No frena el intake: el dato declarado ya quedó guardado igual.
      console.error('[intake] no se pudo promover el seguro declarado:', e);
    });
  }

  if (step === 7 && data.health) {
    const h = data.health;
    await db.intakeSubmission.upsert({
      where:  { caseId: rec.id },
      create: {
        caseId:             rec.id,
        healthStatus:       h.healthStatus ?? null,
        hasMedications:     h.hasMedications ?? false,
        medications:        h.medications ?? null,
        hasAllergies:       h.hasAllergies ?? false,
        allergies:          h.allergies ?? null,
        hasPreviousInjuries: h.hasPreviousInjuries ?? false,
        previousInjuries:   h.previousInjuries ?? null,
        language:           h.preferredLanguage ?? 'es',
      },
      update: {
        healthStatus:       h.healthStatus ?? null,
        hasMedications:     h.hasMedications ?? false,
        medications:        h.medications ?? null,
        hasAllergies:       h.hasAllergies ?? false,
        allergies:          h.allergies ?? null,
        hasPreviousInjuries: h.hasPreviousInjuries ?? false,
        previousInjuries:   h.previousInjuries ?? null,
        language:           h.preferredLanguage ?? 'es',
      },
    });
  }

  /**
   * ─── Paso 8 · las fotos que el paciente reusó ─────────────────────────────
   *
   * Las que SÍ sacó ya se guardaron una por una en `upload-photo`. Lo que falta
   * registrar es lo otro: que miró la licencia que ya teníamos, la dio por
   * buena y siguió. Sin esto el expediente queda idéntico al de alguien que
   * abandonó el paso —`consentsData.photos` vacío en los dos casos— y la única
   * razón por la que las pantallas igual muestran las fotos es que se acuerdan
   * de pedir el respaldo por persona.
   *
   * Se guarda la CLAVE del archivo y no la url: la que ve el paciente está
   * firmada y vence en dos horas, así que como registro no sirve de nada.
   *
   * Va en una clave propia (`fotosReusadas`) y no en `photos`, que es lo que
   * todo el mundo lee esperando una url que se pueda poner en un `<img>`.
   */
  if (step === 8 && data.fotos) {
    const pedidas = (data.fotos.reusadas ?? []).filter(esSlotFoto);
    const vigente = data.fotos.tarjetaSeguroVigente;

    const claves = pedidas.length > 0
      ? await clavesDeFotosDelPaciente(db, rec.patient.id)
      : {};

    const reusadas: Record<string, { s3Key: string; at: string }> = {};
    const ahora = new Date().toISOString();
    for (const slot of pedidas) {
      const s3Key = claves[slot];
      // Si no hay documento detrás, el cliente dijo que reusó algo que no
      // existe. No se registra: es mejor un expediente que no dice nada que uno
      // que afirma tener una licencia que nadie puede abrir.
      if (s3Key) reusadas[slot] = { s3Key, at: ahora };
    }

    const existing = await db.case.findUnique({ where: { id: rec.id }, select: { consentsData: true } });
    const prev = (existing?.consentsData ?? {}) as Record<string, unknown>;

    /**
     * Qué fotos OBLIGATORIAS faltan de verdad.
     *
     * Se calcula acá y no se le cree al cliente: el navegador podría decir que
     * difirió unas fotos que sí subió, o al revés. Se mira dónde están de
     * verdad — primero en este caso, después entre las del paciente, que es de
     * donde salen las que hereda de una visita anterior.
     *
     * Solo selfie y licencia: son las dos que el formulario exige. La tarjeta
     * del seguro no bloquea a nadie.
     */
    await db.case.update({
      where: { id: rec.id },
      data: {
        consentsData: {
          ...prev,
          ...(Object.keys(reusadas).length > 0 ? { fotosReusadas: reusadas } : {}),
          /**
           * Que el paciente confirme que su tarjeta de seguro sigue vigente es
           * un dato de facturación, no un detalle de la pantalla: es la
           * diferencia entre cobrar contra una cobertura verificada y descubrir
           * el rechazo un mes después.
           */
          ...(typeof vigente === 'boolean'
            ? { tarjetaSeguroVigente: vigente, tarjetaSeguroVigenteAt: ahora }
            : {}),
        } as object,
      },
    });

  }

  if (step === 9 && data.consents) {
    const c = data.consents;
    const existing = await db.case.findUnique({ where: { id: rec.id }, select: { consentsData: true } });
    const prev = (existing?.consentsData ?? {}) as Record<string, unknown>;
    await db.case.update({
      where: { id: rec.id },
      data: {
        consentsData: {
          ...prev,
          ...(c.hipaa                !== undefined ? { hipaa: c.hipaa }                               : {}),
          ...(c.assignedParties      !== undefined ? { assignedParties: c.assignedParties }           : {}),
          ...(c.authRecords          !== undefined ? { authRecords: c.authRecords }                   : {}),
          ...(c.authVoicemail        !== undefined ? { authVoicemail: c.authVoicemail }               : {}),
          ...(c.authNotifications    !== undefined ? { authNotifications: c.authNotifications }       : {}),
          ...(c.authorizedPersons    !== undefined ? { authorizedPersons: c.authorizedPersons }       : {}),
          ...(c.treatment            !== undefined ? { treatment: c.treatment }                       : {}),
          ...(c.financial            !== undefined ? { financial: c.financial }                       : {}),
          ...(c.financialSignatureSvg !== undefined ? { financialSignatureSvg: c.financialSignatureSvg } : {}),
          ...(c.medicalHistory        !== undefined ? { medicalHistory: c.medicalHistory }             : {}),
        },
      },
    });
  }

  // Audit log — autosave (non-blocking, best-effort)
  writeAuditLog(db, {
    actorType:    'SYSTEM',
    actorUserId:  null,
    action:       'INTAKE_STEP_SAVE',
    entityType:   'Case',
    entityId:     rec.id,
    metadata:     { step, token: token.slice(0, 8) + '…' },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, ...(caseTypeEfectivo ? { caseType: caseTypeEfectivo } : {}) });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[intake PATCH] step=${step} error:`, msg);
    // Unique constraint (P2002) — email/phone duplicado
    if (msg.includes('P2002') || msg.includes('Unique constraint')) {
      const field = msg.includes('email') ? 'correo electrónico' : msg.includes('phone') ? 'teléfono' : 'campo';
      return NextResponse.json(
        { error: 'DUPLICATE_FIELD', detail: `El ${field} ingresado ya está registrado en otro paciente. Por favor usa uno diferente.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'SAVE_FAILED', detail: msg }, { status: 500 });
  }
}
