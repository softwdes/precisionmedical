'use client';

/**
 * La casilla "No tiene alergias / No toma medicinas".
 *
 * Una lista vacía no distingue "no tiene" de "nadie preguntó"; esta casilla es
 * lo que lo distingue. Mismo componente en Pacientes, Day Admission y la
 * consulta, para que las tres pantallas hablen igual. El estado lo resuelve
 * `lib/revision-historial` (vía `patientContext.history.revision`) y la regla la
 * pone el servidor en `updateMedicalHistory`: acá solo se pide.
 */

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, Clock } from 'lucide-react';
import { updateMedicalHistory } from '@/app/(admin)/patients/actions';
import type { EstadoRevision, SelloRevision } from '@/lib/revision-historial';

export type TipoRevision = 'alergias' | 'medicinas';

export interface RevisionGuardada {
  noKnownAllergies: SelloRevision | null;
  noCurrentMedications: SelloRevision | null;
}

export function RevisionHistorial({
  tipo, patientId, estado, sello, onSaved, onError, readOnly = false,
}: {
  tipo: TipoRevision;
  patientId: string;
  estado: EstadoRevision;
  sello: SelloRevision | null;
  /** Recibe cómo quedaron las dos casillas, para que la pantalla actualice sin recargar. */
  onSaved?: (r: RevisionGuardada) => void;
  onError?: (mensaje: string) => void;
  readOnly?: boolean;
}) {
  const t = useTranslations('phoenix.revision');
  const te = useTranslations('phoenix.patients');
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Hay datos cargados: la casilla "no tiene" no aplica y no se ofrece.
  if (estado === 'TIENE') return null;

  const campo = tipo === 'alergias' ? 'noKnownAllergies' : 'noCurrentMedications';
  const confirmado = estado === 'CONFIRMADO_NO_TIENE';

  function cambiar(marcar: boolean): void {
    setError(null);
    start(async () => {
      const r = await updateMedicalHistory(patientId, {
        [campo]: marcar ? { at: new Date().toISOString() } : null,
      });
      if (!r.ok) {
        // El servidor devuelve un código; el texto lo pone el cliente.
        let msg = t('conflict');
        try { msg = te(`mh.err.${r.code ?? 'inesperado'}`, { max: r.max ?? 0 }); } catch { /* clave faltante */ }
        setError(msg);
        onError?.(msg);
        return;
      }
      if (r.revision) onSaved?.(r.revision);
    });
  }

  const caja = tipo === 'alergias' ? t('nkaBox') : t('noMedsBox');
  const fecha = sello?.at ? new Date(sello.at).toLocaleDateString(locale) : null;
  const detalle = confirmado
    ? (sello?.by && fecha
        ? t('confirmed', { by: sello.by, date: fecha })
        : tipo === 'alergias' ? t('confirmedLegacy') : t('confirmedMedsLegacy'))
    : estado === 'DECLARADO_NO_TIENE' ? t('declared') : t('unreviewed');

  return (
    <div className={`rounded-md border p-2.5 ${confirmado ? 'border-emerald/30 bg-emerald/5' : 'border-amber/30 bg-amber/5'}`}>
      <label className={`flex items-start gap-2 ${readOnly || pending ? 'opacity-60' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={confirmado}
          disabled={readOnly || pending}
          onChange={e => cambiar(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-emerald"
        />
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1.5 text-[12px] font-semibold ${confirmado ? 'text-emerald' : 'text-amber'}`}>
            {confirmado ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <Clock className="w-3.5 h-3.5 shrink-0" />}
            {caja}
          </span>
          <span className="block text-[10.5px] text-text-muted mt-0.5">{pending ? t('saving') : detalle}</span>
        </span>
      </label>
      {error && <div className="text-[10.5px] text-rose mt-1.5">{error}</div>}
    </div>
  );
}
