/**
 * Nombres PROPIOS de las categorías de snippets (lado servidor).
 *
 * Las secciones de la nota y los grupos de mensajería tienen un nombre por
 * defecto en i18n (`sec_<KEY>`). Erick pidió poder cambiarlos (2026-09-07):
 * los providers vienen de Medusa y allá se llaman "HPI", "ROS Other",
 * "PE Other", "Treatment Plan" — el nombre que ellos conocen tiene que ser el
 * que ven en Configuración, en la nota y en la impresión.
 *
 * Se guardan en la tabla genérica `settings` (key/value JSON), bajo UNA clave,
 * como `{ HPI: { es: "HPI", en: "HPI" }, … }`. Solo el admin edita. Un idioma
 * vacío cae al otro y, si no hay ninguno, al nombre por defecto — así con un
 * solo texto alcanza para las dos lenguas.
 *
 * La CLAVE del enum no cambia nunca: esto es solo el rótulo.
 */

import { cache } from 'react';
import { db } from '@precision-medical/database';

export const SECTION_LABELS_KEY = 'snippet_section_labels';

export type SectionLabelOverrides = Record<string, { es?: string; en?: string }>;

/** Los nombres propios guardados, memorizados por request. `{}` si nadie cambió nada. */
export const getSectionLabelOverrides = cache(async (): Promise<SectionLabelOverrides> => {
  const row = await db.setting.findUnique({ where: { key: SECTION_LABELS_KEY }, select: { value: true } });
  const v = row?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as SectionLabelOverrides) : {};
});

/** El nombre a mostrar: propio en el idioma, propio en el otro, o el por defecto. */
export function sectionLabelFrom(
  overrides: SectionLabelOverrides,
  key: string,
  locale: string,
  fallback: string,
): string {
  const o = overrides[key];
  if (!o) return fallback;
  const lang: 'es' | 'en' = locale.toLowerCase().startsWith('en') ? 'en' : 'es';
  const otro: 'es' | 'en' = lang === 'en' ? 'es' : 'en';
  return o[lang]?.trim() || o[otro]?.trim() || fallback;
}
