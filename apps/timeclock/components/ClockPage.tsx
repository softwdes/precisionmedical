'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Play, Square, Coffee, UserX, RefreshCw, Clock } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { InstallPWABanner } from '@/components/InstallPWABanner';
import { useSessionGuard, clearSessionGuard } from '@/lib/useSessionGuard';

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
  /** When true, clock-in is blocked if location_status is not verified/remote. */
  strict_geofencing: boolean;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ClockState = 'loading' | 'idle' | 'working' | 'break' | 'done';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  type: string;
  /** Country code from the joined countries table ('US' | 'BO' | 'PE'). */
  country_code: string | null;
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

interface Stats {
  today: string; week: string; month: string;
  // Raw hours used to compute progress bars vs employee's goal
  todayH: number; weekH: number; monthH: number;
}

/** Active work schedule for today (used to render the schedule-context card). */
interface ActiveSchedule {
  start_time: string;            // HH:MM:SS
  end_time:   string;            // HH:MM:SS
  clinic_name: string;
  days_of_week: number[];
}

const GOAL_HOURS = {
  FULL_TIME: { daily: 8, weekly: 40, monthly: 160 },
  PART_TIME: { daily: 4, weekly: 20, monthly: 80 },
} as const;

function goalsFor(empType: string): { daily: number; weekly: number; monthly: number } {
  return GOAL_HOURS[empType as keyof typeof GOAL_HOURS] ?? GOAL_HOURS.FULL_TIME;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function fmtTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Renders a decimal-hours number (e.g. 8.5) as a HH:MM clock string ("8:30"). */
function fmtHoursAsClock(hours: number) {
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

/** Greeting key based on local hour. The actual string comes from i18n (t.greetXxx). */
type GreetingKey = 'morning' | 'afternoon' | 'evening' | 'night';
function greetingFor(d: Date): GreetingKey {
  const h = d.getHours();
  if (h >= 5  && h < 12) return 'morning';
  if (h >= 12 && h < 19) return 'afternoon';
  if (h >= 19 && h < 23) return 'evening';
  return 'night';
}

/** Format Date as "Domingo, 31 de mayo de 2026" (properly cased — no CSS capitalize). */
function fmtLongDate(d: Date, locale: string): string {
  // Intl already lowercases prepositions correctly; we just capitalize the
  // very first letter (weekday). Avoids CSS text-transform: capitalize which
  // wrongly uppercases every word ("31 De Mayo De 2026").
  const s = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "HH:MM" from a 24h time string like "09:00:00" or "09:00". */
function shortTime(t: string): string {
  const [h, m] = t.split(':');
  return `${h?.padStart(2, '0') ?? '00'}:${m?.padStart(2, '0') ?? '00'}`;
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

/** Accuracy (meters) above which we flag a reading as low_accuracy.
 *  Raised from 500 to 1500 to reduce false positives on indoor mobile
 *  GPS, while still catching desktop/IP-based geolocation which is
 *  typically tens of kilometers off. */
const LOW_ACCURACY_THRESHOLD_M = 1500;

const MAX_GPS_RETRIES   = 3;
const GPS_RETRY_DELAY_MS = 1500;

function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Buckets used to pick which "how to enable location" instructions to show. */
type GeoBrowser =
  | 'chrome-android'
  | 'samsung-internet'
  | 'ios-safari'      // Safari with URL bar visible — has "aA" button to manage permissions
  | 'ios-pwa'         // Added to home screen, runs standalone — NO URL bar, must use iOS Settings
  | 'ios-webview'
  | 'desktop-chrome'
  | 'generic';

function detectGeoBrowser(): GeoBrowser {
  if (typeof navigator === 'undefined') return 'generic';
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  if (isIOS) {
    const webViewMarkers = /FBAN|FBAV|Instagram|Twitter|Line|MicroMessenger|WhatsApp|LinkedIn|GSA\//;
    if (webViewMarkers.test(ua)) return 'ios-webview';
    if (!/Safari\//.test(ua) || /CriOS|FxiOS|EdgiOS/.test(ua)) return 'ios-webview';
    // PWA "Add to Home Screen" -> launches in standalone mode (no URL bar).
    // navigator.standalone is the iOS-specific flag; display-mode covers the spec way.
    // When standalone, the user can't touch "aA" in a URL bar (there is none) — they
    // must go to iOS Settings → Privacy → Location Services → <app> to change permissions.
    const isStandalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches);
    return isStandalone ? 'ios-pwa' : 'ios-safari';
  }
  if (/Android/i.test(ua)) {
    if (/SamsungBrowser/i.test(ua)) return 'samsung-internet';
    return 'chrome-android'; // covers Chrome/Edge/Brave on Android — same UI for location settings
  }
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'desktop-chrome';
  return 'generic';
}

/** Last reason geo failed — used to render a more specific message in the
 *  "denied" banner ("phone GPS is off" vs "browser is denying us"). */
type GeoFailKind = 'denied' | 'unavailable' | 'timeout' | 'unknown' | null;
let lastGeoFail: GeoFailKind = null;

function singleGetLocation(forceFresh: boolean): Promise<GeoPoint | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { lastGeoFail = 'unavailable'; resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      p => {
        lastGeoFail = null;
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      err => {
        // GeolocationPositionError codes:
        //   1 = PERMISSION_DENIED — browser/site permission off
        //   2 = POSITION_UNAVAILABLE — system GPS off / no fix
        //   3 = TIMEOUT
        lastGeoFail =
          err.code === 1 ? 'denied' :
          err.code === 2 ? 'unavailable' :
          err.code === 3 ? 'timeout' :
                           'unknown';
        resolve(null);
      },
      { timeout: 8000, maximumAge: forceFresh ? 0 : 30000, enableHighAccuracy: true },
    );
  });
}

export function getLastGeoFail(): GeoFailKind { return lastGeoFail; }

/** Reads GPS with smart retry on mobile.
 *
 *  Mobile GPS typically improves over time (cold fix vs warm fix): the
 *  first reading after opening the page can be from a cached WiFi-based
 *  guess, and a second reading 1-2s later already has satellite lock.
 *  We retry up to 3 times if the reading is still classified as
 *  low_accuracy and keep the best (lowest accuracy) reading. After the
 *  first attempt we force a fresh read (maximumAge: 0).
 *
 *  Desktop short-circuits: no GPS hardware, retrying yields the same
 *  imprecise WiFi/IP reading. We return whatever we got in one shot. */
async function getLocation(): Promise<GeoPoint | null> {
  if (!isMobileUserAgent()) {
    return singleGetLocation(false);
  }

  let best: GeoPoint | null = null;
  for (let attempt = 0; attempt < MAX_GPS_RETRIES; attempt++) {
    const loc = await singleGetLocation(attempt > 0);
    if (loc && (!best || loc.accuracy < best.accuracy)) best = loc;
    if (best && best.accuracy <= LOW_ACCURACY_THRESHOLD_M) return best; // good enough
    if (attempt < MAX_GPS_RETRIES - 1) {
      await new Promise(r => setTimeout(r, GPS_RETRY_DELAY_MS));
    }
  }
  return best;
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
  if (loc.accuracy > LOW_ACCURACY_THRESHOLD_M) return 'low_accuracy'; // GPS impreciso (desktop sin GPS / indoor sin lock)
  const dist = distanceMeters(loc.lat, loc.lng, clinic.lat, clinic.lng);
  return dist <= (clinic.radius_m ?? 300) ? 'verified' : 'out_of_range';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClockPage({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const waypointIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { t, locale } = useT();

  // Auto sign-out after 12h of session lifetime → /login?expired=true
  useSessionGuard(12);

  // Profile
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [role, setRole] = useState('EMPLOYEE');
  const [profileError, setProfileError] = useState(false);
  // Distinct from profileError: when an authenticated user with a
  // non-EMPLOYEE role lands here (e.g. ADMIN/SUPER_ADMIN browses
  // directly to clock.precisionmedical.com), we show a redirect-to-
  // admin screen instead of the generic "cuenta no configurada".
  const [wrongRoleError, setWrongRoleError] = useState(false);

  // Clock
  const [clockState, setClockState] = useState<ClockState>('loading');
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [selectedClinic, setSelectedClinic] = useState('');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  // Today's active work schedule for the schedule-context card (when idle)
  const [activeSchedule, setActiveSchedule] = useState<ActiveSchedule | null>(null);

  // UI
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  // Tracks which handler failed so the "Reintentar" button retries the
  // correct action (not always clock-in like before).
  const [retryAction, setRetryAction] = useState<'clockIn' | 'break' | 'return' | 'clockOut' | null>(null);
  const [shakeClinic, setShakeClinic] = useState(false);
  const [lateNotice, setLateNotice] = useState('');

  // Live clock
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  // tick forces re-render every second for live elapsed counters
  const [, setTick] = useState(0);

  // Geo troubleshoot banner — expand state
  const [geoStepsOpen, setGeoStepsOpen] = useState(false);

  // Stats
  const [stats, setStats] = useState<Stats>({ today: '0:00', week: '0:00', month: '0:00', todayH: 0, weekH: 0, monthH: 0 });

  // ─── Location permission banner ──────────────────────────────────────────────

  const [locationPerm, setLocationPerm] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');

  // One-shot re-query of the geolocation permission. Called from:
  //   - initial mount (so the pill renders the right state on first paint)
  //   - the in-page "Refrescar / Permitir" button
  //   - visibilitychange when the tab becomes visible again (covers the
  //     "user went to iOS Settings, fixed the permission, came back" case
  //     where iOS PWA standalone does NOT fire the permissions 'change' event)
  //   - after each successful clock action (clock in / break / clock out)
  //     in case the OS-level permission shifted silently
  const refreshLocationPerm = useCallback(async (): Promise<void> => {
    if (typeof navigator === 'undefined' || !navigator.permissions) return;
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      setLocationPerm(result.state as 'prompt' | 'granted' | 'denied');
    } catch {
      setLocationPerm('unknown');
    }
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions) return;

    let changeListener: (() => void) | null = null;

    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(result => {
      setLocationPerm(result.state as 'prompt' | 'granted' | 'denied');
      // Native change events: reliable on Android Chrome, unreliable on iOS Safari/PWA.
      // We keep the listener anyway as a best-effort.
      changeListener = () => setLocationPerm(result.state as 'prompt' | 'granted' | 'denied');
      result.addEventListener('change', changeListener);
    }).catch(() => setLocationPerm('unknown'));

    // Fallback for iOS PWA standalone: re-query whenever the tab becomes
    // visible again. This is what catches the "I went to Settings and fixed
    // the permission, now I'm back" case where Apple doesn't fire 'change'.
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        void refreshLocationPerm();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshLocationPerm]);

  // Warning chip shown next to the status card when location_status is
  // anything other than verified/remote. Records are NOT blocked — admin
  // sees the flag in reports for audit.
  //
  // Suppressions (status still persists in DB; only the UI chip is hidden):
  //  - low_accuracy on desktop: every desktop falls back to WiFi/IP, the
  //    chip would always be on without value.
  //  - Any warning for Bolivia/Perú clinics: their geofencing is at
  //    city granularity, not building-specific. Warnings add noise
  //    without actionable info there.
  const locationNotVerified = (() => {
    const status = record?.location_status;
    if (!status || ['verified', 'remote'].includes(status)) return false;
    if (status === 'low_accuracy' && !isMobileUserAgent()) return false;
    const recClinic = clinics.find(c => c.name === record?.clinic_name);
    if (recClinic && (recClinic.country === 'BO' || recClinic.country === 'PE')) return false;
    return true;
  })();

  const locationWarningText = (() => {
    if (!locationNotVerified) return '';
    switch (record?.location_status) {
      case 'out_of_range':  return t.locOutOfRange;
      case 'low_accuracy':  return t.locLowAccuracy;
      case 'no_permission': return t.locNoPermission;
      default:              return t.locUnknown;
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

  // ─── Auto-select clinic when employee's country only has one ────────────────
  // For Bolivia and Perú employees (one clinic per country), pre-fill
  // the dropdown so they don't have to tap it. The dropdown is rendered
  // disabled below when lockedToSingleClinic is true.
  useEffect(() => {
    if (employee?.country_code && clinics.length > 0) {
      const ownCountryClinics = clinics.filter(c => c.country === employee.country_code);
      if (ownCountryClinics.length === 1 && !selectedClinic) {
        setSelectedClinic(ownCountryClinics[0].name);
      }
    }
  }, [employee?.country_code, clinics, selectedClinic]);

  // ─── Live clock ticker ───────────────────────────────────────────────────────
  // Reruns when locale changes so the date string respects browser language
  // once useT() resolves after mount.
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      // fmtLongDate avoids CSS text-transform: capitalize (which wrongly
      // uppercased prepositions: "31 De Mayo De 2026"). Now: "Domingo, 31 de mayo de 2026".
      setDate(fmtLongDate(now, locale));
      setTick(t => t + 1);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [locale]);

  // ─── Load on mount ───────────────────────────────────────────────────────────
  // Intentional mount-only effect. loadProfile is stable for the component
  // lifetime (closes over supabase from useMemo and React state setters,
  // which are guaranteed stable by React). Listing it as a dep would
  // require either useCallback with every setter as a sub-dep or a ref,
  // both of which obscure intent — this is genuinely "run once on mount".
  useEffect(() => {
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Realtime: cross-device sync ─────────────────────────────────────────
  // Subscribe to the employee's attendance_records changes so a clock-in /
  // break / clock-out done on one device (e.g. mobile) is reflected on
  // other open sessions (e.g. PC) without manual refresh. RLS already
  // limits the channel to this employee's own rows.
  //
  // Caveat: if the employee really has two devices open at the same time,
  // both will run the waypoint setInterval. That double-writes points to
  // attendance_waypoints. We accept that here — it's an edge case.
  useEffect(() => {
    if (!employee) return;
    const channel = supabase
      .channel(`employee-${employee.id}-records`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_records',
          filter: `employee_id=eq.${employee.id}`,
        },
        () => {
          void loadTodayRecord(employee.id);
          void loadStats(employee.id);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id]);

  async function loadProfile() {
    // Resolve auth user email — employees are looked up by email, not by auth UUID
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser?.email) { setProfileError(true); setClockState('idle'); return; }

    // Fetch employee record + role in parallel. We need the role even
    // when there's no employee record, to distinguish "admin landed on
    // the wrong app" from "employee account not set up yet".
    // Employee join brings country.code so the clinic dropdown can be
    // filtered by country (Bolivia/Perú employees only see their one
    // clinic; US employees see the 5 Utah clinics).
    const [{ data: rawEmp }, { data: userData }] = await Promise.all([
      supabase
        .from('employees')
        .select('id, firstName, lastName, employeeCode, type, country:countries(code)')
        .eq('email', authUser.email)
        .maybeSingle(),
      supabase
        .from('users')
        .select('role')
        .eq('email', authUser.email)
        .maybeSingle(),
    ]);

    const userRole = userData?.role ?? 'EMPLOYEE';
    setRole(userRole);

    if (!rawEmp) {
      if (userRole !== 'EMPLOYEE') {
        setWrongRoleError(true);
      } else {
        setProfileError(true);
      }
      setClockState('idle');
      return;
    }

    // Normalize the country join (supabase-js may return obj or array
    // depending on relation cardinality)
    const countryField = (rawEmp as { country?: { code: string } | { code: string }[] | null }).country;
    const countryCode = countryField
      ? Array.isArray(countryField)
        ? countryField[0]?.code ?? null
        : countryField.code
      : null;

    const emp: Employee = {
      id: rawEmp.id as string,
      firstName: rawEmp.firstName as string,
      lastName: rawEmp.lastName as string,
      employeeCode: rawEmp.employeeCode as string,
      type: rawEmp.type as string,
      country_code: countryCode,
    };
    setEmployee(emp);

    await Promise.all([loadClinics(), loadTodayRecord(emp.id), loadStats(emp.id)]);

    // After today's record is loaded, if there's no active shift yet
    // and the employee is in a multi-clinic country (US), try to
    // pre-select the clinic from today's active schedule. This keeps
    // the UX the user described: "shows their assigned clinic by
    // default, but they can change it".
    await loadDefaultClinicFromSchedule(emp.id);
  }

  async function loadDefaultClinicFromSchedule(empId: string) {
    // Brings start_time + end_time too so the schedule-context card
    // can display countdown to the shift + expected end-of-day.
    const jsDay = new Date().getDay();
    const dbDay = jsDay === 0 ? 7 : jsDay;
    const { data: schedules } = await supabase
      .from('work_schedules')
      .select('clinic_name, days_of_week, start_time, end_time')
      .eq('employee_id', empId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const todaySchedule = (schedules ?? []).find(
      s => Array.isArray(s.days_of_week) && (s.days_of_week as number[]).includes(dbDay),
    );
    if (!todaySchedule) {
      setActiveSchedule(null);
      return;
    }

    setActiveSchedule({
      start_time:  todaySchedule.start_time  as string,
      end_time:    todaySchedule.end_time    as string,
      clinic_name: todaySchedule.clinic_name as string,
      days_of_week: todaySchedule.days_of_week as number[],
    });

    // Use functional setSelectedClinic to avoid stale closure on the
    // (possibly already-set) value from loadTodayRecord.
    setSelectedClinic(prev => prev ? prev : (todaySchedule.clinic_name as string));
  }

  async function loadClinics() {
    const { data } = await supabase
      .from('clinics')
      .select('id, name, display_name, country, lat, lng, radius_m, is_active, strict_geofencing')
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
    setStats({
      today: fmtHoursAsClock(todayH), week: fmtHoursAsClock(weekH), month: fmtHoursAsClock(monthH),
      todayH, weekH, monthH,
    });
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
    setRetryAction(null);
    try {
      const [{ status, lateMinutes, scheduleId }, loc] = await Promise.all([
        determineStatus(employee!.id),
        getLocation(),
      ]);
      const locationStatus = resolveLocationStatus(loc, selectedClinic, clinics);

      // Strict geofencing enforcement: if the clinic opted in, block
      // clock-in when location is clearly outside the radius or GPS
      // was denied. low_accuracy stays permitted (could be legit indoor
      // signal). verified/remote always pass.
      const clinicCfg = clinics.find(c => c.name === selectedClinic);
      if (clinicCfg?.strict_geofencing && (locationStatus === 'out_of_range' || locationStatus === 'no_permission')) {
        const msg = locationStatus === 'out_of_range'
          ? t.geoStrictOutOfRange
          : t.geoStrictNoPermission;
        setActionError(msg);
        setRetryAction('clockIn');
        setLoading(false);
        return;
      }

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
      void refreshLocationPerm(); // catch silent permission flips post-action

      if (status === 'late') {
        setLateNotice(t.lateBy(lateMinutes));
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
        setActionError(t.duplicateOpenShift);
        await loadTodayRecord(employee!.id);
        setTimeout(() => setActionError(''), 2500);
      } else {
        setActionError(t.saveError);
        setRetryAction('clockIn');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleBreak() {
    if (!record) return;
    setLoading(true);
    setActionError('');
    setRetryAction(null);
    try {
      // Clear break_end at the same time we set the new break_start. Without
      // this, a stale break_end from a previous break in the same shift
      // would leave the record in an inconsistent state (break_end < break_start).
      // The accumulated break time is preserved in break_minutes, which
      // handleReturnFromBreak keeps incrementing across multiple breaks.
      const { data, error } = await supabase
        .from('attendance_records')
        .update({ break_start: new Date().toISOString(), break_end: null })
        .eq('id', record.id)
        .select()
        .single();
      if (error) throw error;
      setRecord(data as AttendanceRecord);
      setClockState('break');
      void refreshLocationPerm();
    } catch {
      setActionError(t.saveError);
      setRetryAction('break');
    } finally {
      setLoading(false);
    }
  }

  async function handleReturnFromBreak() {
    if (!record?.break_start) return;
    setLoading(true);
    setActionError('');
    setRetryAction(null);
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
      void refreshLocationPerm();
    } catch {
      setActionError(t.saveError);
      setRetryAction('return');
    } finally {
      setLoading(false);
    }
  }

  async function handleClockOut() {
    if (!record?.check_in) return;
    setLoading(true);
    setActionError('');
    setRetryAction(null);
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
      void refreshLocationPerm();
    } catch {
      setActionError(t.saveError);
      setRetryAction('clockOut');
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
    clearSessionGuard();
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

  // ─── Render: wrong role (admin/lawyer/etc landed on timeclock) ───────────────

  if (wrongRoleError) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '24px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', maxWidth: 300 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--indigo-dim)', border: '1px solid rgba(99,102,241,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={24} color="var(--indigo)" />
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{t.wrongRoleTitle}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              {t.wrongRoleBody(role.toLowerCase().replace('_', ' '))}
            </p>
          </div>
          <button onClick={handleLogout} style={{ padding: '10px 24px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
            {t.signOut}
          </button>
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
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{t.profileErrorTitle}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{t.profileErrorBody}</p>
          </div>
          <button onClick={handleLogout} style={{ padding: '10px 24px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
            {t.signOut}
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

  // Employee-friendly type label ("Tiempo completo" / "Full time" etc.)
  const empTypeLabel =
    emp.type === 'FULL_TIME' ? t.empTypeFullTime :
    emp.type === 'PART_TIME' ? t.empTypePartTime :
    emp.type; // fallback to raw value if unexpected

  // Greeting + first name (used in the welcome row above the clock)
  const greetKey = greetingFor(new Date());
  const greetMsg =
    greetKey === 'morning'   ? t.greetMorning(emp.firstName) :
    greetKey === 'afternoon' ? t.greetAfternoon(emp.firstName) :
    greetKey === 'evening'   ? t.greetEvening(emp.firstName) :
                               t.greetNight(emp.firstName);

  // Schedule-context calc (countdown + shift line). Null when no schedule.
  const scheduleCtx = (() => {
    if (!activeSchedule) return null;
    const [sH = 0, sM = 0] = activeSchedule.start_time.split(':').map(Number);
    const [eH = 0, eM = 0] = activeSchedule.end_time.split(':').map(Number);
    const now = new Date();
    const startToday = new Date(now); startToday.setHours(sH, sM, 0, 0);
    const endToday   = new Date(now); endToday.setHours(eH, eM, 0, 0);
    const diffMin = Math.round((startToday.getTime() - now.getTime()) / 60000);
    const durationH = Math.max(0, Math.round((endToday.getTime() - startToday.getTime()) / 3_600_000));
    const startLabel = shortTime(activeSchedule.start_time);
    const endLabel   = shortTime(activeSchedule.end_time);
    const empClinic  = clinics.find(c => c.name === activeSchedule.clinic_name)?.display_name ?? activeSchedule.clinic_name;
    let countdown: string;
    if (diffMin > 0)        countdown = t.scheduleStartsIn(diffMin);
    else if (diffMin === 0) countdown = t.scheduleStarting;
    else                    countdown = t.scheduleStartedMinAgo(Math.abs(diffMin));
    return { countdown, startLabel, endLabel, empClinic, durationH };
  })();

  // Stats progress vs employee's goals
  const goals = goalsFor(emp.type);
  const pct = (h: number, g: number): number => g > 0 ? Math.min(100, Math.round((h / g) * 100)) : 0;
  const pctToday = pct(stats.todayH, goals.daily);
  const pctWeek  = pct(stats.weekH,  goals.weekly);
  const pctMonth = pct(stats.monthH, goals.monthly);

  // Clinics shown in the dropdown are filtered to the employee's
  // country. Bolivia/Perú employees only see their one clinic;
  // US employees see all 5 Utah clinics.
  const visibleClinics = employee?.country_code
    ? clinics.filter(c => c.country === employee.country_code)
    : clinics;

  // If only one option is available (BO/PE employees), the dropdown
  // is locked and auto-selected.
  const lockedToSingleClinic = visibleClinics.length === 1;

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
            {empTypeLabel}{clinicDisplay !== '—' ? ` · ${clinicDisplay}` : ''}
          </p>
        </div>
        <button
          onClick={handleLogout}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          <LogOut size={12} />
          {t.exit}
        </button>
      </div>

      {/* ── B: Greeting + live clock + date ── */}
      <div style={{ ...sectionStyle, textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', letterSpacing: '0.01em' }}>
          <span style={{ color: 'var(--indigo)', fontWeight: 600 }}>{greetMsg}</span>{' '}
          <span style={{ opacity: 0.7 }}>👋</span>
        </p>
        <p style={{ fontSize: 52, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', letterSpacing: '-1.8px', lineHeight: 1, marginTop: 6 }}>
          {time || '00:00:00'}
        </p>
        {/* No more textTransform: capitalize — fmtLongDate already cases it correctly */}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {date}
        </p>
      </div>

      {/* ── C: Status card ── */}
      <div style={sectionStyle}>
        {clockState === 'idle' && (
          <div style={{ borderRadius: 12, padding: '12px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.noRecordToday}</p>
          </div>
        )}

        {clockState === 'working' && (
          <div style={{ borderRadius: 12, padding: '12px 20px', background: 'var(--green-dim)', border: '1px solid var(--green-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--green)' }}>{t.working}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4, fontFamily: 'monospace' }}>
              {t.entryLabel}: {record?.check_in ? fmtTime(record.check_in, locale) : '—'} · {t.todayShort}: {workingDisplay}
            </p>
          </div>
        )}

        {clockState === 'break' && (
          <div style={{ borderRadius: 12, padding: '12px 20px', background: 'var(--amber-dim)', border: '1px solid var(--amber-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--amber)' }}>{t.onBreak}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4, fontFamily: 'monospace' }}>
              {t.breakLabel}: {breakDisplay} · {t.entryLabel}: {record?.check_in ? fmtTime(record.check_in, locale) : '—'}
            </p>
          </div>
        )}

        {clockState === 'done' && record && (
          <div style={{ borderRadius: 12, padding: '12px 20px', background: 'var(--indigo-dim)', border: '1px solid rgba(99,102,241,0.25)', textAlign: 'center' }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--indigo)' }}>{t.shiftComplete}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
              {record.check_in ? fmtTime(record.check_in, locale) : '—'} → {record.check_out ? fmtTime(record.check_out, locale) : '—'} · {record.hours_worked ? fmtHoursAsClock(Number(record.hours_worked)) : '—'}{t.hoursWorkedSuffix}
            </p>
          </div>
        )}
      </div>

      {/* ── C2: Schedule context card (only when idle and a schedule exists for today) ── */}
      {scheduleCtx && clockState === 'idle' && (
        <div
          style={{
            ...sectionStyle,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(6,182,212,0.06))',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 12,
            padding: '12px 14px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(99,102,241,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginTop: 1,
            }}
          >
            <Clock size={15} color="#A5B4FC" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#A5B4FC', margin: 0 }}>
                {scheduleCtx.countdown}
              </p>
              <span
                style={{
                  fontSize: 11, fontWeight: 600,
                  padding: '3px 8px', borderRadius: 99,
                  background: 'rgba(245,158,11,0.15)', color: 'var(--amber)',
                  border: '0.5px solid rgba(245,158,11,0.30)',
                  flexShrink: 0,
                  fontFamily: 'monospace',
                }}
              >
                {scheduleCtx.startLabel}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
              {t.scheduleTodayLine(scheduleCtx.durationH, scheduleCtx.empClinic, scheduleCtx.endLabel)}
            </p>
          </div>
        </div>
      )}

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
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.18)',
          borderRadius: 12,
          padding: '10px 14px',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
        }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(99,102,241,0.13)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A5B4FC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          {/* Neutral one-liner: no red text, no "clinic" wording (works for US/BO/PE/future sites). */}
          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
            <strong style={{ color: '#A5B4FC' }}>{t.geoTitle}</strong> {t.geoBannerNeutral}
          </p>
        </div>
      )}

      {/* ── Location denied banner (expandible con instrucciones por browser) ── */}
      {locationPerm === 'denied' && (() => {
        const browser = detectGeoBrowser();
        const steps =
          browser === 'chrome-android'    ? t.geoStepsChromeAndroid   :
          browser === 'samsung-internet'  ? t.geoStepsSamsungInternet :
          browser === 'ios-pwa'           ? t.geoStepsIosPwa          :  // installed: must use iOS Settings
          browser === 'ios-safari'        ? t.geoStepsIosSafari       :
          browser === 'ios-webview'       ? t.geoStepsIosWebView      :
          browser === 'desktop-chrome'    ? t.geoStepsDesktopChrome   :
                                            t.geoStepsGeneric;
        // If the last geo attempt failed with POSITION_UNAVAILABLE,
        // it's almost always the OS-level location service being off,
        // not the browser permission. Distinct hint helps the user
        // look in the right place (Settings → Location, not browser).
        const systemOff = getLastGeoFail() === 'unavailable';

        return (
          <div data-geo-blocked-banner style={{
            ...sectionStyle,
            background: 'rgba(244,63,94,0.08)',
            border: '1px solid rgba(244,63,94,0.28)',
            borderRadius: 12,
            padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(244,63,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                  <line x1="4" y1="4" x2="20" y2="20" stroke="#F43F5E" strokeWidth="2"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#F87171', margin: 0, letterSpacing: '0.01em' }}>
                  {t.geoBlockedTitle}
                </p>
                <p style={{ fontSize: 11, color: '#F87171', marginTop: 4, lineHeight: 1.5, opacity: 0.85 }}>
                  {systemOff ? t.geoBlockedSystemOff : t.geoBlockedBody}
                </p>
                <button
                  onClick={() => setGeoStepsOpen(o => !o)}
                  style={{
                    marginTop: 8,
                    background: 'rgba(244,63,94,0.10)',
                    border: '1px solid rgba(244,63,94,0.30)',
                    borderRadius: 6,
                    padding: '4px 10px',
                    color: '#FCA5A5',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {geoStepsOpen ? '▾' : '▸'} {t.geoBlockedHowTo}
                </button>
              </div>
            </div>

            {geoStepsOpen && (
              <div style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid rgba(244,63,94,0.18)',
              }}>
                <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {steps.map((step, idx) => (
                    <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: 'var(--text-2)', lineHeight: 1.45 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 17, height: 17, borderRadius: '50%', flexShrink: 0,
                          background: 'rgba(244,63,94,0.18)',
                          color: '#FCA5A5',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700,
                          marginTop: 1,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <button
                  onClick={() => window.location.reload()}
                  style={{
                    marginTop: 10,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                    border: 'none',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: '0 4px 12px rgba(99,102,241,0.40)',
                  }}
                >
                  {t.geoBlockedRetry}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── D: Clinic selector ── */}
      {clockState !== 'done' && (
        <div style={sectionStyle}>
          <select
            value={selectedClinic}
            onChange={e => setSelectedClinic(e.target.value)}
            disabled={clocked || lockedToSingleClinic}
            className={shakeClinic ? 'shake' : ''}
            style={{
              width: '100%',
              height: 44,
              padding: '10px 36px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.07)',
              border: `1px solid ${shakeClinic ? 'var(--rose-border)' : 'var(--border)'}`,
              color: selectedClinic ? 'white' : 'var(--text-muted)',
              fontSize: 14,
              cursor: (clocked || lockedToSingleClinic) ? 'default' : 'pointer',
              outline: 'none',
              opacity: (clocked || lockedToSingleClinic) ? 0.7 : 1,
              // Centered text + custom chevron on the right
              textAlign: 'center' as const,
              textAlignLast: 'center' as const,
              WebkitAppearance: 'none' as const,
              MozAppearance: 'none' as const,
              appearance: 'none' as const,
              backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
            }}
          >
            <option value="" disabled>{t.selectClinic}</option>
            {visibleClinics.map(c => (
              <option key={c.id} value={c.name}>{c.display_name}</option>
            ))}
          </select>
        </div>
      )}

      {/*
        ── D2: GPS status pill (solo cuando hay algo significativo) ──
        Solo se renderiza si:
          - granted: confirmar al empleado que la ubicacion esta OK (verde)
          - denied:  necesita reactivar, expande instrucciones (rojo)
        Para prompt/unknown la ocultamos — el clock in la pedira cuando
        haga falta, y mostrarla por defecto resulta molesto.
      */}
      {clockState !== 'done' && (locationPerm === 'granted' || locationPerm === 'denied') && (() => {
        const statusColor =
          locationPerm === 'granted' ? '#10B981' :
          locationPerm === 'denied'  ? '#F43F5E' :
                                       '#F59E0B';
        const statusLabel =
          locationPerm === 'granted' ? t.geoStatusActive :
          locationPerm === 'denied'  ? t.geoStatusBlocked :
                                       t.geoStatusUnverified;
        // IMPORTANTE — iOS Safari pierde el contexto de user-gesture si hay
        // CUALQUIER await/Promise antes de getCurrentPosition. Por eso este
        // handler NO es async y llama a la API nativa de forma sincronica para
        // el caso prompt/unknown. En Android Chrome funciona ambos modos, pero
        // iOS solo muestra el prompt si la llamada nace directamente del click.
        const onClick = (): void => {
          if (locationPerm === 'denied') {
            // Expand troubleshoot + scroll to it
            setGeoStepsOpen(true);
            // microtask to allow the banner to render before scrolling
            setTimeout(() => {
              const banners = document.querySelectorAll('[data-geo-blocked-banner]');
              banners[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 60);
            return;
          }
          if (!navigator.geolocation) {
            void refreshLocationPerm();
            return;
          }
          // Llamada SINCRONA — sin await previo. Esto es lo unico que dispara
          // el prompt nativo en iOS Safari y en iOS PWA standalone.
          //
          // CASOS QUE PUEDE FALLAR SILENCIOSAMENTE:
          //   - iOS con Servicios de Ubicacion desactivados a nivel sistema:
          //     getCurrentPosition se llama, callback de error dispara
          //     INMEDIATAMENTE con code=1 (PERMISSION_DENIED) y NO se muestra
          //     ningun popup. Para el usuario parece "el boton no hace nada".
          //   - Sitio web previamente denegado en Settings > Safari > Sitios web
          //     > Ubicacion: mismo resultado, no hay forma de re-prompt.
          // Por eso en el callback de error forzamos el estado 'denied' y
          // expandimos las instrucciones — al menos el usuario VE que algo paso
          // (la pill se pone roja) y le aparecen los pasos para reactivar.
          navigator.geolocation.getCurrentPosition(
            () => {
              // Permiso concedido (o ya lo estaba). Refrescamos el estado y
              // disparamos un getLocation con retry para guardar la lectura
              // buena en el state del componente.
              void (async () => {
                await refreshLocationPerm();
                await getLocation();
              })();
            },
            (err) => {
              // code 1 = PERMISSION_DENIED — sistema o sitio bloquearon. iOS
              // NO mostro popup, hay que mandarlo a Settings manualmente.
              // code 2 = POSITION_UNAVAILABLE — GPS hardware off, no fix.
              // code 3 = TIMEOUT — pidio pero tardo >8s. Inusual.
              if (err.code === 1) {
                // Forzamos 'denied' aunque navigator.permissions no se entere
                // (iOS Safari historicamente no soporta la API correctamente).
                setLocationPerm('denied');
                setGeoStepsOpen(true);
                setTimeout(() => {
                  const banners = document.querySelectorAll('[data-geo-blocked-banner]');
                  banners[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 80);
              } else {
                // Otros errores — re-leemos permiso por si cambio
                void refreshLocationPerm();
              }
            },
            { timeout: 8000, maximumAge: 0, enableHighAccuracy: true },
          );
        };
        const ctaLabel =
          locationPerm === 'granted' ? t.geoStatusRefresh :
          locationPerm === 'denied'  ? t.geoStatusRetryHowTo :
                                       t.geoStatusRetryAllow;
        return (
          <div
            style={{
              ...sectionStyle,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 10,
              background: `${statusColor}10`,
              border: `1px solid ${statusColor}33`,
              fontSize: 12,
            }}
          >
            <span
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: statusColor, flexShrink: 0,
                boxShadow: `0 0 8px ${statusColor}80`,
              }}
            />
            <span style={{ color: statusColor, fontWeight: 600, fontSize: 11 }}>
              {statusLabel}
            </span>
            <button
              onClick={onClick}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                color: statusColor,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 8px',
                borderRadius: 6,
                fontFamily: 'inherit',
                opacity: 0.85,
              }}
              onMouseOver={(e) => { e.currentTarget.style.opacity = '1'; }}
              onMouseOut={(e) => { e.currentTarget.style.opacity = '0.85'; }}
            >
              {ctaLabel} →
            </button>
          </div>
        );
      })()}

      {/* ── E: Action buttons ── */}
      <div style={sectionStyle}>
        {clockState === 'idle' && (
          <button
            onClick={handleClockIn}
            disabled={loading}
            style={{ width: '100%', height: 52, borderRadius: 14, background: 'var(--green-dim)', border: '1px solid var(--green-border)', color: 'var(--green)', fontSize: 15, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.15s' }}
          >
            {loading ? <span style={{ width: 18, height: 18, border: '2px solid var(--green-border)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> : <Play size={16} />}
            {loading ? t.saving : t.clockInBtn}
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
              {t.breakBtn}
            </button>
            <button
              onClick={handleClockOut}
              disabled={loading}
              style={{ flex: 1, height: 48, borderRadius: 12, background: 'var(--rose-dim)', border: '1px solid var(--rose-border)', color: 'var(--rose)', fontSize: 13, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {loading ? <span style={{ width: 16, height: 16, border: '2px solid var(--rose-border)', borderTopColor: 'var(--rose)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> : <Square size={15} />}
              {t.clockOutBtn}
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
            {loading ? t.saving : t.backToWork}
          </button>
        )}

        {clockState === 'done' && (
          <button
            onClick={handleNewShift}
            style={{ width: '100%', height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {t.newShift}
          </button>
        )}
      </div>

      {/* ── Action error ── */}
      {actionError && (
        <div style={{ ...sectionStyle, background: 'var(--rose-dim)', border: '1px solid var(--rose-border)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--rose)' }}>{actionError}</span>
          {retryAction && (
            <button
              onClick={() => {
                setActionError('');
                const action = retryAction;
                setRetryAction(null);
                if (action === 'clockIn')  void handleClockIn();
                if (action === 'break')    void handleBreak();
                if (action === 'return')   void handleReturnFromBreak();
                if (action === 'clockOut') void handleClockOut();
              }}
              style={{ background: 'none', border: 'none', color: 'var(--rose)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, flexShrink: 0 }}
            >
              <RefreshCw size={12} />
              {t.retry}
            </button>
          )}
        </div>
      )}

      {/* ── F: Stats bar with progress vs employee goals ── */}
      <div style={{ ...sectionStyle, display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {([
          { label: t.statToday, value: stats.today, pct: pctToday, goal: goals.daily },
          { label: t.statWeek,  value: stats.week,  pct: pctWeek,  goal: goals.weekly },
          { label: t.statMonth, value: stats.month, pct: pctMonth, goal: goals.monthly },
        ] as const).map((s, i, arr) => (
          <div
            key={s.label}
            style={{ flex: 1, padding: '12px 10px 10px', textAlign: 'center', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}
          >
            <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', lineHeight: 1 }}>
              {s.value}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {s.label}
            </p>
            {/* Mini progress bar towards the goal (8h / 40h / 160h for FT) */}
            <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${s.pct}%`, height: '100%', borderRadius: 99,
                  background: 'linear-gradient(90deg, var(--indigo), var(--cyan, #06B6D4))',
                  transition: 'width 400ms ease',
                }}
              />
            </div>
            <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, opacity: 0.75 }}>
              {t.statProgressOf(s.pct, s.goal)}
            </p>
          </div>
        ))}
      </div>

      {/* ── Install PWA banner (mobile only; hidden when installed/dismissed) ── */}
      <InstallPWABanner />

    </main>
  );
}
