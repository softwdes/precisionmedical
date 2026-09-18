/**
 * El Medical Lien Agreement en PDF — el documento, sin el guard.
 *
 * Vive en `lib/` y no dentro de una ruta porque lo sirven DOS puertas con
 * reglas distintas, igual que `lib/intake-pdf.tsx`:
 *
 *   · el portal legal (`/api/attorney/cases/[id]/lien`) — acotado al alcance
 *     del bufete y sólo una vez que el abogado firmó;
 *   · el back office (`/api/admin/cases/[id]/lien`) — sin esa exigencia.
 *
 * Esa diferencia no es un descuido: la firma del ABOGADO es lo que le abre el
 * expediente al bufete. Para la clínica no significa nada — ella hace firmar al
 * PACIENTE y necesita ver ese papel el mismo día, esté el abogado donde esté.
 * Con el documento adentro de la ruta del portal legal, el back office no tenía
 * forma de abrirlo: daba 403 (Erick, 2026-09-17).
 *
 * Réplica del documento de v2, con el texto legal literal que pasó Erick
 * (2026-08-25).
 */

import * as React from 'react';
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { db, type Prisma } from '@precision-medical/database';
import { edad } from '@/lib/fechas';

const LOGO_B64 = (() => {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'logo-pm.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
})();

/**
 * El texto del acuerdo, literal.
 *
 * Va acá como constante y no en base de datos porque es el contrato vigente y
 * cambiarlo es una decisión legal, no de configuración: si alguien pudiera
 * editarlo desde una pantalla, los documentos ya firmados y los nuevos dirían
 * cosas distintas sin rastro de cuál se firmó.
 */
const LIEN_PARAGRAPHS = [
  `I hereby authorize Precision Medical Pain Management and Orthopedics ('the Provider') to furnish my attorney with full reports concerning my medical examinations, treatment, diagnosis, prognosis, billing, and any other information related to or arising from the accident or injury that occurred on or around the date referenced above. These records shall pertain to the current or pending litigation in which I am involved.`,
  `I acknowledge and agree that I am directly and fully responsible to Precision Medical Pain Management and Orthopedics, including its affiliated clinics, companies, and other entities, for all medical bills, charges, and services rendered to me. This agreement is made for the sole purpose of providing additional protection to Precision Medical Pain Management and Orthopedics, its affiliated clinics, companies, and other entities, in consideration of awaiting payment for services rendered on my behalf.`,
  `I further understand that payment of such medical bills is not contingent upon any financial settlement, payment, judgment, or verdict I may ultimately recover in this matter. I agree that Precision Medical Pain Management and Orthopedics, its affiliated clinics, companies, and other entities may seek payment for services rendered at any time, regardless of the outcome of my legal proceedings. Should no settlement, payment, judgment, or verdict be obtained, I remain fully responsible for paying the full amount due to Precision Medical Pain Management and Orthopedics, its clinics, companies, and other entities. They may pursue payment through any available legal means.`,
  `I hereby grant and assign to Precision Medical Pain Management and Orthopedics, its clinics, companies, and other entities, a lien upon any proceeds from any financial settlement, payment, judgment, or verdict that may be obtained in connection with my claim. I instruct my attorney to pay, in full, any amounts due to Precision Medical Pain Management and Orthopedics, its clinics, companies, and entities, within thirty (30) days of any financial settlement, payment, judgment, or verdict.`,
  `I agree to not rescind this document, and any attempted rescission will not be honored by my attorney. This agreement shall remain in full force and effect, regardless of whether my attorney signs it. Furthermore, in the event that my attorney is substituted or replaced, this agreement shall remain binding and enforceable upon my new attorney as if it had been executed by them.`,
  `I further understand that Precision Medical Pain Management and Orthopedics, its clinics, companies, and other entities may file this agreement with the court having jurisdiction over my case or with any third-party payer responsible for payments related to my treatment. By doing so, they may assert and enforce a lien against any amounts payable to me from any financial settlement, payment, judgment, or verdict received.`,
];

const ATTORNEY_ACK =
  `The undersigned, as the attorney of record, acknowledges receipt of this lien agreement and agrees to uphold ` +
  `its terms as accepted by their client. The absence of the attorney's acknowledgment or signature shall not ` +
  `affect the validity or enforceability of this lien.`;

