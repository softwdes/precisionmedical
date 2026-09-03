'use client';

/**
 * Los vitales fuera de rango, y la leyenda.
 *
 * ── La decisión de diseño de la leyenda ─────────────────────────────────────
 *
 * El pedido era "una leyenda visual con los colores". Un cuadro fijo que diga
 * "rojo = peligro, ámbar = fuera de rango" enseña lo obvio (esos dos colores ya
 * se entienden), ocupa alto en TODAS las visitas y termina siendo mueble que el
 * ojo saltea. Lo que el doctor no sabe es el NÚMERO: por qué esto está en
 * ámbar. Y eso es por signo vital, no global.
 *
 * Así que la leyenda son tres cosas y ninguna es un cuadro de colores fijo:
 *
 *  1. **El motivo pegado al valor**: el chip dice `PA 186/104 · ≥180`. La duda
 *     se contesta donde aparece.
 *  2. **La línea de leyenda sale SOLO si hay algo pintado.** Con todo normal no
 *     se dibuja: no cuesta nada cuando no hace falta.
 *  3. **"Criterios"** abre los umbrales completos CON LA FUENTE (ACC/AHA 2017).
 *     Es lo que un cuadro de colores no da: sin saber de dónde sale el umbral,
 *     el doctor no puede confiar ni discutirlo — y un umbral que no se puede
 *     discutir se ignora.
 *
 * Lo que a propósito NO está: un cuadrito verde de "normal" (no pintamos nada
 * de verde, y prometer un color que no aparece confunde) y qué HACER con el
 * hallazgo (eso es protocolo clínico, no nuestro).
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Info, TriangleAlert, X } from 'lucide-react';
import {
  hallazgosVitales, peorNivel, sinEvaluar, UMBRALES, TONO_NIVEL, EDAD_ADULTO,
  type ClaveVital, type Hallazgo, type VitalesLeidos,
} from '@/lib/vitales-alerta';

/** Etiqueta corta de cada signo — la misma en las cuatro pantallas. */
function useEtiquetas(): Record<ClaveVital, string> {
  const t = useTranslations('phoenix.doctor');
  return {
    presion:     t('vitBP'),
    pulso:       t('vitPulse'),
    respiracion: t('vitResp'),
    temperatura: t('vitTemp'),
    oxigeno:     t('vitO2'),
    dolor:       t('vitPain'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  vitales: VitalesLeidos;
  /** Años cumplidos del paciente. `null` = sin fecha de nacimiento: no se evalúa. */
  edad: number | null;
  /** `compacta` para Mi Día (una línea); `completa` para el triaje y el Resumen. */
  variante?: 'compacta' | 'completa';
  className?: string;
}

export function AlertaVitales({ vitales, edad, variante = 'completa', className = '' }: Props): React.ReactElement | null {
  const t = useTranslations('phoenix.doctor');
  const etq = useEtiquetas();
  const [criterios, setCriterios] = React.useState(false);

  const hallazgos = React.useMemo(() => hallazgosVitales(vitales, edad), [vitales, edad]);
  const noEvaluado = sinEvaluar(vitales, edad);
  const peor = peorNivel(hallazgos);

  /* Nada fuera de rango y nada que aclarar: no se dibuja. La ausencia de la
     tira ES la señal de que está todo bien. */
  if (hallazgos.length === 0 && !noEvaluado) return null;

  const chip = (h: Hallazgo, i: number) => (
    <span
      key={`${h.clave}-${h.toma}-${i}`}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] ${TONO_NIVEL[h.nivel].chip}`}
    >
      {h.nivel === 'CRITICO' && <AlertTriangle className="w-3 h-3 shrink-0" />}
      {h.nivel === 'IMPOSIBLE' && <TriangleAlert className="w-3 h-3 shrink-0" />}
      <span className="font-bold">{etq[h.clave]}</span>
      <span className="font-bold">{h.texto}</span>
      {/* La 2ª toma se dice SIEMPRE que exista: un pico de la 1ª que la 2ª ya
          resolvió no es lo mismo que uno vigente, y sin esto se ven idénticos. */}
      {h.toma === 2 && <span className="opacity-70">{t('vitReading2')}</span>}
      {h.nivel === 'IMPOSIBLE'
        ? <span className="opacity-80">· {t('vitalCheckValue')}</span>
        : h.limite && <span className="opacity-70">· {h.limite}</span>}
    </span>
  );

  return (
    <div className={className}>
      <div className={`rounded-md px-3 py-2.5 ${
        peor === 'CRITICO' ? 'border border-rose/40 bg-rose/10'
        : hallazgos.length > 0 ? 'border border-amber/30 bg-amber/[0.07]'
        : 'border border-border bg-bg-2/40'
      }`}>
        <div className="flex items-start gap-2 flex-wrap">
          {peor === 'CRITICO' && <AlertTriangle className="w-4 h-4 text-rose shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            {peor === 'CRITICO' && (
              <div className="text-[12px] font-bold text-rose mb-1.5">{t('vitalsCriticalTitle')}</div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              {hallazgos.map(chip)}
            </div>

            {/* Menor de edad o sin fecha de nacimiento: se DICE que no se evaluó.
                Callarse haría creer que los números están bien. */}
            {noEvaluado && (
              <div className="text-[11px] text-text-muted mt-1.5 flex items-start gap-1.5">
                <Info className="w-3 h-3 shrink-0 mt-px" />
                {edad === null ? t('vitalsNoDob') : t('vitalsPediatric', { edad })}
              </div>
            )}

            {/* La leyenda. Solo cuando hay algo pintado que explicar. */}
            {hallazgos.length > 0 && variante === 'completa' && (
              <div className="flex items-center gap-3 flex-wrap mt-2 pt-2 border-t border-row-sep text-[10.5px]">
                <span className="inline-flex items-center gap-1.5 text-rose">
                  <span className="w-2 h-2 rounded-full bg-rose inline-block" />
                  {t('legendCritical')}
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber">
                  <span className="w-2 h-2 rounded-full bg-amber inline-block" />
                  {t('legendWarning')}
                </span>
                <button
                  type="button"
                  onClick={() => setCriterios(true)}
                  className="text-brand-text font-semibold hover:underline"
                >
                  {t('legendCriteria')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {criterios && <CriteriosDialog onClose={() => setCriterios(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los umbrales completos, con la fuente.
 *
 * La tabla se ARMA de `UMBRALES`, no se escribe a mano: si alguien cambia un
 * número, esto lo dice solo. Una leyenda que se escribe aparte del código es
 * una leyenda que va a mentir en la primera corrección.
 */
function CriteriosDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  /** Sistólica/diastólica viven en `phoenix.admission` — una sola copia. */
  const ta = useTranslations('phoenix.admission');
  const etq = useEtiquetas();

  const filas: Array<{ etiqueta: string; unidad: string; u: typeof UMBRALES.sistolica }> = [
    { etiqueta: `${etq.presion} · ${ta('vitSystolic')}`,  unidad: '', u: UMBRALES.sistolica },
    { etiqueta: `${etq.presion} · ${ta('vitDiastolic')}`, unidad: '', u: UMBRALES.diastolica },
    { etiqueta: etq.pulso,       unidad: ' bpm', u: UMBRALES.pulso },
    { etiqueta: etq.respiracion, unidad: '',     u: UMBRALES.respiracion },
    { etiqueta: etq.temperatura, unidad: '°F',   u: UMBRALES.temperatura },
    { etiqueta: etq.oxigeno,     unidad: '%',    u: UMBRALES.oxigeno },
    { etiqueta: etq.dolor,       unidad: '/10',  u: UMBRALES.dolor },
  ];

  const rango = (bajo: number | null, alto: number | null, unidad: string): string => {
    const partes: string[] = [];
    if (bajo !== null) partes.push(`< ${bajo}${unidad}`);
    if (alto !== null) partes.push(`≥ ${alto}${unidad}`);
    return partes.length ? partes.join('  ·  ') : '—';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border sticky top-0 bg-bg-1">
          <Info className="w-4 h-4 text-brand" />
          <span className="text-text-1 font-semibold text-sm uppercase tracking-wider flex-1">
            {t('criteriaTitle')}
          </span>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-1 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                <th className="text-left pb-2">{t('criteriaVital')}</th>
                <th className="text-left pb-2 text-rose">{t('legendCritical')}</th>
                <th className="text-left pb-2 text-amber">{t('legendWarning')}</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.etiqueta} className="border-t border-row-sep">
                  <td className="py-2 pr-3 text-text-1 font-medium">{f.etiqueta}</td>
                  <td className="py-2 pr-3 text-rose whitespace-nowrap">{rango(f.u.critico[0], f.u.critico[1], f.unidad)}</td>
                  <td className="py-2 text-amber whitespace-nowrap">{rango(f.u.atencion[0], f.u.atencion[1], f.unidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-2 text-[11.5px] text-text-2 leading-relaxed">
            {/* La FUENTE. Es lo más importante del diálogo: sin ella el umbral
                no se puede discutir, y uno que no se discute se ignora. */}
            <p><span className="font-semibold text-text-1">{t('criteriaSourceLabel')}:</span> {t('criteriaSource')}</p>
            <p>{t('criteriaAdultOnly', { edad: EDAD_ADULTO })}</p>
            <p className="flex items-start gap-1.5">
              <TriangleAlert className="w-3.5 h-3.5 text-amber shrink-0 mt-px" />
              <span>{t('criteriaImpossible')}</span>
            </p>
            <p className="text-text-muted">{t('criteriaNotAdvice')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
