/**
 * GET /api/attorney/report — "Cases Summary" del despacho, en PDF.
 *
 * Réplica del reporte de actividad de v2. Siempre en inglés: es un documento que
 * el bufete archiva y reenvía, no una pantalla — por eso no sigue el idioma de
 * la sesión.
 *
 * El alcance sale de `getSessionLawyer()`, igual que el resto del portal: este
 * endpoint no acepta ningún parámetro que amplíe lo que se ve.
 *
 * OJO con `Debt`: es la suma de `AppointmentBilling.balanceDue` de las citas del
 * caso — el saldo que queda sin pagar. Es la única lectura de "deuda" que existe
 * hoy en v3; falta confirmar con Erick que sea la misma que muestra v2.
 */

import { type NextRequest } from 'next/server';
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter } from '@/lib/attorney-portal';

const LOGO_B64 = (() => {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'logo-pm.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
})();

const CLOSED_STATUSES = new Set(['CLOSED', 'SETTLED', 'ARCHIVED']);

const styles = StyleSheet.create({
  page:      { paddingTop: 34, paddingBottom: 46, paddingHorizontal: 34, fontSize: 8, color: '#111' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  logo:      { width: 132 },
  clinic:    { fontSize: 7, textAlign: 'right', lineHeight: 1.5 },
  clinicName:{ fontSize: 7, fontWeight: 'bold' },
  title:     { fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginBottom: 18 },
  firmName:  { fontSize: 9, fontWeight: 'bold' },
  firmMeta:  { fontSize: 7, color: '#444', marginTop: 2, marginBottom: 10 },

  tHead:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 3 },
  tRow:      { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#DDD', paddingVertical: 3 },
  th:        { fontSize: 7, fontWeight: 'bold' },
  td:        { fontSize: 7 },

  cCase:     { width: '8%' },
  cPatient:  { width: '22%' },
  cLawyer:   { width: '17%' },
  cManager:  { width: '17%' },
  cDate:     { width: '11%' },
  cStatus:   { width: '10%' },
  cClose:    { width: '6%' },
  cDebt:     { width: '9%', textAlign: 'right' },

  footer:    { position: 'absolute', bottom: 24, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#555' },
});

interface Row {
  caseCode: string;
  patient: string;
  lawyer: string;
  manager: string;
  accidentDate: string;
  status: string;
  closed: string;
  debt: string;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function mdy(d: Date | null): string {
  if (!d) return '';
  // Formato del v2: M/D/YYYY, sin ceros a la izquierda.
  const x = new Date(d);
  return `${x.getUTCMonth() + 1}/${x.getUTCDate()}/${x.getUTCFullYear()}`;
}

function SummaryDoc({
  firmName, firmMeta, rows, generatedAt,
}: {
  firmName: string; firmMeta: string; rows: Row[]; generatedAt: string;
}): React.ReactElement {
  return (
    <Document>
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

        <Text style={styles.title}>Cases Summary</Text>

        <Text style={styles.firmName}>{firmName}</Text>
        <Text style={styles.firmMeta}>{firmMeta}</Text>

        <View style={styles.tHead} fixed>
          <Text style={[styles.th, styles.cCase]}>Case</Text>
          <Text style={[styles.th, styles.cPatient]}>Patient</Text>
          <Text style={[styles.th, styles.cLawyer]}>Lawyer</Text>
          <Text style={[styles.th, styles.cManager]}>Case Manager</Text>
          <Text style={[styles.th, styles.cDate]}>Accident Date</Text>
          <Text style={[styles.th, styles.cStatus]}>Status</Text>
          <Text style={[styles.th, styles.cClose]}>Close</Text>
          <Text style={[styles.th, styles.cDebt]}>Debt</Text>
        </View>

        {rows.map((r, i) => (
          <View key={`${r.caseCode}-${i}`} style={styles.tRow} wrap={false}>
            <Text style={[styles.td, styles.cCase]}>{r.caseCode}</Text>
            <Text style={[styles.td, styles.cPatient]}>{r.patient}</Text>
            <Text style={[styles.td, styles.cLawyer]}>{r.lawyer}</Text>
            <Text style={[styles.td, styles.cManager]}>{r.manager}</Text>
            <Text style={[styles.td, styles.cDate]}>{r.accidentDate}</Text>
            <Text style={[styles.td, styles.cStatus]}>{r.status}</Text>
            <Text style={[styles.td, styles.cClose]}>{r.closed}</Text>
            <Text style={[styles.td, styles.cDebt]}>{r.debt}</Text>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>{generatedAt}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function GET(_req: NextRequest): Promise<Response> {
  const lawyer = await getSessionLawyer();
  if (!lawyer) return new Response('Forbidden', { status: 403 });

  const [cases, firm] = await Promise.all([
    db.case.findMany({
      where: lawyerCaseFilter(lawyer),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, caseCode: true, status: true, accidentDate: true,
        patient:  { select: { firstName: true, lastName: true } },
        attorney: { select: { firstName: true, lastName: true } },
        paralegal:{ select: { firstName: true, lastName: true } },
      },
    }),
    lawyer.firmId
      ? db.lawyer.findUnique({
          where: { id: lawyer.firmId },
          select: { firmName: true, address: true, city: true, state: true, zip: true, phone: true },
        })
      : null,
  ]);

  // `AppointmentBilling.caseId` es una columna denormalizada, NO una relación de
  // Prisma: no se puede pedir con un `include` desde el caso. Se agrega aparte,
  // en una sola consulta para todos los casos del despacho.
  const debtByCase = new Map<string, number>();
  if (cases.length > 0) {
    const sums = await db.appointmentBilling.groupBy({
      by: ['caseId'],
      where: { caseId: { in: cases.map((c) => c.id) } },
      _sum: { balanceDue: true },
    });
    for (const row of sums) {
      if (row.caseId) debtByCase.set(row.caseId, Number(row._sum.balanceDue ?? 0));
    }
  }

  const person = (p: { firstName: string | null; lastName: string | null } | null): string =>
    p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '';

  const rows: Row[] = cases
    .map((c) => {
      const debt = debtByCase.get(c.id) ?? 0;
      return {
        caseCode: c.caseCode,
        patient: `${c.patient.firstName} ${c.patient.lastName}`.trim(),
        lawyer: person(c.attorney),
        manager: person(c.paralegal),
        accidentDate: mdy(c.accidentDate),
        status: c.status,
        closed: CLOSED_STATUSES.has(c.status) ? 'Yes' : 'No',
        debtValue: debt,
        debt: usd(debt),
      };
    })
    // Mismo orden que el reporte de v2: lo que más se debe, arriba.
    .sort((a, b) => b.debtValue - a.debtValue)
    .map(({ debtValue: _debtValue, ...r }) => r);

  const firmMeta = [
    [firm?.address, firm?.city, firm?.state, firm?.zip].filter(Boolean).join(', '),
    firm?.phone,
  ].filter(Boolean).join('  |  ');

  const generatedAt = new Date().toLocaleString('en-US', {
    timeZone: 'America/Denver',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const buffer = await renderToBuffer(
    <SummaryDoc
      firmName={firm?.firmName ?? lawyer.firmName ?? 'Firm'}
      firmMeta={firmMeta}
      rows={rows}
      generatedAt={generatedAt}
    />,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="cases-summary.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
