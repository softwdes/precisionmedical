'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Gauge } from 'lucide-react';

interface GeoPoint { lat: number; lng: number; at?: string }
interface Waypoint { lat: number; lng: number; recorded_at: string }

/**
 * Un turno del dia. El componente acepta:
 *   - Modo legacy: `checkIn`/`checkOut`/`waypoints` (un solo turno).
 *   - Modo dia completo: `shifts` (array de turnos cronologicos).
 *
 * Cuando `shifts` esta presente, se ignoran las props legacy.
 */
export interface Shift {
  id: string;
  checkIn: GeoPoint | null;
  checkOut: GeoPoint | null;
  waypoints: Waypoint[];
}

interface Props {
  // Modo single-shift (legacy)
  checkIn?: GeoPoint | null;
  checkOut?: GeoPoint | null;
  waypoints?: Waypoint[];
  // Modo multi-shift (dia completo)
  shifts?: Shift[];
}

interface TimePoint {
  lat: number;
  lng: number;
  t: number;
  kind: 'check_in' | 'waypoint' | 'check_out' | 'gap';
  /** Indice del turno al que pertenece este punto (0-based). */
  shiftIdx: number;
}

const DEFAULT_CENTER: [number, number] = [40.2338, -111.6585];  // Provo, Utah
const SPEEDS = [1, 2, 5, 10, 25] as const;

