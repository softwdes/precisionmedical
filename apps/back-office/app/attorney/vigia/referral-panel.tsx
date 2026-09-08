'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UserPlus, ArrowRight } from 'lucide-react';
import { ReferralDialog } from './referral-dialog';

/**
 * Portal Legal · Vigía · el panel "¿Tenés un referido?".
 *
 * Va a la DERECHA del caso urgente del día, con la misma altura (propuesta D,
 * Erick 2026-09-08): son las dos cosas que le pedimos al abogado hoy —destrabá
 * este caso, mandanos el próximo cliente— y tienen el mismo rango. El referido
 * es la razón por la que el portal es gratis, así que no se ordena para que
 * moleste menos: se le da su columna.
 *
 * Los tres números son el argumento: nada convence más de mandar el siguiente
 * que ver qué pasó con los anteriores. Sin referidos todavía, el panel invita en
 * vez de contar.
 */
export function ReferralPanel({ firmName, attorneyName, esteMes, enTratamiento, pendientes }: {
  firmName: string;
  attorneyName: string | null;
  esteMes: number;
  enTratamiento: number;
  pendientes: number;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const hayHistorial = esteMes + enTratamiento + pendientes > 0;

  return (
    <>
      <div className="relative overflow-hidden rounded-lg bg-bg-1 p-6 h-full flex flex-col">
        {/* Un solo acento de marca por panel: el halo de fondo. El botón lleva
            el degradado; nada más compite. */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full bg-brand/20 blur-2xl" />

        <div className="relative flex items-center gap-2 mb-2">
          <UserPlus className="w-3.5 h-3.5 text-brand-text" />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-text">{t('refPanelLabel')}</span>
        </div>
        <h2 className="relative text-text-1 text-xl font-bold">{t('refPanelTitle')}</h2>
        <p className="relative text-text-2 text-sm mt-2">{t('refPanelBody')}</p>

        {hayHistorial ? (
          <dl className="relative flex gap-6 mt-4 flex-wrap">
            <div>
              <dd className="text-2xl font-bold text-text-1 tabular-nums leading-none">{esteMes}</dd>
              <dt className="text-[11px] text-text-muted mt-1">{t('refPanelThisMonth')}</dt>
            </div>
            <div>
              <dd className="text-2xl font-bold text-emerald tabular-nums leading-none">{enTratamiento}</dd>
              <dt className="text-[11px] text-text-muted mt-1">{t('refPanelInTreatment')}</dt>
            </div>
            <div>
              <dd className={`text-2xl font-bold tabular-nums leading-none ${pendientes > 0 ? 'text-amber' : 'text-text-1'}`}>{pendientes}</dd>
              <dt className="text-[11px] text-text-muted mt-1">{t('refPanelPending')}</dt>
            </div>
          </dl>
        ) : (
          <p className="relative text-[12.5px] text-text-muted mt-4">{t('refPanelFirst')}</p>
        )}

        <div className="relative flex items-center gap-4 flex-wrap mt-auto pt-5">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-md bg-gradient-brand text-white font-semibold text-sm shadow-glow hover:opacity-90 transition-opacity w-full sm:w-auto"
          >
            {t('refCtaButton')}
            <ArrowRight className="w-4 h-4" />
          </button>
          {hayHistorial && (
            <Link href="/attorney/referrals" className="text-[12.5px] text-text-2 hover:text-text-1 underline-offset-2 hover:underline">
              {t('refPanelSeeAll')}
            </Link>
          )}
        </div>
      </div>

      <ReferralDialog
        open={abierto}
        onClose={() => setAbierto(false)}
        firmName={firmName}
        attorneyName={attorneyName}
        onSent={() => router.refresh()}
      />
    </>
  );
}
