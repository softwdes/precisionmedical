'use client';

/**
 * RxPatientSummary — alergias y medicación activa, DENTRO del tab de Recetas.
 *
 * ─── Por qué existe ─────────────────────────────────────────────────────────
 *
 * El panel del paciente (`PatientContextPanel`) se dibuja SOLO en el tab de la
 * nota, en las dos pantallas: "en los otros tabs el contenido son tablas y el
 * ancho es el recurso escaso". Para las tablas de labs o servicios eso está
 * bien; para Recetas sale caro, porque al cambiar de tab desaparecen justo las
 * dos cosas que hay que tener delante al recetar — a qué es alérgico y qué está
 * tomando (Erick, 2026-09-15).
 *
 * En Day Admission quedaba peor: sin panel y con los widgets de escritura
 * ocultos, el asistente veía en ese tab un solo botón.
 *
 * No cuesta una consulta más: `patientContext` ya viaja a las dos pantallas.
 *
 * ─── Dos lectores, un resumen ───────────────────────────────────────────────
 *
 * Day Admission es la pantalla del ASISTENTE y Mi Día la del MÉDICO (Erick).
 * Por eso el resumen es idéntico y lo único que cambia es el atajo para
 * registrar la alergia en ScriptSure: lo ve quien puede usarlo. Ofrecérselo al
 * asistente sería mandarlo a una pantalla que no tiene.
 *
 * ─── Lo que la advertencia NO puede callar ──────────────────────────────────
 *
 * El control de interacciones corre sobre la lista de ALERGIAS DE SCRIPTSURE,
 * que es otra: lo que se carga en el historial clínico no se le manda (se le
 * mandan nombre, fecha de nacimiento y dirección, nada más). Mostrar la alergia
 * acá sin decir eso sería peor que no mostrarla — reforzaría la idea de que el
 * sistema ya la está mirando.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { TriangleAlert, Pill, Plus } from 'lucide-react';
import type { MedicationConDetalle } from '@/lib/medication-details';

export function RxPatientSummary({
  allergies, allergiesDeclared = null, medications, readOnly = false, onRegistrarAlergia,
}: {
  /** Texto libre del historial clínico. null / vacío = no hay nada cargado. */
  allergies: string | null;
  /**
   * Lo que el PACIENTE declaró en su formulario de intake, sin confirmar por el
   * staff. Se muestra acá porque esta es la pantalla donde se receta: si el
   * paciente dijo "penicilina" y nadie lo pasó al historial, el peor lugar para
   * enterarse tarde es este. Ver `allergiesDeclared` en lib/patient-context.
   */
  allergiesDeclared?: string | null;
  medications: MedicationConDetalle[];
  /** Day Admission: sin el atajo a ScriptSure — esa pantalla no es del médico. */
  readOnly?: boolean;
  onRegistrarAlergia?: () => void;
}): React.ReactElement | null {
  const t = useTranslations('phoenix.doctor');

  const alergias = allergies?.trim() ?? '';
  const declaradas = allergiesDeclared?.trim() ?? '';
  const activos = medications.filter((m) => m.status === 'IN_USE');

  // Sin alergias NI medicación no se dibuja nada: un recuadro que dice "no hay"
  // ocupa el lugar de la acción principal y no informa.
  if (!alergias && !declaradas && activos.length === 0) return null;

  return (
    <div className="mx-5 mb-4 space-y-2">
      {(alergias || declaradas) && (
        <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <TriangleAlert className="w-4 h-4 text-amber shrink-0 mt-px" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-amber">
                {t('rxSummaryAllergies')}
              </div>
              {alergias && (
                <div className="text-[13px] text-text-1 mt-0.5 leading-relaxed">{alergias}</div>
              )}
              {/* Lo declarado por el paciente va etiquetado y DENTRO del mismo
                  aviso: dos cajas ámbar iguales una encima de la otra se leen
                  como un error de render, no como dos orígenes distintos. */}
              {declaradas && (
                <div className="mt-1.5">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-amber/80">
                    {t('rxSummaryAllergiesDeclared')}
                  </div>
                  <div className="text-[13px] text-text-1 leading-relaxed">{declaradas}</div>
                </div>
              )}
              <p className="text-[11px] text-text-muted mt-1.5 leading-relaxed">
                {t('rxSummaryAllergiesHint')}
              </p>
            </div>
            {/* Solo para quien puede usarlo — ver el docblock. */}
            {!readOnly && onRegistrarAlergia && (
              <button
                type="button"
                onClick={onRegistrarAlergia}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber/40 text-amber text-[11px] font-semibold hover:bg-amber/15 transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span className="hidden sm:inline">{t('rxSummaryRegister')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {activos.length > 0 && (
        <div className="rounded-md bg-bg-2/40 px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-text-muted flex items-center gap-1.5">
            <Pill className="w-3.5 h-3.5" /> {t('rxSummaryActive', { count: activos.length })}
          </div>
          <div className="mt-1.5 space-y-1">
            {activos.map((m, i) => (
              <div key={m.id ?? i} className="text-[12.5px] text-text-2 flex items-baseline gap-1.5">
                <span className="text-text-1">{m.name}</span>
                {m.dose && <span className="text-text-muted">· {m.dose}</span>}
                {m.instructions && <span className="text-text-muted truncate">· {m.instructions}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
