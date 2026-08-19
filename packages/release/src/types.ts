import type { Audience } from './audience';

/** Idioma de la nota. Sale de la cookie `locale` via el i18n de cada app. */
export type NoteLocale = 'es' | 'en';

/** Una linea del changelog, ya resuelta al idioma del usuario. */
export interface ReleaseNote {
  id: string;
  /** Texto ya resuelto al locale pedido. */
  text: string;
  /** Para el icono. Los tipos internos nunca llegan aca. */
  kind: 'FEAT' | 'FIX';
}

/** Un grupo de notas del mismo modulo. */
export interface ReleaseModuleGroup {
  /** Clave estable: `tracking`, `billing`, `prescriptions`... */
  module: string;
  /** Etiqueta ya traducida por la API — `timeclock` no tiene next-intl. */
  moduleLabel: string;
  notes: ReleaseNote[];
}

/** Un deploy publicado, con sus notas agrupadas por modulo. */
export interface ReleaseSummary {
  sha: string;
  publishedAt: string;
  modules: ReleaseModuleGroup[];
}

export interface ChangelogResponse {
  /** Vacio = no hay nada publicado que mostrar (o audiencia silenciosa). */
  releases: ReleaseSummary[];
  audience: Audience;
  locale: NoteLocale;
}