function fmtClock(t: number): string {
  return new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function interpAt(traj: TimePoint[], t: number): { lat: number; lng: number } | null {
  if (traj.length === 0) return null;
  if (t <= traj[0]!.t) return { lat: traj[0]!.lat, lng: traj[0]!.lng };
  const last = traj[traj.length - 1]!;
  if (t >= last.t) return { lat: last.lat, lng: last.lng };
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

export function AttendanceMap({ checkIn, checkOut, waypoints, shifts }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const movingMarkerRef = useRef<L.Marker | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);

  // Normalizamos a un array de shifts. Si vienen las props legacy,
  // las envolvemos en un solo shift.
  const normalizedShifts: Shift[] = useMemo(() => {
    if (shifts && shifts.length > 0) return shifts;
    return [{
      id: 'legacy',
      checkIn: checkIn ?? null,
      checkOut: checkOut ?? null,
      waypoints: waypoints ?? [],
    }];
  }, [shifts, checkIn, checkOut, waypoints]);

  const isMultiShift = normalizedShifts.length > 1;

  // Construye la trayectoria combinada en orden temporal.
  // Cada turno aporta: check_in -> waypoints -> check_out.
  // Entre dos turnos consecutivos, marcamos el final del primero y
  // el inicio del siguiente como kind='gap' para que el render de
  // la polyline pinte ese tramo de manera distinta (punteado gris).
  const trajectory = useMemo<TimePoint[]>(() => {
    const pts: TimePoint[] = [];
    normalizedShifts.forEach((shift, idx) => {
      if (shift.checkIn?.at) {
        pts.push({
          lat: shift.checkIn.lat, lng: shift.checkIn.lng,
          t: new Date(shift.checkIn.at).getTime(),
          kind: 'check_in', shiftIdx: idx,
        });
      }
      for (const wp of shift.waypoints) {
        pts.push({
          lat: wp.lat, lng: wp.lng,
          t: new Date(wp.recorded_at).getTime(),
          kind: 'waypoint', shiftIdx: idx,
        });
      }
      if (shift.checkOut?.at) {
        pts.push({
          lat: shift.checkOut.lat, lng: shift.checkOut.lng,
          t: new Date(shift.checkOut.at).getTime(),
          kind: 'check_out', shiftIdx: idx,
        });
      }
    });
    return pts.sort((a, b) => a.t - b.t);
  }, [normalizedShifts]);

  const startMs = trajectory[0]?.t ?? 0;
  const endMs = trajectory[trajectory.length - 1]?.t ?? 0;
  const durationMs = Math.max(0, endMs - startMs);
  const hasPath = trajectory.length >= 2 && durationMs > 0;

  // Player state
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [speed, setSpeed] = useState<typeof SPEEDS[number]>(5);

  // ── Initialize Leaflet map once ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    void import('leaflet').then(L => {
      leafletRef.current = L;

      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Centro inicial: primer punto disponible.
      const firstPoint = normalizedShifts.flatMap((s) => [
        s.checkIn ? [s.checkIn.lat, s.checkIn.lng] as [number, number] : null,
        ...s.waypoints.map((w) => [w.lat, w.lng] as [number, number]),
        s.checkOut ? [s.checkOut.lat, s.checkOut.lng] as [number, number] : null,
      ]).find((p): p is [number, number] => p !== null);

      const map = L.map(containerRef.current!, { zoomControl: true, attributionControl: false })
        .setView(firstPoint ?? DEFAULT_CENTER, 15);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

      const allPoints: [number, number][] = [];

      // Render por turno: pines numerados, polyline solida intra-shift.
      normalizedShifts.forEach((shift, idx) => {
        const shiftNum = idx + 1;
        const points: [number, number][] = [];

        // Check-in pin (emerald) — con numero si hay multiple turnos.
        if (shift.checkIn) {
          const html = isMultiShift
            ? `<div style="position:relative;width:18px;height:18px;border-radius:50%;background:#10B981;border:2px solid white;box-shadow:0 2px 8px rgba(16,185,129,0.6);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700;">${shiftNum}</div>`
            : `<div style="width:14px;height:14px;border-radius:50%;background:#10B981;border:2px solid white;box-shadow:0 2px 8px rgba(16,185,129,0.6)"></div>`;
          const size: [number, number] = isMultiShift ? [18, 18] : [14, 14];
          const anchor: [number, number] = isMultiShift ? [9, 9] : [7, 7];
          L.marker([shift.checkIn.lat, shift.checkIn.lng], {
            icon: L.divIcon({ html, className: '', iconSize: size, iconAnchor: anchor }),
          }).addTo(map).bindPopup(
            isMultiShift
              ? `<b>Entrada · Turno ${shiftNum}</b>${shift.checkIn.at ? `<br><span style="font-family:monospace">${fmtClock(new Date(shift.checkIn.at).getTime())}</span>` : ''}`
              : '<b>Entrada</b>',
          );
          points.push([shift.checkIn.lat, shift.checkIn.lng]);
          allPoints.push([shift.checkIn.lat, shift.checkIn.lng]);
        }

        // Waypoints
        for (const wp of shift.waypoints) {
          L.marker([wp.lat, wp.lng], {
            icon: L.divIcon({
              html: `<div style="width:8px;height:8px;border-radius:50%;background:#6366F1;border:1.5px solid white;opacity:0.85"></div>`,
              className: '', iconSize: [8, 8], iconAnchor: [4, 4],
            }),
          }).addTo(map).bindPopup(fmtClock(new Date(wp.recorded_at).getTime()));
          points.push([wp.lat, wp.lng]);
          allPoints.push([wp.lat, wp.lng]);
        }

        // Check-out pin (rose) — con numero si hay multiple turnos.
        if (shift.checkOut) {
          const html = isMultiShift
            ? `<div style="position:relative;width:18px;height:18px;border-radius:50%;background:#F43F5E;border:2px solid white;box-shadow:0 2px 8px rgba(244,63,94,0.6);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:700;">${shiftNum}</div>`
            : `<div style="width:14px;height:14px;border-radius:50%;background:#F43F5E;border:2px solid white;box-shadow:0 2px 8px rgba(244,63,94,0.6)"></div>`;
          const size: [number, number] = isMultiShift ? [18, 18] : [14, 14];
          const anchor: [number, number] = isMultiShift ? [9, 9] : [7, 7];
          L.marker([shift.checkOut.lat, shift.checkOut.lng], {
            icon: L.divIcon({ html, className: '', iconSize: size, iconAnchor: anchor }),
          }).addTo(map).bindPopup(
            isMultiShift
              ? `<b>Salida · Turno ${shiftNum}</b>${shift.checkOut.at ? `<br><span style="font-family:monospace">${fmtClock(new Date(shift.checkOut.at).getTime())}</span>` : ''}`
              : '<b>Salida</b>',
          );
          points.push([shift.checkOut.lat, shift.checkOut.lng]);
          allPoints.push([shift.checkOut.lat, shift.checkOut.lng]);
        }

        // Polyline solida dentro del turno (color brand, opacidad alta).
        if (points.length >= 2) {
          L.polyline(points, { color: '#6366F1', weight: 3, opacity: 0.75 }).addTo(map);
        }
      });

      // Polylines punteadas entre turnos (gap "off-shift").
      // Solo se dibujan en modo multi-shift y cuando los dos turnos
      // consecutivos tienen puntos finales/iniciales con coords.
      if (isMultiShift) {
        for (let i = 0; i < normalizedShifts.length - 1; i++) {
          const a = normalizedShifts[i]!;
          const b = normalizedShifts[i + 1]!;
          const from = a.checkOut ?? (a.waypoints.length > 0 ? { lat: a.waypoints[a.waypoints.length - 1]!.lat, lng: a.waypoints[a.waypoints.length - 1]!.lng } : a.checkIn);
          const to = b.checkIn ?? (b.waypoints.length > 0 ? { lat: b.waypoints[0]!.lat, lng: b.waypoints[0]!.lng } : b.checkOut);
          if (from && to) {
            L.polyline(
              [[from.lat, from.lng], [to.lat, to.lng]],
              { color: '#6B7280', weight: 2, opacity: 0.55, dashArray: '4 6' },
            ).addTo(map).bindPopup('Tiempo off-shift');
          }
        }
      }

      // Animated marker
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
    if (currentMs >= durationMs) setCurrentMs(0);
    setPlaying(p => !p);
  }

  const currentT = startMs + currentMs;
  const pct = durationMs > 0 ? Math.min(100, (currentMs / durationMs) * 100) : 0;

  // ¿En que turno esta el marcador animado ahora mismo? Lo usamos para
  // pintar un label "Turno N · Off-shift" segun corresponda.
  const currentShiftLabel = useMemo<string>(() => {
    if (!isMultiShift || !hasPath) return '';
    const t = currentT;
    for (let i = 0; i < normalizedShifts.length; i++) {
      const s = normalizedShifts[i]!;
      const sStart = s.checkIn?.at ? new Date(s.checkIn.at).getTime() : null;
      const sEnd = s.checkOut?.at ? new Date(s.checkOut.at).getTime() : null;
      if (sStart != null && sEnd != null && t >= sStart && t <= sEnd) {
        return `Turno ${i + 1}`;
      }
      if (sStart != null && sEnd != null && i < normalizedShifts.length - 1) {
        const nextStart = normalizedShifts[i + 1]!.checkIn?.at
          ? new Date(normalizedShifts[i + 1]!.checkIn!.at!).getTime()
          : null;
        if (nextStart != null && t > sEnd && t < nextStart) {
          return 'Off-shift';
        }
      }
    }
    return '';
  }, [currentT, normalizedShifts, isMultiShift, hasPath]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={containerRef} style={{ width: '100%', flex: 1, minHeight: 0, borderRadius: 8 }} />

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

      {hasPath && playing && (
        <p style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'monospace' }}>
          ⏱ {fmtClock(currentT)}
          {currentShiftLabel && (
            <span
              style={{
                marginLeft: 8,
                padding: '1px 6px',
                borderRadius: 4,
                background: currentShiftLabel === 'Off-shift' ? 'rgba(107,114,128,0.18)' : 'rgba(99,102,241,0.15)',
                color: currentShiftLabel === 'Off-shift' ? '#9CA3AF' : '#A5B4FC',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {currentShiftLabel}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
