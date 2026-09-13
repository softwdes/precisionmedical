'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { SaludoCifo, type LineaSaludo } from '@precision-medical/agente/saludo';

/**
 * Lo que CIFO le dice al ADMIN al abrir el panel.
 *
 * El muñeco entra al centro, saluda, y a los tres segundos se corre al costado
 * y cuenta el día. Misma puesta en escena que la clínica y el portal médico —
 * se comparte entera en `packages/agente/src/saludo.tsx`— y **ningún número en
 * común**, porque acá el alcance es la empresa.
 *
 * ── Tercer portal, tercer contenido ────────────────────────────────────────
 *
 *   · recepción → quién llega sin el formulario firmado
 *   · provider  → quién lo espera en la sala
 *   · admin     → cuántas visitas hay, y qué caja quedó corta
 *
 * El orden lo puso Erick (2026-09-12): **las visitas primero**, el resto
 * debajo. El volumen de trabajo del día le importa a todo el mundo todos los
 * días; una caja baja importa el día que pasa.
 */

export interface DatosSaludoAdmin {
  /** Clave del día de la clínica (`YYYY-MM-DD`). Es la marca de "ya lo vi". */
  hoy: string;
  visitas: {
    dia: string;
    /** `false` = el número es del próximo lunes porque hoy es fin de semana. */
    esHoy: boolean;
    total: number;
    porClinica: Record<string, number>;
  } | null;
  cajas: Array<{ nombre: string; moneda: string; saldo: number; falta: number }>;
  /** Salarios pendientes que vencen — misma regla que el cron de avisos. */
  salarios: { hoy: number; enTresDias: number; montoHoy: Record<string, number> };
}

export function CifoSaludoAdmin({ datos }: { datos: DatosSaludoAdmin }): React.ReactElement | null {
  const router = useRouter();

  const lineas: LineaSaludo[] = [{ texto: 'Hola, soy CIFO. Así viene el día.' }];

  if (datos.visitas) {
    const v = datos.visitas;
    const cuando = v.esHoy ? 'hoy' : 'el lunes';
    const reparto = Object.entries(v.porClinica)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} ${n}`)
      .join(' · ');

    lineas.push({
      texto: v.total === 0
        ? `No hay visitas agendadas para ${cuando}.`
        : `Hay ${v.total} ${v.total === 1 ? 'visita' : 'visitas'} ${cuando}${reparto ? ` — ${reparto}` : ''}.`,
      boton: { etiqueta: 'Ver métricas', ir: () => router.push('/dashboard/metricas') },
    });
  }

  /**
   * Los salarios que vencen, ANTES que las cajas: una nómina que vence hoy
   * tiene fecha y consecuencia; una caja corta se puede reponer mañana.
   *
   * El botón lleva al mismo lugar que la notificación de la campana
   * (`/dashboard/employees?tab=pagos`), para que el aviso y el correo no
   * manden a dos sitios distintos por la misma cosa.
   */
  if (datos.salarios.hoy > 0 || datos.salarios.enTresDias > 0) {
    const s = datos.salarios;
    const monto = Object.entries(s.montoHoy).map(([m, t]) => `${m} ${t.toFixed(2)}`).join(' + ');
    lineas.push({
      texto: s.hoy > 0
        ? `${s.hoy} ${s.hoy === 1 ? 'salario vence' : 'salarios vencen'} HOY${monto ? ` — ${monto}` : ''}.`
        : `${s.enTresDias} ${s.enTresDias === 1 ? 'salario vence' : 'salarios vencen'} en 3 días.`,
      urgente: s.hoy > 0,
      boton: {
        etiqueta: 'Ver los pagos',
        ir: () => router.push('/dashboard/employees?tab=pagos'),
      },
    });
  }

  /**
   * Las cajas van EN ROJO y con el monto que falta. El triangulito que había
   * antes no decía cuánto ni desde cuándo: era un dato sin acción.
   *
   * Solo las dos primeras: si hay cinco cajas cortas, el saludo no es el lugar
   * para listarlas — para eso está el botón.
   */
  for (const c of datos.cajas.slice(0, 2)) {
    lineas.push({
      texto: `La caja de ${c.nombre} está en ${c.moneda} ${c.saldo.toFixed(2)}, faltan ${c.moneda} ${c.falta.toFixed(2)} para el mínimo.`,
      urgente: true,
      boton: { etiqueta: 'Reponer', ir: () => router.push('/dashboard/finanzas') },
    });
  }

  lineas.push({ texto: 'Cualquier cosa, preguntame acá abajo.' });

  /**
   * Llave PROPIA de `localStorage`: es el mismo navegador para los tres
   * portales. Con una sola, quien entra al Admin y después a la clínica vería
   * un saludo y el otro no, sin entender por qué.
   */
  return <SaludoCifo lineas={lineas} hoy={datos.hoy} clave="cifo:saludo-visto:admin" />;
}
