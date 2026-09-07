'use client';

/**
 * Nombres propios de las categorías de snippets (lado cliente).
 *
 * `useSectionLabels()` devuelve `label(key)`: el nombre propio guardado por el
 * admin en el idioma de quien mira, o el por defecto de i18n (`sec_<KEY>`)
 * mientras no haya ninguno — también durante el primer render, antes de que
 * llegue la respuesta. Los datos se piden UNA vez por pestaña y se comparten
 * entre todos los componentes que los usan (índice de Configuración, títulos
 * de la nota, plantillas, mensajería).
 *
 * Ver `lib/section-labels.ts` para el lado servidor y el porqué.
 */

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { sectionLabelFrom, type SectionLabelOverrides } from './section-labels';

let cache: SectionLabelOverrides | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void { listeners.forEach((fn) => fn()); }

function load(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch('/api/admin/snippets/sections')
    .then(async (r) => {
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { labels?: SectionLabelOverrides };
      cache = d.labels ?? {};
    })
    // Sin respuesta se queda el por defecto; no es un error que la persona deba ver.
    .catch(() => { cache = cache ?? {}; })
    .finally(() => { inflight = null; notify(); });
  return inflight;
}

/** Después de guardar un nombre: la próxima lectura vuelve a pedir y avisa a todos. */
export function invalidateSectionLabels(): void {
  cache = null;
  void load();
}

export function useSectionLabels(): {
  label: (key: string) => string;
  overrides: SectionLabelOverrides;
} {
  const t = useTranslations('phoenix.doctor');
  const locale = useLocale();
  const [overrides, setOverrides] = React.useState<SectionLabelOverrides>(cache ?? {});

  React.useEffect(() => {
    const fn = (): void => setOverrides(cache ?? {});
    listeners.add(fn);
    if (cache) fn(); else void load();
    return () => { listeners.delete(fn); };
  }, []);

  const label = React.useCallback(
    (key: string): string => sectionLabelFrom(overrides, key, locale, t(`sec_${key}`)),
    [overrides, locale, t],
  );

  return { label, overrides };
}
