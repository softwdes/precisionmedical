'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CortinaVersion } from '@precision/release/cortina';
import { useNovedadDeVersion, marcarVersionVista } from '@precision/release/novedad';
import { VERSION } from '@precision/version';

/**
 * La cortina de versión del Admin: el hook, los textos y nada más.
 *
 * ── Por qué en el LAYOUT y no en el panel ───────────────────────────────────
 *
 * Porque la insignia que la abre está en el sidebar, y el sidebar se dibuja en
 * todas las pantallas. Colgada del panel, tocar el número desde Usuarios o
 * desde Finanzas no habría hecho nada — y un botón que funciona en una pantalla
 * y no en otra es peor que no tenerlo.
 *
 * El componente de la cortina vive en `@precision/release` porque lo van a
 * compartir el Admin y el back-office; los textos los pone cada app, que es la
 * que sabe su idioma. Ver la nota de `DatosCortina`.
 */
export function CortinaVersionAdmin(): React.ReactElement {
  const t = useTranslations('cifo');
  const novedad = useNovedadDeVersion(VERSION, 'admin');

  return (
    <CortinaVersion
      datos={novedad === null ? null : {
        version: VERSION,
        modulos: novedad.modulos,
        etiqueta: t('versionEtiqueta'),
        // Vacío con cero: pasa cuando el changelog no vino (ver `sinResumen`).
        // "0 cambios" debajo de un cartel de versión nueva es peor que nada.
        resumen: novedad.cambios === 0 ? '' : t('versionCambios', { count: novedad.cambios }),
        cerrar: t('versionCerrar'),
        nonce: novedad.nonce,
      }}
      onMostrada={() => marcarVersionVista(VERSION)}
    />
  );
}
