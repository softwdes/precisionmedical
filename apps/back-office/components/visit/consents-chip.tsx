'use client';

/**
 * Aviso de consentimientos sin firmar — junto al "Sin firmar" de la cita.
 *
 * Solo AVISA: no bloquea nada (Erick 2026-10-09). Parpadea mientras falte
 * algo, para que quien está en el mostrador lo vea ANTES de entregarle el QR al
 * paciente y lo resuelva ahí, en vez de que el paciente se tope con el bloqueo
 * del formulario ("Authorizations pending"). Con `prefers-reduced-motion` queda
 * quieto pero con el mismo color.
 *
 * Si no falta nada no dibuja nada: el lado "completo" ya lo dice la ausencia del
 * aviso Y el chip de la firma, y una fila con nueve pastillas verdes es ruido.
 */

import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { CONSENTIMIENTOS } from '@/lib/estado-consentimientos';

export function ConsentsChip({ faltan, onClick }: { faltan: string[]; onClick?: () => void }) {
  const t = useTranslations('phoenix.calendar');
  if (faltan.length === 0) return null;

  const nombres = faltan.map((k) => t(`consentName_${k}` as 'consentName_hipaa')).join(', ');
  const clase = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold border border-rose/40 bg-rose/10 text-rose animate-pulse motion-reduce:animate-none';
  const contenido = (
    <>
      <ShieldAlert className="w-2.5 h-2.5" />
      {t('consentsMissingBadge', { n: faltan.length, total: CONSENTIMIENTOS.length })}
      {onClick && <span className="underline">· {t('consentsSignNow')}</span>}
    </>
  );
  const titulo = t('consentsMissingTitle', { lista: nombres });
  // Con `onClick` es un botón que abre el formulario del caso en el paso de
  // consentimientos; sin él, solo avisa.
  return onClick ? (
    <button
      type="button"
      title={titulo}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`${clase} hover:bg-rose/20 focus:outline-none focus:ring-1 focus:ring-rose`}
    >
      {contenido}
    </button>
  ) : (
    <span title={titulo} className={clase}>{contenido}</span>
  );
}
