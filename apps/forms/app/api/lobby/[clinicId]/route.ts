import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';

/**
 * B.37 — Lobby HIPAA Display API
 * GET /api/lobby/[clinicId]
 *
 * HIPAA CRÍTICO — esta ruta es PÚBLICA (sin auth, pantalla de TV).
 * NUNCA devuelve: nombre completo, DOB, diagnóstico, aseguradora, bufete.
 * SOLO devuelve: iniciales + 2 dígitos del código de caso ("E.S - 62"),
 *                nombre de pila del doctor, estado, tiempo estimado.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LobbyPatient {
  id:           string;   // appointment ID (safe — no PHI)
  display:      string;   // "E.S - 62" — HIPAA-safe display token
  doctorName:   string | null;
  checkedInAt:  string | null;
  updatedAt:    string;
  scheduledFor: string;
}

export interface WaitingPatient extends LobbyPatient {
  position:         number;
  estimatedWaitMin: number;
}

export interface ConsultationPatient extends LobbyPatient {
  elapsedMin: number;
}

export interface NowCalling {
  display:     string;
  destination: 'consultation' | 'triage';
  doctorName:  string | null;
}

export interface LobbyResponse {
  ok:          true;
  clinic:      { id: string; name: string };
  nowCalling:  NowCalling | null;
  consultation: ConsultationPatient[];
  triage:       LobbyPatient[];
  waiting:      WaitingPatient[];
  stats: {
    waiting:      number;
    triage:       number;
    consultation: number;
    completed:    number;
    totalToday:   number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Anonymize patient: "Sandra López" + "MVA-2865" → "S.L - 65"
 * HIPAA: never expose first name, last name, full DOB, or full case code.
 */
function anonymize(
  firstName: string,
  lastName:  string,
  caseCode:  string | null,
  fallback:  string,   // appointment ID — used when no case code
): string {
  const fi = (firstName.trim()[0] ?? '?').toUpperCase();
  const li = (lastName.trim()[0] ?? '?').toUpperCase();
  const raw = caseCode ?? fallback;
  const suffix = raw.slice(-2).toUpperCase();
  return `${fi}.${li} - ${suffix}`;
}

/**
 * Today's UTC range for Mountain Daylight Time (UTC-6, June).
 * Phase 1A: hardcoded MDT offset. Phase 2: use `Intl` for DST-aware calc.
 */
function todayRangeMDT(): { start: Date; end: Date } {
  const MDT_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC-6 (summer)
  const now = new Date();
  // Floor to midnight Denver time
  const nowDenver = new Date(now.getTime() - MDT_OFFSET_MS);
  const startDenver = new Date(Date.UTC(
    nowDenver.getUTCFullYear(),
    nowDenver.getUTCMonth(),
    nowDenver.getUTCDate(),
    0, 0, 0, 0,
  ));
  const endDenver = new Date(Date.UTC(
    nowDenver.getUTCFullYear(),
    nowDenver.getUTCMonth(),
    nowDenver.getUTCDate(),
    23, 59, 59, 999,
  ));
  return {
    start: new Date(startDenver.getTime() + MDT_OFFSET_MS),
    end:   new Date(endDenver.getTime()   + MDT_OFFSET_MS),
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clinicId: string }> },
) {
  const { clinicId } = await params;

  const clinic = await db.clinic.findUnique({
    where:  { id: clinicId },
    select: { id: true, name: true },
  });

  if (!clinic) {
    return NextResponse.json({ ok: false, error: 'Clinic not found' }, { status: 404 });
  }

  const { start, end } = todayRangeMDT();
  const now = new Date();
  const threeMinAgo = new Date(now.getTime() - 3 * 60 * 1000);

  const appts = await db.appointment.findMany({
    where: {
      clinicId,
      scheduledFor: { gte: start, lte: end },
      status:       { in: ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'] },
    },
    select: {
      id:           true,
      status:       true,
      scheduledFor: true,
      checkedInAt:  true,
      updatedAt:    true,
      patient:      { select: { firstName: true, lastName: true } },
      case:         { select: { caseCode: true } },
      triageRecord: { select: { id: true, createdAt: true } },
      provider:     { select: { firstName: true } },
    },
    orderBy: { scheduledFor: 'asc' },
  });

  const waiting:      LobbyPatient[]        = [];
  const triage:       LobbyPatient[]        = [];
  const consultation: ConsultationPatient[] = [];
  let   nowCalling:   NowCalling | null     = null;
  let   nowCallingAt: Date | null           = null;

  for (const a of appts) {
    if (a.status === 'COMPLETED') continue;

    const display = anonymize(
      a.patient.firstName,
      a.patient.lastName,
      a.case?.caseCode ?? null,
      a.id,
    );
    const doctorName = a.provider ? `Dr. ${a.provider.firstName}` : null;

    const base: LobbyPatient = {
      id:           a.id,
      display,
      doctorName,
      checkedInAt:  a.checkedInAt?.toISOString() ?? null,
      updatedAt:    a.updatedAt.toISOString(),
      scheduledFor: a.scheduledFor.toISOString(),
    };

    if (a.status === 'IN_PROGRESS') {
      const elapsedMin = Math.max(
        0,
        Math.floor((now.getTime() - a.updatedAt.getTime()) / 60_000),
      );
      consultation.push({ ...base, elapsedMin });

      // "Ahora llamando" — moved to IN_PROGRESS in last 3 min
      if (a.updatedAt >= threeMinAgo) {
        if (!nowCallingAt || a.updatedAt > nowCallingAt) {
          nowCallingAt = a.updatedAt;
          nowCalling = { display, destination: 'consultation', doctorName };
        }
      }

    } else if (a.status === 'CHECKED_IN') {
      if (a.triageRecord) {
        triage.push(base);
        // "Ahora llamando" — triage record created in last 3 min
        if (a.triageRecord.createdAt >= threeMinAgo && !nowCalling) {
          nowCalling = { display, destination: 'triage', doctorName };
        }
      } else {
        waiting.push(base);
      }
    }
  }

  const completedToday = appts.filter(a => a.status === 'COMPLETED').length;

  const payload: LobbyResponse = {
    ok:    true,
    clinic: { id: clinic.id, name: clinic.name },
    nowCalling,
    consultation,
    triage,
    waiting: waiting.map((w, i) => ({
      ...w,
      position:         i + 1,
      estimatedWaitMin: (i + 1) * 15,
    })),
    stats: {
      waiting:      waiting.length,
      triage:       triage.length,
      consultation: consultation.length,
      completed:    completedToday,
      totalToday:   appts.length,
    },
  };

  return NextResponse.json(payload, {
    headers: {
      // TV display: always fresh, no caching
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
