'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SaludoCifo, type LineaSaludo } from '@/components/cifo/saludo';

/**
 * Lo que CIFO le dice AL PROVIDER al abrir su día.
 *
 * Misma puesta en escena que el del panel de recepción —se comparte entera en
 * `components/cifo/saludo.tsx`— y **ningún número en común**.
 *
 * ── Por qué no es el mismo saludo con otro filtro ───────────────────────────
 *
 * El de recepción dice cuántas citas tiene LA CLÍNICA, quién llega sin el
 * formulario firmado y cuántos liens quedaron sin firma. Ninguna de esas tres
 * cosas las puede accionar un provider: la primera no es suya, la segunda es
 * trabajo de recepción y la tercera de facturación. Copiarlo tal cual habría
 * sido poner en su pantalla cuatro frases que no producen ninguna acción — el
 * mismo error que ya se corrigió sacando los KPI del dashboard.
 *
 * Así que el reparto es el de siempre acá: **el alcance se invierte**.
 *
 *   · recepción → toda la clínica, y NUNCA nombres de paciente
 *   · provider  → solo lo suyo, y SÍ con nombres: son sus pacientes y es su
 *     trabajo saber quién lo espera
 *
 * ── Lo que NO hace ──────────────────────────────────────────────────────────
 *
 * No consulta nada. Los tres números salen de lo que `page.tsx` ya trae para
 * pintar la lista del día: las citas del provider, quién hizo check-in y el
 * conteo de notas sin cerrar. Cero consultas nuevas.
 */

export interface DatosSaludoProvider {
  /** Clave del día de la CLÍNICA (`YYYY-MM-DD`). Es la marca de "ya lo vi". */
  hoy: string;
  /** Citas de hoy de ESTE provider, sin canceladas ni no-shows. */
  citasHoy: number;
  /** Las que todavía no atendió. */
  porAtender: number;
  /** Notas sin cerrar — mismo criterio que el KPI de la pantalla. */
  notasSinCerrar: number;
  /**
   * Quién está en el edificio esperándolo AHORA, si hay alguien.
   *
   * Es la urgencia real de un provider, y no tiene nada que ver con la de
   * recepción: allá es un paciente que no llegó, acá es uno que ya llegó y
   * sigue sentado. `minutos` se calcula en el servidor con el check-in.
   */
  esperando: { appointmentId: string; paciente: string; minutos: number } | null;
}

export function CifoSaludoProvider({ datos }: { datos: DatosSaludoProvider }): React.ReactElement | null {
  const t = useTranslations('phoenix.dashboard');
  const router = useRouter();

  const lineas: LineaSaludo[] = [{ texto: t('saludoHola') }];

  // Lo que ya está esperando va primero. Un paciente sentado en la sala manda
  // sobre cualquier resumen del día.
  if (datos.esperando) {
    lineas.push({
      texto: t('saludoProvEsperando', {
        paciente: datos.esperando.paciente,
        min: datos.esperando.minutos,
      }),
      urgente: true,
      boton: {
        etiqueta: t('saludoProvAtender'),
        ir: () => router.push(`/doctor/consultation/${datos.esperando!.appointmentId}`),
      },
    });
  }

  /**
   * El día. Sin botón a propósito: la lista completa ya está DEBAJO de este
   * globo — mandarlo a la pantalla en la que ya está sería un clic para nada.
   */
  lineas.push({
    texto: datos.porAtender > 0
      ? t('saludoProvCitas', { citas: datos.citasHoy, faltan: datos.porAtender })
      : t('saludoProvCitasListas', { citas: datos.citasHoy }),
  });

  if (datos.notasSinCerrar > 0) {
    lineas.push({
      texto: t('saludoProvNotas', { n: datos.notasSinCerrar }),
      boton: { etiqueta: t('saludoProvVerNotas'), ir: () => router.push('/doctor/notes') },
    });
  }

  lineas.push({ texto: t('saludoProvCierre') });

  /**
   * Llave PROPIA de `localStorage`, distinta a la del panel de recepción.
   *
   * Es el mismo navegador: con una sola llave, quien entra a los dos portales
   * vería un saludo y el otro no, sin entender por qué. Son dos mensajes
   * distintos y cada uno lleva su marca.
   */
  return <SaludoCifo lineas={lineas} hoy={datos.hoy} clave="cifo:saludo-visto:provider" />;
}