/**
 * ─── Todo el acuerdo entra en UNA hoja ──────────────────────────────────────
 *
 * v2 lo imprimía en una sola página —la referencia que pasó la clínica dice
 * "4 / 4"— y el nuestro se desbordaba a una segunda. Con el acuerdo pegado al
 * final del intake eso convertía un papel de 4 hojas en uno de 5, con la firma
 * cayendo sola en la última (Erick, 2026-09-18).
 *
 * De 712 puntos útiles el contenido pedía ~936: sobraban unos 225, el 24%. El
 * grueso está en los SEIS párrafos legales, así que ahí va el recorte más
 * fuerte —cuerpo e interlineado— y el resto sale de los aires: el margen del
 * encabezado, el del título, el alto de la firma y el respiro entre filas del
 * recuadro de datos.
 *
 * ⚠️ El TEXTO no se toca nunca: es el contrato vigente. Si algún día no entra,
 * se achica la tipografía, no el acuerdo.
 */
const styles = StyleSheet.create({
  page:      { paddingTop: 28, paddingBottom: 34, paddingHorizontal: 38, fontSize: 9, color: '#111' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  logo:      { width: 112 },
  clinic:    { fontSize: 6.5, textAlign: 'right', lineHeight: 1.35 },
  clinicName:{ fontSize: 6.5, fontWeight: 'bold' },
  title:     { fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },

  box:       { backgroundColor: '#EFEFEF', padding: 7, marginBottom: 8 },
  boxTitle:  { fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  cols:      { flexDirection: 'row', gap: 14 },
  col:       { flex: 1 },
  row:       { flexDirection: 'row', marginBottom: 1 },
  key:       { fontSize: 7, fontWeight: 'bold' },
  val:       { fontSize: 7, flexShrink: 1 },

  sectTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  // El recorte grande: 8,5 → 7,2 de cuerpo y 1,45 → 1,25 de interlineado. Son
  // ~39 renglones que pasan a ~33, y cada uno de 12,3 a 9 puntos.
  para:      { fontSize: 7.2, textAlign: 'justify', marginBottom: 4, lineHeight: 1.25 },

  signRow:   { flexDirection: 'row', gap: 24, marginTop: 10 },
  signCol:   { flex: 1 },
  signImg:   { height: 34, marginBottom: 2 },
  signLabel: { fontSize: 7.5, fontWeight: 'bold' },
  signMeta:  { fontSize: 6.5, color: '#555' },

  footer:    { position: 'absolute', bottom: 16, left: 38, right: 38, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6.5, color: '#555' },
});

/**
 * Un campo vacío se imprime como `—`, NUNCA como "null".
 *
 * El documento de v2 sale con `Address: null, null, null, null` y
 * `Age: null years` — en un papel que firma un abogado y puede terminar en un
 * juzgado. Un guión dice "no lo tenemos"; "null" dice que el sistema está roto.
 */
function v(x: string | null | undefined): string {
  const s = (x ?? '').toString().trim();
  return s.length ? s : '—';
}

/**
 * La firma se guarda a veces con el prefijo `data:` y a veces como base64 pelado
 * — el diálogo del admin manda uno y el formulario del paciente el otro. El
 * `<Image>` de react-pdf solo entiende el primero: sin normalizar, la mitad de
 * los documentos salían con el renglón en blanco y ningún error.
 */
function imgSrc(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  return s.startsWith('data:') ? s : `data:image/png;base64,${s}`;
}

function Field({ k, value }: { k: string; value: string }): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.key}>{k}: </Text>
      <Text style={styles.val}>{value}</Text>
    </View>
  );
}

/**
 * Lo que la página del lien necesita de la base.
 *
 * Se exporta porque el INTAKE la agrega como última página (v2 imprimía las dos
 * cosas en un solo papel, "Case Report … 4 de 4", y así lo pidió la clínica el
 * 2026-09-18). Si el intake armara su propio `select`, el día que la página pida
 * un campo más saldría vacío ahí y lleno acá, sin ningún error.
 */
export const SELECT_DEL_LIEN = {
      id: true, caseCode: true, accidentDate: true, signatureExempt: true,
      patient: {
        select: {
          firstName: true, lastName: true, sex: true, dateOfBirth: true,
          race: true, ethnicity: true, maritalStatus: true, email: true,
          phone: true, employer: true, preferredLanguage: true,
          preferredPharmacy: true, communicationPreference: true,
          addressCity: true, addressState: true, addressZip: true,
          emergencyContactName: true, emergencyContactPhone: true, emergencyContactRelation: true,
          lawyerReferrer:   { select: { firmName: true, firstName: true, lastName: true } },
          providerReferrer: { select: { firstName: true, lastName: true } },
        },
      },
      lawFirm:  { select: { firmName: true } },
      attorney: { select: { firstName: true, lastName: true, barNumber: true } },
      lienSignatures: {
        where: { signerType: { in: ['PATIENT', 'GUARDIAN', 'ATTORNEY'] } },
        orderBy: { signedAt: 'asc' },
        select: { signerType: true, signerName: true, signatureSvg: true, signedAt: true },
      },
} satisfies Prisma.CaseSelect;

