'use client';

/**
 * FileViewerDialog — ver un archivo DENTRO de la app, sin abrir pestaña.
 *
 * Nació en mensajería y se generalizó: los resultados de laboratorio y los
 * documentos del expediente hacían `window.open(urlFirmada, '_blank')`, que
 * tiene dos problemas. Saca al usuario de donde estaba —y al volver atrás la
 * pantalla ya no es la misma— y deja la URL firmada en la barra de direcciones
 * y en el historial del navegador. Para PHI eso último es lo grave: un
 * resultado de laboratorio quedaba accesible en el historial de la máquina de
 * la clínica por 15 minutos.
 *
 * NO pide la URL. La recibe ya resuelta porque cada llamador tiene su endpoint
 * y, sobre todo, su propia entrada de auditoría (`VIEW_MESSAGE_ATTACHMENT`,
 * `VIEW_LAB_RESULT`, `VIEW_CASE_DOCUMENT`). Si el fetch viviera acá esa
 * distinción se volvería un parámetro y se perdería el rastro de quién abrió
 * qué. Lo que sí es idéntico en los tres casos —y por eso vive acá— es cómo se
 * PINTA el archivo.
 *
 * El tipo se deduce de la EXTENSIÓN: los archivos vienen de buckets distintos y
 * ninguno guarda el mime de forma confiable; para pdf/jpg/png el nombre alcanza.
 * Lo que no se sepa mostrar cae en "no se puede previsualizar" con las salidas.
 *
 * Las salidas (abrir en pestaña / descargar) están SIEMPRE, no solo en el
 * fallback: si el navegador se niega a embeber el archivo, el usuario no queda
 * atrapado en un modal en blanco.
 *
 * `downloadUrl` va aparte de `url` a propósito: tiene que ser una firma con
 * `Content-Disposition: attachment` (en Supabase, la opción `download` de
 * `createSignedUrl`). Con la URL de ver, el atributo `download` del `<a>` se
 * ignora —no aplica a URLs de otro origen— y el click NAVEGA la pestaña al
 * archivo, que es justo lo que este modal existe para evitar.
 */

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
  open: boolean;
  fileName: string;
  /** URL firmada para VER embebido. `null` mientras se pide. */
  url: string | null;
  /**
   * URL firmada con `Content-Disposition: attachment`. Sin ella el botón de
   * descargar navega la pestaña en vez de bajar el archivo.
   */
  downloadUrl?: string | null;
  /** Mensaje de error ya traducido por el llamador. */
  error?: string | null;
  onClose: () => void;
}

export function FileViewerDialog({
  open, fileName, url, downloadUrl, error, onClose,
}: Props): React.ReactElement {
  const t = useTranslations('phoenix.fileViewer');
  const kind = kindOf(fileName);

  const salida =
    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-text-2 hover:text-text-1 hover:bg-white/5 transition-colors';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl p-0 h-[88vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pr-12 sm:pr-14 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 flex-wrap text-text-1 text-base font-semibold">
            <Paperclip className="w-4 h-4 text-brand" />
            <span className="truncate">{fileName}</span>
            {url && (
              <span className="ml-auto flex items-center gap-1">
                <a href={url} target="_blank" rel="noopener noreferrer" className={salida}>
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('openTab')}
                </a>
                <a href={downloadUrl ?? url} download={fileName} className={salida}>
                  <Download className="w-3.5 h-3.5" />
                  {t('download')}
                </a>
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-bg-2/40">
          {error ? (
            <div className="h-full flex items-center justify-center text-rose text-sm px-6 text-center">
              {error}
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
              {t('noPreview')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
