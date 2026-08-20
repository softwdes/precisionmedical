'use client';

/**
 * AttachmentViewerDialog — ver el adjunto de un hilo dentro de la app.
 *
 * Solo resuelve la URL y delega el dibujo a `FileViewerDialog`, el primitivo
 * compartido con los resultados de laboratorio y los documentos del expediente
 * (ver el comentario de ese archivo: ahí está el por qué de no usar
 * `window.open` y el por qué de las dos firmas).
 *
 * El fetch se queda acá, no en el primitivo, porque este endpoint audita
 * `VIEW_MESSAGE_ATTACHMENT` — quién abrió qué archivo de qué hilo. Cada
 * llamador tiene su propia acción de auditoría y por eso cada uno pide su URL.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileViewerDialog } from '@/components/ui-phoenix';

interface Props {
  /** id del MessageAttachment; null = cerrado */
  attachmentId: string | null;
  fileName: string;
  onClose: () => void;
}

export function AttachmentViewerDialog({ attachmentId, fileName, onClose }: Props) {
  const t = useTranslations('phoenix.messaging');
  const [url, setUrl] = useState<string | null>(null);
  // Firma aparte, con `Content-Disposition: attachment`.
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!attachmentId) { setUrl(null); setDownloadUrl(null); setError(false); return; }
    let cancelled = false;
    setUrl(null);
    setDownloadUrl(null);
    setError(false);
    fetch(`/api/messages/attachments/${attachmentId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { url: string; downloadUrl?: string }) => {
        if (cancelled) return;
        setUrl(d.url);
        setDownloadUrl(d.downloadUrl ?? d.url);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [attachmentId]);

  return (
    <FileViewerDialog
      open={attachmentId !== null}
      fileName={fileName}
      url={url}
      downloadUrl={downloadUrl}
      error={error ? t('attachOpenError') : null}
      onClose={onClose}
    />
  );
}
