'use client';

/**
 * La bandeja del Admin: lista, hilo y respuesta.
 *
 * ── Por qué en el teléfono es UNA columna y no dos ─────────────────────────
 *
 * Porque quien más la va a usar la va a usar ahí. Amanda y los dueños entran
 * desde el celular; el escritorio es el caso raro, no al revés. Así que en
 * móvil la lista OCUPA la pantalla y el hilo la reemplaza al tocarlo, con su
 * propio botón de volver — que es como funciona cualquier bandeja de correo en
 * un teléfono. En pantalla ancha recién ahí se abren las dos columnas.
 *
 * ── Por qué no usa tRPC como el resto del Admin ────────────────────────────
 *
 * Porque estos datos no son del Admin: viven en la clínica y se piden por el
 * puente `/api/clinica/mensajes/…`, que reenvía con la sesión de cada persona.
 * Meterlos en el router de tRPC sería declarar que el Admin es dueño de algo
 * que no lo es.
 */

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import { Button, Textarea, Badge } from '@precision/ui';
import { ArrowLeft, Mail, Paperclip, Send, Inbox, Archive, SendHorizontal } from 'lucide-react';
import { toast } from 'sonner';

type Carpeta = 'inbox' | 'sent' | 'archived';

interface HiloEnLista {
  id: string;
  subject: string;
  priority: 'NORMAL' | 'URGENT' | string;
  lastEntryAt: string;
  lastAuthorName: string | null;
  patient: { id: string; name: string } | null;
  unread: boolean;
  answered: boolean;
  attachmentCount: number;
}

interface Entrada {
  id: string;
  authorName: string | null;
  body: string;
  createdAt: string;
  kind: string;
}

interface HiloAbierto {
  id: string;
  subject: string;
  priority: string;
  entries: Entrada[];
}

