'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Wallet, BadgeDollarSign } from 'lucide-react';

/**
 * El aviso de CIFO en el Admin: cómo viene el día, en una línea por cosa.
 *
 * ── Por qué las visitas van ARRIBA ─────────────────────────────────────────
 *
 * Es la prioridad que puso Erick (2026-09-12): *"talvez incluir un resumen de
 * cuántas visitas tendrán las clínicas en el día o la semana, eso primero y
 * debajo los demás"*. Tiene razón y es la misma lección del dashboard de la
 * clínica: el volumen de trabajo del día le importa a todo el mundo, todos los
 * días; las excepciones —una caja baja— importan el día que pasan.
 *
 * ── Y por qué reemplaza al triangulito ─────────────────────────────────────
 *
 * La alerta de caja baja era un ícono ámbar al lado de una fila. No decía cuánto
 * faltaba, ni desde cuándo, ni qué hacer. Acá dice el monto que falta para
 * llegar al mínimo y lleva a la pantalla donde se repone.
 */

export interface VisitasVista {
  dia: string;
  /** `false` = el número es del próximo lunes porque hoy es fin de semana. */
  esHoy: boolean;
  total: number;
  porClinica: Record<string, number>;
}

export interface CajaVista {
  nombre: string;
  moneda: string;
  saldo: number;
  falta: number;
}

export function CifoAviso({ visitas, cajas, salarios }: {
  /** `null` si la clínica no respondió: el panel muestra el resto igual. */
  visitas: VisitasVista | null;
  cajas: CajaVista[];
  /** Salarios pendientes que vencen — misma regla que el cron de avisos. */
  salarios: { hoy: number; enTresDias: number };
}): React.ReactElement | null {
  const router = useRouter();

  const haySalarios = salarios.hoy > 0 || salarios.enTresDias > 0;

  // Sin nada que decir, no se dibuja. Una tarjeta vacía ocupa el mismo lugar
  // que una con información y no aporta ninguna.
  if (!visitas && cajas.length === 0 && !haySalarios) return null;

  const dia = visitas
    ? new Date(`${visitas.dia}T12:00:00Z`).toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
      })
    : null;

  /** Las clínicas ordenadas de mayor a menor: dónde se concentra el día. */
  const reparto = visitas
    ? Object.entries(visitas.porClinica).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="mx-auto w-full max-w-[760px] rounded-lg bg-bg-1 p-5 space-y-3">
      {visitas && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <CalendarDays className="w-4 h-4 text-brand shrink-0" />
          <p className="text-sm text-text-1">
            {visitas.total === 0
              ? <>No hay visitas agendadas para {dia}.</>
              : (
                <>
                  <strong>{visitas.total}</strong>{' '}
                  {visitas.total === 1 ? 'visita' : 'visitas'}{' '}
                  {/* Si no es hoy, se dice QUÉ día es. Un número del lunes
                      presentado como "hoy" un sábado es una mentira chica que
                      hace desconfiar de todo el resto. */}
                  {visitas.esHoy ? 'hoy' : <>el {dia}</>}
                  {reparto.length > 0 && (
                    <span className="text-text-2">
                      {' · '}{reparto.map(([c, n]) => `${c} ${n}`).join(' · ')}
                    </span>
                  )}
                </>
              )}
          </p>
        </div>
      )}

      {/* Los salarios primero entre las excepciones: tienen fecha. */}
      {haySalarios && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <BadgeDollarSign className={`w-4 h-4 shrink-0 ${salarios.hoy > 0 ? 'text-rose' : 'text-amber'}`} />
          <p className={`text-sm ${salarios.hoy > 0 ? 'text-rose font-semibold' : 'text-text-1'}`}>
            {salarios.hoy > 0
              ? <>{salarios.hoy} {salarios.hoy === 1 ? 'salario vence' : 'salarios vencen'} <strong>hoy</strong>.</>
              : <>{salarios.enTresDias} {salarios.enTresDias === 1 ? 'salario vence' : 'salarios vencen'} en 3 días.</>}
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard/employees?tab=pagos')}
            className={`h-10 sm:h-7 px-3.5 sm:px-2.5 rounded text-[12.5px] sm:text-[11.5px] font-semibold transition-colors ${
              salarios.hoy > 0
                ? 'bg-rose/15 text-rose hover:bg-rose/25'
                : 'bg-amber/15 text-amber hover:bg-amber/25'
            }`}
          >
            Ver los pagos
          </button>
        </div>
      )}

      {cajas.map((c) => (
        <div key={c.nombre} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Wallet className="w-4 h-4 text-amber shrink-0" />
          <p className="text-sm text-text-1">
            La caja de <strong>{c.nombre}</strong> está en {c.moneda} {c.saldo.toFixed(2)}
            <span className="text-text-2">
              {' '}— faltan {c.moneda} {c.falta.toFixed(2)} para el mínimo.
            </span>
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard/finanzas')}
            className="h-10 sm:h-7 px-3.5 sm:px-2.5 rounded text-[12.5px] sm:text-[11.5px] font-semibold bg-amber/15 text-amber hover:bg-amber/25 transition-colors"
          >
            Reponer
          </button>
        </div>
      ))}
    </div>
  );
}
