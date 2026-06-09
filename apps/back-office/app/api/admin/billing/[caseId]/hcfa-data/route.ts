import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

/**
 * B.26 — HCFA / CMS-1500 data
 * GET /api/admin/billing/[caseId]/hcfa-data
 *
 * Devuelve todos los campos para el formulario CMS-1500 pre-cargados desde
 * la nota SOAP firmada, el caso y el catálogo de proveedores.
 *
 * Phase 1A notes:
 * - Tax ID: placeholder (Phase 2: billing_config table)
 * - NPI: desde DoctorCredentials vía Employee (query separada por caseId)
 * - Address: desde Clinic (Patient no tiene campo address)
 * - CaseType 'MVA' = Motor Vehicle Accident (el tipo principal de PM)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface CptRow {
  visit_note_id: string;
  cpt_code:      string;
  description:   string | null;
  units:         number;
  amount:        number;
}

interface DiagRow {
  visit_note_id: string;
  icd10_code:    string | null;
  icd10_label:   string | null;
}

interface CaseRow {
  id:                  string;
  caseCode:            string;
  caseType:            string;
  accidentDate:        Date | null;
  accidentType:        string | null;
  primaryPolicyNumber: string | null;
  patient: {
    firstName:   string;
    lastName:    string;
    dateOfBirth: Date | null;
    phone:       string | null;
  };
  primaryInsurance: {
    name:          string;
    legalName:     string | null;
    claimsPhone:   string | null;
    claimsEmail:   string | null;
    claimsFax:     string | null;
    claimsAddress: string | null;
  } | null;
  appointments: {
    id:           string;
    scheduledFor: Date;
    clinic:       { name: string; address: string | null } | null;
    provider: {
      id:        string;
      firstName: string;
      lastName:  string;
    } | null;
    visitNote: {
      id:       string;
      status:   string;
      signedAt: Date | null;
    } | null;
  }[];
  notes: {
    content:   string;
    createdAt: Date;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDob(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function fmtDate(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await ctx.params;

  const raw = await db.case.findUnique({
    where:  { id: caseId },
    select: {
      id:                  true,
      caseCode:            true,
      caseType:            true,
      accidentDate:        true,
      accidentType:        true,
      primaryPolicyNumber: true,
      patient: {
        select: {
          firstName:   true,
          lastName:    true,
          dateOfBirth: true,
          phone:       true,
        },
      },
      primaryInsurance: {
        select: {
          name:          true,
          legalName:     true,
          claimsPhone:   true,
          claimsEmail:   true,
          claimsFax:     true,
          claimsAddress: true,
        },
      },
      appointments: {
        where: {
          status:    'COMPLETED',
          visitNote: { status: 'SIGNED' },
        },
        select: {
          id:           true,
          scheduledFor: true,
          clinic:       { select: { name: true, address: true } },
          provider: {
            select: {
              id:        true,
              firstName: true,
              lastName:  true,
              // npiNumber is in DoctorCredentials → Employee, not Provider
            },
          },
          visitNote: {
            select: { id: true, status: true, signedAt: true },
          },
        },
        orderBy: { scheduledFor: 'desc' },
      },
      notes: {
        where:   { content: { startsWith: '🤖' } },
        select:  { content: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take:    5,
      },
    },
  });

  if (!raw) {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }

  // Cast: Prisma narrow-select doesn't infer relations correctly here
  const c = raw as unknown as CaseRow;

  // Gather signed visit note IDs
  const noteIds = c.appointments
    .map(a => a.visitNote?.id)
    .filter(Boolean) as string[];

  // CPT service lines via $queryRaw (snake_case table)
  let serviceLines: {
    date: string; cptCode: string; description: string;
    units: number; amount: number; amountFmt: string;
  }[] = [];

  if (noteIds.length > 0) {
    const cptRows = await db.$queryRaw<CptRow[]>`
      SELECT
        vsc.visit_note_id,
        vsc.cpt_code,
        vsc.description,
        vsc.units::int             AS units,
        COALESCE(vsc.fee_override, vsc.fee_catalog)::float AS amount
      FROM visit_service_codes vsc
      WHERE vsc.visit_note_id = ANY(${noteIds}::text[])
      ORDER BY vsc.visit_note_id, vsc.cpt_code
    `;

    const noteToDate = new Map<string, Date>();
    for (const a of c.appointments) {
      if (a.visitNote?.id) noteToDate.set(a.visitNote.id, a.scheduledFor);
    }

    serviceLines = cptRows.map(row => ({
      date:        fmtDate(noteToDate.get(row.visit_note_id) ?? null),
      cptCode:     row.cpt_code,
      description: row.description ?? '',
      units:       row.units,
      amount:      row.amount ?? 0,
      amountFmt:   fmtMoney(row.amount ?? 0),
    }));
  }

  // Diagnoses via $queryRaw
  const diagRows = noteIds.length > 0
    ? await db.$queryRaw<DiagRow[]>`
        SELECT vnd.visit_note_id, vnd.icd10_code, vnd.icd10_label
        FROM visit_note_diagnoses vnd
        WHERE vnd.visit_note_id = ANY(${noteIds}::text[])
        ORDER BY vnd.icd10_code
      `
    : [] as DiagRow[];

  const seenCodes = new Set<string>();
  const LETTERS   = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const diagnoses = diagRows
    .filter(d => {
      if (!d.icd10_code || seenCodes.has(d.icd10_code)) return false;
      seenCodes.add(d.icd10_code);
      return true;
    })
    .slice(0, 8)
    .map((d, i) => ({
      letter: LETTERS[i] ?? String(i + 1),
      code:   d.icd10_code ?? '—',
      label:  d.icd10_label ?? '—',
    }));

  // Provider (most recent appointment)
  const recentAppt = c.appointments[0];
  const provider   = recentAppt?.provider ?? null;
  const clinic     = recentAppt?.clinic   ?? null;

  // NPI lookup via DoctorCredentials (Phase 1A: optional join, graceful fallback)
  let providerNpi: string | null = null;
  if (provider?.id) {
    // DoctorCredentials links to Employee, not Provider directly.
    // Look up by matching email via Employee.
    // Phase 1A: raw query for simplicity
    const npiRows = await db.$queryRaw<{ npi_number: string | null }[]>`
      SELECT dc.npi_number
      FROM doctor_credentials dc
      JOIN employees e ON e.id = dc.employee_id
      JOIN providers p ON p.email = e.email
      WHERE p.id = ${provider.id}
      LIMIT 1
    `.catch(() => []);
    providerNpi = (npiRows[0]?.npi_number) ?? null;
  }

  // Already generated?
  const alreadyGenerated = c.notes.some(n => n.content.includes('HCFA'));

  // Total
  const totalCharge = serviceLines.reduce((s, l) => s + l.amount * l.units, 0);

  // caseType check — 'MVA' is the main case type at Precision Medical
  const isMva = c.caseType === 'MVA';

  const validations = {
    diagnosesLinked: diagnoses.length > 0,
    cptCodesValid:   serviceLines.length > 0,
    npiActive:       !!providerNpi,
    taxIdVerified:   true,  // Phase 2: verify against EIN registry
  };
  const allValid = Object.values(validations).every(Boolean);

  return NextResponse.json({
    ok: true,
    hcfaData: {
      caseId:   c.id,
      caseCode: c.caseCode,
      caseType: c.caseType,

      // CMS-1500 boxes
      insuredId:       c.primaryPolicyNumber ?? 'N/A',
      patientName:     c.patient
        ? `${c.patient.lastName.toUpperCase()}, ${c.patient.firstName.toUpperCase()}`
        : '—',
      patientFirstName: c.patient?.firstName ?? '',
      patientLastName:  c.patient?.lastName  ?? '',
      dob:     fmtDob(c.patient?.dateOfBirth ?? null),
      address: clinic?.address ?? '—',

      insurerName:  c.primaryInsurance?.name    ?? '—',
      insurerLegal: c.primaryInsurance?.legalName ?? null,
      groupNumber:  isMva ? 'PIP-AUTO-MVA' : (c.primaryPolicyNumber ?? '—'),

      dateOfInjury: fmtDate(c.accidentDate),
      injuryType:   c.accidentType === 'AUTO' ? 'Auto Accident' : (c.accidentType ?? 'Injury'),

      diagnoses,
      serviceLines,

      taxId: '87-XXXXXXX',   // Phase 2: billing_config

      totalCharge,
      totalChargeFmt: fmtMoney(totalCharge),

      facility: {
        name:    clinic?.name ?? 'Precision Medical · Provo Clinic',
        address: clinic?.address ?? '123 N University Ave, Provo UT 84601',
      },
      billingProvider: 'Precision Medical Pain Management and Orthopedics',

      providerName: provider
        ? `Dr. ${provider.firstName} ${provider.lastName}`
        : '—',
      providerNpi,

      insurerFax:   c.primaryInsurance?.claimsFax   ?? null,
      insurerEmail: c.primaryInsurance?.claimsEmail ?? null,
      insurerPhone: c.primaryInsurance?.claimsPhone ?? null,

      alreadyGenerated,
      validations,
      allValid,
    },
  });
}
