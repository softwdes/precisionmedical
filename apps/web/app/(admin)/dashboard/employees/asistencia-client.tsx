'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@precision-medical/auth/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttendanceRow {
  id: string;
  employee_id: string;
  check_in: string;
  check_out: string | null;
  break_start: string | null;
  break_end: string | null;
  clinic_name: string;
  break_minutes: number;
}

interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

interface WorkSlot {
  employee_id: string;
}

interface Pill {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  checkIn: string;
  clinic: string;
  onBreak: boolean;
  breakStart: string | null;
}

interface KPIs { presentes: number; enBreak: number; ausentes: number; sinHorario: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(f: string, l: string) { return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase(); }

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function elapsedSince(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AsistenciaClient() {
  const supabase = createClient();
  const [pills, setPills] = useState<Pill[]>([]);
  const [kpis, setKpis] = useState<KPIs>({ presentes: 0, enBreak: 0, ausentes: 0, sinHorario: 0 });
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0); // force re-render for elapsed counters

  const loadData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const jsDay = new Date().getDay();
    const dbDay = jsDay === 0 ? 7 : jsDay;

    // 1. Today's active attendance records
    const { data: attending } = await supabase
      .from('attendance_records')
      .select('id, employee_id, check_in, check_out, break_start, break_end, clinic_name, break_minutes')
      .eq('date', today)
      .not('check_in', 'is', null)
      .is('check_out', null)
      .order('check_in', { ascending: true });

    const rows: AttendanceRow[] = (attending ?? []) as AttendanceRow[];

    // 2. Employee names
    const empIds = rows.map(r => r.employee_id);
    let empMap: Record<string, EmployeeRow> = {};
    if (empIds.length > 0) {
      const { data: emps } = await supabase
        .from('employees')
        .select('id, firstName, lastName, employeeCode')
        .in('id', empIds);
      (emps ?? []).forEach((e: EmployeeRow) => { empMap[e.id] = e; });
    }

    // 3. Employees with schedule today (for absent/no-schedule KPIs)
    const { data: schedules } = await supabase
      .from('work_schedules')
      .select('employee_id')
      .eq('is_active', true)
      .contains('days_of_week', [dbDay]);

    const scheduledIds = new Set<string>((schedules ?? []).map((s: WorkSlot) => s.employee_id));
    const attendingIds = new Set<string>(rows.map(r => r.employee_id));

    const ausentes = [...scheduledIds].filter(id => !attendingIds.has(id)).length;
    const sinHorario = 0; // would require full employee list — kept 0 unless queried

    // 4. Build pills
    const newPills: Pill[] = rows.map(r => {
      const emp = empMap[r.employee_id];
      return {
        id: r.id,
        firstName: emp?.firstName ?? '?',
        lastName: emp?.lastName ?? '?',
        employeeCode: emp?.employeeCode ?? '',
        checkIn: r.check_in,
        clinic: r.clinic_name,
        onBreak: !!(r.break_start && !r.break_end),
        breakStart: r.break_start,
      };
    });

    const enBreak = newPills.filter(p => p.onBreak).length;
    const presentes = newPills.length - enBreak;

    setPills(newPills);
    setKpis({ presentes, enBreak, ausentes, sinHorario });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
    const refresh = setInterval(() => void loadData(), 60000);
    return () => clearInterval(refresh);
  }, [loadData]);

  // Re-render every 30s to update elapsed counters
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const kpiCards = [
    { label: 'Presentes',   value: kpis.presentes,   color: '#10B981', dim: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.22)' },
    { label: 'En break',    value: kpis.enBreak,     color: '#F59E0B', dim: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.22)' },
    { label: 'Ausentes',    value: kpis.ausentes,    color: '#F43F5E', dim: 'rgba(244,63,94,0.10)',  border: 'rgba(244,63,94,0.22)' },
    { label: 'Sin horario', value: kpis.sinHorario,  color: 'rgba(255,255,255,0.4)', dim: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)' },
  ] as const;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-text-3">Cargando asistencia...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-2">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpiCards.map(k => (
          <div
            key={k.label}
            className="rounded-xl p-4 flex flex-col gap-1"
            style={{ background: k.dim, border: `1px solid ${k.border}` }}
          >
            <span className="text-2xl font-bold" style={{ color: k.color }}>
              {k.value}
            </span>
            <span className="text-[11px] text-text-muted uppercase tracking-wider">
              {k.label}
            </span>
          </div>
        ))}
      </div>

      {/* Pills header */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-text-muted">
          Activos ahora
        </p>
        <button
          onClick={() => void loadData()}
          className="text-[11px] text-text-muted hover:text-text-2 transition-colors"
        >
          Actualizar
        </button>
      </div>

      {/* Pills */}
      {pills.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-text-muted">
          Nadie fichado en este momento
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {pills.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-2.5 rounded-full px-3 py-1.5"
              style={{
                background: p.onBreak ? 'rgba(245,158,11,0.10)' : 'rgba(16,185,129,0.10)',
                border: `1px solid ${p.onBreak ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'}`,
              }}
            >
              {/* Avatar */}
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
              >
                {initials(p.firstName, p.lastName)}
              </div>

              {/* Name + meta */}
              <div>
                <p className="text-[12px] font-medium leading-none" style={{ color: p.onBreak ? '#F59E0B' : '#10B981' }}>
                  {p.firstName} {p.lastName}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {p.onBreak
                    ? `Break ${p.breakStart ? elapsedSince(p.breakStart) : '—'}`
                    : `${elapsedSince(p.checkIn)} · ${p.clinic}`
                  }
                </p>
              </div>

              {/* Break badge */}
              {p.onBreak && (
                <span className="text-[10px] font-semibold rounded px-1.5 py-0.5" style={{ background: 'rgba(245,158,11,0.2)', color: '#F59E0B' }}>
                  Break
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
