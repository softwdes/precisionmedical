/**
 * GET /api/admin/cases/[id]/pdf
 *
 * Genera el formulario de intake del caso como PDF descargable.
 * Diseño fiel al V2: fondo blanco, 3 páginas, textos legales completos.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import {
  renderToBuffer, Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer';
import { readFileSync } from 'fs';
import { join } from 'path';

// Logo leído una vez al arrancar el módulo
const LOGO_B64 = (() => {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'logo-pm.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
})();

// ─── Textos legales ────────────────────────────────────────────────────────────
const CONSENT_TEXTS = {
  c1Title: 'MEDICAL INFORMATION RELEASE',
  c1Body: `I acknowledge that I have been provided with a copy of the NOTICE OF PRIVACY PRACTICES of Precision Medical Urgent Care & Family Practice (PMUCFP). I understand that PMUCFP may release all or portions of my medical records, or those of my dependents, to me, as well as to individuals or entities responsible for paying the charges for services rendered. This may include my insurance carriers (e.g., health, auto, worker's compensation, disability) and attorneys working on my case.\n\nFurthermore, I acknowledge that PMUCFP may disclose patient information to referring or treating healthcare providers, and for purposes of payment and healthcare operations.\n\nI hereby authorize PMUCFP to obtain medical information from other healthcare entities and providers, including but not limited to: lab results, diagnostic test reports, images, and other clinical information deemed necessary by PMUCFP's physicians or representatives.\n\nI understand that I may inspect my protected health information, or that of my dependents, request additional information, and revoke this authorization in accordance with federal privacy regulations and PMUCFP's privacy policy. I understand that this revocation must be made in writing, except to the extent that PMUCFP has already used or disclosed my protected health information based on my original request.`,

  c2Title: 'MEDICAL INFORMATION RELEASE TO ASSIGNED PARTIES',
  c2Body: `Under the Health Insurance Portability and Accountability Act (HIPAA), I have certain rights regarding my protected health information. I hereby specifically authorize the disclosure of my health information for the following purposes:\n\nIn my absence, I authorize Precision Medical Urgent Care & Family Practice to release all or portions of my, or my dependents', protected health information to the individuals or entities indicated below.\n\nThis authorization remains in effect until I revoke it in writing.`,
  c2AuthRows: ['Name:', 'Name:', 'Name:', 'Name:'],

  c3Title: 'CONSENT FOR TREATMENT',
  c3Body: `I hereby authorize care and consent to medical treatment, including tests and procedures, performed by the physician(s) or other healthcare providers for my treatment or the treatment of my dependents.\n\nI intend this authorization to apply to this visit and any future care that I or my dependents may seek.`,

  c4Title: 'CREDIT AND FINANCE CHARGE POLICY AND AGREEMENT',
  c4Body: `I agree to be financially responsible for any costs incurred for myself or my dependents. I understand that charges for services provided must be paid at the time of service, including any copayments or deductibles as per my agreement with my health insurance carrier. I understand that PMUCFP will submit claims on my behalf and that I am financially responsible for any balance, copayments, coinsurance, deductibles, or services not covered by my insurance company. I authorize any benefits due to me to be paid directly to Precision Medical Urgent Care & Family Practice (assignment of benefits).\n\nFinancial Responsibility:\n\nPMUCFP reserves the right to charge a fee of $50 to $100 for appointments canceled or missed without at least 24 hours' notice.\n\nA finance charge of 1.5% per month (APR 18%) will be added to my account if payment is not received within 30 days of the statement date.\n\nI agree to pay a service fee of $25.00 for any returned check or other payment method returned by my financial institution.\n\nIf any amounts are referred to a third-party debt collection agency, I agree that, in addition to any other amounts allowed by law (including interest, court costs, and attorney fees), I will also be responsible for a collection fee of up to 40% of the principal amount owed, as permitted by Utah Code Annotated section 12-1-11. These terms apply to all the amounts incurred by me or any individual for whom I have legal responsibility, whether incurred before or after the date of this agreement.\n\nIn consideration for the medical services rendered, I acknowledge receipt of PMUCFP's Financial Policy and agree to pay for medical services according to its terms.`,

  c5Title: 'MEDICAL HISTORY AUTHORITY',
  c5Body: `Electronic Health Records (EHR) System Authorization: PMUCFP has implemented a new Electronic Health Records (EHR) system that imports prescription history from third-party sources (e.g., pharmacies).\n\nIn order to transfer my current and past prescription history to this new system, I hereby provide my consent. By signing below, I authorize PMUCFP to transfer my prescription history.`,
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const BLUE   = '#1E4D8C';
const LBLUE  = '#4A90D9';
const GRAY1  = '#F2F2F2';
const GRAY2  = '#D8D8D8';
const BLACK  = '#1A1A1A';
const DGRAY  = '#555555';
const GREEN  = '#2E7D32';

const s = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 40,
    paddingTop: 28,
    paddingBottom: 36,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: BLACK,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: BLUE,
  },
  headerLogoBlock: { flexDirection: 'column', gap: 1 },
  headerLogoImg: { width: 160, height: 50, objectFit: 'contain' },
  headerLogoTop: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: BLUE, letterSpacing: -0.3 },
  headerLogoSub: { fontSize: 7.5, color: LBLUE, letterSpacing: 0.8, textTransform: 'uppercase' },
  headerRight: { alignItems: 'flex-end' },
  headerAddr: { fontSize: 8, color: DGRAY, textAlign: 'right', lineHeight: 1.5 },

  // ── Title ──
  pageTitle: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: BLACK,
    marginBottom: 12,
    letterSpacing: 0.3,
  },

  // ── Section ──
  sectionHeader: {
    backgroundColor: GRAY1,
    borderWidth: 1,
    borderColor: GRAY2,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: BLACK,
  },
  sectionBody: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: GRAY2,
    marginBottom: 10,
  },

  // ── Table rows ──
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: GRAY2,
    minHeight: 20,
  },
  tableRowLast: {
    flexDirection: 'row',
    minHeight: 20,
  },
  cellLabel: {
    width: '22%',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRightWidth: 1,
    borderRightColor: GRAY2,
    backgroundColor: '#FAFAFA',
  },
  cellLabelText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DGRAY },
  cellValue: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  cellValueText: { fontSize: 8.5, color: BLACK },
  cellValueEmpty: { fontSize: 8.5, color: '#AAAAAA', fontStyle: 'italic' },

  // 2-col table
  cell2Label: {
    width: '18%',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRightWidth: 1,
    borderRightColor: GRAY2,
    backgroundColor: '#FAFAFA',
  },
  cell2Value: {
    width: '32%',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRightWidth: 1,
    borderRightColor: GRAY2,
  },
  cell2ValueLast: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },

  // ── Consent page ──
  consentSection: { marginBottom: 14 },
  consentTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: BLACK,
    textAlign: 'center',
    marginBottom: 6,
  },
  consentBody: { fontSize: 8, color: BLACK, lineHeight: 1.5, marginBottom: 6 },
  consentCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  consentCheckBox: {
    width: 10, height: 10,
    borderWidth: 1, borderColor: BLACK,
    alignItems: 'center', justifyContent: 'center',
  },
  consentCheckText: { fontSize: 8, fontFamily: 'Helvetica-Bold' },

  // Auth persons table
  authRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: GRAY2,
    paddingVertical: 3,
  },
  authLabel: { width: '40%', fontSize: 8, color: DGRAY },
  authRelLabel: { width: '20%', fontSize: 8, color: DGRAY },
  authValue: { flex: 1, fontSize: 8, color: '#AAAAAA', fontStyle: 'italic' },

  // Divider
  divider: { height: 1, backgroundColor: GRAY2, marginVertical: 8 },

  // Signature
  sigSection: { marginTop: 10 },
  sigLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DGRAY, marginBottom: 4 },
  sigImage: { width: 120, height: 50, objectFit: 'contain' },
  sigPlaceholder: {
    width: 180,
    height: 50,
    borderBottomWidth: 1,
    borderBottomColor: BLACK,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: GRAY2,
    paddingTop: 4,
  },
  footerText: { fontSize: 7, color: '#AAAAAA' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function v(val: string | null | undefined) {
  return val?.trim() || null;
}
function fmtDate(d: Date | string | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function age(dob: Date | null | undefined): string | null {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return String(Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
}

// Checkbox indicator (unused standalone — checkboxes rendered inline in consent text)
function Chk({ checked }: { checked?: boolean }) {
  return (
    <View style={s.consentCheckBox}>
      {checked && <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }}>X</Text>}
    </View>
  );
}

// Page header component (reused on every page)
function PageHeader() {
  return (
    <View style={s.header}>
      <View style={s.headerLogoBlock}>
        {LOGO_B64
          ? <Image src={LOGO_B64} style={s.headerLogoImg} />
          : <><Text style={s.headerLogoTop}>Precision Medical</Text><Text style={s.headerLogoSub}>Urgent Care and Family Practice</Text></>
        }
      </View>
      <View style={s.headerRight}>
        <Text style={s.headerAddr}>
          {'Precision Medical\n75 South 200 East Suite 202 Provo, UT, 84606\nEmail: info@precisionmedicalcare.com\nTel: (801) 375-2207\nFax: (801) 375-2307'}
        </Text>
      </View>
    </View>
  );
}

function TableRow({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  const RowStyle = last ? s.tableRowLast : s.tableRow;
  const txt = value?.trim();
  return (
    <View style={RowStyle}>
      <View style={s.cellLabel}><Text style={s.cellLabelText}>{label}</Text></View>
      <View style={s.cellValue}>
        {txt
          ? <Text style={s.cellValueText}>{txt}</Text>
          : <Text style={s.cellValueEmpty}>N/A</Text>
        }
      </View>
    </View>
  );
}

function TableRow2({
  l1, v1, l2, v2, last,
}: { l1: string; v1?: string | null; l2: string; v2?: string | null; last?: boolean }) {
  const RowStyle = last ? s.tableRowLast : s.tableRow;
  return (
    <View style={RowStyle}>
      <View style={s.cell2Label}><Text style={s.cellLabelText}>{l1}</Text></View>
      <View style={s.cell2Value}>
        {v1?.trim() ? <Text style={s.cellValueText}>{v1.trim()}</Text> : <Text style={s.cellValueEmpty}>N/A</Text>}
      </View>
      <View style={s.cell2Label}><Text style={s.cellLabelText}>{l2}</Text></View>
      <View style={s.cell2ValueLast}>
        {v2?.trim() ? <Text style={s.cellValueText}>{v2.trim()}</Text> : <Text style={s.cellValueEmpty}>N/A</Text>}
      </View>
    </View>
  );
}

// ─── PDF Builder ──────────────────────────────────────────────────────────────
async function buildPDF(data: {
  patient: {
    firstName: string; lastName: string;
    dateOfBirth: Date | null; phone: string | null; email: string | null;
    addressLine1: string | null; addressCity: string | null; addressState: string | null; addressZip: string | null;
    emergencyContactName: string | null; emergencyContactPhone: string | null; emergencyContactRelation: string | null;
  };
  caseData: {
    caseCode: string; caseType: string; accidentDate: Date | null; accidentType: string | null;
    intakeFormCompletedAt: Date | null; consentsData: Record<string, unknown> | null;
    consentSignaturePng: string | null;
    lawFirm: { firmName: string | null } | null;
    primaryInsurance: { name: string } | null;
  };
  intake: {
    healthStatus: string | null;
    hasMedications: boolean; medications: string | null;
    hasAllergies: boolean; allergies: string | null;
    hasPreviousInjuries: boolean; previousInjuries: string | null;
  } | null;
}) {
  const { patient, caseData, intake } = data;
  const cd = caseData.consentsData as Record<string, unknown> | null;

  // La firma del PACIENTE (portal/tablet, wizard step 9) es la que cuenta
  // legalmente. `consentSignaturePng` es un campo viejo que el back-office
  // llenaba cuando el personal firmaba en lugar del paciente durante la
  // creación del caso — eso se saca del wizard interno, ver case-wizard-dialog.
  // Se deja como fallback solo para no perder los casos que ya quedaron con
  // esa firma y ninguna otra.
  const patientSig = (cd?.financialSignatureSvg as string | null) ?? null;
  const staffSig    = caseData.consentSignaturePng;
  const sigPng       = patientSig ?? staffSig;
  const sigIsPatient = !!patientSig;

  const fullName = `${patient.firstName} ${patient.lastName}`;
  const address = [patient.addressLine1, patient.addressCity, patient.addressState, patient.addressZip]
    .filter(Boolean).join(', ') || null;
  const emergencyContact = patient.emergencyContactName
    ? `${patient.emergencyContactName} (${patient.emergencyContactRelation ?? ''}) ${patient.emergencyContactPhone ?? ''}`
    : null;

  const HEALTH_LABEL: Record<string, string> = {
    excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor',
  };
  const ACCIDENT_LABEL: Record<string, string> = {
    AUTO_ACCIDENT: 'Auto Accident (MVA)',
    SLIP_AND_FALL: 'Slip & Fall',
    WORK_INJURY:   'Work Injury',
    OTHER:         'Other',
  };

  const completedDate = fmtDate(caseData.intakeFormCompletedAt);

  const doc = (
    <Document
      title={`Patient Intake Form — ${caseData.caseCode}`}
      author="Precision Medical Care"
      subject="Patient Intake Form"
    >
      {/* ══════════════════════════════════════════════════
          PAGE 1 — Patient Information + Case Info
      ══════════════════════════════════════════════════ */}
      <Page size="LETTER" style={s.page}>
        <PageHeader />
        <Text style={s.pageTitle}>Patient Intake Form</Text>

        {/* Patient Information */}
        <View style={s.sectionHeader}><Text style={s.sectionTitle}>Patient Information</Text></View>
        <View style={s.sectionBody}>
          <TableRow2 l1="Name:" v1={fullName} l2="Address:" v2={address} />
          <TableRow2 l1="Sex:" v1={null} l2="Phone:" v2={patient.phone} />
          <TableRow2 l1="Date of Birth:" v1={fmtDate(patient.dateOfBirth)} l2="Cellphone:" v2={patient.phone} />
          <TableRow2 l1="Age:" v1={age(patient.dateOfBirth)} l2="Email:" v2={patient.email} />
          <TableRow2 l1="Ethnicity:" v1={null} l2="Employer:" v2={null} />
          <TableRow2 l1="Race:" v1={null} l2="Preferred Language:" v2={null} />
          <TableRow2 l1="Marital Status:" v1={null} l2="Preferred Pharmacy:" v2={null} />
          <TableRow2 l1="Referred By:" v1={null} l2="Notification Method:" v2="email" />
          <TableRow2
            l1="Emergency Contact 1:"
            v1={emergencyContact}
            l2="Emergency Contact 2:"
            v2={null}
            last
          />
        </View>

        {/* Medical History */}
        {intake && (
          <>
            <View style={s.sectionHeader}><Text style={s.sectionTitle}>Medical History</Text></View>
            <View style={s.sectionBody}>
              <TableRow label="Health Status" value={HEALTH_LABEL[intake.healthStatus ?? ''] ?? null} />
              <TableRow2
                l1="Medications:"
                v1={intake.hasMedications ? (intake.medications ?? 'Yes') : 'No'}
                l2="Allergies:"
                v2={intake.hasAllergies ? (intake.allergies ?? 'Yes') : 'No'}
              />
              <TableRow
                label="Previous Injuries:"
                value={intake.hasPreviousInjuries ? (intake.previousInjuries ?? 'Yes') : 'No'}
                last
              />
            </View>
          </>
        )}

        {/* Case Information */}
        <View style={s.sectionHeader}><Text style={s.sectionTitle}>Case Information</Text></View>
        <View style={s.sectionBody}>
          <TableRow2 l1="Case type:" v1={caseData.caseType} l2="Entry date:" v2={completedDate ?? fmtDate(new Date())} last />
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Precision Medical Care · Confidential document</Text>
          <Text style={s.footerText}>{caseData.caseCode}</Text>
        </View>
      </Page>

      {/* ══════════════════════════════════════════════════
          PAGE 2 — Consents 1, 2, 3
      ══════════════════════════════════════════════════ */}
      <Page size="LETTER" style={s.page}>
        <PageHeader />
        <Text style={s.pageTitle}>Consents</Text>

        {/* C1 — Medical Information Release */}
        <View style={s.consentSection}>
          <Text style={s.consentTitle}>{CONSENT_TEXTS.c1Title}</Text>
          <Text style={s.consentBody}>{CONSENT_TEXTS.c1Body}</Text>
          <View style={s.consentCheck}>
            <Chk checked={!!cd?.hipaa} />
            <Text style={s.consentCheckText}>I accept all the terms of this consent</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* C2 — Assigned Parties */}
        <View style={s.consentSection}>
          <Text style={s.consentTitle}>{CONSENT_TEXTS.c2Title}</Text>
          <Text style={s.consentBody}>{CONSENT_TEXTS.c2Body}</Text>

          {/* Auth persons rows */}
          {CONSENT_TEXTS.c2AuthRows.map((_, i) => (
            <View key={i} style={s.authRow}>
              <Text style={s.authLabel}>Name:</Text>
              <Text style={s.authLabel}>   </Text>
              <Text style={s.authRelLabel}>Relationship:</Text>
              <Text style={s.authValue}> </Text>
            </View>
          ))}

          <View style={{ marginTop: 6 }}>
            <View style={s.consentCheck}>
              <Text style={s.consentCheckText}>[{cd?.assignedParties ? 'X' : ' '}] I AUTHORIZE THE RELEASE OF ALL OR PORTIONS OF MY MEDICAL RECORDS TO MY PARENTS (18 years of age and older).</Text>
            </View>
            <View style={s.consentCheck}>
              <Text style={s.consentCheckText}>[ ] I AUTHORIZE TEST RESULTS AND APPOINTMENT REMINDERS TO BE LEFT ON MY VOICE MAIL.</Text>
            </View>
            <View style={s.consentCheck}>
              <Text style={s.consentCheckText}>[ ] I AUTHORIZE NOTIFICATIONS AND APPOINTMENT REMINDERS TO BE SENT BY EMAIL OR TEXT MESSAGE.</Text>
            </View>
            <View style={[s.consentCheck, { marginTop: 4 }]}>
              <Text style={s.consentCheckText}>[{cd?.assignedParties ? 'X' : ' '}] I accept all the terms of this consent</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* C3 — Consent for Treatment */}
        <View style={s.consentSection}>
          <Text style={s.consentTitle}>{CONSENT_TEXTS.c3Title}</Text>
          <Text style={s.consentBody}>{CONSENT_TEXTS.c3Body}</Text>
          <View style={s.consentCheck}>
            <Text style={s.consentCheckText}>[{cd?.treatment ? 'X' : ' '}] I accept all the terms of this consent</Text>
          </View>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Precision Medical Care · Confidential document</Text>
          <Text style={s.footerText}>{caseData.caseCode}</Text>
        </View>
      </Page>

      {/* ══════════════════════════════════════════════════
          PAGE 3 — Financial Policy + Medical History Auth + Signature
      ══════════════════════════════════════════════════ */}
      <Page size="LETTER" style={s.page}>
        <PageHeader />

        {/* C4 — Financial Policy */}
        <View style={s.consentSection}>
          <Text style={s.consentTitle}>{CONSENT_TEXTS.c4Title}</Text>
          <Text style={s.consentBody}>{CONSENT_TEXTS.c4Body}</Text>
          <View style={s.consentCheck}>
            <Text style={s.consentCheckText}>[{cd?.financial ? 'X' : ' '}] I accept all the terms of this consent</Text>
          </View>

          {/* Signature */}
          <View style={s.sigSection}>
            <Text style={s.sigLabel}>
              {sigPng
                ? `Digital Sign${sigIsPatient ? ' (Patient)' : ' (Staff — patient signature not on file)'}:`
                : 'Digital Sign:'}
            </Text>
            {sigPng ? (
              <Image
                src={sigPng.startsWith('data:') ? sigPng : `data:image/png;base64,${sigPng}`}
                style={s.sigImage}
              />
            ) : (
              <View style={s.sigPlaceholder} />
            )}
          </View>
        </View>

        <View style={s.divider} />

        {/* C5 — Medical History Authority */}
        <View style={s.consentSection}>
          <Text style={s.consentTitle}>{CONSENT_TEXTS.c5Title}</Text>
          <Text style={s.consentBody}>{CONSENT_TEXTS.c5Body}</Text>
          <View style={s.consentCheck}>
            <Text style={s.consentCheckText}>[{cd?.medicalHistory ? 'X' : ' '}] I accept all the terms of this consent</Text>
          </View>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Precision Medical Care · Confidential document</Text>
          <Text style={s.footerText}>{caseData.caseCode} · {completedDate ?? 'Pending'}</Text>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const caseRecord = await db.case.findUnique({
    where: { id },
    select: {
      caseCode:              true,
      caseType:              true,
      accidentDate:          true,
      accidentType:          true,
      intakeFormCompletedAt: true,
      consentsData:          true,
      consentSignaturePng:   true,
      lawFirm:   { select: { firmName: true } },
      primaryInsurance: { select: { name: true } },
      patient: {
        select: {
          firstName: true, lastName: true,
          dateOfBirth: true, phone: true, email: true,
          addressLine1: true, addressCity: true, addressState: true, addressZip: true,
          emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
        },
      },
      intakeSubmission: {
        select: {
          healthStatus: true,
          hasMedications: true, medications: true,
          hasAllergies: true,   allergies: true,
          hasPreviousInjuries: true, previousInjuries: true,
        },
      },
    },
  });

  if (!caseRecord) {
    return NextResponse.json({ error: 'CASE_NOT_FOUND' }, { status: 404 });
  }

  const buffer = await buildPDF({
    patient:  caseRecord.patient,
    caseData: {
      caseCode:              caseRecord.caseCode,
      caseType:              caseRecord.caseType,
      accidentDate:          caseRecord.accidentDate,
      accidentType:          caseRecord.accidentType,
      intakeFormCompletedAt: caseRecord.intakeFormCompletedAt,
      consentsData:          caseRecord.consentsData as Record<string, unknown> | null,
      consentSignaturePng:   caseRecord.consentSignaturePng,
      lawFirm:               caseRecord.lawFirm,
      primaryInsurance:      caseRecord.primaryInsurance,
    },
    intake: caseRecord.intakeSubmission,
  });

  const filename = `intake-${caseRecord.caseCode}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length':      String(buffer.byteLength),
    },
  });
}

