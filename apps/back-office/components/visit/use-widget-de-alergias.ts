'use client';

/**
 * Abre la ventana de ALERGIAS de ScriptSure desde cualquier pantalla de visita.
 *
 * ## Por qué existe, y por qué no se reusó el abridor que ya había
 *
 * Devin, 2026-10-09: *"When I click the pencil on allergies it does not open the
 * surescripts allergy window. Just opens the free text window to type in
 * allergies but not the surecripts window that will do the cross check when
 * prescribing"*.
 *
 * La ventana ya se sabía abrir: `openWidget` en `rx-integration-status.tsx`. Pero
 * ese componente **solo se monta cuando la pestaña activa es Recetas**, y el
 * lápiz de alergias vive en la barra lateral, que se ve desde la pestaña de la
 * nota. Pasarle un ref desde el padre se probó y no sirve: cuando el médico está
 * escribiendo la nota, el componente que llenaría ese ref todavía no existe.
 *
 * Por eso el abridor vive acá, en un hook que monta quien SÍ está siempre en
 * pantalla.
 *
 * ## Qué hace de menos, a propósito
 *
 * `openWidget` atiende seis widgets y arrastra lo que esos necesitan: el permiso
 * del paciente para la red de farmacias (428) y el carrito de "repetir receta".
 * Las alergias no pasan por ninguno de los dos —el 428 lo devuelve solo
 * `medicationdownload`— así que acá no están.
 *
 * Lo que sí está es la salida del callejón: si falta la dirección o el teléfono
 * (422), se ofrece completarlos y la ventana se reintenta sola. Ese es el bug
 * que este código ya tuvo que destapar tres veces en tres botones distintos, y
 * un atajo nuevo no puede nacer con él.
 *
 * ⚠️ DEUDA CONOCIDA: con esto hay DOS traducciones de las respuestas de
 * `/api/admin/scriptsure/widget/*` —ésta y la de `rx-integration-status`— más la
 * de `case-clinical-tabs`. Son tres, y deberían ser una. No se unificaron en el
 * mismo cambio porque la de recetas es el camino de prescripción y no se puede
 * verificar en navegador desde esta sesión; unificar a ciegas el flujo con el
 * que se mandan recetas es peor negocio que esta duplicación anotada.
 */

import * as React from 'react';
import type { WidgetStatus } from '@/components/visit/scriptsure-widget-dialog';
import type { CampoFaltante } from '@/components/visit/patient-demographics-dialog';

export interface WidgetDeAlergias {
  /** Llamar desde el botón. */
  abrir: () => void;
  abierto: boolean;
  status: WidgetStatus;
  url: string | null;
  errorDetail: string | null;
  cerrar: () => void;
  /** Datos que faltan en la ficha; `null` = no hay formulario pendiente. */
  demografia: { faltantes: CampoFaltante[]; motivo: 'faltan' | 'muy-larga' } | null;
  cancelarDemografia: () => void;
  /** Al guardar los datos se reintenta la ventana sola. */
  reintentar: () => void;
}

export function useWidgetDeAlergias(appointmentId: string): WidgetDeAlergias {
  const [abierto, setAbierto] = React.useState(false);
  const [status, setStatus] = React.useState<WidgetStatus>('loading');
  const [url, setUrl] = React.useState<string | null>(null);
  const [errorDetail, setErrorDetail] = React.useState<string | null>(null);
  const [demografia, setDemografia] =
    React.useState<{ faltantes: CampoFaltante[]; motivo: 'faltan' | 'muy-larga' } | null>(null);

  const abrir = React.useCallback((): void => {
    setAbierto(true);
    setStatus('loading');
    setUrl(null);
    setErrorDetail(null);

    void (async () => {
      try {
        const res = await fetch(`/api/admin/scriptsure/widget/${appointmentId}?widget=allergy`);

        // 403: no es su turno de firmar. No es un problema de red, y decir "no
        // se pudo conectar" manda a buscar el problema al lugar equivocado.
        if (res.status === 403) { setStatus('forbidden'); return; }

        if (res.status === 409) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setStatus(body?.error === 'NO_SCRIPTSURE_USER' ? 'no_scriptsure_user' : 'not_onboarded');
          return;
        }

        if (res.status === 422) {
          const body = (await res.json().catch(() => null)) as
            { error?: string; missingFields?: string[] } | null;
          // La fecha de nacimiento es identidad, no contacto: se avisa y se
          // corrige en la ficha, nunca en un atajo puesto para destrabar algo.
          if (body?.error === 'PATIENT_MISSING_DOB') { setStatus('missing_dob'); return; }
          setAbierto(false);
          setDemografia({
            faltantes: (body?.missingFields ?? []) as CampoFaltante[],
            motivo: body?.error === 'PATIENT_ADDRESS_TOO_LONG' ? 'muy-larga' : 'faltan',
          });
          return;
        }

        if (!res.ok) {
          // El servidor manda el motivo literal de ScriptSure y el diálogo sabe
          // mostrarlo. Tirarlo convertía un rechazo de datos del paciente en "no
          // se pudo conectar" — una tarde perdida de Devin, el 2026-09-15.
          const body = (await res.json().catch(() => null)) as
            { message?: string; error?: string } | null;
          const detalle = body?.message ?? body?.error ?? null;
          setErrorDetail(detalle ? detalle.slice(0, 400) : null);
          setStatus('error');
          return;
        }

        const data = (await res.json()) as { url: string };
        setUrl(data.url);
        setStatus('ready');
      } catch {
        setStatus('error');
      }
    })();
  }, [appointmentId]);

  return {
    abrir,
    abierto,
    status,
    url,
    errorDetail,
    cerrar: () => setAbierto(false),
    demografia,
    cancelarDemografia: () => setDemografia(null),
    reintentar: () => { setDemografia(null); abrir(); },
  };
}
