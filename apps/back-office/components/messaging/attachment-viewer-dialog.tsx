'use client';

/**
 * AttachmentViewerDialog — ver el adjunto DENTRO de la app, sin abrir pestaña.
 *
 * Antes se hacía `window.open(urlFirmada)`. Además de sacar al usuario del
 * hilo, dejaba la URL firmada en la barra de direcciones y en el historial del
 * navegador — para PHI es preferible que no ande suelta por ahí.
 *
 * La URL se pide al endpoint de siempre (`/api/messages/attachments/[id]`), así
 * que se sigue auditando quién abrió qué archivo.
 *
 * El tipo se deduce de la EXTENSIÓN: los adjuntos no guardan mime (el que sube
 * al bucket y el que referencia un documento del expediente vienen por caminos
 * distintos), y para pdf/jpg/png el nombre alcanza. Lo que no se sepa mostrar
 * cae en el estado "no se puede previsualizar" con las dos salidas.
 *
 * Las salidas (abrir en pestaña / descargar) están SIEMPRE, no solo en el
 * fallback: si el navegador se niega a embeber el archivo, el usuario no queda
 * atrapado en un modal en blanco.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Paperclip, ExternalLink, Download, FileQuestion } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@precision/ui';

type Kind = 'pdf' | 'image' | 'other';

function kindOf(fileName: string): Kind {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  return 'other';
}

interface Props {
  /** id del MessageAttachment; null = cerrado */
  attachmentId: string | null;
  fileName: string;
  onClose: () => void;
}

export function AttachmentViewerDialog({ attachmentId, fileName, onClose }: Props) {
  const t = useTranslations('phoenix.messaging');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const kind = kindOf(fileName);

  useEffect(() => {
    if (!attachmentId) { setUrl(null); setError(false); return; }
    let cancelled = false;
    setUrl(null);
    setError(false);
    fetch(`/api/messages/attachments/${attachmentId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { url: string }) => { if (!cancelled) setUrl(d.url); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [attachmentId]);

  const salida =
    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-text-2 hover:text-text-1 hover:bg-white/5 transition-colors';

  return (
    <Dialog open={attachmentId !== null} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl p-0 h-[88vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pr-12 sm:pr-14 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 flex-wrap text-text-1 text-base font-semibold">
            <Paperclip className="w-4 h-4 text-brand" />
            <span className="truncate">{fileName}</span>
            {url && (
              <span className="ml-auto flex items-center gap-1">
                <a href={url} target="_blank" rel="noopener noreferrer" className={salida}>
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('viewerOpenTab')}
                </a>
                <a href={url} download={fileName} className={salida}>
                  <Download className="w-3.5 h-3.5" />
                  {t('viewerDownload')}
                </a>
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-bg-2/40">
          {error ? (
            <div className="h-full flex items-center justify-center text-rose text-sm px-6 text-center">
              {t('attachOpenError')}
            </div>
          ) : !url ? (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              {t('loading')}
            </div>
          ) : kind === 'pdf' ? (
            /* El visor nativo del navegador: trae zoom, paginación y búsqueda
               sin que tengamos que montar una librería de PDF. */
            <iframe src={url} title={fileName} className="w-full h-full border-0" />
          ) : kind === 'image' ? (
            <div className="h-full overflow-auto flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={fileName} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-text-muted text-sm">
              <FileQuestion className="w-8 h-8" />
              {t('viewerNoPreview')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
