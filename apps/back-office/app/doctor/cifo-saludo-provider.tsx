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
  /**
   * Los de hoy a los que hay que cobrarles antes de atenderlos.
   *
   * Ya viene filtrado y ordenado por `lib/deudas-del-dia.ts` — ahí está por qué
   * el saldo se mira por el circuito del MOSTRADOR y no por `balanceDue`.
   */
  cobrar: Array<{
    patientId: string;
    nombre: string;
    monto: number;
    marcado: boolean;
    nota: string | null;
  }>;
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
   * A quién cobrarle antes de atenderlo — va ANTES del resumen del día.
   *
   * Es lo único de este saludo que cambia lo que el provider hace en los
   * próximos minutos: una vez que lo hizo pasar, el momento de cobrar ya se
   * perdió. El conteo de citas puede esperar quince segundos.
   *
   * ⚠️ Él no cobra: la acción es avisarle a recepción. Por eso el botón abre la
   * FICHA —donde está el detalle y el teléfono— y no un modal de cobro que no
   * le corresponde.
   *
   * Solo los dos primeros. Con cinco marcados el saludo dejaría de ser un aviso
   * para ser una tabla, y hay una pantalla para eso.
   */
  for (const c of datos.cobrar.slice(0, 2)) {
    lineas.push({
      texto: c.nota
        // La nota que escribió una persona gana sobre cualquier número: dice
        // qué hacer, y el monto solo dice cuánto.
        ? t('saludoProvCobrarNota', { paciente: c.nombre, nota: c.nota })
        : t('saludoProvCobrar', { paciente: c.nombre, monto: c.monto.toFixed(2) }),
      urgente: true,
      boton: {
        etiqueta: t('saludoProvVerFicha'),
        ir: () => router.push(`/doctor/patients/${c.patientId}`),
      },
    });
  }

  /**
   * El día, en tres versiones y no dos.
   *
   * Con la agenda vacía, "tenés 0 citas hoy y ya las atendiste todas" es un
   * sinsentido —no atendió a nadie, no había nadie— y así se vio en pantalla
   * (Erick, 2026-09-11). El caso de cero es un TERCER estado, no el de "ya
   * terminaste" con el número en cero.
   *
   * Sin botón a propósito: la lista completa ya está DEBAJO de este globo —
   * mandarlo a la pantalla en la que ya está sería un clic para nada.
   */
  lineas.push({
    texto: datos.citasHoy === 0
      ? t('saludoProvSinCitas')
      : datos.porAtender > 0
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
