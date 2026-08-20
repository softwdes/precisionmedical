'use client';

/**
 * useFileViewer — pide la URL firmada de un archivo y la sirve a `FileViewerDialog`.
 *
 * Los tres lugares que abren archivos (adjuntos de mensajería, resultados de
 * laboratorio, documentos del expediente) hacían el MISMO fetch a endpoints
 * distintos, y dos de ellos con el handler copiado línea por línea. Lo que
 * cambia entre ellos es la ruta —y con ella la acción de auditoría que el
 * server registra—, no la mecánica.
 *
 * Uso:
 *   const viewer = useFileViewer(t('labErrResult'));
 *   ...
 *   <button onClick={() => viewer.open(`/api/admin/lab-orders/item/${id}/result`, name)}>
 *   <FileViewerDialog {...viewer.props} />
 *
 * El endpoint tiene que devolver `{ url, downloadUrl?, name? }`. Si no manda
 * `downloadUrl` se cae a `url`: el botón de descargar navega en vez de bajar
 * (ver FileViewerDialog), pero no queda muerto — importa durante un deploy,
 * cuando el cliente nuevo puede hablar un rato con el server viejo.
 */

import { useCallback, useRef, useState } from 'react';

interface Resuelto {
  fileName: string;
  url: string | null;
  downloadUrl: string | null;
  failed: boolean;
}

export interface FileViewerHandle {
  /** Abre el modal y pide la URL. `fallbackName` se usa hasta que responda. */
  open: (endpoint: string, fallbackName: string) => void;
  /**
   * Abre el modal con una URL ya resuelta, para el llamador que hace su propio
   * fetch porque necesita distinguir errores que este hook no conoce (los
   * documentos del expediente separan "S3 sin configurar" del resto).
   */
  show: (file: { fileName: string; url: string; downloadUrl?: string | null }) => void;
  close: () => void;
  /** Para desparramar en `<FileViewerDialog {...viewer.props} />`. */
  props: {
    open: boolean;
    fileName: string;
    url: string | null;
    downloadUrl: string | null;
    error: string | null;
    onClose: () => void;
  };
}

export function useFileViewer(errorMessage: string): FileViewerHandle {
  const [state, setState] = useState<Resuelto | null>(null);
  // Una respuesta lenta de un archivo que ya se cerró (o de otro que se abrió
  // después) no debe pisar lo que se está mostrando.
  const pedido = useRef(0);

  const close = useCallback(() => {
    pedido.current += 1;
    setState(null);
  }, []);

  const open = useCallback((endpoint: string, fallbackName: string) => {
    pedido.current += 1;
    const mio = pedido.current;
    setState({ fileName: fallbackName, url: null, downloadUrl: null, failed: false });

    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { url?: string; downloadUrl?: string; name?: string }) => {
        if (pedido.current !== mio) return;
        if (!d.url) { setState({ fileName: fallbackName, url: null, downloadUrl: null, failed: true }); return; }
        setState({
          fileName: d.name ?? fallbackName,
          url: d.url,
          downloadUrl: d.downloadUrl ?? d.url,
          failed: false,
        });
      })
      .catch(() => {
        if (pedido.current !== mio) return;
        setState({ fileName: fallbackName, url: null, downloadUrl: null, failed: true });
      });
  }, []);

  const show = useCallback((file: { fileName: string; url: string; downloadUrl?: string | null }) => {
    pedido.current += 1;
    setState({
      fileName: file.fileName,
      url: file.url,
      downloadUrl: file.downloadUrl ?? file.url,
      failed: false,
    });
  }, []);

  return {
    open,
    show,
    close,
    props: {
      open: state !== null,
      fileName: state?.fileName ?? '',
      url: state?.url ?? null,
      downloadUrl: state?.downloadUrl ?? null,
      error: state?.failed ? errorMessage : null,
      onClose: close,
    },
  };
}
