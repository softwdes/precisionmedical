'use client';

/**
 * Fotos de identificación del paciente — selfie, tarjeta de seguro (frente y
 * dorso) y licencia de conducir.
 *
 * Vivía adentro de `patients-client.tsx` (3.638 líneas) y recibía un
 * `PatientRow`, así que la ÚNICA forma de abrirlo era el menú ⋮ de una fila de
 * la lista de pacientes. Eso lo volvía imposible de encontrar desde donde el
 * staff se da cuenta de que falta la foto —el detalle del caso y la ficha del
 * paciente—, y los números lo confirman: de 2.992 casos solo 7 tenían selfie.
 *
 * Al salir a su propio archivo recibe ids sueltos en vez de la fila entera, y lo
 * puede abrir cualquier pantalla. El disparador natural es el propio avatar
 * (ver `PersonAvatar` con `onEditPhoto`): el lugar donde falta la foto es el
 * lugar donde se sube.
 *
 * ⚠️ La foto se guarda en `Case.consentsData.photos`, no en el paciente —
 * `Patient` no tiene columna de foto. El endpoint la escribe sobre el caso MÁS
 * RECIENTE del paciente, así que un paciente con dos casos muestra la foto del
 * último. Es una decisión de modelo pendiente, no de esta pantalla.
 */

import { Fragment, useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Camera, Download, Eye, FileText, FolderOpen, RefreshCw, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, Button } from '@precision/ui';
import { FileViewerDialog, useFileViewer } from '@/components/ui-phoenix';
import { localeApp } from '@/lib/fechas';
import { nombreDeFoto, urlParaDescargar } from '@/lib/descarga-archivo';

export type PhotoKey = 'selfie' | 'insuranceCardFront' | 'insuranceCardBack' | 'dlFront';

/** Las fotos guardadas en el `consentsData` de un caso. */
export function fotosDelCaso(consentsData: unknown): Record<string, string> {
  return ((consentsData ?? {}) as Record<string, unknown>).photos as Record<string, string> ?? {};
}

/**
 * Las que están en la PAPELERA de ese caso.
 *
 * Eliminar una foto ya no la borra: la mueve acá y deja el archivo en el bucket
 * (Erick, 2026-09-13). Se lee del mismo JSON que las vigentes, así que quien ya
 * llamaba a `fotosDelCaso` tiene esto a un renglón de distancia.
 */
export interface FotoEnPapelera { url: string; at: string; by: string | null }

export function fotosEliminadasDelCaso(consentsData: unknown): Record<string, FotoEnPapelera> {
  const v = ((consentsData ?? {}) as Record<string, unknown>).photosEliminadas;
  return (v as Record<string, FotoEnPapelera>) ?? {};
}

