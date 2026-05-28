'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Play, Square, Coffee, UserX, RefreshCw, Clock } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

// Clinics now live in DB (public.clinics). The `name` column is the
// legacy key (preserves matches with attendance_records.clinic_name
// and work_schedules.clinic_name). `display_name` is what we show to
// the employee in the dropdown.
interface Clinic {
  id: string;
  name: string;
  display_name: string;
  country: string;
  lat: number | null;     // null = no geofence (remote)
  lng: number | null;
  radius_m: number | null;
  is_active: boolean;
}

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
  location_status: LocationStatus | null;
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

/**
 * Returns YYYY-MM-DD in the user's local timezone.
 * Using toISOString() converts to UTC, which shifts the date forward
 * for evening clock-ins in Utah (UTC-6/-7) — a 6pm Tuesday turns into
 * Wednesday in UTC, breaking same-day lookups, daily stats and joins
 * with attendance_records.date from the admin app.
 * 'en-CA' locale formats as YYYY-MM-DD by spec, respecting timezone.
 */
function localDateString(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

// ─── Geo helpers ─────────────────────────────────────────────────────────────

interface GeoPoint { lat: number; lng: number; accuracy: number; }

type LocationStatus = 'verified' | 'out_of_range' | 'low_accuracy' | 'no_permission' | 'remote' | 'unknown';

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

/** Distancia Haversine entre dos puntos GPS, en metros */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Clasifica la ubicación del empleado respecto a la clínica seleccionada */
function resolveLocationStatus(loc: GeoPoint | null, clinicName: string, clinics: Clinic[]): LocationStatus {
  const clinic = clinics.find(c => c.name === clinicName);
  if (!clinic || clinic.lat === null || clinic.lng === null) return 'remote'; // sin coordenadas → remoto
  if (!loc) return 'no_permission';                          // sin GPS / permiso negado
  if (loc.accuracy > 500) return 'low_accuracy';             // PC sin GPS (WiFi muy impreciso)
  const dist = distanceMeters(loc.lat, loc.lng, clinic.lat, clinic.lng);
  return dist <= (clinic.radius_m ?? 300) ? 'verified' : 'out_of_range';
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
  const [clinics, setClinics] = useState<Clinic[]>([]);

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
    title: isSpanish ? 'Verificar tu ubicación' : 'Verify your location',
    body:  isSpanish
      ? 'Permite tu ubicación para verificar que estás en la clínica.'
      : 'Allow location so we can verify you are at the clinic.',
    note:  isSpanish
      ? 'Tu registro se guarda igual; esto solo añade verificación.'
      : 'Your record is saved either way; this just adds verification.',
    denied: isSpanish
      ? 'Ubicación bloqueada. Tus registros se guardarán sin verificación.'
      : 'Location blocked. Records will be saved without verification.',
  };

  // Warning chip shown next to the status card when location_status is
  // anything other than verified/remote. Records are NOT blocked — admin
  // sees the flag in reports for audit.
  const locationNotVerified =
    record?.location_status &&
    !['verified', 'remote'].includes(record.location_status);

  const locationWarningText = (() => {
    if (!locationNotVerified) return '';
    switch (record?.location_status) {
      case 'out_of_range':
        return isSpanish ? 'Fuera del rango de la clínica' : 'Outside clinic range';
      case 'low_accuracy':
        return isSpanish ? 'GPS impreciso' : 'Low GPS accuracy';
      case 'no_permission':
        return isSpanish ? 'Sin permiso de ubicación' : 'No location permission';
      default:
        return isSpanish ? 'Ubicación no verificada' : 'Location not verified';
    }
  })();

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

    await Promise.all([loadClinics(), loadTodayRecord(emp.id), loadStats(emp.id)]);
  }

  async function loadClinics() {
    const { data } = await supabase
      .from('clinics')
      .select('id, name, display_name, country, lat, lng, radius_m, is_active')
      .eq('is_active', true)
      .order('country', { ascending: true })
      .order('display_name', { ascending: true });
    setClinics((data ?? []) as Clinic[]);
  }

  async function loadTodayRecord(empId: string) {
    const today = localDateString(new Date());
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

    // Restart waypoint tracking on reload while shift is still active.
    // Without this, closing the app mid-shift kills the interval and no
    // more waypoints are recorded until the next clock-in. Matches the
    // behavior of the original clock-in flow (tracking stays on through
    // breaks; stopped only by clock-out).
    if (data.check_in && !data.check_out) {
      startWaypointTracking(data.id as string);
    }

    if (data.check_out) setClockState('done');
    else if (data.break_start && !data.break_end) setClockState('break');
    else if (data.check_in) setClockState('working');
    else setClockState('idle');
  }

  async function loadStats(empId: string) {
    const now = new Date();
    const today = localDateString(now);
    const jsDay = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (jsDay === 0 ? 6 : jsDay - 1));
    const weekStart = localDateString(monday);
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
      const locationStatus = resolveLocationStatus(loc, selectedClinic, clinics);
      const now = new Date();

      const { data, error } = await supabase
        .from('attendance_records')
        .insert({
          employee_id: employee!.id,
          clinic_name: selectedClinic,
          check_in: now.toISOString(),
          date: localDateString(now),
          status,
          late_minutes: lateMinutes,
          schedule_id: scheduleId,
          recorded_by: userId,
          location_status: locationStatus,
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
    } catch (err) {
      // Partial UNIQUE index uniq_open_attendance fires when there's
      // already an open shift (no check_out) for today. Resync the UI
      // instead of letting the user retry into the same error.
      const pgError = err as { code?: string; message?: string } | null;
      const isDuplicateOpen =
        pgError?.code === '23505' ||
        (pgError?.message ?? '').includes('uniq_open_attendance');
      if (isDuplicateOpen) {
        setActionError('Ya tienes un turno abierto hoy. Sincronizando...');
        await loadTodayRecord(employee!.id);
        setTimeout(() => setActionError(''), 2500);
      } else {
        setActionError('Error al guardar. Verifica tu conexión.');
      }
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

    // Bring all active schedules (an employee can legitimately have more
    // than one — different days/clinics) and pick the one that covers
    // today's day-of-week. Most recent wins if multiple match.
    // maybeSingle() throws PGRST116 ("multiple rows returned") if 2+ rows
    // exist, which used to block clock-in entirely on admin misconfig.
    const { data: schedules } = await supabase
      .from('work_schedules')
      .select('id, start_time, days_of_week')
      .eq('employee_id', empId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const schedule = (schedules ?? []).find(
      s => Array.isArray(s.days_of_week) && (s.days_of_week as number[]).includes(dbDay),
    ) ?? null;

    if (!schedule) {
      return { status: 'on_time', lateMinutes: 0, scheduleId: null };
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

  // Map the legacy clinic_name stored in the record to the friendly
  // display_name (e.g. "Bolivia" -> "La Paz, Bolivia"). Fallback to
  // raw name if the clinic isn't in the loaded list anymore.
  const clinicDisplay = record?.clinic_name
    ? (clinics.find(c => c.name === record.clinic_name)?.display_name ?? record.clinic_name)
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
            {emp.type} · {clinicDisplay}
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

      {/* ── Location warning chip (record exists + status not verified/remote) ── */}
      {locationNotVerified && clockState !== 'idle' && (
        <div style={{
          ...sectionStyle,
          background: 'var(--amber-dim)',
          border: '1px solid var(--amber-border)',
          borderRadius: 8,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'var(--amber)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{locationWarningText}</span>
        </div>
      )}

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
            {clinics.map(c => (
              <option key={c.id} value={c.name}>{c.display_name}</option>
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
