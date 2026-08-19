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

/**
 * Lo que ve el usuario: los modulos, unificados.
 *
 * NO agrupado por release. El aviso no muestra fronteras entre deploys, asi que
 * agrupar por release repetia el encabezado del modulo —salian dos "OTROS"
 * seguidos— y se leia como un error. Si dos deploys tocaron `tracking`, es una
 * sola seccion "Seguimiento de casos".
 */
export interface ChangelogResponse {
  /** Vacio = no hay nada que mostrar (o audiencia silenciosa). */
  modules: ReleaseModuleGroup[];
  count: number;
  audience: Audience;
  locale: NoteLocale;
}
