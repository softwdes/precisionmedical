'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Play, Square, Coffee, UserX, RefreshCw, Clock } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const CLINICS = [
  'Provo Clinic',
  'Pleasant Grove Clinic',
  'Spanish Fork Clinic',
  'West Valley Clinic',
  'South Murray Clinic',
  'Bolivia',
  'Perú',
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type ClockState = 'loading' | 'idle' | 'working' | 'break' | 'done';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  type: string;
}

interface AttendanceRecord {
  id: string;
  check_in: string | null;
  check_out: string | null;
  break_start: string | null;
  break_end: string | null;
  break_minutes: number;
  clinic_name: string;
  hours_worked: number | null;
  status: string;
}

interface Stats { today: string; week: string; month: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDecimal(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function elapsedWorking(checkIn: string, breakMinutes: number): string {
  const ms = Math.max(0, Date.now() - new Date(checkIn).getTime() - breakMinutes * 60000);
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function elapsedBreak(breakStart: string): string {
  const mins = Math.floor((Date.now() - new Date(breakStart).getTime()) / 60000);
  return `${mins}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

// ─── Geo helpers ─────────────────────────────────────────────────────────────

interface GeoPoint { lat: number; lng: number; accuracy: number; }

function getLocation(): Promise<GeoPoint | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true },
    );
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClockPage({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const waypointIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Profile
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [role, setRole] = useState('EMPLOYEE');
  const [profileError, setProfileError] = useState(false);

  // Clock
  const [clockState, setClockState] = useState<ClockState>('loading');
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [selectedClinic, setSelectedClinic] = useState('');

  // UI
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [shakeClinic, setShakeClinic] = useState(false);
  const [lateNotice, setLateNotice] = useState('');

  // Live clock
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  // tick forces re-render every second for live elapsed counters
  const [, setTick] = useState(0);

  // Stats
  const [stats, setStats] = useState<Stats>({ today: '0:00', week: '0:00', month: '0:00' });

  // ─── Location permission banner ──────────────────────────────────────────────

  const [locationPerm, setLocationPerm] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions) return;
    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(result => {
      setLocationPerm(result.state as 'prompt' | 'granted' | 'denied');
      result.addEventListener('change', () => setLocationPerm(result.state as 'prompt' | 'granted' | 'denied'));
    }).catch(() => setLocationPerm('unknown'));
  }, []);

  const isSpanish = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('es');

  const GEO_TEXT = {
    title: isSpanish ? 'Permiso de ubicación' : 'Location permission',
    body:  isSpanish
      ? 'Al fichar, el sistema registrará tu ubicación.'
      : 'When clocking in, the system will record your location.',
    note:  isSpanish
      ? 'Debes aceptar para seguir con el marcado de horas.'
      : 'You must accept to continue with time tracking.',
    denied: isSpanish
      ? 'Ubicación bloqueada. Ve a la configuración del navegador para activarla.'
      : 'Location blocked. Enable it in your browser settings.',
  };

  // ─── Waypoint tracking ───────────────────────────────────────────────────────

  function startWaypointTracking(recordId: string) {
    if (waypointIntervalRef.current) clearInterval(waypointIntervalRef.current);
    waypointIntervalRef.current = setInterval(() => { void saveWaypoint(recordId); }, 10 * 60 * 1000);
  }

  function stopWaypointTracking() {
    if (waypointIntervalRef.current) { clearInterval(waypointIntervalRef.current); waypointIntervalRef.current = null; }
  }

  async function saveWaypoint(recordId: string) {
    const loc = await getLocation();
    if (!loc) return;
    await supabase.from('attendance_waypoints').insert({ record_id: recordId, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy });
  }

  useEffect(() => () => stopWaypointTracking(), []);

  // ─── Live clock ticker ───────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      setDate(now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
      setTick(t => t + 1);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ─── Load on mount ───────────────────────────────────────────────────────────
  useEffect(() => {
    void loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    // Resolve auth user email — employees are looked up by email, not by auth UUID
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser?.email) { setProfileError(true); setClockState('idle'); return; }

    const { data: emp } = await supabase
      .from('employees')
      .select('id, firstName, lastName, employeeCode, type')
      .eq('email', authUser.email)
      .maybeSingle();

    if (!emp) { setProfileError(true); setClockState('idle'); return; }

    setEmployee(emp as Employee);

    // Role from internal users table (keyed by email)
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('email', authUser.email)
      .maybeSingle();
    setRole(userData?.role ?? 'EMPLOYEE');

    await Promise.all([loadTodayRecord(emp.id), loadStats(emp.id)]);
  }

  async function loadTodayRecord(empId: string) {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('employee_id', empId)
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) { setClockState('idle'); return; }
    setRecord(data as AttendanceRecord);
    setSelectedClinic(data.clinic_name);

    if (data.check_out) setClockState('done');
    else if (data.break_start && !data.break_end) setClockState('break');
    else if (data.check_in) setClockState('working');
    else setClockState('idle');
  }

  async function loadStats(empId: string) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const jsDay = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (jsDay === 0 ? 6 : jsDay - 1));
    const weekStart = monday.toISOString().split('T')[0];
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { data } = await supabase
      .from('attendance_records')
      .select('hours_worked, date')
      .eq('employee_id', empId)
      .gte('date', monthStart)
      .not('hours_worked', 'is', null);

    const rows = data ?? [];
    const todayH  = rows.filter(r => r.date === today).reduce((s, r) => s + Number(r.hours_worked ?? 0), 0);
    const weekH   = rows.filter(r => r.date >= weekStart).reduce((s, r) => s + Number(r.hours_worked ?? 0), 0);
    const monthH  = rows.reduce((s, r) => s + Number(r.hours_worked ?? 0), 0);
    setStats({ today: fmtDecimal(todayH), week: fmtDecimal(weekH), month: fmtDecimal(monthH) });
  }

  // ─── Clock actions ───────────────────────────────────────────────────────────

  async function handleClockIn() {
    if (!selectedClinic) {
      setShakeClinic(true);
      setTimeout(() => setShakeClinic(false), 400);
      return;
    }
    setLoading(true);
    setActionError('');
    try {
      const [{ status, lateMinutes, scheduleId }, loc] = await Promise.all([
        determineStatus(employee!.id),
        getLocation(),
      ]);
      const now = new Date();

      const { data, error } = await supabase
        .from('attendance_records')
        .insert({
          employee_id: employee!.id,
          clinic_name: selectedClinic,
          check_in: now.toISOString(),
          date: now.toISOString().split('T')[0],
          status,
          late_minutes: lateMinutes,
          schedule_id: scheduleId,
          recorded_by: userId,
          ...(loc ? { check_in_lat: loc.lat, check_in_lng: loc.lng, check_in_acc: loc.accuracy } : {}),
        })
        .select()
        .single();

      if (error) throw error;
      setRecord(data as AttendanceRecord);
      setClockState('working');
      startWaypointTracking(data.id as string);

      if (status === 'late') {
        setLateNotice(`Llegaste ${lateMinutes} min después de tu horario`);
        setTimeout(() => setLateNotice(''), 3000);
      }
    } catch {
      setActionError('Error al guardar. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBreak() {
    if (!record) return;
    setLoading(true);
    setActionError('');
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .update({ break_start: new Date().toISOString() })
        .eq('id', record.id)
        .select()
        .single();
      if (error) throw error;
      setRecord(data as AttendanceRecord);
      setClockState('break');
    } catch {
      setActionError('Error al guardar. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReturnFromBreak() {
    if (!record?.break_start) return;
    setLoading(true);
    setActionError('');
    try {
      const now = new Date();
      const breakMins = Math.floor((now.getTime() - new Date(record.break_start).getTime()) / 60000);
      const { data, error } = await supabase
        .from('attendance_records')
        .update({
          break_end: now.toISOString(),
          break_minutes: (record.break_minutes ?? 0) + breakMins,
        })
        .eq('id', record.id)
        .select()
        .single();
      if (error) throw error;
      setRecord(data as AttendanceRecord);
      setClockState('working');
    } catch {
      setActionError('Error al guardar. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  }

  async function handleClockOut() {
    if (!record?.check_in) return;
    setLoading(true);
    setActionError('');
    stopWaypointTracking();
    try {
      const [loc, now] = [await getLocation(), new Date()];
      const totalMs = now.getTime() - new Date(record.check_in).getTime();
      const breakMs = (record.break_minutes ?? 0) * 60000;
      const hoursWorked = Math.max(0, (totalMs - breakMs) / 3600000);

      const { data, error } = await supabase
        .from('attendance_records')
        .update({
          check_out: now.toISOString(),
          hours_worked: hoursWorked,
          ...(loc ? { check_out_lat: loc.lat, check_out_lng: loc.lng, check_out_acc: loc.accuracy } : {}),
        })
        .eq('id', record.id)
        .select()
        .single();
      if (error) throw error;
      setRecord(data as AttendanceRecord);
      setClockState('done');
      void loadStats(employee!.id);
    } catch {
      setActionError('Error al guardar. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  }

  async function determineStatus(empId: string) {
    const jsDay = new Date().getDay();
    const dbDay = jsDay === 0 ? 7 : jsDay;

    const { data: schedule } = await supabase
      .from('work_schedules')
      .select('id, start_time, days_of_week')
      .eq('employee_id', empId)
      .eq('is_active', true)
      .maybeSingle();

    if (!schedule || !Array.isArray(schedule.days_of_week) || !schedule.days_of_week.includes(dbDay)) {
      return { status: 'on_time', lateMinutes: 0, scheduleId: schedule?.id ?? null };
    }

    const [h, m] = (schedule.start_time as string).split(':').map(Number);
    const expected = new Date();
    expected.setHours(h, m, 0, 0);
    const diffMins = Math.floor((Date.now() - expected.getTime()) / 60000);
    const GRACE = 10;

    if (diffMins <= GRACE) return { status: 'on_time', lateMinutes: 0, scheduleId: schedule.id };
    return { status: 'late', lateMinutes: Math.max(0, diffMins), scheduleId: schedule.id };
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function handleNewShift() {
    setRecord(null);
    setSelectedClinic('');
    setClockState('idle');
  }

  // ─── Render: loading ─────────────────────────────────────────────────────────

  if (clockState === 'loading') {
    return (
      <main style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', zIndex: 100, animation: 'tcBootFade 400ms ease both' }}>
        <style>{`
          @keyframes tcBootFade { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
          @keyframes tcDotPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(1.25); } }
        `}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {/* Logo box */}
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #06B6D4 100%)',
            boxShadow: '0 0 32px rgba(99,102,241,0.50), 0 0 64px rgba(99,102,241,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Clock size={26} color="white" strokeWidth={2.5} />
          </div>

          {/* Text */}
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px', margin: 0 }}>PM Time Clock</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>Precision Medical</p>
          </div>

          {/* 3 pulsing dots */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366F1', animation: `tcDotPulse 1.2s ease-in-out infinite`, animationDelay: `${i * 200}ms` }} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  // ─── Render: profile error ───────────────────────────────────────────────────

  if (profileError) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '24px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', maxWidth: 280 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--rose-dim)', border: '1px solid var(--rose-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserX size={24} color="var(--rose)" />
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Cuenta no configurada</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>Contacta a tu administrador</p>
          </div>
          <button onClick={handleLogout} style={{ padding: '10px 24px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
            Cerrar sesión
          </button>
        </div>
      </main>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  const emp = employee!;
  const ini = initials(emp.firstName, emp.lastName);
  const fullName = `${emp.firstName} ${emp.lastName}`;
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const clocked = clockState !== 'idle';

  const workingDisplay = record?.check_in && !record?.check_out
    ? elapsedWorking(record.check_in, record.break_minutes ?? 0)
    : '—';

  const breakDisplay = record?.break_start && !record?.break_end
    ? elapsedBreak(record.break_start)
    : '—';

  const sectionStyle: React.CSSProperties = { width: '100%', maxWidth: 360, position: 'relative', zIndex: 1 };

  return (
    <main
      className="pt-safe pb-safe"
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        gap: 20,
        background: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Background glows */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: 280, height: 280, background: 'radial-gradient(circle at 80% 10%, rgba(16,185,129,0.07), transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: 220, height: 220, background: 'radial-gradient(circle at 20% 90%, rgba(99,102,241,0.05), transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ── A: Employee header ── */}
      <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 500, color: 'white' }}>
          {ini}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {fullName}
            {isAdmin && (
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--indigo)', background: 'var(--indigo-dim)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.05em' }}>
                Admin
              </span>
            )}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {emp.type} · {record?.clinic_name ?? '—'}
          </p>
        </div>
        <button
          onClick={handleLogout}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          <LogOut size={12} />
          Salir
        </button>
      </div>

      {/* ── B: Live clock ── */}
      <div style={{ ...sectionStyle, textAlign: 'center' }}>
        <p style={{ fontSize: 64, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', letterSpacing: '-2px', lineHeight: 1 }}>
          {time || '00:00:00'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, textTransform: 'capitalize' }}>
          {date}
        </p>
      </div>

      {/* ── C: Status card ── */}
      <div style={sectionStyle}>
        {clockState === 'idle' && (
          <div style={{ borderRadius: 12, padding: '12px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin registro hoy</p>
          </div>
        )}

        {clockState === 'working' && (
          <div style={{ borderRadius: 12, padding: '12px 20px', background: 'var(--green-dim)', border: '1px solid var(--green-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--green)' }}>Trabajando</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4, fontFamily: 'monospace' }}>
              Entrada: {record?.check_in ? fmtTime(record.check_in) : '—'} · Hoy: {workingDisplay}
            </p>
          </div>
        )}

        {clockState === 'break' && (
          <div style={{ borderRadius: 12, padding: '12px 20px', background: 'var(--amber-dim)', border: '1px solid var(--amber-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--amber)' }}>En break</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4, fontFamily: 'monospace' }}>
              Break: {breakDisplay} · Entrada: {record?.check_in ? fmtTime(record.check_in) : '—'}
            </p>
          </div>
        )}

        {clockState === 'done' && record && (
          <div style={{ borderRadius: 12, padding: '12px 20px', background: 'var(--indigo-dim)', border: '1px solid rgba(99,102,241,0.25)', textAlign: 'center' }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--indigo)' }}>Jornada completada</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
              {record.check_in ? fmtTime(record.check_in) : '—'} → {record.check_out ? fmtTime(record.check_out) : '—'} · {record.hours_worked ? fmtDecimal(Number(record.hours_worked)) : '—'}h trabajadas
            </p>
          </div>
        )}
      </div>

      {/* ── Late notice ── */}
      {lateNotice && (
        <div style={{ ...sectionStyle, background: 'var(--amber-dim)', border: '1px solid var(--amber-border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--amber)', textAlign: 'center', zIndex: 1 }}>
          {lateNotice}
        </div>
      )}

      {/* ── Location permission banner ── */}
      {locationPerm === 'prompt' && clockState === 'idle' && (
        <div style={{
          ...sectionStyle,
          background: 'rgba(99,102,241,0.07)',
          border: '1px solid rgba(99,102,241,0.22)',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          {/* Pin icon */}
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#818CF8', margin: 0, letterSpacing: '0.01em' }}>
              {GEO_TEXT.title}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
              {GEO_TEXT.body}
            </p>
            <p style={{ fontSize: 10, color: '#F87171', marginTop: 5, fontStyle: 'italic' }}>
              {GEO_TEXT.note}
            </p>
          </div>
        </div>
      )}

      {/* ── Location denied banner ── */}
      {locationPerm === 'denied' && (
        <div style={{
          ...sectionStyle,
          background: 'rgba(244,63,94,0.08)',
          border: '1px solid rgba(244,63,94,0.28)',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(244,63,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
              <line x1="4" y1="4" x2="20" y2="20" stroke="#F43F5E" strokeWidth="2"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#F87171', margin: 0, letterSpacing: '0.01em' }}>
              {isSpanish ? 'Ubicación bloqueada' : 'Location blocked'}
            </p>
            <p style={{ fontSize: 11, color: '#F87171', marginTop: 4, lineHeight: 1.5, opacity: 0.85 }}>
              {GEO_TEXT.denied}
            </p>
          </div>
        </div>
      )}

      {/* ── D: Clinic selector ── */}
      {clockState !== 'done' && (
        <div style={sectionStyle}>
          <select
            value={selectedClinic}
            onChange={e => setSelectedClinic(e.target.value)}
            disabled={clocked}
            className={shakeClinic ? 'shake' : ''}
            style={{
              width: '100%',
              height: 44,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.07)',
              border: `1px solid ${shakeClinic ? 'var(--rose-border)' : 'var(--border)'}`,
              color: selectedClinic ? 'white' : 'var(--text-muted)',
              fontSize: 14,
              cursor: clocked ? 'default' : 'pointer',
              outline: 'none',
              opacity: clocked ? 0.6 : 1,
            }}
          >
            <option value="" disabled>Seleccionar clínica...</option>
            {CLINICS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── E: Action buttons ── */}
      <div style={sectionStyle}>
        {clockState === 'idle' && (
          <button
            onClick={handleClockIn}
            disabled={loading}
            style={{ width: '100%', height: 52, borderRadius: 14, background: 'var(--green-dim)', border: '1px solid var(--green-border)', color: 'var(--green)', fontSize: 15, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.15s' }}
          >
            {loading ? <span style={{ width: 18, height: 18, border: '2px solid var(--green-border)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> : <Play size={16} />}
            {loading ? 'Guardando...' : 'Clock In'}
          </button>
        )}

        {clockState === 'working' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleBreak}
              disabled={loading}
              style={{ flex: 1, height: 48, borderRadius: 12, background: 'var(--amber-dim)', border: '1px solid var(--amber-border)', color: 'var(--amber)', fontSize: 13, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {loading ? <span style={{ width: 16, height: 16, border: '2px solid var(--amber-border)', borderTopColor: 'var(--amber)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> : <Coffee size={15} />}
              Break
            </button>
            <button
              onClick={handleClockOut}
              disabled={loading}
              style={{ flex: 1, height: 48, borderRadius: 12, background: 'var(--rose-dim)', border: '1px solid var(--rose-border)', color: 'var(--rose)', fontSize: 13, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {loading ? <span style={{ width: 16, height: 16, border: '2px solid var(--rose-border)', borderTopColor: 'var(--rose)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> : <Square size={15} />}
              Clock Out
            </button>
          </div>
        )}

        {clockState === 'break' && (
          <button
            onClick={handleReturnFromBreak}
            disabled={loading}
            style={{ width: '100%', height: 52, borderRadius: 14, background: 'var(--green-dim)', border: '1px solid var(--green-border)', color: 'var(--green)', fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {loading ? <span style={{ width: 18, height: 18, border: '2px solid var(--green-border)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> : <Play size={16} />}
            {loading ? 'Guardando...' : 'Volver al trabajo'}
          </button>
        )}

        {clockState === 'done' && (
          <button
            onClick={handleNewShift}
            style={{ width: '100%', height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            + Nuevo turno
          </button>
        )}
      </div>

      {/* ── Action error ── */}
      {actionError && (
        <div style={{ ...sectionStyle, background: 'var(--rose-dim)', border: '1px solid var(--rose-border)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--rose)' }}>{actionError}</span>
          <button
            onClick={() => { setActionError(''); void handleClockIn(); }}
            style={{ background: 'none', border: 'none', color: 'var(--rose)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, flexShrink: 0 }}
          >
            <RefreshCw size={12} />
            Reintentar
          </button>
        </div>
      )}

      {/* ── F: Stats bar ── */}
      <div style={{ ...sectionStyle, display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {([
          { label: 'Hoy',    value: stats.today },
          { label: 'Semana', value: stats.week },
          { label: 'Mes',    value: stats.month },
        ] as const).map((s, i, arr) => (
          <div
            key={s.label}
            style={{ flex: 1, padding: '10px 8px', textAlign: 'center', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', lineHeight: 1 }}>
              {s.value}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

    </main>
  );
}