// ── In-App Camera (getUserMedia) ────────────────────────────────────────────
function InAppCamera({
  facingMode, guideType, onCapture, onCancel, onPermissionError,
}: {
  facingMode: 'user' | 'environment';
  guideType:  'face' | 'document';
  onCapture:        (f: File) => void;
  onCancel:         () => void;
  onPermissionError: () => void;
}) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    }).then(stream => {
      if (!active) { stream.getTracks().forEach(tr => tr.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(() => { if (active) setError('Sin acceso a la cámara.'); });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(tr => tr.stop());
      streamRef.current = null;
    };
  }, [facingMode]);

  const handleCapture = () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return;
    const w = video.videoWidth || 1280; const h = video.videoHeight || 720;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(blob => {
      if (!blob) return;
      streamRef.current?.getTracks().forEach(tr => tr.stop());
      onCapture(new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  if (error) return (
    <div className="rounded-xl border border-rose/25 bg-black/80 p-5 text-center space-y-3">
      <p className="text-2xl">📷</p>
      <p className="text-[12px] text-text-muted leading-relaxed">{error}</p>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg border border-border text-[12px] text-text-muted hover:bg-bg-2 transition-colors">Cancelar</button>
        <button onClick={onPermissionError} className="flex-[2] py-2 rounded-lg border border-brand/40 bg-brand/10 text-[12px] text-brand-text font-semibold hover:bg-brand/20 transition-colors">Usar archivo</button>
      </div>
    </div>
  );

  const isOval = guideType === 'face';
  return (
    <div className="rounded-xl overflow-hidden border border-brand/30 bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-black/70">
        <button onClick={onCancel} className="text-[12px] text-text-muted hover:text-text-2 transition-colors">← Cancelar</button>
        <span className="text-[10px] font-bold tracking-widest text-brand-text">{isOval ? 'SELFIE' : 'DOCUMENTO'}</span>
        <div className="w-10" />
      </div>
      {/* Video */}
      <div className={`relative bg-[#111] ${isOval ? 'px-8 pt-4 pb-2' : 'px-3 py-2'}`}>
        {isOval ? (
          <div className="mx-auto relative" style={{ width: '100%', maxWidth: 200, aspectRatio: '3/4', borderRadius: '50%', overflow: 'hidden', border: '2.5px solid rgba(99,102,241,0.65)' }}>
            <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setReady(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: 'block' }} />
            {!ready && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[11px] text-text-muted">Iniciando cámara…</div>}
          </div>
        ) : (
          <div className="relative w-full rounded-lg overflow-hidden bg-[#111]" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} autoPlay playsInline muted onCanPlay={() => setReady(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {/* Corner markers */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute" style={{ inset: '14%' }}>
                {[['top-0 left-0 border-t border-l'],['top-0 right-0 border-t border-r'],['bottom-0 left-0 border-b border-l'],['bottom-0 right-0 border-b border-r']].map(([cls], i) => (
                  <div key={i} className={`absolute w-5 h-5 border-brand/80 border-2 ${cls}`} />
                ))}
              </div>
            </div>
            {!ready && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[11px] text-text-muted">Iniciando cámara…</div>}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {/* Shutter */}
      <div className="flex flex-col items-center gap-3 py-5 bg-black/80">
        <p className="text-[11px] text-text-muted">{isOval ? 'Centra tu rostro en el óvalo' : 'Alinea el documento dentro del marco'}</p>
        <button onClick={handleCapture} disabled={!ready} aria-label="Capturar"
          className="w-16 h-16 rounded-full border-[3px] border-white/70 flex items-center justify-center disabled:opacity-40 hover:scale-105 transition-transform">
          <div className={`w-12 h-12 rounded-full transition-colors ${ready ? 'bg-white' : 'bg-white/30'}`} />
        </button>
        <p className="text-[10px] text-white/25">Capturar</p>
      </div>
    </div>
  );
}

// ── Archivos personales dialog ─────────────────────────────────────────────

// Resize + re-encode image so upload stays well under Vercel's 4.5MB body limit.
// maxSideKB is the target max file size in KB.
function compressImage(file: File, maxSideKB = 1400): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const MAX_SIDE = 1600; // px — enough for ID documents at typical DPI
      let { width, height } = img;
      if (width > MAX_SIDE || height > MAX_SIDE) {
        if (width > height) { height = Math.round((height / width) * MAX_SIDE); width = MAX_SIDE; }
        else { width = Math.round((width / height) * MAX_SIDE); height = MAX_SIDE; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no ctx')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      // Try quality 0.85 first; if still too large, drop to 0.70
      canvas.toBlob(blob1 => {
        if (!blob1) { reject(new Error('toBlob failed')); return; }
        if (blob1.size <= maxSideKB * 1024) {
          resolve(new File([blob1], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
          return;
        }
        canvas.toBlob(blob2 => {
          const final = blob2 ?? blob1;
          resolve(new File([final], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.70);
      }, 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = objUrl;
  });
}

export interface ArchivosDialogProps {
  patientId:  string;
  firstName:  string;
  lastName:   string;
  /**
   * Fotos que ya tiene el caso. Quien abre el diálogo las trae de donde las
   * tenga a mano (`consentsData` del caso, o la fila de la lista) — usar
   * `fotosDelCaso()` para sacarlas del JSON.
   */
  fotos?: Record<string, string> | null;
  /**
   * Las que están en la papelera — con `fotosEliminadasDelCaso()`. Opcional: si
   * no viene, el recuadro vacío no ofrece recuperar, que es el comportamiento
   * de antes. Nadie ve un botón que no puede funcionar.
   */
  fotosEliminadas?: Record<string, FotoEnPapelera> | null;
  /**
   * `false` cuando el paciente no tiene ningún caso: sin caso no hay dónde
   * guardar la foto, así que los slots quedan deshabilitados con su aviso.
   * Se muestra igual, no se esconde — el staff tiene que ver por qué no puede.
   */
  tieneCaso?: boolean;
  /**
   * Portal médico: las fotos se VEN, no se cargan.
   *
   * Es la decisión que ya tomaba la ficha del paciente («el doctor mira, no
   * carga», `patient-detail-client.tsx`) y que la lista contradecía: abría este
   * mismo diálogo con los botones vivos, así que la misma acción estaba
   * permitida o prohibida según desde dónde se llegara. Confirmado por Erick el
   * 2026-09-11; la API lo hace cumplir aunque alguien llame el endpoint a mano.
   */
  soloLectura?: boolean;
  onClose: () => void;
}

/**
 * ── Los archivos del paciente ────────────────────────────────────────────────
 *
 * Esta sección existía como maqueta: un encabezado NAME / SIZE / LAST MODIFIED
 * y un "Empty directory" escrito a mano, con el comentario «sección futura» y
 * **sin un solo fetch**. O sea que decía "carpeta vacía" para todos los
 * pacientes, siempre, incluso para uno con cuarenta documentos cargados (Erick
 * la encontró el 2026-09-08 buscando el intake).
 *
 * Ahora trae de verdad TODO el papelerío de la persona, junto:
 *
 *  · **una fila de intake por caso**, que apunta al PDF que se arma al vuelo — no
 *    se guarda como archivo, porque un intake congelado envejece y además se
 *    podría borrar (mismo criterio que el tab Documentos del caso);
 *  · **los archivos de todos sus casos** en una lista plana, con la pastilla del
 *    caso en cada fila.
 *
 * Sin carpetas y sin subir: organizar y cargar es trabajo del expediente del
 * caso, que es donde vive el explorador. Acá la pregunta es otra —"¿qué papeles
 * tiene esta persona?"— y navegar tres niveles de carpetas por cada uno de tres
 * casos la responde peor.
 */
function ArchivosDelPaciente({ patientId, onFotosPaciente }: {
  patientId: string;
  /**
   * Las fotos de identidad que la persona trae del v2, ya firmadas.
   *
   * Viajan hacia ARRIBA en vez de pedirlas de nuevo desde el diálogo porque
   * salen de la misma respuesta que esta lista: dos componentes pidiendo el
   * mismo endpoint al abrir es una llamada de más y, peor, dos verdades que se
   * pueden desincronizar.
   *
   * `sinLink` son los recuadros que TIENEN archivo y se quedaron sin URL. Sin
   * ese dato el recuadro vacío miente: dice "falta la foto" cuando la foto
   * está guardada y lo que falló fue pedirle el link a Storage.
   */
  onFotosPaciente?: (r: { fotos: Record<string, string>; sinLink: string[] }) => void;
}) {
  const t = useTranslations('phoenix.patients');
  const tc = useTranslations('phoenix.common');
  const viewer = useFileViewer(t('archivosDownloadError'));

  const [casos, setCasos] = useState<Array<{ id: string; caseCode: string }>>([]);
  const [docs, setDocs] = useState<Array<{
    id: string; name: string; mimeType: string | null; size: number | null;
    createdAt: string; caseId: string | null; caseCode: string | null;
  }>>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError(null);
      try {
        // `no-store`: el diálogo se abre justo después de subir algo desde el
        // caso, y el heurístico del navegador servía la lista vieja.
        const res = await fetch(`/api/admin/patients/${patientId}/documents`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!vivo) return;
        setCasos(data.casos ?? []);
        setDocs(data.documentos ?? []);
        onFotosPaciente?.({
          fotos: data.fotosPaciente ?? {},
          sinLink: data.fotosSinLink ?? [],
        });
        // El motivo exacto solo tiene sentido para quien mira la consola; en
        // pantalla alcanza con "no se pudo cargar". Va igual porque sin esto la
        // única forma de diagnosticarlo es entrar al servidor.
        if (data.fotosError) console.error('[archivos] Storage no dio la URL de las fotos:', data.fotosError);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'Error');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
    // `onFotosPaciente` queda FUERA de las dependencias a propósito: si alguien
    // la pasa como arrow inline, incluirla vuelve a pedir el endpoint en cada
    // render del padre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  /**
   * Abre un archivo del expediente en el visor, con su URL firmada.
   *
   * Va por la ruta del PACIENTE y no por la del caso porque acá se listan las
   * dos cosas: los papeles de sus casos y los suyos sin caso (las fotos de
   * identidad del v2). Antes esto arrancaba con `if (!doc.caseId) return`, o
   * sea: los archivos sin caso se listaban y el clic no hacía nada.
   */
  async function abrir(doc: { id: string; name: string; caseId: string | null }) {
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/documents/${doc.id}/download`);
      const data = await res.json();
      if (!res.ok) { alert(data.message ?? t('archivosDownloadError')); return; }
      viewer.show({ fileName: data.name ?? doc.name, url: data.url, downloadUrl: data.downloadUrl });
    } catch {
      alert(t('archivosDownloadError'));
    }
  }

  /**
   * ─── Los archivos, AGRUPADOS por qué son ───────────────────────────────────
   *
   * La lista sigue siendo PLANA —una sola tabla, sin navegar— y eso no cambia:
   * acá la pregunta es "¿qué papeles tiene esta persona?" y meterla en carpetas
   * la responde peor (ver el comentario de arriba). Lo que faltaba no era
   * jerarquía, era orden: el staff abría esto buscando la licencia y le caían
   * cuarenta filas en una sola corrida, con la licencia en el medio.
   *
   * Los grupos son un encabezado y nada más. No existen en la base: no hay
   * carpetas nuevas que mantener ni filas que se puedan mover o borrar por
   * error. Si mañana cambia el criterio, cambia acá y se acabó.
   *
   * Un grupo vacío no se dibuja. Con 3.197 fotos de identidad y 11 archivos
   * sueltos de persona en todo el sistema (medido 2026-09-17), "Del paciente"
   * va a estar vacío casi siempre y no tiene por qué ocupar una línea.
   */
  const SLOTS_DE_IDENTIDAD = /^(patient_photo|dl_front|dl_back|id_card_front|id_card_back)\./i;

  const grupos = useMemo(() => {
    const identificacion = docs.filter(d => !d.caseId && SLOTS_DE_IDENTIDAD.test(d.name));
    const dePersona      = docs.filter(d => !d.caseId && !SLOTS_DE_IDENTIDAD.test(d.name));
    const deCasos        = docs.filter(d => d.caseId);
    return [
      { clave: 'identificacion', titulo: t('archivosGrupoIdentificacion'), filas: identificacion },
      { clave: 'persona',        titulo: t('archivosGrupoPersona'),        filas: dePersona },
      { clave: 'casos',          titulo: t('archivosGrupoCasos'),          filas: deCasos },
    ].filter(g => g.filas.length > 0);
  }, [docs, t]);

  const vacio = !cargando && !error && casos.length === 0 && docs.length === 0;

  return (
    <div>
      <FileViewerDialog {...viewer.props} />
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-2">
          <FolderOpen className="w-3.5 h-3.5" /> {t('archivosPersonalFiles')}
        </div>
        {!cargando && !vacio && (
          <span className="text-[10px] text-text-muted tabular-nums">
            {t('archivosCuenta', { intakes: casos.length, archivos: docs.length })}
          </span>
        )}
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-bg-2 border-b border-border px-3 py-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('archivosColName')}</span>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('archivosColSize')}</span>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right">{t('archivosColDate')}</span>
        </div>

        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-10 text-text-muted text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> {tc('loading')}
          </div>
        ) : error ? (
          <div className="m-3 rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose">{error}</div>
        ) : vacio ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted">
            <FolderOpen className="w-10 h-10 opacity-15" />
            <p className="text-sm font-medium">{t('archivosEmptyDir')}</p>
            <p className="text-[11px]">{t('archivosSinCasos')}</p>
          </div>
        ) : (
          <div className="max-h-[260px] overflow-y-auto scroll-thin divide-y divide-row-sep">
            {/* Un intake por caso, arriba y en cyan: es del sistema, no lo subió
                nadie, y no se puede borrar. Lleva su propio encabezado porque es
                lo único generado al vuelo — el resto son archivos de verdad. */}
            {casos.length > 0 && (
              <div className="px-3 py-1.5 bg-bg-2/40 text-[10px] uppercase tracking-wider font-semibold text-text-muted">
                {t('archivosGrupoAdmision')}
              </div>
            )}
            {casos.map((c) => (
              <button
                key={`intake-${c.id}`}
                type="button"
                onClick={() => viewer.show({
                  fileName:    `${t('archivosIntakeName')} · ${c.caseCode}.pdf`,
                  url:         `/api/admin/cases/${c.id}/pdf`,
                  downloadUrl: `/api/admin/cases/${c.id}/pdf?download=1`,
                })}
                className="w-full text-left grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 bg-cyan/[0.03] hover:bg-cyan/[0.07] transition-colors group"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-cyan shrink-0" />
                  <span className="truncate text-[12.5px] text-text-1 group-hover:text-cyan transition-colors">
                    {t('archivosIntakeName')}
                  </span>
                  <span className="text-[9.5px] font-mono text-text-muted shrink-0">{c.caseCode}</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-cyan border border-cyan/30 rounded px-1.5 py-px shrink-0">
                    {t('archivosBadgeSistema')}
                  </span>
                </span>
                <span className="text-[11px] text-text-muted tabular-nums">—</span>
                <span className="text-[11px] text-text-muted text-right">{t('archivosSiempreAlDia')}</span>
              </button>
            ))}

            {grupos.map((g) => (
              <Fragment key={g.clave}>
                <div className="px-3 py-1.5 bg-bg-2/40 text-[10px] uppercase tracking-wider font-semibold text-text-muted flex items-center gap-2">
                  {g.titulo}
                  <span className="tabular-nums font-normal opacity-70">{g.filas.length}</span>
                </div>
                {g.filas.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => abrir(d)}
                    className="w-full text-left grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 hover:bg-white/[0.02] transition-colors group"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <FolderOpen className="w-3.5 h-3.5 text-text-muted shrink-0" />
                      <span className="truncate text-[12.5px] text-text-1 group-hover:text-brand-text transition-colors" title={d.name}>
                        {d.name}
                      </span>
                      {d.caseCode && (
                        <span className="text-[9.5px] font-mono text-text-muted shrink-0">{d.caseCode}</span>
                      )}
                    </span>
                    <span className="text-[11px] text-text-muted tabular-nums">{formatBytes(d.size)}</span>
                    <span className="text-[11px] text-text-muted text-right tabular-nums">
                      {new Date(d.createdAt).toLocaleDateString(localeApp(), { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </button>
                ))}
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Bytes legibles. Igual que en el tab Documentos del caso. */
function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArchivosDialog({
  patientId, firstName, lastName, fotos, fotosEliminadas, tieneCaso = true,
  soloLectura = false, onClose,
}: ArchivosDialogProps) {
  const t      = useTranslations('phoenix.patients');
  /** "Descargar" ya existe en común — el mismo texto que el resto del sistema. */
  const tc     = useTranslations('phoenix.common');
  const router = useRouter();
  /**
   * El mismo visor que usan los documentos del expediente, acá para las cuatro
   * fotos de identidad: no se podían ni abrir ni guardar (Erick, 2026-09-15).
   * Se reusa el primitivo y no una pestaña nueva por lo que dice su propio
   * encabezado: `window.open` deja la URL del documento en el historial del
   * navegador de la máquina de la clínica.
   */
  const viewer = useFileViewer(t('archivosDownloadError'));

  const initialPhotos = fotos ?? {};
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>(initialPhotos);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]   = useState<Record<string, boolean>>({});
  /**
   * Qué recuadros tienen algo en la papelera.
   *
   * Arranca de lo que vino del caso y se actualiza al borrar y al recuperar,
   * sin recargar: el que acaba de borrar por error tiene que ver el "recuperar"
   * al instante, no después de cerrar y abrir el diálogo.
   */
  const [recuperables, setRecuperables] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(fotosEliminadas ?? {}).map((k) => [k, true])));
  const [errors, setErrors]       = useState<Record<string, string>>({});

  /**
   * Fotos que la PERSONA trae del v2 (`patients/<id>/personal/…`), servidas con
   * URL firmada desde el bucket privado. Las llena la lista de archivos, que ya
   * pide ese endpoint.
   *
   * Son el respaldo, no lo principal: si el caso tiene su propia foto, gana esa
   * —es la más nueva y la que el staff cargó para ESTE expediente—. Y como no
   * viven en `consentsData`, no se pueden borrar desde acá: el botón de eliminar
   * solo aparece sobre las del caso, que es lo único que el endpoint sabe
   * borrar. Sacar una foto nueva sí funciona y pasa a tener prioridad sola.
   */
  const [fotosPaciente, setFotosPaciente] = useState<Record<string, string>>({});

  /**
   * Recuadros que tienen archivo guardado y quedaron sin URL.
   *
   * Es la diferencia entre "no hay foto" y "hay foto y no la pude traer", que
   * para el que mira la pantalla es todo: en el primer caso saca una foto, en
   * el segundo avisa que algo está roto. Antes las dos cosas se veían igual.
   */
  const [fotosSinLink, setFotosSinLink] = useState<string[]>([]);

  /** Recuadros cuya imagen no cargó — ver el comentario en el render. */
  const [fallidas, setFallidas] = useState<Record<string, boolean>>({});

  const PHOTO_SLOTS: { key: PhotoKey; label: string; capture: 'user' | 'environment' }[] = [
    { key: 'selfie',             label: t('photoSlotSelfie'),       capture: 'user' },
    { key: 'insuranceCardFront', label: t('photoSlotInsCardFront'), capture: 'environment' },
    { key: 'insuranceCardBack',  label: t('photoSlotInsCardBack'),  capture: 'environment' },
    { key: 'dlFront',            label: t('photoSlotDlFront'),      capture: 'environment' },
  ];

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [cameraSlot, setCameraSlot] = useState<PhotoKey | null>(null);

  async function handleFile(photoKey: PhotoKey, file: File) {
    setErrors(p => ({ ...p, [photoKey]: '' }));
    // Si el recuadro había quedado marcado como "no cargó", la foto nueva tiene
    // que poder mostrarse: sin esto el preview se suprimía y parecía que la
    // subida no había funcionado.
    setFallidas(f => ({ ...f, [photoKey]: false }));

    /**
     * El PDF NO pasa por la compresión — se sube tal cual.
     *
     * `compressImage` dibuja el archivo en un `<canvas>`, y un PDF no se dibuja
     * ahí: el `img.onerror` rechaza y caíamos al `catch`, que sube el original.
     * O sea que "funcionaba" por accidente, dando una vuelta entera y un error
     * silencioso en cada subida. Mejor no pedírselo.
     *
     * Por eso también el PDF tiene un techo más chico del lado del servidor
     * (`MAX_BYTES_PDF`): es el único archivo que viaja sin achicar.
     */
    const esPdf = file.type === 'application/pdf';

    // Compress/resize to ≤1.5MB before upload (Vercel body limit is 4.5MB,
    // multipart overhead + JPEG at 1920×1080 can exceed it)
    let uploadFile = file;
    if (!esPdf) {
      try {
        uploadFile = await compressImage(file, 1400);
      } catch {
        // If compression fails, attempt upload with original (may fail on large files)
      }
    }

    // Optimistic preview
    const blobUrl = URL.createObjectURL(uploadFile);
    setPhotoUrls(p => ({ ...p, [photoKey]: blobUrl }));
    setUploading(p => ({ ...p, [photoKey]: true }));

    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('photoType', photoKey);
      const res  = await fetch(`/api/admin/patients/${patientId}/upload-photo`, { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json.url) {
        setPhotoUrls(p => {
          if (p[photoKey] === blobUrl) URL.revokeObjectURL(blobUrl);
          return { ...p, [photoKey]: json.url };
        });
        router.refresh();
      } else {
        setPhotoUrls(p => ({ ...p, [photoKey]: initialPhotos[photoKey] ?? '' }));
        const detail = (json as { error?: string }).error ?? '';
        setErrors(p => ({ ...p, [photoKey]: detail === 'NO_CASE_FOUND' ? 'Paciente sin caso activo.' : 'Error al subir. Intenta de nuevo.' }));
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      setPhotoUrls(p => ({ ...p, [photoKey]: initialPhotos[photoKey] ?? '' }));
      setErrors(p => ({ ...p, [photoKey]: 'Error de conexión.' }));
      URL.revokeObjectURL(blobUrl);
    } finally {
      setUploading(p => ({ ...p, [photoKey]: false }));
    }
  }

  async function handleDelete(photoKey: PhotoKey) {
    /*
     * Preguntar antes. Este botón borraba de un clic y sin aviso.
     *
     * Ahora además la foto va a la PAPELERA en vez de borrarse del bucket, así
     * que el aviso dice que se puede recuperar — y es verdad (Erick,
     * 2026-09-13). La confirmación se queda igual: recuperable no es lo mismo
     * que gratis, y el recuadro queda vacío delante del paciente.
     *
     * Se usa `window.confirm` y no el `ConfirmDialog` del sistema a propósito:
     * este diálogo ya está dentro de otro modal, y en el tab Documentos se vio
     * que apilar dos capas de overlay deja el segundo por debajo. Acá el cartel
     * del navegador siempre queda arriba.
     */
    if (!window.confirm(t('photoDeleteConfirm'))) return;
    setErrors(p => ({ ...p, [photoKey]: '' }));
    setDeleting(p => ({ ...p, [photoKey]: true }));
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/upload-photo?photoType=${photoKey}`, { method: 'DELETE' });
      if (res.ok) {
        setPhotoUrls(p => { const n = { ...p }; delete n[photoKey]; return n; });
        setRecuperables(p => ({ ...p, [photoKey]: true }));
        router.refresh();
      } else {
        setErrors(p => ({ ...p, [photoKey]: 'Error al eliminar.' }));
      }
    } catch {
      setErrors(p => ({ ...p, [photoKey]: 'Error de conexión.' }));
    } finally {
      setDeleting(p => ({ ...p, [photoKey]: false }));
    }
  }

  /** Traer la foto de vuelta de la papelera. Sin confirmación: no destruye nada. */
  async function handleRestore(photoKey: PhotoKey) {
    setErrors(p => ({ ...p, [photoKey]: '' }));
    setDeleting(p => ({ ...p, [photoKey]: true }));
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/upload-photo?photoType=${photoKey}`, { method: 'PATCH' });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) {
        setPhotoUrls(p => ({ ...p, [photoKey]: d.url as string }));
        setRecuperables(p => { const n = { ...p }; delete n[photoKey]; return n; });
        router.refresh();
      } else {
        setErrors(p => ({ ...p, [photoKey]: t('photoRestoreError') }));
      }
    } catch {
      setErrors(p => ({ ...p, [photoKey]: 'Error de conexión.' }));
    } finally {
      setDeleting(p => ({ ...p, [photoKey]: false }));
    }
  }

  /**
   * Abrir una foto en grande, con las salidas de ver en pestaña y descargar.
   *
   * La URL no se pide al servidor: la pantalla YA la tiene. La de descarga sale
   * de agregarle el parámetro `download` (ver `lib/descarga-archivo`), que es
   * lo que hace que el archivo BAJE en vez de que el click navegue la pestaña.
   *
   * El nombre lleva el del paciente porque estos cuatro archivos terminan en la
   * carpeta de Descargas junto a los de todos los demás.
   */
  function abrirFoto(etiqueta: string, url: string) {
    const nombre = nombreDeFoto(lastName, firstName, etiqueta, url);
    viewer.show({ fileName: nombre, url, downloadUrl: urlParaDescargar(url, nombre) });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl p-0">
        <FileViewerDialog {...viewer.props} />
        <DialogTitle className="sr-only">{firstName} {lastName} — {t('archivosTitle')}</DialogTitle>
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-1">{firstName} {lastName}</h2>
          <p className="text-[12px] text-text-muted mt-0.5">{t('archivosSubtitle')}</p>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">
          {soloLectura ? (
            <div className="rounded-md border border-cyan/30 bg-cyan/10 px-4 py-3 text-[12px] text-cyan">
              {t('photosStaffOnly')}
            </div>
          ) : !tieneCaso && (
            <div className="rounded-md border border-amber/30 bg-amber/10 px-4 py-3 text-[12px] text-amber">
              {t('archivosNoCases')}
            </div>
          )}

          {/* In-app camera overlay */}
          {cameraSlot && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
              <div className="w-full max-w-sm">
                <InAppCamera
                  facingMode={PHOTO_SLOTS.find(s => s.key === cameraSlot)?.capture ?? 'environment'}
                  guideType={cameraSlot === 'selfie' ? 'face' : 'document'}
                  onCapture={file => { handleFile(cameraSlot, file); setCameraSlot(null); }}
                  onCancel={() => setCameraSlot(null)}
                  onPermissionError={() => { setCameraSlot(null); fileRefs.current[cameraSlot]?.click(); }}
                />
              </div>
            </div>
          )}

          {/* Fotos de identificación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PHOTO_SLOTS.map(({ key, label }) => {
              // La del caso gana; la del v2 (de la persona) es el respaldo.
              const delCaso   = photoUrls[key] ?? null;
              const candidata = delCaso ?? fotosPaciente[key] ?? null;
              // Si la imagen no carga —el archivo no llegó a Storage, o la
              // firma venció con el diálogo abierto— se muestra el recuadro
              // vacío, que invita a sacar la foto. Un ícono de imagen rota no
              // le dice nada a nadie y encima parece un error de la pantalla.
              const url       = fallidas[key] ? null : candidata;
              const esDelV2   = !delCaso && !!fotosPaciente[key];
              /**
               * El recuadro está vacío pero la foto EXISTE: o el servidor no
               * consiguió el link, o el navegador no pudo bajar la imagen. Sin
               * este aviso el recuadro dice "sacá una foto" encima de una foto
               * que ya está guardada, y el que mira sube una duplicada.
               */
              const noCargo   = !url && (fotosSinLink.includes(key) || !!fallidas[key]);
              const isLoading = uploading[key] ?? false;
              const isDel     = deleting[key] ?? false;
              const err       = errors[key] ?? '';

              return (
                <div key={key} className="rounded-lg border border-border bg-bg-2/40 overflow-hidden flex flex-col">
                  {/* Hidden file input (Archivo button) */}
                  <input
                    ref={el => { fileRefs.current[key] = el; }}
                    type="file"
                    /* También PDF: la licencia y la tarjeta del seguro llegan
                       escaneadas muchas veces, y ese es el único archivo que
                       existe (pedido de la clínica, 21-sep-2026). La cámara
                       sigue dando JPEG; esto es para el botón "Archivo". */
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(key, f); e.target.value = ''; }}
                  />

                  <p className="px-3 pt-3 pb-1 text-[11px] font-semibold text-cyan">{label}</p>

                  {/* Preview area */}
                  <div className="group flex-1 mx-3 mb-1 rounded-md bg-bg-2 border border-border/60 overflow-hidden flex items-center justify-center min-h-[140px] relative">
                    {isLoading || isDel ? (
                      <RefreshCw className="w-6 h-6 animate-spin text-text-muted opacity-50" />
                    ) : url ? (
                      <>
                        {/* La FOTO ENTERA abre el visor. Va así, y no como un
                            botón chico dentro del overlay, porque recepción y
                            los providers trabajan en iPad: un control que solo
                            aparece al pasar el mouse, en una pantalla táctil no
                            existe. Está también en modo solo lectura — el
                            provider mira estas fotos, que es justamente lo que
                            dice el aviso de arriba. */}
                        <button
                          type="button"
                          onClick={() => abrirFoto(label, url)}
                          title={t('photoView')}
                          className="absolute inset-0 w-full h-full cursor-zoom-in"
                        >
                          {/* Un PDF no se puede pintar en un `<img>`: el
                              recuadro quedaba en blanco y parecía que la subida
                              había fallado. Se muestra la ficha del archivo, y
                              el clic sigue abriendo el visor igual que una
                              foto — ahí el PDF sí se ve. */}
                          {/\.pdf(\?|$)/i.test(url) ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-bg-2">
                              <FileText className="w-7 h-7 text-rose/70" />
                              <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">PDF</span>
                            </div>
                          ) : (
                            <img
                              src={url}
                              alt={label}
                              className="w-full h-full object-cover"
                              onError={() => setFallidas(f => ({ ...f, [key]: true }))}
                            />
                          )}
                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                            <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/15 rounded px-2 py-1">
                              <Eye className="w-3.5 h-3.5 text-white" />
                              <span className="text-[10px] text-white font-medium">{t('photoView')}</span>
                            </span>
                          </span>
                        </button>
                        {/* Las acciones quedan ENCIMA de la foto. El contenedor
                            no recibe clicks (`pointer-events-none`): sin eso
                            taparía la foto entera y no se podría abrir. Cada
                            botón los vuelve a habilitar para sí mismo. */}
                        {/* `flex-wrap` porque ahora son TRES acciones: medido en
                            un teléfono de 375 px, la barra ocupa 266 px dentro
                            de una tarjeta de 268 — entra por dos píxeles. Sin
                            esto, una palabra más larga en cualquier idioma la
                            desborda, y es la regla de la guía para 3+ items. */}
                        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-1.5 p-1.5 pointer-events-none">
                          {/**
                            * Bajar la foto SIN abrirla.
                            *
                            * Ya se podía desde el visor, pero eso son dos pasos
                            * para algo que el mostrador hace en serie: abrir,
                            * bajar, cerrar, y otra vez con la siguiente. Acá
                            * baja de una (pedido de la clínica, 21-sep-2026).
                            *
                            * Un `<a>` y no un botón: el navegador ya sabe
                            * descargar. Y con `stopPropagation` porque está
                            * dentro del área que abre el visor — sin eso, bajar
                            * la foto también la abría.
                            *
                            * No lleva `download`: ese atributo se IGNORA entre
                            * orígenes y estas URLs son de Storage. El nombre lo
                            * pone `urlParaDescargar` por query, que es lo que
                            * hace que Storage conteste con `attachment`.
                            *
                            * Va FUERA de `!soloLectura`: bajar es leer, y el
                            * provider que puede abrirla ya puede bajarla desde
                            * el visor. Lo que no le toca es reemplazar y borrar.
                            */}
                          {/* Solo la flecha, sin la palabra: es el ícono que
                              todo el mundo reconoce (Erick, 21-sep-2026), y con
                              tres acciones en una tarjeta de 268 px el texto de
                              más es justo lo que la apretaba. El nombre viaja
                              en `title` y en `aria-label`, así que el tooltip y
                              el lector de pantalla lo siguen diciendo. */}
                          <a
                            href={urlParaDescargar(url, nombreDeFoto(lastName, firstName, label, url))}
                            onClick={(e) => e.stopPropagation()}
                            title={tc('download')}
                            aria-label={tc('download')}
                            className="pointer-events-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/15 hover:bg-white/30 rounded p-1.5"
                          >
                            <Download className="w-3.5 h-3.5 text-white" />
                          </a>
                          {/**
                            * La MISMA imagen, envuelta en un PDF de una página.
                            *
                            * Pedido de la clínica (Erick, 22-sep-2026): el v2
                            * dejaba bajar estos documentos como PDF y acá solo
                            * salían como imagen. Es un PDF por imagen, sin
                            * encabezado y sin juntar frente y dorso — se pidió
                            * así de explícito.
                            *
                            * Solo cuando el archivo ES una imagen: si ya está
                            * guardado como PDF, se baja con la flecha de al lado
                            * y este botón no tiene sentido.
                            *
                            * SIN TEXTO, solo el ícono, por lo mismo que la
                            * flecha de arriba: la barra ya tenía tres acciones y
                            * ocupaba 266 px dentro de una tarjeta de 268 en un
                            * teléfono de 375. Una cuarta con palabra la
                            * desbordaba. El nombre viaja en `title` y en
                            * `aria-label`.
                            *
                            * El `tipo` es lo ÚNICO que se manda: la ruta resuelve
                            * la URL ella misma contra el caso del paciente. Una
                            * ruta que baje cualquier URL que le pasen, corriendo
                            * con la sesión de un admin, es un SSRF.
                            */}
                          {!/\.pdf(\?|$)/i.test(url) && (
                            <a
                              href={`/api/admin/patients/${patientId}/photo-pdf?tipo=${key}`}
                              onClick={(e) => e.stopPropagation()}
                              title={t('photoDownloadPdf')}
                              aria-label={t('photoDownloadPdf')}
                              className="pointer-events-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/15 hover:bg-white/30 rounded p-1.5"
                            >
                              <FileText className="w-3.5 h-3.5 text-white" />
                            </a>
                          )}
                          {!soloLectura && (
                            <>
                            <button
                              onClick={() => fileRefs.current[key]?.click()}
                              className="pointer-events-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/15 hover:bg-white/30 rounded px-2 py-1"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-white" />
                              <span className="text-[10px] text-white font-medium">{t('photoReplace')}</span>
                            </button>
                            {/* Solo la del caso se puede borrar: el endpoint
                                borra de `consentsData`, y la del v2 no está
                                ahí. Un botón que no puede cumplir es peor que
                                no tenerlo. */}
                            {!esDelV2 && (
                              <button
                                onClick={() => handleDelete(key)}
                                className="pointer-events-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-rose/30 hover:bg-rose/50 rounded px-2 py-1"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-white" />
                                <span className="text-[10px] text-white font-medium">{t('photoDelete')}</span>
                              </button>
                            )}
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <button
                        disabled={!tieneCaso || soloLectura}
                        onClick={() => setCameraSlot(key)}
                        className="flex flex-col items-center gap-2 text-text-muted py-6 hover:text-text-2 transition-colors disabled:cursor-not-allowed group"
                        title={soloLectura ? t('photosStaffOnly') : undefined}
                      >
                        <Camera className="w-7 h-7 opacity-30 group-hover:opacity-60 transition-opacity" />
                        {!soloLectura && (
                          <span className="text-[10px] opacity-0 group-hover:opacity-60 transition-opacity">{t('photoOpenCamera')}</span>
                        )}
                      </button>
                    )}
                  </div>

                  {err && <p className="px-3 text-[10px] text-rose mb-1">{err}</p>}

                  {noCargo && !err && (
                    <p className="px-3 text-[10px] text-amber mb-1">{t('photoNoCargo')}</p>
                  )}

                  {/* La foto está en la PAPELERA: el recuadro se ve vacío pero
                      el archivo sigue ahí. Se ofrece traerla de vuelta justo
                      donde se la borró, que es donde el que se equivocó está
                      mirando. Desaparece al sacar una foto nueva: ahí la vieja
                      ya no es lo que se quiere. */}
                  {!soloLectura && !url && recuperables[key] && (
                    <button
                      onClick={() => void handleRestore(key)}
                      disabled={isDel}
                      className="mx-3 mb-1 flex items-center justify-center gap-1 py-1 rounded-md border border-emerald/30 bg-emerald/10 text-[10.5px] font-medium text-emerald hover:bg-emerald/20 transition-colors disabled:opacity-40"
                    >
                      <RotateCcw className="w-3 h-3" /> {t('photoRestore')}
                    </button>
                  )}

                  {/* Action buttons — en el portal médico no hay ninguno: la
                      foto se mira. El aviso de arriba dice por qué. */}
                  <div className={`flex gap-1.5 px-3 py-2 ${soloLectura ? 'hidden' : ''}`}>
                    <button
                      disabled={!tieneCaso || isLoading}
                      onClick={() => setCameraSlot(key)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md border border-border text-[11px] text-text-2 hover:bg-bg-2 hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Camera className="w-3 h-3" /> {t('btnCamera')}
                    </button>
                    <button
                      disabled={!tieneCaso || isLoading}
                      onClick={() => fileRefs.current[key]?.click()}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md border border-border text-[11px] text-text-2 hover:bg-bg-2 hover:border-cyan/40 hover:text-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Upload className="w-3 h-3" /> {t('btnFile')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <ArchivosDelPaciente
            patientId={patientId}
            onFotosPaciente={({ fotos, sinLink }) => { setFotosPaciente(fotos); setFotosSinLink(sinLink); }}
          />
        </div>

        <div className="px-6 py-3 border-t border-border flex justify-end">
          <Button variant="outline" onClick={onClose}>{t('btnClose')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
