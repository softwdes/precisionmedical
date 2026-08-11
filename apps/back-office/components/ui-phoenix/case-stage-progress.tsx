'use client';

/**
 * CaseStageProgress — barra segmentada del avance del CASO por etapas.
 *
 * Muestra en qué etapa del ciclo de vida está un caso (Admisión → Tratamiento
 * → Cierre), con el % derivado de la POSICIÓN del status en la progresión
 * lineal de `CaseStatus` — nunca un % inventado. Es información distinta al
 * progreso de ADMISIÓN (consentimientos/intake): aquél mide cuánto falta del
 * formulario; éste, en qué punto del recorrido está el caso.
 *
 * Progresión lineal (schema.prisma → enum CaseStatus):
 *   NEW_REFERRAL → INTAKE_PENDING → INTAKE_COMPLETED → CONFIRMED →
 *   ACTIVE → MMI → CLOSED → SETTLED → ARCHIVED  (+ CANCELLED fuera de ruta)
 *
 * Uso:
 *   <CaseStageProgress
 *     status={c.status}
 *     labels={{
 *       admission: t('caseStageAdmission'), treatment: t('caseStageTreatment'),
 *       closure: t('caseStageClosure'),     cancelled: t('caseStageCancelled'),
 *     }}
 *   />
 */

const LINEAR_ORDER = [
  'NEW_REFERRAL', 'INTAKE_PENDING', 'INTAKE_COMPLETED', 'CONFIRMED',
  'ACTIVE', 'MMI',
  'CLOSED', 'SETTLED', 'ARCHIVED',
] as const;

type StageKey = 'admission' | 'treatment' | 'closure';

const STAGE_GROUPS: Array<{ key: StageKey; statuses: readonly string[] }> = [
  { key: 'admission', statuses: LINEAR_ORDER.slice(0, 4) },
  { key: 'treatment', statuses: LINEAR_ORDER.slice(4, 6) },
  { key: 'closure',   statuses: LINEAR_ORDER.slice(6, 9) },
];

export interface CaseStageProgressLabels {
  admission: string;
  treatment: string;
  closure:   string;
  cancelled: string;
}

export interface CaseStageProgressProps {
  /** CaseStatus crudo del caso */
  status: string;
  /** Labels ya traducidos — el primitivo no conoce i18n */
  labels: CaseStageProgressLabels;
  className?: string;
}

export function CaseStageProgress({ status, labels, className = '' }: CaseStageProgressProps) {
  const isCancelled = status === 'CANCELLED';
  // Posición 1-based dentro de la progresión lineal; -1 = status desconocido
  const idx = LINEAR_ORDER.indexOf(status as (typeof LINEAR_ORDER)[number]) + 1;

  if (isCancelled || idx === 0) {
    return (
      <div className={`leading-tight ${className}`}>
        <div className="flex items-center gap-1">
          {STAGE_GROUPS.map(g => (
            <div key={g.key} className="h-1.5 rounded-full bg-bg-2" style={{ flexGrow: g.statuses.length }} />
          ))}
        </div>
        <div className={`text-[10px] mt-1 font-medium ${isCancelled ? 'text-rose' : 'text-text-muted'}`}>
          {isCancelled ? labels.cancelled : status}
        </div>
      </div>
    );
  }

  const pct = Math.round((idx / LINEAR_ORDER.length) * 100);
  const activeGroup = STAGE_GROUPS.find(g => g.statuses.includes(status));
  const label = activeGroup ? labels[activeGroup.key] : '';
  const isComplete = idx === LINEAR_ORDER.length;

  // Offset acumulado de cada grupo dentro de la progresión lineal
  let offset = 0;

  return (
    <div className={`leading-tight ${className}`}>
      <div className="flex items-center gap-1">
        {STAGE_GROUPS.map(g => {
          const size   = g.statuses.length;
          // Cuántos statuses del grupo ya se recorrieron (incluido el actual)
          const filled = Math.max(0, Math.min(size, idx - offset));
          // Emerald solo cuando el caso ya PASÓ el grupo entero (o terminó el recorrido)
          const done = idx > offset + size || isComplete;
          offset += size;
          return (
            <div
              key={g.key}
              className="h-1.5 rounded-full bg-bg-2 overflow-hidden"
              style={{ flexGrow: size }}
            >
              {filled > 0 && (
                <div
                  className={`h-full rounded-full transition-all ${done ? 'bg-emerald' : 'bg-brand'}`}
                  style={{ width: `${(filled / size) * 100}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className={`text-[10px] font-medium ${isComplete ? 'text-emerald' : 'text-brand-text'}`}>{label}</span>
        <span className="text-[10px] text-text-muted tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}
