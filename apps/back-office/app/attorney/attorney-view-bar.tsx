'use client';

/**
 * AttorneyViewBar — barra "viendo como" del Portal Legal.
 *
 * Espejo de `DoctorViewBar`, pero en DOS pasos: primero el bufete, después la
 * persona. Con un solo selector únicamente se podía entrar como la cuenta del
 * despacho, que ve todo — y así era imposible comprobar qué ve un gestor de
 * casos o un asistente, que son los roles con el alcance recortado.
 *
 * Solo la usan los admins. Al elegir, todo el portal se resuelve como esa
 * persona: menús, casos, firma. La elección vive en una cookie que lee
 * `getSessionLawyer`, y el servidor la ignora si quien la puso no es admin.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Loader2, X } from 'lucide-react';
import { useTransitionProgress } from '@/components/layout/navigation-progress';

export interface FirmMemberOption {
  id: string;
  label: string;
  role: string | null;
  inactive: boolean;
}

export interface FirmOption {
  id: string;
  label: string;
  /** Sin bufete: es un abogado suelto, no un despacho. */
  isIndependent: boolean;
  members: FirmMemberOption[];
}

interface Props {
  firms: FirmOption[];
  /** Ficha vigente ('' si todavía no eligió). Puede ser un bufete o un miembro. */
  currentId: string;
}

export function AttorneyViewBar({ firms, currentId }: Props): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  useTransitionProgress(isPending);
  const [saving, setSaving] = React.useState(false);

  /**
   * El bufete del selector se DEDUCE de la ficha vigente: si estás viendo como
   * Camila Rojas, el primer paso tiene que mostrar Garcia Law. Guardarlo aparte
   * en estado obligaría a mantenerlo sincronizado con la cookie, y al recargar
   * quedaría vacío aunque el portal sí sepa a quién está mostrando.
   */
  const firmOfCurrent = React.useMemo(() => {
    if (!currentId) return '';
    const own = firms.find((f) => f.id === currentId);
    if (own) return own.id;
    return firms.find((f) => f.members.some((m) => m.id === currentId))?.id ?? '';
  }, [firms, currentId]);

  const [firmId, setFirmId] = React.useState(firmOfCurrent);
  React.useEffect(() => { setFirmId(firmOfCurrent); }, [firmOfCurrent]);

  const firm = firms.find((f) => f.id === firmId) ?? null;

  async function select(id: string): Promise<void> {
    if (id === currentId) return;
    setSaving(true);
    try {
      const res = id
        ? await fetch('/api/attorney/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lawyerId: id }),
          })
        : await fetch('/api/attorney/view', { method: 'DELETE' });
      if (!res.ok) return;
      startTransition(() => { router.refresh(); });
    } finally {
      setSaving(false);
    }
  }

  function pickFirm(id: string): void {
    setFirmId(id);
    const next = firms.find((f) => f.id === id);
    // Un independiente no tiene segundo paso: elegirlo YA es la selección.
    // Un despacho arranca mostrándose como la cuenta del bufete, que es la
    // vista más amplia; desde ahí se baja a una persona.
    if (next) void select(next.id);
  }

  const roleLabel = (role: string | null): string =>
    t(`role${role ?? 'OTHER'}` as 'roleOTHER');

  const withFirms = firms.filter((f) => !f.isIndependent);
  const independents = firms.filter((f) => f.isIndependent);

  return (
    <div className="rounded-lg border border-amber/30 bg-amber/[0.07] px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 shrink-0">
        {saving || isPending
          ? <Loader2 className="w-4 h-4 text-amber animate-spin" />
          : <Eye className="w-4 h-4 text-amber" />}
        <span className="text-[12px] font-semibold text-amber">{t('viewAsLabel')}</span>
      </div>

      <label className="flex-1 min-w-[200px]">
        <span className="sr-only">{t('viewAsFirmStep')}</span>
        <select
          value={firmId}
          onChange={(e) => pickFirm(e.target.value)}
          className="w-full rounded-md border border-border bg-bg-1 px-3 py-1.5 text-sm text-text-1 focus:outline-none focus:ring-1 focus:ring-amber/40"
        >
          <option value="">{t('viewAsPlaceholder')}</option>
          {/* Los independientes van en su propio grupo: mezclados entre los
              despachos se leían como si fueran uno más. */}
          <optgroup label={t('viewAsFirms')}>
            {withFirms.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </optgroup>
          {independents.length > 0 && (
            <optgroup label={t('viewAsIndependent')}>
              {independents.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {firm && !firm.isIndependent && firm.members.length > 0 && (
        <label className="flex-1 min-w-[200px]">
          <span className="sr-only">{t('viewAsPersonStep')}</span>
          <select
            value={currentId === firm.id ? '' : currentId}
            onChange={(e) => void select(e.target.value || firm.id)}
            className="w-full rounded-md border border-border bg-bg-1 px-3 py-1.5 text-sm text-text-1 focus:outline-none focus:ring-1 focus:ring-amber/40"
          >
            <option value="">{t('viewAsTheFirm')}</option>
            {firm.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {roleLabel(m.role)}
                {m.inactive ? ` (${t('inactiveSuffix')})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {currentId && (
        <button
          type="button"
          onClick={() => void select('')}
          className="shrink-0 text-text-muted hover:text-text-1 rounded-md p-1"
          title={t('viewAsExit')}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
