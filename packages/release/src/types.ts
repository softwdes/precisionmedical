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
  /**
   * Publicada DESPUES de la ultima vez que este usuario miro el buzon.
   *
   * Se marca en negrita, el mismo lenguaje que usa la bandeja de mensajes para
   * lo no leido. Sin esto, 58 notas se leen todas iguales y no hay forma de
   * saber cual es la que todavia no viste.
   *
   * En el modal post-reload viene siempre `true`: ahi todo es, por definicion,
   * lo que acaba de salir.
   */
  isNew: boolean;
  /**
   * Instante del deploy que la trajo (ISO).
   *
   * La campana ordena y agrupa por DIA, no por modulo: un changelog es
   * cronologico por naturaleza y agrupar por modulo dejaba lo mas nuevo
   * enterrado en el grupo doce, en orden alfabetico.
   *
   * El agrupado se hace en el CLIENTE, que es quien conoce la zona de la
   * clinica (`ZONA_CLINICA`). Aca solo viaja el instante.
   */
  date: string;
  /** Etiqueta del modulo, ya traducida. En la vista cronologica es un chip. */
  moduleLabel: string;
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
