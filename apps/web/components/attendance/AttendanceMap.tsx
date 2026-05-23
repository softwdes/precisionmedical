'use client';

import { useEffect, useRef } from 'react';

interface GeoPoint { lat: number; lng: number; }
interface Waypoint  { lat: number; lng: number; recorded_at: string; }

interface Props {
  checkIn:   GeoPoint | null;
  checkOut:  GeoPoint | null;
  waypoints: Waypoint[];
}

// Default center: Provo, Utah
const DEFAULT_CENTER: [number, number] = [40.2338, -111.6585];

export function AttendanceMap({ checkIn, checkOut, waypoints }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    void import('leaflet').then(L => {
      // Inject leaflet CSS once
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id   = 'leaflet-css';
        link.rel  = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const center: [number, number] = checkIn
        ? [checkIn.lat, checkIn.lng]
        : waypoints[0]
          ? [waypoints[0].lat, waypoints[0].lng]
          : DEFAULT_CENTER;

      const map = L.map(containerRef.current!, { zoomControl: true, attributionControl: false })
        .setView(center, 15);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

      // ── Clock-in pin (emerald) ────────────────────────────────────────────
      if (checkIn) {
        L.marker([checkIn.lat, checkIn.lng], {
          icon: L.divIcon({
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#10B981;border:2px solid white;box-shadow:0 2px 8px rgba(16,185,129,0.6)"></div>`,
            className: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        }).addTo(map).bindPopup('<b>Entrada</b>');
      }

      // ── Clock-out pin (rose) ──────────────────────────────────────────────
      if (checkOut) {
        L.marker([checkOut.lat, checkOut.lng], {
          icon: L.divIcon({
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#F43F5E;border:2px solid white;box-shadow:0 2px 8px rgba(244,63,94,0.6)"></div>`,
            className: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        }).addTo(map).bindPopup('<b>Salida</b>');
      }

      // ── Waypoints + polyline ──────────────────────────────────────────────
      const allPoints: [number, number][] = [];
      if (checkIn)  allPoints.push([checkIn.lat,  checkIn.lng]);
      for (const wp of waypoints) allPoints.push([wp.lat, wp.lng]);
      if (checkOut) allPoints.push([checkOut.lat, checkOut.lng]);

      if (waypoints.length > 0) {
        // Polyline connecting all points
        L.polyline(allPoints, { color: '#6366F1', weight: 2.5, opacity: 0.65, dashArray: '5 5' }).addTo(map);

        // Intermediate waypoint dots (indigo)
        for (const wp of waypoints) {
          L.marker([wp.lat, wp.lng], {
            icon: L.divIcon({
              html: `<div style="width:8px;height:8px;border-radius:50%;background:#6366F1;border:1.5px solid white;opacity:0.85"></div>`,
              className: '',
              iconSize: [8, 8],
              iconAnchor: [4, 4],
            }),
          }).addTo(map).bindPopup(new Date(wp.recorded_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }));
        }
      }

      // Fit map to show all points
      if (allPoints.length > 1) {
        map.fitBounds(allPoints as [number, number][], { padding: [40, 40], maxZoom: 16 });
      }
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 8 }} />;
}
