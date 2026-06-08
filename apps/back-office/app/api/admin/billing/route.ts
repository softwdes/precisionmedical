/**
 * GET /api/admin/billing
 *
 * Bandeja de Brunella (B.25) — casos con notas SOAP firmadas listas para billing.
 *
 * Query params:
 *   tab — 'pending' | 'hcfa' | 'all' (default: 'pending')
 *
 * Retorna:
 *   kpis  — métricas agregadas
 *   items — lista de casos con la última nota firmada relevante
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';

const HCFA_MARKER = '🤖 HCFA';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab') ?? 'pending';

  try {
    // ── 1. All signed visit notes (SIGNED) with appointment → case context ──
    const signedNotes = await db.visitNote.findMany({
      where: { status: 'SIGNED' },
      select: {
        id:           true,
        signedAt:     true,
        signedByName: true,
        assessment:   true,
        appointment: {
          select: {
            id:    true,
            type:  true,
            scheduledFor: true,
            case: {
              select: {
                id:               true,
                caseCode:         true,
                caseType:         true,
                status:           true,
                accidentDate:     true,
                primaryPolicyNumber: true,
                patient: { select: { id: true, firstName: true, lastName: true } },
                lawFirm:  { select: { firmName: true, phone: true } },
                attorney: { select: { firstName: true, lastName: true } },
                primaryInsurance: {
                  select: { id: true, name: true, shortCode: true, color: true, claimsPhone: true },
                },
                notes: {
                  where:   { content: { startsWith: HCFA_MARKER } },
                  orderBy: { createdAt: 'desc' },
                  take:    1,
                  select:  { id: true, createdAt: true, content: true },
                },
              },
            },
          },
        },
      },
      orderBy: { signedAt: 'desc' },
    });

    // ── 2. CPT totals via queryRaw ─────────────────────────────────────────────
    const noteIds = signedNotes.map(n => n.id);
    const cptRows = noteIds.length > 0
      ? await db.$queryRaw<{ visit_note_id: string; total: number; count: number }[]>`
          SELECT
            visit_note_id,
            SUM(COALESCE(fee_override, fee_catalog) * units)::float AS total,
            COUNT(*)::int AS count
          FROM visit_service_codes
          WHERE visit_note_id = ANY(${noteIds})
          GROUP BY visit_note_id
        `
      : [];

    const cptByNote = new Map(cptRows.map(r => [r.visit_note_id, r]));

    // ── 3. Build enriched items (deduplicated by case — latest note per case) ─
    const caseMap = new Map<string, (typeof signedNotes)[number] & { cptTotal: number; cptCount: number; hcfaGeneratedAt: string | null }>();

    for (const note of signedNotes) {
      const c = note.appointment.case;
      if (!c) continue;

      const cpt   = cptByNote.get(note.id);
      const hcfa  = c.notes[0] ?? null;

      if (!caseMap.has(c.id)) {
        caseMap.set(c.id, {
          ...note,
          cptTotal:       cpt?.total  ?? 0,
          cptCount:       cpt?.count  ?? 0,
          hcfaGeneratedAt: hcfa ? hcfa.createdAt.toISOString() : null,
        });
      }
    }

    const allItems = [...caseMap.values()];

    // ── 4. KPIs ───────────────────────────────────────────────────────────────
    const kpis = {
      notesReady: allItems.filter(i => !i.hcfaGeneratedAt).length,
      hcfaSent:   allItems.filter(i =>  i.hcfaGeneratedAt).length,
      // Phase 1A: mock financials from CPT totals
      totalBilled: allItems.reduce((s, i) => s + i.cptTotal, 0),
      pendingCollection: allItems.filter(i => !i.hcfaGeneratedAt).reduce((s, i) => s + i.cptTotal, 0),
    };

    // ── 5. Filter by tab ─────────────────────────────────────────────────────
    let filtered = allItems;
    if (tab === 'pending') filtered = allItems.filter(i => !i.hcfaGeneratedAt);
    if (tab === 'hcfa')    filtered = allItems.filter(i =>  i.hcfaGeneratedAt);

    // ── 6. Serialize ─────────────────────────────────────────────────────────
    const items = filtered.map(i => {
      const c = i.appointment.case!;
      return {
        noteId:        i.id,
        caseId:        c.id,
        caseCode:      c.caseCode,
        caseType:      c.caseType,
        caseStatus:    c.status,
        accidentDate:  c.accidentDate?.toISOString() ?? null,
        signedAt:      i.signedAt?.toISOString() ?? null,
        signedByName:  i.signedByName,
        cptCount:      i.cptCount,
        cptTotal:      i.cptTotal,
        hcfaGeneratedAt: i.hcfaGeneratedAt,
        patient: c.patient,
        lawFirm:         c.lawFirm,
        attorney:        c.attorney,
        primaryInsurance: c.primaryInsurance,
        primaryPolicyNumber: c.primaryPolicyNumber,
        assessmentSnippet: i.assessment ? i.assessment.slice(0, 120) : null,
      };
    });

    return NextResponse.json({ ok: true, kpis, items, total: items.length });
  } catch (err) {
    console.error('[GET /api/admin/billing]', err);
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
