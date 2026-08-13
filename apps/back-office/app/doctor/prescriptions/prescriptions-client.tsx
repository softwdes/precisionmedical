'use client';

/**
 * Portal Médico · Recetas — la bandeja de ScriptSure embebida.
 *
 * Va a PÁGINA COMPLETA, no en un modal como el widget de la consulta: esto no
 * es un paso dentro de atender a un paciente, es trabajo de bandeja (revisar
 * qué rechazó la farmacia, aprobar lo que quedó en cola, contestar renovaciones)
 * y necesita el alto de la pantalla para respirar.
 *
 * Las vistas son widgets de ellos, no reimplementaciones nuestras: su bandeja
 * ya trae las acciones reales (Represcribe, Approve, Deny, Edit) y se mantiene
 * al día sola. Rehacerla de nuestro lado sería una copia peor y desactualizada.
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Inbox, ListChecks, ShieldCheck, Loader2, AlertTriangle, Lock, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui-phoenix';

type Vista = 'message' | 'prescription-queue' | 'auditlog';
type Estado = 'loading' | 'ready' | 'not_onboarded' | 'error';

const VISTAS: { key: Vista; icon: typeof Inbox; labelKey: string }[] = [
  { key: 'message', icon: Inbox, labelKey: 'rxInboxTab' },
  { key: 'prescription-queue', icon: ListChecks, labelKey: 'rxQueueTab' },
  { key: 'auditlog', icon: ShieldCheck, labelKey: 'rxAuditTab' },
];

export function PrescriptionsClient(): React.ReactElement {
  const t = useTranslations('phoenix.doctor');

  const [vista, setVista] = React.useState<Vista>('message');
  const [estado, setEstado] = React.useState<Estado>('loading');
  const [url, setUrl] = React.useState<string | null>(null);
  const [detalle, setDetalle] = React.useState<string | null>(null);
  // Cambia en cada "actualizar" para forzar que el iframe recargue: si solo se
  // reusara la misma URL, React no vuelve a montarlo y la bandeja queda vieja.
  const [recarga, setRecarga] = React.useState(0);

  React.useEffect(() => {
    let vigente = true;
    setEstado('loading');
    setUrl(null);
    setDetalle(null);

    void (async () => {
      try {
        const res = await fetch(`/api/admin/scriptsure/practice-widget?widget=${vista}`);
        const body = (await res.json()) as { url?: string; error?: string; message?: string };
        if (!vigente) return;

        if (!res.ok) {
          setEstado(body.error === 'NOT_ONBOARDED' ? 'not_onboarded' : 'error');
          setDetalle(body.message ?? body.error ?? null);
          return;
        }
        setUrl(body.url ?? null);
        setEstado('ready');
      } catch (err) {
        if (!vigente) return;
        setEstado('error');
        setDetalle((err as Error).message);
      }
    })();

    return () => { vigente = false; };
  }, [vista, recarga]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('prescriptionsTitle')} subtitle={t('prescriptionsSubtitle')} />

      <div className="flex items-center gap-2 flex-wrap">
        {VISTAS.map(({ key, icon: Icon, labelKey }) => (
          <button
            key={key}
            type="button"
            onClick={() => setVista(key)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold transition-colors ${
              vista === key
                ? 'bg-violet/15 text-violet-text'
                : 'bg-bg-2 text-text-muted hover:text-text-1'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t(labelKey)}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setRecarga((n) => n + 1)}
          disabled={estado === 'loading'}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold text-text-muted hover:text-text-1 bg-bg-2 disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${estado === 'loading' ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('rxRefresh')}</span>
        </button>
      </div>

      {/* Alto fijo en viewport, no calculado contra el header: el shell no expone
          su altura y un calc() adivinado deja franjas o scroll doble. */}
      <div className="min-h-[70vh] h-[70vh] rounded-lg bg-bg-1 overflow-hidden flex flex-col">
        {estado === 'loading' && (
          <div className="flex-1 flex items-center justify-center gap-2 text-text-muted text-[12.5px]">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('rxWidgetLoading')}
          </div>
        )}

        {estado === 'not_onboarded' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex items-start gap-3 max-w-md">
              <div className="w-8 h-8 rounded-md bg-amber/10 border border-amber/25 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-amber" />
              </div>
              <div className="text-[12.5px] text-text-2 leading-relaxed">
                <p className="text-text-1 font-medium mb-1">{t('rxNotOnboardedTitle')}</p>
                <p>{t('rxNotOnboardedDesc')}</p>
              </div>
            </div>
          </div>
        )}

        {estado === 'error' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex items-start gap-3 max-w-md">
              <div className="w-8 h-8 rounded-md bg-rose/10 border border-rose/25 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose" />
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] text-text-2 leading-relaxed">{t('rxWidgetError')}</p>
                {detalle && (
                  <pre className="mt-2 text-[10.5px] text-text-muted bg-bg-2/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-40">
                    {detalle}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}

        {estado === 'ready' && url && (
          <iframe
            key={`${vista}-${recarga}`}
            src={url}
            title={`ScriptSure ${vista}`}
            className="w-full flex-1 border-0"
          />
        )}
      </div>
    </div>
  );
}
