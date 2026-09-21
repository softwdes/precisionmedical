'use client';

/**
 * Los dos avisos del paciente, para usarlos igual en todas las pantallas.
 *
 * ── Qué problema resuelven ─────────────────────────────────────────────────
 *
 * Los dos datos existen en la base y ninguno se ve donde hace falta. Medido el
 * 2026-09-20: la ficha de una paciente con cita AL DÍA SIGUIENTE solo decía
 * "Total appointments 1 · cumulative"; para saber que venía había que abrir el
 * caso y entrar al tab de Citas, dos clics más. Con la deuda pasa lo mismo: el
 * saldo del mostrador vive en Finanzas, dentro del caso.
 *
 * Así que el que atiende la puerta no se entera de ninguna de las dos cosas
 * justo cuando tiene a la persona enfrente.
 *
 * ── Por qué el saldo va en rojo y la cita no ───────────────────────────────
 *
 * En este sistema el rojo está reservado para lo que EXIGE actuar. Una deuda en
 * el mostrador lo es: hay que cobrarla antes de que se vaya. Una cita que viene
 * es información — va en cian, el color del calendario en todo el sistema.
 *
 * El v2 (Medusa) pinta las dos de rojo, y por eso el equipo lo pide así. La
 * diferencia acá es a propósito: si todo es rojo, nada es urgente.
 *
 * ── Ninguno bloquea ────────────────────────────────────────────────────────
 *
 * Avisan y nada más. La decisión de atender o no es de la clínica, no del
 * software — y una pantalla que frena el trabajo con el paciente enfrente
 * termina siempre en alguien buscando cómo saltearla.
 */

import { useTranslations } from 'next-intl';
import { DollarSign, CalendarClock } from 'lucide-react';
import { fechaConDia, hora } from '@/lib/fechas';

const money = (n: number): string => `$${n.toFixed(2)}`;

/** Lo que debe en el mostrador. `0` o menos no muestra nada. */
export function AvisoDeSaldo({ saldo, compacto }: { saldo: number; compacto?: boolean }) {
  const t = useTranslations('phoenix.avisosPaciente');
  if (!saldo || saldo <= 0) return null;

  if (compacto) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-rose/15 text-rose text-[10px] font-semibold whitespace-nowrap"
        title={t('debeHint')}
      >
        <DollarSign className="w-3 h-3 shrink-0" />{money(saldo)}
      </span>
    );
  }

  return (
    <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 flex items-center gap-2">
      <DollarSign className="w-4 h-4 text-rose shrink-0" />
      <div className="min-w-0">
        <div className="text-rose text-[12.5px] font-semibold">
          {t('debe', { monto: money(saldo) })}
        </div>
        <div className="text-rose/70 text-[11px]">{t('debeHint')}</div>
      </div>
    </div>
  );
}

export interface CitaDeAviso {
  id: string;
  scheduledFor: string;
  clinicName?: string | null;
}

/**
 * La próxima cita. Sin cita no muestra nada por defecto: el hueco solo es
 * noticia cuando el paciente está en tratamiento, y quién lo está no se decide
 * acá — lo pasa la pantalla con `avisarSiFalta`.
 */
export function AvisoProximaCita({
  cita, compacto, avisarSiFalta,
}: {
  cita: CitaDeAviso | null;
  compacto?: boolean;
  avisarSiFalta?: boolean;
}) {
  const t = useTranslations('phoenix.avisosPaciente');

  if (!cita) {
    if (!avisarSiFalta) return null;
    return compacto ? (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-amber/15 text-amber text-[10px] font-semibold whitespace-nowrap">
        <CalendarClock className="w-3 h-3 shrink-0" />{t('sinProxima')}
      </span>
    ) : (
      <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-amber shrink-0" />
        <div>
          <div className="text-amber text-[12.5px] font-semibold">{t('sinProxima')}</div>
          <div className="text-amber/70 text-[11px]">{t('sinProximaHint')}</div>
        </div>
      </div>
    );
  }

  const cuando = `${fechaConDia(cita.scheduledFor)} · ${hora(cita.scheduledFor)}`;
  const donde  = cita.clinicName ? ` · ${cita.clinicName}` : '';

  if (compacto) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-cyan/15 text-cyan text-[10px] font-semibold whitespace-nowrap"
        title={`${t('proxima')}: ${cuando}${donde}`}
      >
        <CalendarClock className="w-3 h-3 shrink-0" />{cuando}
      </span>
    );
  }

  return (
    <div className="rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 flex items-center gap-2">
      <CalendarClock className="w-4 h-4 text-cyan shrink-0" />
      <div className="min-w-0">
        <div className="text-cyan text-[12.5px] font-semibold">
          {t('proxima')}: {cuando}
        </div>
        {cita.clinicName && (
          <div className="text-cyan/70 text-[11px]">{cita.clinicName}</div>
        )}
      </div>
    </div>
  );
}
