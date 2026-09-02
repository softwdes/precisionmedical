'use client';

/**
 * Tab "Mensajes" del caso — los hilos de mensajería anclados a ESTE caso.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * El vínculo ya estaba: `MessageThread` tiene `caseId` y 44 de los 63 hilos lo
 * llevan. Lo que faltaba era la pantalla — el caso tenía nueve tabs y ninguno
 * de mensajes, así que nadie leía ese vínculo desde la ficha. Reportado el
 * 2026-09-02: "puedo verlo en mi bandeja de entrada pero no en el chart del
 * paciente".
 *
 * Se apoya entero en lo que ya existe: `GET /api/messages/patient/[id]?caseId=`
 * devuelve el historial y `ThreadViewDialog` abre el hilo con todo lo que se
 * compartió. Acá no hay backend nuevo.
 *
 * ── Muestra los SELLADOS y los sacados de bandeja ──────────────────────────
 *
 * A propósito, y es el punto de la pantalla. "Move to Patient Folder" saca el
 * hilo de todas las bandejas; si además no estuviera en el caso, un hilo sellado
 * desaparecería del sistema para cualquiera que lo busque después. Lo único que
 * no aparece son los borrados del historial (`deletedAt`), que ya lo filtra la
 * API.
 *
 * ── No lo ve el bufete ─────────────────────────────────────────────────────
 *
 * `TABS_ATTORNEY` no lo incluye: son mensajes internos de la clínica entre su
 * propio staff. Que el caso sea del bufete no le da acceso a la conversación
 * operativa de la clínica sobre ese caso.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Lock, Paperclip, MessagesSquare, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui-phoenix';
import { ThreadViewDialog } from './thread-view-dialog';
import { ComposeMessageDialog } from './compose-message-dialog';

interface Hilo {
  id: string;
  subject: string;
  type: string;
  priority: 'NORMAL' | 'URGENT';
  createdByName: string;
  lastAuthorName: string | null;
  lastEntryAt: string;
  sealedAt: string | null;
  attachmentCount?: number;
}

interface Props {
  patientId: string;
  /** "APELLIDO, Nombre" — el formato que espera la cabecera del compose. */
  patientName: string;
  caseId: string;
  currentUserId: string;
  isAdmin?: boolean;
}

export function CaseMessagesTab({
  patientId, patientName, caseId, currentUserId, isAdmin = false,
}: Props) {
  const t = useTranslations('phoenix.messaging');
  const tc = useTranslations('phoenix.caseDetail');
  const locale = useLocale();

  const [hilos, setHilos] = useState<Hilo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [componer, setComponer] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/messages/patient/${patientId}?caseId=${caseId}`);
      const json = await res.json().catch(() => ({}));
      setHilos(Array.isArray(json.threads) ? json.threads : []);
    } catch {
      setHilos([]);
    } finally {
      setCargando(false);
    }
  }, [patientId, caseId]);

  useEffect(() => { void cargar(); }, [cargar]);

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'es' ? 'es-US' : 'en-US', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
    });

  return (
    <div className="rounded-lg bg-bg-1 p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <MessagesSquare className="w-4 h-4 text-brand" />
          <span className="text-text-1 font-semibold text-sm uppercase tracking-wider">
            {tc('tabMessages')}
          </span>
          {hilos.length > 0 && (
            <span className="text-[10px] text-text-muted">({hilos.length})</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setComponer(true)}
          className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t('btnNewMessage')}
        </button>
      </div>

      {cargando ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-md bg-bg-2/40 animate-pulse" />
          ))}
        </div>
      ) : hilos.length === 0 ? (
        <EmptyState.Rich
          icon={MessagesSquare}
          title={tc('noMessagesTitle')}
          subtitle={tc('noMessagesBody')}
        />
      ) : (
        <div className="divide-y divide-row-sep">
          {hilos.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setAbierto(h.id)}
              className="w-full text-left py-2.5 px-1 hover:bg-white/[0.02] transition-colors flex items-start gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-text-1 text-sm font-medium truncate">{h.subject}</span>
                  {h.priority === 'URGENT' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose/30 bg-rose/10 text-rose">
                      {t('priorityURGENT')}
                    </span>
                  )}
                  {/* El sello no esconde el hilo acá — para eso está esta pantalla. */}
                  {h.sealedAt && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-border bg-bg-2 text-text-muted">
                      <Lock className="w-2.5 h-2.5" /> {tc('msgSealed')}
                    </span>
                  )}
                  {!!h.attachmentCount && h.attachmentCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                      <Paperclip className="w-2.5 h-2.5" /> {h.attachmentCount}
                    </span>
                  )}
                </div>
                <div className="text-text-muted text-[11px] mt-0.5 truncate">
                  {h.lastAuthorName ?? h.createdByName} · {fecha(h.lastEntryAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {abierto && (
        <ThreadViewDialog
          open
          onClose={() => setAbierto(null)}
          threadId={abierto}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onChanged={() => { void cargar(); }}
        />
      )}

      {componer && (
        <ComposeMessageDialog
          open
          onClose={() => setComponer(false)}
          patient={{ id: patientId, name: patientName, caseId }}
          onSent={() => { setComponer(false); void cargar(); }}
        />
      )}
    </div>
  );
}