/** Lo que devuelve ese select, para tipar a quien arma la página. */
export type DatosDelLien = Prisma.CaseGetPayload<{ select: typeof SELECT_DEL_LIEN }>;

/**
 * La página del acuerdo, sin `Document` alrededor.
 *
 * Es un `<Page>` suelto a propósito: así la sirve sola la ruta del lien y la
 * agrega el intake al final de las suyas, sin duplicar el texto legal — que es
 * el contrato vigente y no puede existir en dos versiones.
 */
export function PaginaDelLien({ caseRecord }: { caseRecord: DatosDelLien }): React.ReactElement {
    const attorneySig = [...caseRecord.lienSignatures].reverse().find((s) => s.signerType === 'ATTORNEY');
    const patientSig = [...caseRecord.lienSignatures].reverse()
      .find((s) => s.signerType === 'PATIENT' || s.signerType === 'GUARDIAN');

    const p = caseRecord.patient;
    const fullName = `${p.firstName} ${p.lastName}`.trim();

    const age = edad(p.dateOfBirth);

    // Locale fijo a propósito: el acuerdo es un documento legal en inglés y sale
    // igual aunque el bufete tenga la interfaz en español. UTC porque una fecha de
    // nacimiento es un día del calendario, no un instante (ver lib/fechas.ts).
    const fmtDia = (d: Date): string =>
      new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(d);

    const dob = p.dateOfBirth ? fmtDia(new Date(p.dateOfBirth)) : null;
    const accident = caseRecord.accidentDate ? fmtDia(new Date(caseRecord.accidentDate)) : null;

    const address = [p.addressCity, p.addressState, p.addressZip].filter(Boolean).join(', ');

    // OJO: `join(' ')` devuelve '' cuando no hay nada, y '' NO es nullish — con
    // `??` encadenado el proveedor que refirió no aparecía nunca.
    const nombre = (a?: string | null, b?: string | null): string => [a, b].filter(Boolean).join(' ');
    const referred =
      p.lawyerReferrer?.firmName
      || nombre(p.lawyerReferrer?.firstName, p.lawyerReferrer?.lastName)
      || nombre(p.providerReferrer?.firstName, p.providerReferrer?.lastName);

    const emergency = [
      p.emergencyContactName,
      p.emergencyContactRelation ? `(${p.emergencyContactRelation})` : null,
      p.emergencyContactPhone,
    ].filter(Boolean).join(' ');

    const attorneyName = caseRecord.attorney
      ? `${caseRecord.attorney.firstName ?? ''} ${caseRecord.attorney.lastName ?? ''}`.trim()
      : '';

    const fmtSigned = (d: Date): string =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Denver', year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(d);

    const generatedAt = fmtSigned(new Date());
    const patientSrc  = imgSrc(patientSig?.signatureSvg);
    const attorneySrc = imgSrc(attorneySig?.signatureSvg);


  return (
          <Page size="LETTER" style={styles.page}>
            <View style={styles.headerRow} fixed>
              {LOGO_B64 ? <Image src={LOGO_B64} style={styles.logo} /> : <Text>Precision Medical</Text>}
              <View style={styles.clinic}>
                <Text style={styles.clinicName}>Precision Medical</Text>
                <Text>75 South 200 East Suite 202 Provo, UT, 84606</Text>
                <Text>Email: info@precisionmedicalcare.com</Text>
                <Text>Tel: (801) 375-2207</Text>
                <Text>Fax: (801) 375-2307</Text>
              </View>
            </View>

            <Text style={styles.title}>Medical Lien Agreement</Text>

            <View style={styles.box}>
              <Text style={styles.boxTitle}>Patient Information</Text>
              <View style={styles.cols}>
                <View style={styles.col}>
                  <Field k="Name" value={v(fullName)} />
                  <Field k="Sex" value={v(p.sex)} />
                  <Field k="Date of Birth" value={v(dob)} />
                  <Field k="Age" value={age === null ? '—' : `${age} years`} />
                  <Field k="Ethnicity" value={v(p.ethnicity)} />
                  <Field k="Race" value={v(p.race)} />
                  <Field k="Marital Status" value={v(p.maritalStatus)} />
                  <Field k="Refered By" value={v(referred)} />
                  <Field k="Emergency Contact" value={v(emergency)} />
                </View>
                <View style={styles.col}>
                  <Field k="Address" value={v(address)} />
                  <Field k="Phone" value={v(p.phone)} />
                  <Field k="Email" value={v(p.email)} />
                  <Field k="Employer" value={v(p.employer)} />
                  <Field k="Preferred Language" value={v(p.preferredLanguage)} />
                  <Field k="Preferred Pharmacy" value={v(p.preferredPharmacy)} />
                  <Field k="Notification Method" value={v(p.communicationPreference)} />
                  <Field k="Law Firm" value={v(caseRecord.lawFirm?.firmName)} />
                  <Field k="Date of Accident" value={v(accident)} />
                  <Field k="Case" value={v(caseRecord.caseCode)} />
                </View>
              </View>
            </View>

            <Text style={styles.sectTitle}>Lien</Text>
            {LIEN_PARAGRAPHS.map((text, i) => (
              <Text key={i} style={styles.para}>{text}</Text>
            ))}

            <Text style={[styles.para, { marginTop: 6 }]}>{ATTORNEY_ACK}</Text>

            {/* Las firmas REALES, no una línea en blanco. v2 imprime el renglón
                vacío aunque las tenga guardadas; acá se estampan las que existen y
                debajo queda quién firmó y cuándo. */}
            <View style={styles.signRow} wrap={false}>
              <View style={styles.signCol}>
                {patientSrc
                  ? <Image src={patientSrc} style={styles.signImg} />
                  : <View style={{ height: 42 }} />}
                <View style={{ borderTopWidth: 1, borderTopColor: '#000', paddingTop: 3 }}>
                  <Text style={styles.signLabel}>Patient Signature</Text>
                  <Text style={styles.signMeta}>{v(patientSig?.signerName ?? fullName)}</Text>
                  {patientSig && <Text style={styles.signMeta}>{fmtSigned(patientSig.signedAt)}</Text>}
                </View>
              </View>

              <View style={styles.signCol}>
                {attorneySrc
                  ? <Image src={attorneySrc} style={styles.signImg} />
                  : <View style={{ height: 42 }} />}
                <View style={{ borderTopWidth: 1, borderTopColor: '#000', paddingTop: 3 }}>
                  <Text style={styles.signLabel}>Attorney Signature</Text>
                  <Text style={styles.signMeta}>{v(attorneySig?.signerName ?? attorneyName)}</Text>
                  {attorneySig && <Text style={styles.signMeta}>{fmtSigned(attorneySig.signedAt)}</Text>}
                  {caseRecord.attorney?.barNumber && (
                    <Text style={styles.signMeta}>Bar #{caseRecord.attorney.barNumber}</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.footer} fixed>
              <Text>{caseRecord.caseCode} · {generatedAt}</Text>
              <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
            </View>
          </Page>
  );
}

export async function respuestaLienPdf(id: string, opts: {
  /**
   * Recorte de alcance del que pide. Lo manda el portal legal con el filtro de
   * su bufete; el back office no manda nada porque ve la clínica entera.
   */
  alcance?: Prisma.CaseWhereInput;
  /**
   * Exigir la firma del ABOGADO para emitir el PDF.
   *
   * `true` en el portal legal: firmar es lo que le abre el expediente. `false`
   * en el back office, donde esa regla no aplica — la clínica necesita el papel
   * que firmó el PACIENTE, y el abogado puede tardar días o no firmar nunca
   * (el propio acuerdo dice que sigue siendo válido igual).
   */
  exigirFirmaDelAbogado: boolean;
}): Promise<Response> {

  const caseRecord = await db.case.findFirst({
    where: opts.alcance ? { AND: [opts.alcance, { id }] } : { id },
    select: SELECT_DEL_LIEN,
  });
  if (!caseRecord) return new Response('Not found', { status: 404 });

  const attorneySig = [...caseRecord.lienSignatures].reverse().find((s) => s.signerType === 'ATTORNEY');
  // Portal legal: firmar es lo que abre el expediente — mismo criterio que el
  // tab de Documentos. El back office no pasa por acá (ver `opts`).
  if (opts.exigirFirmaDelAbogado && !attorneySig && !caseRecord.signatureExempt) {
    return new Response('Signature required', { status: 409 });
  }

  const buffer = await renderToBuffer(
    <Document>
      <PaginaDelLien caseRecord={caseRecord} />
    </Document>,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="lien-${caseRecord.caseCode}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
