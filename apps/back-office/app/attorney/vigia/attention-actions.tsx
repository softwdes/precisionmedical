'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MessageSquarePlus } from 'lucide-react';
import { Button } from '@precision/ui';
import { RequestDialog } from './request-dialog';

/**
 * Portal Legal · Vigía · los dos botones del aviso del día.
 *
 * Existe como componente de cliente solo porque el pedido abre un diálogo: la
 * tarjeta sigue siendo server, y los textos ya vienen traducidos desde ahí. Así
 * el pedido nace con el contexto puesto —el caso y el motivo— y el abogado solo
 * lo lee y lo manda.
 */
export function AttentionActions({ caso, href, asunto, cuerpo, urgente }: {
  caso: string;
  href: string;
  asunto: string;
  cuerpo: string;
  /** Cambia el color del botón principal, igual que el resto de la tarjeta. */
  urgente: boolean;
}): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const [pidiendo, setPidiendo] = React.useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
        <Link
          href={href}
          className={`inline-flex items-center justify-center h-9 px-5 rounded font-semibold text-sm text-white transition-opacity hover:opacity-90 ${
            urgente ? 'bg-rose' : 'bg-amber'
          }`}
        >
          {t('vigiaHeroCta')}
        </Link>

        <Button variant="secondary" onClick={() => setPidiendo(true)}>
          <MessageSquarePlus />
          {t('vigiaReqCta')}
        </Button>
      </div>

      <RequestDialog
        caso={pidiendo ? caso : null}
        asunto={asunto}
        cuerpo={cuerpo}
        onClose={() => setPidiendo(false)}
      />
    </>
  );
}