/** Todo lo de esta pantalla pasa por el puente, nunca por la API del Admin. */
async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/clinica/mensajes/${ruta}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`${res.status} ${detalle.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function MensajesClient(): React.ReactElement {
  const t = useTranslations('mensajes');
  const locale = useLocale();
  const qc = useQueryClient();

  const [carpeta, setCarpeta] = useState<Carpeta>('inbox');

  /**
   * El hilo que pide la URL (`?thread=…`), si viene uno.
   *
   * Es el aterrizaje del aviso del celular: el Service Worker del Admin traduce
   * `/messages?thread=X` a esta pantalla, y tocar la notificación tiene que
   * abrir ESE mensaje, no la lista para que la persona lo busque.
   *
   * Se lee de `window.location` en el inicializador y no con `useSearchParams`
   * a propósito: ese hook obliga a envolver la pantalla en un `Suspense` y acá
   * el dato se necesita una sola vez, al abrir.
   */
  const [abierto, setAbierto] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('thread');
  });
  const [respuesta, setRespuesta] = useState('');

  const lista = useQuery({
    queryKey: ['clinica-mensajes', carpeta],
    queryFn: () => pedir<{ threads: HiloEnLista[]; unreadInbox: number }>(`?folder=${carpeta}`),
    placeholderData: keepPreviousData,
    // La bandeja se mira y se deja abierta: un pulso corto la mantiene viva sin
    // que nadie tenga que recargar.
    refetchInterval: 60_000,
  });

  const hilo = useQuery({
    queryKey: ['clinica-hilo', abierto],
    queryFn: () => pedir<HiloAbierto>(abierto!),
    enabled: !!abierto,
  });

  /**
   * Marcar leído va en un efecto y no en el clic, para que también valga cuando
   * el hilo viene de la URL — que es el caso del aviso del celular.
   *
   * Es fuego y olvido a propósito: si falla, el hilo se queda en negrita.
   * Molesto y honesto, mucho mejor que decir "leído" sin que el otro lado se
   * haya enterado.
   */
  useEffect(() => {
    if (!abierto) return;
    void pedir(`${abierto}/read`, { method: 'POST' })
      .then(() => qc.invalidateQueries({ queryKey: ['clinica-mensajes'] }))
      .catch(() => undefined);
  }, [abierto, qc]);

  const abrir = (id: string): void => {
    setAbierto(id);
    setRespuesta('');
  };

  const responder = useMutation({
    mutationFn: (cuerpo: string) =>
      pedir(`${abierto}/entries`, { method: 'POST', body: JSON.stringify({ body: cuerpo, kind: 'REPLY' }) }),
    onSuccess: () => {
      setRespuesta('');
      void qc.invalidateQueries({ queryKey: ['clinica-hilo', abierto] });
      void qc.invalidateQueries({ queryKey: ['clinica-mensajes'] });
      toast.success(t('sent'));
    },
    onError: (e: Error) => {
      // El detalle va a la consola y a la pantalla va algo que se pueda leer.
      console.error('[mensajes] no se pudo responder', e);
      toast.error(t('sendError'));
    },
  });

  const fecha = (iso: string): string =>
    new Date(iso).toLocaleString(locale === 'es' ? 'es-US' : 'en-US', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    });

  const CARPETAS: Array<{ id: Carpeta; icono: React.ReactNode; etiqueta: string }> = [
    { id: 'inbox', icono: <Inbox className="w-3.5 h-3.5" />, etiqueta: t('inbox') },
    { id: 'sent', icono: <SendHorizontal className="w-3.5 h-3.5" />, etiqueta: t('sent_') },
    { id: 'archived', icono: <Archive className="w-3.5 h-3.5" />, etiqueta: t('archived') },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <h1 className="text-2xl font-bold text-text-1">{t('title')}</h1>
        {(lista.data?.unreadInbox ?? 0) > 0 && (
          <Badge variant="secondary">{t('unread', { n: lista.data?.unreadInbox ?? 0 })}</Badge>
        )}
      </div>

      {/* Las carpetas: en móvil se envuelven en vez de salirse de la pantalla. */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {CARPETAS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { setCarpeta(c.id); setAbierto(null); }}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors ${
              carpeta === c.id
                ? 'bg-brand/15 text-brand-text border border-brand/30'
                : 'bg-bg-2 text-text-2 border border-border hover:text-text-1'
            }`}
          >
            {c.icono}
            {c.etiqueta}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-4">
        {/* ── La lista ──────────────────────────────────────────────────────
            En móvil desaparece cuando hay un hilo abierto: dos paneles
            apilados en 375px no son dos paneles, son un amontonamiento. */}
        <div className={`${abierto ? 'hidden lg:block' : ''} rounded-lg bg-bg-1 overflow-hidden`}>
          {lista.isLoading && <p className="p-5 text-sm text-text-muted">{t('loading')}</p>}

          {!lista.isLoading && (lista.data?.threads.length ?? 0) === 0 && (
            <div className="p-8 text-center">
              <Mail className="w-8 h-8 mx-auto mb-2 text-text-muted" aria-hidden="true" />
              <p className="text-sm text-text-muted">{t('empty')}</p>
            </div>
          )}

          {lista.data?.threads.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => abrir(h.id)}
              className={`w-full text-left px-4 py-3 border-b border-row-sep last:border-0 transition-colors hover:bg-white/[0.02] ${
                abierto === h.id ? 'bg-brand/[0.06]' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                {/* El punto de "sin leer" ocupa lugar siempre, para que las
                    filas no se corran al marcarse leídas. */}
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${h.unread ? 'bg-brand' : 'bg-transparent'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className={`truncate text-sm ${h.unread ? 'font-semibold text-text-1' : 'text-text-2'}`}>
                      {h.subject}
                    </p>
                    {h.priority === 'URGENT' && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wider font-semibold text-rose-text">
                        {t('urgent')}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[12px] text-text-muted mt-0.5">
                    {h.lastAuthorName ?? '—'}
                    {h.patient ? ` · ${h.patient.name}` : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-text-muted">{fecha(h.lastEntryAt)}</span>
                    {h.attachmentCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                        <Paperclip className="w-3 h-3" aria-hidden="true" />
                        {h.attachmentCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* ── El hilo ───────────────────────────────────────────────────── */}
        <div className={`${abierto ? '' : 'hidden lg:block'} rounded-lg bg-bg-1`}>
          {!abierto && (
            <div className="p-8 text-center">
              <p className="text-sm text-text-muted">{t('pick')}</p>
            </div>
          )}

          {abierto && (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                {/* Volver solo existe en móvil: en ancho, la lista nunca se fue. */}
                <button
                  type="button"
                  onClick={() => setAbierto(null)}
                  className="lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-md text-text-2 hover:text-text-1 hover:bg-white/5"
                  aria-label={t('back')}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <p className="font-semibold text-text-1 text-sm truncate">
                  {hilo.data?.subject ?? '…'}
                </p>
              </div>

              <div className="p-4 space-y-4 max-h-[50vh] lg:max-h-[58vh] overflow-y-auto">
                {hilo.isLoading && <p className="text-sm text-text-muted">{t('loading')}</p>}
                {hilo.data?.entries.map((e) => (
                  <div key={e.id} className="rounded-md bg-bg-2/40 p-3">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-[12px] font-semibold text-text-1">{e.authorName ?? '—'}</span>
                      <span className="text-[11px] text-text-muted shrink-0">{fecha(e.createdAt)}</span>
                    </div>
                    {/* `whitespace-pre-wrap`: los saltos que escribió la persona
                        son parte del mensaje, no ruido que se pueda colapsar. */}
                    <p className="text-[13px] text-text-2 whitespace-pre-wrap break-words">{e.body}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-border p-4">
                <Textarea
                  value={respuesta}
                  onChange={(ev) => setRespuesta(ev.target.value)}
                  placeholder={t('replyPlaceholder')}
                  rows={3}
                  className="mb-2"
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => responder.mutate(respuesta.trim())}
                    disabled={!respuesta.trim() || responder.isPending}
                    className="w-full sm:w-auto"
                  >
                    <Send className="w-4 h-4 mr-2" aria-hidden="true" />
                    {responder.isPending ? t('sending') : t('reply')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
