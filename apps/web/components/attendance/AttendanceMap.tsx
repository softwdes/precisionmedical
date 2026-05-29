'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Gauge } from 'lucide-react';

interface GeoPoint   { lat: number; lng: number; at?: string }
interface Waypoint   { lat: number; lng: number; recorded_at: string }

interface Props {
  checkIn:   GeoPoint | null;
  checkOut:  GeoPoint | null;
  waypoints: Waypoint[];
}

interface TimePoint {
  lat: number;
  lng: number;
  t: number;                                     // epoch ms
  kind: 'check_in' | 'waypoint' | 'check_out';
}

const DEFAULT_CENTER: [number, number] = [40.2338, -111.6585];  // Provo, Utah
const SPEEDS = [1, 2, 5, 10, 25] as const;

function fmtClock(t: number): string {
  return new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** Linear interpolation between two TimePoints at time `t` (clamped to range). */
function interpAt(traj: TimePoint[], t: number): { lat: number; lng: number } | null {
  if (traj.length === 0) return null;
  if (t <= traj[0]!.t) return { lat: traj[0]!.lat, lng: traj[0]!.lng };
  const last = traj[traj.length - 1]!;
  if (t >= last.t) return { lat: last.lat, lng: last.lng };
  // Binary-ish linear scan: trajectories are short (<200 points)
  for (let i = 1; i < traj.length; i++) {
    const a = traj[i - 1]!;
    const b = traj[i]!;
    if (t <= b.t) {
      const span = b.t - a.t || 1;
      const frac = (t - a.t) / span;
      return {
        lat: a.lat + (b.lat - a.lat) * frac,
        lng: a.lng + (b.lng - a.lng) * frac,
      };
    }
  }
  return { lat: last.lat, lng: last.lng };
}

export function AttendanceMap({ checkIn, checkOut, waypoints }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<L.Map | null>(null);
  const movingMarkerRef = useRef<L.Marker | null>(null);
  const leafletRef      = useRef<typeof import('leaflet') | null>(null);

  // Build the time-ordered trajectory once per props change
  const trajectory = useMemo<TimePoint[]>(() => {
    const pts: TimePoint[] = [];
    if (checkIn && checkIn.at) {
      pts.push({ lat: checkIn.lat, lng: checkIn.lng, t: new Date(checkIn.at).getTime(), kind: 'check_in' });
    }
    for (const wp of waypoints) {
      pts.push({ lat: wp.lat, lng: wp.lng, t: new Date(wp.recorded_at).getTime(), kind: 'waypoint' });
    }
    if (checkOut && checkOut.at) {
      pts.push({ lat: checkOut.lat, lng: checkOut.lng, t: new Date(checkOut.at).getTime(), kind: 'check_out' });
    }
    return pts.sort((a, b) => a.t - b.t);
  }, [checkIn, checkOut, waypoints]);

  const startMs    = trajectory[0]?.t ?? 0;
  const endMs      = trajectory[trajectory.length - 1]?.t ?? 0;
  const durationMs = Math.max(0, endMs - startMs);
  const hasPath    = trajectory.length >= 2 && durationMs > 0;

  // Player state
  const [playing, setPlaying]     = useState(false);
  const [currentMs, setCurrentMs] = useState(0);     // offset from startMs
  const [speed, setSpeed]         = useState<typeof SPEEDS[number]>(5);

  // ── Initialize Leaflet map once ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    void import('leaflet').then(L => {
      leafletRef.current = L;

      // Inject Leaflet CSS once (next.js bundler strips third-party CSS)
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id   = 'leaflet-css';
        link.rel  = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const center: [number, number] =
        checkIn   ? [checkIn.lat,  checkIn.lng]  :
        waypoints[0] ? [waypoints[0].lat, waypoints[0].lng] :
        checkOut  ? [checkOut.lat, checkOut.lng] :
                    DEFAULT_CENTER;

      const map = L.map(containerRef.current!, { zoomControl: true, attributionControl: false })
        .setView(center, 15);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

      // Check-in pin (emerald)
      if (checkIn) {
        L.marker([checkIn.lat, checkIn.lng], {
          icon: L.divIcon({
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#10B981;border:2px solid white;box-shadow:0 2px 8px rgba(16,185,129,0.6)"></div>`,
            className: '', iconSize: [14, 14], iconAnchor: [7, 7],
          }),
        }).addTo(map).bindPopup('<b>Entrada</b>');
      }

      // Check-out pin (rose)
      if (checkOut) {
        L.marker([checkOut.lat, checkOut.lng], {
          icon: L.divIcon({
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#F43F5E;border:2px solid white;box-shadow:0 2px 8px rgba(244,63,94,0.6)"></div>`,
            className: '', iconSize: [14, 14], iconAnchor: [7, 7],
          }),
        }).addTo(map).bindPopup('<b>Salida</b>');
      }

      // Waypoints + polyline
      const allPoints: [number, number][] = [];
      if (checkIn)  allPoints.push([checkIn.lat,  checkIn.lng]);
      for (const wp of waypoints) allPoints.push([wp.lat, wp.lng]);
      if (checkOut) allPoints.push([checkOut.lat, checkOut.lng]);

      if (waypoints.length > 0) {
        L.polyline(allPoints, { color: '#6366F1', weight: 2.5, opacity: 0.65, dashArray: '5 5' }).addTo(map);

        for (const wp of waypoints) {
          L.marker([wp.lat, wp.lng], {
            icon: L.divIcon({
              html: `<div style="width:8px;height:8px;border-radius:50%;background:#6366F1;border:1.5px solid white;opacity:0.85"></div>`,
              className: '', iconSize: [8, 8], iconAnchor: [4, 4],
            }),
          }).addTo(map).bindPopup(fmtClock(new Date(wp.recorded_at).getTime()));
        }
      }

      // Animated marker (shown only when we have a real trajectory)
      if (hasPath) {
        movingMarkerRef.current = L.marker([trajectory[0]!.lat, trajectory[0]!.lng], {
          icon: L.divIcon({
            html: `<div style="
              width:20px;height:20px;border-radius:50%;
              background:linear-gradient(135deg,#6366F1,#8B5CF6,#06B6D4);
              border:3px solid white;
              box-shadow:0 0 0 2px rgba(99,102,241,0.4), 0 0 16px rgba(99,102,241,0.6);
            "></div>`,
            className: '', iconSize: [20, 20], iconAnchor: [10, 10],
          }),
        }).addTo(map);
      }

      if (allPoints.length > 1) {
        map.fitBounds(allPoints as [number, number][], { padding: [40, 40], maxZoom: 16 });
      }
    });

    return () => {
      const m = mapRef.current;
      if (m) m.remove();
      mapRef.current = null;
      movingMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update moving marker position when currentMs changes ─────────────────
  useEffect(() => {
    if (!movingMarkerRef.current || !hasPath) return;
    const pos = interpAt(trajectory, startMs + currentMs);
    if (pos) movingMarkerRef.current.setLatLng([pos.lat, pos.lng]);
  }, [currentMs, hasPath, startMs, trajectory]);

  // ── Animation loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !hasPath) return;

    let raf = 0;
    let lastTick = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTick;
      lastTick = now;
      setCurrentMs(prev => {
        // 1s of wall time = `speed` real-time minutes. Tunable. Default speed=5
        // means 1s = 5 real minutes (an 8h shift takes ~96s to replay).
        const advance = delta * speed * 60;
        const next = prev + advance;
        if (next >= durationMs) {
          setPlaying(false);
          return durationMs;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, durationMs, hasPath]);

  function togglePlay() {
    if (!hasPath) return;
    if (currentMs >= durationMs) setCurrentMs(0); // rewind on play after end
    setPlaying(p => !p);
  }

  // Current displayed timestamp (for the clock label)
  const currentT = startMs + currentMs;
  const pct = durationMs > 0 ? Math.min(100, (currentMs / durationMs) * 100) : 0;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={containerRef} style={{ width: '100%', flex: 1, minHeight: 0, borderRadius: 8 }} />

      {/* Player controls — only shown when we have an actual trajectory */}
      {hasPath && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            marginTop: 8,
            borderRadius: 10,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            fontSize: 12,
          }}
        >
          <button
            onClick={togglePlay}
            aria-label={playing ? 'Pausar' : 'Reproducir'}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              border: 'none', color: 'white', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
              flexShrink: 0,
            }}
          >
            {playing ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" />}
          </button>

          <span style={{ fontFamily: 'monospace', color: 'var(--text-2)', minWidth: 60, fontSize: 11 }}>
            {fmtClock(startMs)}
          </span>

          <div style={{ flex: 1, position: 'relative', height: 6, minWidth: 0 }}>
            <input
              type="range"
              min={0}
              max={durationMs}
              value={currentMs}
              onChange={(e) => setCurrentMs(Number(e.target.value))}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                margin: 0, padding: 0,
                appearance: 'none', WebkitAppearance: 'none',
                background: 'transparent',
                cursor: 'pointer',
                zIndex: 2,
              }}
            />
            <div
              style={{
                position: 'absolute', inset: 0,
                background: 'rgba(255,255,255,0.10)',
                borderRadius: 999,
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: `${pct}%`, height: '100%',
                  background: 'linear-gradient(90deg, #6366F1, #8B5CF6, #06B6D4)',
                  transition: playing ? 'none' : 'width 100ms ease',
                }}
              />
            </div>
          </div>

          <span style={{ fontFamily: 'monospace', color: 'var(--text-2)', minWidth: 60, fontSize: 11, textAlign: 'right' }}>
            {fmtClock(endMs)}
          </span>

          {/* Speed selector */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '3px 6px 3px 8px',
            }}
            title="Velocidad de reproducción"
          >
            <Gauge size={11} style={{ color: 'var(--text-muted)' }} />
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value) as typeof SPEEDS[number])}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-1)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            >
              {SPEEDS.map(s => <option key={s} value={s} style={{ background: '#1E293B' }}>{s}x</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Live time label (centered above progress when playing) */}
      {hasPath && playing && (
        <p style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'monospace' }}>
          ⏱ {fmtClock(currentT)}
        </p>
      )}
    </div>
  );
}
