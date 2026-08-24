/**
 * GET /api/attorney/cases/[id]/history/pdf — el historial de cambios en PDF.
 *
 * Misma fuente y mismo alcance que `../history` (el JSON que consume el
 * diálogo): audit log `ASSIGNMENT_CHANGE` del caso, y el caso tiene que estar
 * dentro del alcance de la sesión.
 */

import { type NextRequest } from 'next/server';
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { db } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter } from '@/lib/attorney-portal';

const styles = StyleSheet.create({
  page:   { paddingTop: 34, paddingBottom: 46, paddingHorizontal: 34, fontSize: 8, color: '#111' },
  title:  { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  sub:    { fontSize: 8, color: '#555', marginBottom: 16 },
  tHead:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 3 },
  tRow:   { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#DDD', paddingVertical: 3 },
  th:     { fontSize: 7, fontWeight: 'bold' },
  td:     { fontSize: 7 },
  cDate:  { width: '17%' },
  cType:  { width: '14%' },
  cAct:   { width: '12%' },
  cUser:  { width: '25%' },
  cPrev:  { width: '16%' },
  cNew:   { width: '16%' },
  footer: { position: 'absolute', bottom: 24, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#555' },
});

interface Row {
  date: string; changeType: string; action: string;
  user: string; previousValue: string; newValue: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const lawyer = await getSessionLawyer();
  if (!lawyer) return new Response('Forbidden', { status: 403 });

  const target = await db.case.findFirst({
    where: { AND: [lawyerCaseFilter(lawyer), { id }] },
    select: { id: true, caseCode: true },
  });
  if (!target) return new Response('Not found', { status: 404 });

  const logs = await db.auditLog.findMany({
    where: { entityType: 'cases', entityId: target.id, action: 'ASSIGNMENT_CHANGE' },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, createdAt: true, actorUserId: true, metadata: true },
  });

  // Las filas viejas guardaron un cuid donde iba el email (ya corregido en el
  // escritor). Se resuelven contra `users` para no imprimir un id.
  const ids = new Set<string>();
  for (const l of logs) {
    const m = (l.metadata ?? {}) as Record<string, unknown>;
    const by = typeof m.changedByEmail === 'string' ? m.changedByEmail : null;
    if (by && !by.includes('@')) ids.add(by);
    if (!by && l.actorUserId) ids.add(l.actorUserId);
  }
  const emailById = new Map<string, string>();
  if (ids.size > 0) {
    const users = await db.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    for (const u of users) emailById.set(u.id, u.email || `${u.firstName} ${u.lastName}`.trim());
  }

  const fmt = (d: Date): string =>
    d.toLocaleString('en-US', {
      timeZone: 'America/Denver',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  const rows: Row[] = logs.map((l) => {
    const m = (l.metadata ?? {}) as Record<string, unknown>;
    const raw = typeof m.changedByEmail === 'string' ? m.changedByEmail : null;
    const user =
      raw && raw.includes('@') ? raw
      : raw ? (emailById.get(raw) ?? raw)
      : l.actorUserId ? (emailById.get(l.actorUserId) ?? '')
      : (typeof m.changedByName === 'string' ? m.changedByName : '');

    return {
      date: fmt(l.createdAt),
      changeType:    typeof m.changeType    === 'string' ? m.changeType    : '',
      action:        typeof m.action        === 'string' ? m.action        : '',
      user,
      previousValue: typeof m.previousValue === 'string' ? m.previousValue : '',
      newValue:      typeof m.newValue      === 'string' ? m.newValue      : '',
    };
  });

  const generatedAt = fmt(new Date());
  const firmName = lawyer.firmName ?? '';

  const buffer = await renderToBuffer(
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Change history &mdash; {target.caseCode}</Text>
        <Text style={styles.sub}>{firmName}</Text>

        <View style={styles.tHead} fixed>
          <Text style={[styles.th, styles.cDate]}>Date</Text>
          <Text style={[styles.th, styles.cType]}>Type</Text>
          <Text style={[styles.th, styles.cAct]}>Action</Text>
          <Text style={[styles.th, styles.cUser]}>User</Text>
          <Text style={[styles.th, styles.cPrev]}>Previous value</Text>
          <Text style={[styles.th, styles.cNew]}>New value</Text>
        </View>

        {rows.map((r, i) => (
          <View key={`${r.date}-${i}`} style={styles.tRow} wrap={false}>
            <Text style={[styles.td, styles.cDate]}>{r.date}</Text>
            <Text style={[styles.td, styles.cType]}>{r.changeType}</Text>
            <Text style={[styles.td, styles.cAct]}>{r.action}</Text>
            <Text style={[styles.td, styles.cUser]}>{r.user}</Text>
            <Text style={[styles.td, styles.cPrev]}>{r.previousValue}</Text>
            <Text style={[styles.td, styles.cNew]}>{r.newValue}</Text>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>{generatedAt}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="history-${target.caseCode}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
