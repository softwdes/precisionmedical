'use client';

/**
 * AttachmentPicker — adjuntos de un mensaje, compartido por el compose y por el
 * composer inline del hilo (responder / reenviar / nota).
 *
 * Se extrajo del ComposeMessageDialog cuando responder también necesitó
 * adjuntar: tener el mismo bloque escrito dos veces garantiza que el próximo
 * arreglo se aplique en uno y se olvide en el otro.
 *
 * Dos orígenes, como en el legacy:
 *  · archivo nuevo → se sube al bucket privado y queda su key
 *  · del expediente → se guarda la REFERENCIA al documento del paciente, no una
 *    copia (por eso pide `patientId`; sin paciente ese botón no aparece)
 *
 * El servidor revalida los dos casos: la key tiene que venir de nuestro upload
 * y el documento tiene que ser de ese paciente.
 */

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Paperclip, FileText, FolderOpen, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui-phoenix/toast';

export interface PendingAttachment {
  /** Key devuelta por el upload (archivo nuevo) */
  path?: string;
  /** Documento existente del expediente del paciente */
  patientDocumentId?: string;
  fileName: string;
  description: string;
}

interface ChartDoc {
  id: string;
  name: string;
  mimeType: string | null;
  createdAt: string;
}

interface Props {
  attachments: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  /** Habilita "adjuntar del expediente". Sin paciente, no aplica. */
  patientId?: string | null;
  disabled?: boolean;
  /**
   * Composer inline del hilo: sin la etiqueta ADJUNTOS y sin el campo de
   * descripción, que ahí es ruido — se responde en dos líneas, no se documenta.
   */
  compact?: boolean;
}

export function AttachmentPicker({
  attachments, onChange, patientId, disabled = false, compact = false,
}: Props) {
  const t = useTranslations('phoenix.messaging');
  const toast = useToast();

  const [uploading, setUploading] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [chartDocs, setChartDocs] = useState<ChartDoc[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const subidos: PendingAttachment[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/messages/attachments', { method: 'POST', body: fd });
        if (!res.ok) { toast.error(t('attachError', { name: file.name })); continue; }
        const data = (await res.json()) as { path: string; fileName: string };
        subidos.push({ path: data.path, fileName: data.fileName, description: '' });
      }
      // Un solo onChange al final: con varios archivos, encadenar setState por
      // archivo pisaba los anteriores (el caller no ve el estado intermedio).
      if (subidos.length > 0) onChange([...attachments, ...subidos]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openChart = async (): Promise<void> => {
    if (!patientId) return;
    setChartOpen(true);
    setChartLoading(true);
    try {
      const res = await fetch(`/api/messages/chart-documents?patientId=${patientId}`);
      if (res.ok) setChartDocs(((await res.json()).documents ?? []) as ChartDoc[]);
    } catch {
      setChartDocs([]);
    } finally {
      setChartLoading(false);
    }
  };

  const labelCls = 'text-[10px] uppercase tracking-wider font-semibold text-text-muted';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        {!compact && <label className={labelCls}>{t('fieldAttachments')}</label>}
        <input ref={fileInputRef} type="file" multiple className="hidden"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => void uploadFiles(e.target.files)} />
        <button type="button" disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-brand hover:bg-brand/10 transition-colors disabled:opacity-40">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
          {uploading ? t('attachUploading') : attachments.length > 0 ? t('attachAnother') : t('attachFile')}
        </button>
        {patientId && (
          <button type="button" disabled={disabled}
            onClick={() => (chartOpen ? setChartOpen(false) : void openChart())}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-40">
            <FolderOpen className="w-3.5 h-3.5" />
            {t('attachFromChart')}
          </button>
        )}
      </div>

      {chartOpen && (
        <div className="rounded-md bg-bg-2/40 max-h-44 overflow-y-auto">
          {chartLoading ? (
            <div className="px-3 py-3 text-text-muted text-xs">{t('loading')}</div>
          ) : chartDocs.length === 0 ? (
            <div className="px-3 py-3 text-text-muted text-xs text-center">{t('chartEmpty')}</div>
          ) : chartDocs
              .filter((d) => !attachments.some((a) => a.patientDocumentId === d.id))
              .map((d) => (
                <button key={d.id} type="button"
                  onClick={() => onChange([...attachments, { patientDocumentId: d.id, fileName: d.name, description: '' }])}
                  className="w-full flex items-center gap-2 px-3 !py-1.5 text-left hover:bg-white/5 transition-colors">
                  <FileText className="w-3.5 h-3.5 text-cyan shrink-0" />
                  <span className="flex-1 text-[12.5px] text-text-1 truncate">{d.name}</span>
                  <span className="shrink-0 text-[10px] text-text-muted">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
        </div>
      )}

      {attachments.map((a, i) => (
        <div key={a.path ?? a.patientDocumentId ?? i}
          className="flex items-center gap-2 rounded-md bg-bg-2/40 px-3 py-2">
          {a.patientDocumentId
            ? <FolderOpen className="w-3.5 h-3.5 text-cyan shrink-0" />
            : <FileText className="w-3.5 h-3.5 text-brand shrink-0" />}
          <span className={`text-sm text-text-1 truncate ${compact ? 'flex-1' : 'max-w-[40%]'}`} title={a.fileName}>
            {a.fileName}
          </span>
          {!compact && (
            <input
              className="flex-1 min-w-[100px] bg-transparent outline-none text-[12.5px] text-text-1 placeholder:text-text-muted/50 px-1 py-0.5"
              placeholder={t('attachDescPlaceholder')}
              value={a.description}
              disabled={disabled}
              onChange={(e) => onChange(attachments.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x))}
            />
          )}
          <button type="button" disabled={disabled}
            onClick={() => onChange(attachments.filter((_, xi) => xi !== i))}
            className="p-1.5 rounded text-text-muted hover:text-rose hover:bg-rose/10 transition-colors shrink-0"
            aria-label={t('attachRemove')}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
