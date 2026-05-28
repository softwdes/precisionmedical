'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
// Note: NOT importing 'leaflet/dist/leaflet.css' here — Next.js App Router
// sometimes drops third-party CSS imports from client components in the
// production bundle. We inject the stylesheet from CDN below.

const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_CSS_ID  = 'pm-leaflet-css';

function ensureLeafletCss(): Promise<void> {
  return new Promise((resolve) => {
    if (document.getElementById(LEAFLET_CSS_ID)) { resolve(); return; }
    const link = document.createElement('link');
    link.id = LEAFLET_CSS_ID;
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS_URL;
    link.crossOrigin = '';
    link.onload = () => resolve();
    link.onerror = () => resolve(); // resolve anyway, map will still try
    document.head.appendChild(link);
  });
}
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@precision/ui';
import { MapPin, Save } from 'lucide-react';
import { toast } from 'sonner';

export interface Clinic {
  id: string;
  name: string;
  display_name: string;
  country: string;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  is_active: boolean;
  address?: string | null;
  phone?: string | null;
}

// Default map center when a clinic has no coords yet — city center per country.
const COUNTRY_DEFAULT_CENTER: Record<string, [number, number]> = {
  US: [40.2338, -111.6585],  // Provo, Utah (fallback for new US clinics)
  BO: [-16.4897, -68.1193],  // La Paz
  PE: [-16.4090, -71.5375],  // Arequipa
};

// Custom inline SVG marker so we don't depend on Leaflet's default PNG icons
// (which break in Next.js bundles without workarounds).
const PIN_ICON = L.divIcon({
  className: 'pm-clinic-pin',
  html: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="#6366F1"/>
    <circle cx="14" cy="14" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 36],
  iconAnchor: [14, 36],
});

export function ClinicEditDialog({
  clinic,
  onClose,
  onSaved,
}: {
  clinic: Clinic;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const [form, setForm] = useState({
    display_name: clinic.display_name,
    lat: clinic.lat,
    lng: clinic.lng,
    radius_m: clinic.radius_m ?? 250,
    is_active: clinic.is_active,
    address: clinic.address ?? '',
    phone: clinic.phone ?? '',
  });

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const updateMutation = trpc.clinics.update.useMutation({
    onSuccess: () => {
      toast.success('Clínica actualizada');
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  // Initialize Leaflet map once — waits for CSS to load from CDN before init
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await ensureLeafletCss();
      if (cancelled) return;
      if (!mapRef.current || mapInstanceRef.current) return;

      const initialCenter: [number, number] =
        form.lat !== null && form.lng !== null
          ? [form.lat, form.lng]
          : COUNTRY_DEFAULT_CENTER[clinic.country] ?? [0, 0];
      const initialZoom = form.lat !== null && form.lng !== null ? 16 : 12;

      const map = L.map(mapRef.current, { zoomControl: true }).setView(initialCenter, initialZoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);

      // Click anywhere on the map → update lat/lng
      map.on('click', (e: L.LeafletMouseEvent) => {
        setForm((f) => ({ ...f, lat: e.latlng.lat, lng: e.latlng.lng }));
      });

      mapInstanceRef.current = map;

      // Initial marker + circle if we already have coords
      if (form.lat !== null && form.lng !== null) {
        markerRef.current = L.marker([form.lat, form.lng], { icon: PIN_ICON }).addTo(map);
        circleRef.current = L.circle([form.lat, form.lng], {
          radius: form.radius_m,
          color: '#6366F1',
          fillColor: '#6366F1',
          fillOpacity: 0.12,
          weight: 2,
        }).addTo(map);
      }

      // Fix Leaflet sizing when dialog finishes mounting (Radix Portal +
      // animation can leave the div with height 0 on first measure).
      [50, 200, 500].forEach(ms => setTimeout(() => map.invalidateSize(), ms));
    })();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render marker + circle whenever lat/lng/radius change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (form.lat === null || form.lng === null) {
      if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
      if (circleRef.current) { circleRef.current.remove(); circleRef.current = null; }
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng([form.lat, form.lng]);
    } else {
      markerRef.current = L.marker([form.lat, form.lng], { icon: PIN_ICON }).addTo(map);
    }

    if (circleRef.current) {
      circleRef.current.setLatLng([form.lat, form.lng]);
      circleRef.current.setRadius(form.radius_m);
    } else {
      circleRef.current = L.circle([form.lat, form.lng], {
        radius: form.radius_m,
        color: '#6366F1',
        fillColor: '#6366F1',
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map);
    }
  }, [form.lat, form.lng, form.radius_m]);

  const handleSave = (): void => {
    updateMutation.mutate({
      id: clinic.id,
      display_name: form.display_name,
      lat: form.lat,
      lng: form.lng,
      radius_m: form.radius_m,
      is_active: form.is_active,
      address: form.address || undefined,
      phone: form.phone || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col max-h-[90dvh] w-full sm:max-w-2xl overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-brand" />
            Editar clínica — {clinic.display_name}
          </DialogTitle>
          <DialogDescription>
            Ajusta las coordenadas GPS y el radio de geofencing para verificar la asistencia de empleados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-1 pr-1">
          {/* Map */}
          <div className="space-y-1.5">
            <Label>Ubicación en el mapa <span className="text-text-muted font-normal">(clic para fijar)</span></Label>
            <div
              ref={mapRef}
              style={{ height: 280, width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}
            />
            <p className="text-tiny text-text-muted">
              El círculo indigo muestra el radio de geofencing donde los empleados pueden marcar entrada.
            </p>
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <Label>Nombre visible</Label>
            <Input
              value={form.display_name}
              onChange={(e) => setForm(f => ({ ...f, display_name: e.target.value }))}
            />
            <p className="text-tiny text-text-muted">
              Esto es lo que el empleado ve en el dropdown del Time Clock. La clave interna (<code className="text-text-3">{clinic.name}</code>) no cambia.
            </p>
          </div>

          {/* Coords + radius */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Latitud</Label>
              <Input
                type="number"
                step="any"
                value={form.lat ?? ''}
                onChange={(e) => setForm(f => ({ ...f, lat: e.target.value === '' ? null : Number(e.target.value) }))}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Longitud</Label>
              <Input
                type="number"
                step="any"
                value={form.lng ?? ''}
                onChange={(e) => setForm(f => ({ ...f, lng: e.target.value === '' ? null : Number(e.target.value) }))}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Radio (m)</Label>
              <Input
                type="number"
                step="10"
                min={10}
                max={50000}
                value={form.radius_m}
                onChange={(e) => setForm(f => ({ ...f, radius_m: Number(e.target.value) }))}
              />
            </div>
          </div>

          {/* Address + phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dirección <span className="text-text-muted font-normal">(opcional)</span></Label>
              <Input
                value={form.address}
                onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Calle, ciudad, código postal"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono <span className="text-text-muted font-normal">(opcional)</span></Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+1 (801) ..."
              />
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface/50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text-1">Clínica activa</p>
              <p className="text-tiny text-text-muted">
                Las inactivas no aparecen en el Time Clock ni se asignan a empleados nuevos.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.is_active}
              onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              style={{
                width: 38,
                height: 22,
                borderRadius: 11,
                background: form.is_active ? '#10B981' : 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.08)',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 150ms',
                padding: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: form.is_active ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: 'white',
                  transition: 'left 180ms ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </button>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={updateMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={updateMutation.isPending}>
            <Save className="h-3.5 w-3.5" />
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
