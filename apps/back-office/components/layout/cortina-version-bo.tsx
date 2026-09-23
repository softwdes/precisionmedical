'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CortinaVersion } from '@precision/release/cortina';
import { useNovedadDeVersion, marcarVersionVista } from '@precision/release/novedad';
import { VERSION } from '@precision/version';

/**
 * La cortina de versión del back-office.
 *
 * ── Por qué la audiencia sale de la RUTA ────────────────────────────────────
 *
 * Porque esta app sirve tres portales bajo el mismo dominio y cada uno tiene su
 * propio changelog: la clínica, el provider y el bufete. Si mandáramos una sola
 * audiencia, a un abogado le nombraríamos módulos de la clínica que no le tocan
 * —y al revés—.
 *
 * Es solo un filtro de PRESENTACIÓN: `resolverAudiencia` en
 * `/api/changelog` valida lo que mande el cliente contra la sesión y cae a la
 * principal si no le corresponde. O sea que mentir acá no abre nada.
 *
 * ── Por qué en el shell y no en el panel ────────────────────────────────────
 *
 * Porque la pastilla que la abre está en el sidebar, y el sidebar se dibuja en
 * todas las pantallas. Colgada del panel, tocar el número desde Pacientes o
 * desde Citas no habría hecho nada.
 */
export function CortinaVersionBO(): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations('phoenix.dashboard');

  const audiencia = pathname.startsWith('/doctor')
    ? 'doctor'
    : pathname.startsWith('/attorney')
      ? 'attorney'
      : 'clinic';

  const novedad = useNovedadDeVersion(VERSION, audiencia);

  return (
    <CortinaVersion
      datos={novedad === null ? null : {
        version: VERSION,
        modulos: novedad.modulos,
        etiqueta: t('novedadEtiqueta'),
        // Vacío con cero: pasa cuando el changelog no vino. "0 cambios" debajo
        // de un cartel de versión nueva es peor que no poner nada.
        resumen: novedad.cambios === 0 ? '' : t('novedadCambios', { count: novedad.cambios }),
        cerrar: t('novedadCerrar'),
        nonce: novedad.nonce,
      }}
      onMostrada={() => marcarVersionVista(VERSION)}
    />
  );
}
