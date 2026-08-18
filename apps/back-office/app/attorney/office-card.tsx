'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { MapPin, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Portal Legal · tarjeta de oficina de la barra lateral (F7).
 *
 * Le muestra al bufete dónde queda la clínica a la que manda a sus clientes.
 * Los datos salen de `Clinic` (`photos`, `businessHours`, `website` son campos
 * nuevos — ver el comentario del modelo).
 *
 * Todo bloque se esconde si no tiene datos, en vez de mostrar un placeholder:
 * hoy las 6 clínicas están sin fotos ni horarios, y una tarjeta llena de "—" es
 * peor que una tarjeta corta. A medida que se carguen, va apareciendo sola.
 */

export interface OfficeClinic {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  photos: string[];
  website: string | null;
  /** { mon: { open, close } | null, ... } — ver `Clinic.businessHours`. */
  hours: Record<string, { open: string; close: string } | null> | null;
}

const DAYS: Array<{ key: string; labelKey: string }> = [
  { key: 'mon', labelKey: 'dayMon' },
  { key: 'tue', labelKey: 'dayTue' },
  { key: 'wed', labelKey: 'dayWed' },
  { key: 'thu', labelKey: 'dayThu' },
  { key: 'fri', labelKey: 'dayFri' },
  { key: 'sat', labelKey: 'daySat' },
  { key: 'sun', labelKey: 'daySun' },
];

export function OfficeCard({ clinics }: { clinics: OfficeClinic[] }): React.ReactElement | null {
  const t = useTranslations('phoenix.attorney');
  const [index, setIndex] = React.useState(0);

  if (clinics.length === 0) return null;

  // El índice puede quedar fuera de rango si la lista se acorta entre renders.
  const clinic = clinics[Math.min(index, clinics.length - 1)]!;

  const fullAddress = [clinic.address, clinic.city, clinic.state, clinic.zipCode]
    .filter(Boolean).join(', ');

  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  const photo = clinic.photos[0] ?? null;
  const hours = clinic.hours;
  const hasHours = !!hours && DAYS.some((d) => d.key in hours);

  const move = (delta: number) =>
    setIndex((i) => (i + delta + clinics.length) % clinics.length);

  return (
    <div className="px-3 pb-3 space-y-2.5">
      {/* Foto + nombre. Sin foto se muestra solo el nombre — no un recuadro vacío. */}
      {photo && (
        <div className="relative rounded-lg overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL externa del bucket, sin loader configurado */}
          <img src={photo} alt={clinic.name} className="w-full h-24 object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
            <span className="text-white text-[11px] font-semibold">{clinic.name}</span>
          </div>
        </div>
      )}

      {clinics.length > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => move(-1)}
            className="w-6 h-6 rounded-md text-text-muted hover:text-text-1 hover:bg-white/5 inline-flex items-center justify-center"
            aria-label="←"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1">
            {clinics.map((c, i) => (
              <span
                key={c.id}
                className={`h-1 rounded-full transition-all ${
                  i === Math.min(index, clinics.length - 1) ? 'w-4 bg-brand' : 'w-1 bg-white/20'
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => move(1)}
            className="w-6 h-6 rounded-md text-text-muted hover:text-text-1 hover:bg-white/5 inline-flex items-center justify-center"
            aria-label="→"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-start gap-2">
        <MapPin className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-text-1 text-[12px] font-semibold truncate">{clinic.name}</div>
          {fullAddress && <div className="text-text-2 text-[11px] leading-snug">{fullAddress}</div>}
        </div>
      </div>

      {mapsUrl && (
        <div>
          <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold">
            {t('officeVisitUs')}
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-text text-[11px] inline-flex items-center gap-1 hover:underline"
          >
            {t('officeOpenAddress')}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {hasHours && hours && (
        <div>
          <div className="text-text-muted text-[10px] uppercase tracking-wider font-semibold mb-1">
            {t('officeHours')}
          </div>
          <dl className="space-y-0.5">
            {DAYS.filter((d) => d.key in hours).map((d) => {
              const slot = hours[d.key];
              return (
                <div key={d.key} className="flex items-baseline justify-between gap-2">
                  <dt className="text-text-2 text-[10.5px]">{t(d.labelKey as 'dayMon')}</dt>
                  <dd className={`text-[10.5px] ${slot ? 'text-text-1' : 'text-rose'}`}>
                    {slot ? `${slot.open} - ${slot.close}` : t('officeClosed')}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      {clinic.website && (
        <a
          href={clinic.website}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center rounded-md bg-brand/10 hover:bg-brand/20 text-brand-text text-[11px] font-semibold py-2 transition-colors"
        >
          {t('officeWebsite')}
        </a>
      )}
    </div>
  );
}
