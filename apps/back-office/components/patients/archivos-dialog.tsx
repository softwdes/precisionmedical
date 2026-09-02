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

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Camera, FolderOpen, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, Button } from '@precision/ui';

export type PhotoKey = 'selfie' | 'insuranceCardFront' | 'insuranceCardBack' | 'dlFront';

/** Las fotos guardadas en el `consentsData` de un caso. */
export function fotosDelCaso(consentsData: unknown): Record<string, string> {
  return ((consentsData ?? {}) as Record<string, unknown>).photos as Record<string, string> ?? {};
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
   * `false` cuando el paciente no tiene ningún caso: sin caso no hay dónde
   * guardar la foto, así que los slots quedan deshabilitados con su aviso.
   * Se muestra igual, no se esconde — el staff tiene que ver por qué no puede.
   */
  tieneCaso?: boolean;
  onClose: () => void;
}

export function ArchivosDialog({
  patientId, firstName, lastName, fotos, tieneCaso = true, onClose,
}: ArchivosDialogProps) {
  const t      = useTranslations('phoenix.patients');
  const router = useRouter();

  const initialPhotos = fotos ?? {};
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>(initialPhotos);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]   = useState<Record<string, boolean>>({});
  const [errors, setErrors]       = useState<Record<string, string>>({});

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

    // Compress/resize to ≤1.5MB before upload (Vercel body limit is 4.5MB,
    // multipart overhead + JPEG at 1920×1080 can exceed it)
    let uploadFile = file;
    try {
      uploadFile = await compressImage(file, 1400);
    } catch {
      // If compression fails, attempt upload with original (may fail on large files)
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
    setErrors(p => ({ ...p, [photoKey]: '' }));
    setDeleting(p => ({ ...p, [photoKey]: true }));
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/upload-photo?photoType=${photoKey}`, { method: 'DELETE' });
      if (res.ok) {
        setPhotoUrls(p => { const n = { ...p }; delete n[photoKey]; return n; });
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

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl p-0">
        <DialogTitle className="sr-only">{firstName} {lastName} — Archivos</DialogTitle>
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-1">{firstName} {lastName}</h2>
          <p className="text-[12px] text-text-muted mt-0.5">{t('archivosSubtitle')}</p>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[75vh] overflow-y-auto">
          {!tieneCaso && (
            <div className="rounded-md border border-amber/30 bg-amber/10 px-4 py-3 text-[12px] text-amber">
              Este paciente no tiene casos registrados. Las fotos se guardarán cuando se cree el primer caso.
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
              const url       = photoUrls[key] ?? null;
              const isLoading = uploading[key] ?? false;
              const isDel     = deleting[key] ?? false;
              const err       = errors[key] ?? '';

              return (
                <div key={key} className="rounded-lg border border-border bg-bg-2/40 overflow-hidden flex flex-col">
                  {/* Hidden file input (Archivo button) */}
                  <input
                    ref={el => { fileRefs.current[key] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(key, f); e.target.value = ''; }}
                  />

                  <p className="px-3 pt-3 pb-1 text-[11px] font-semibold text-cyan">{label}</p>

                  {/* Preview area */}
                  <div className="flex-1 mx-3 mb-1 rounded-md bg-bg-2 border border-border/60 overflow-hidden flex items-center justify-center min-h-[140px] relative">
                    {isLoading || isDel ? (
                      <RefreshCw className="w-6 h-6 animate-spin text-text-muted opacity-50" />
                    ) : url ? (
                      <>
                        <img src={url} alt={label} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 hover:bg-black/50 transition-colors group">
                          <button
                            onClick={() => fileRefs.current[key]?.click()}
                            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 rounded px-2 py-1"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-white" />
                            <span className="text-[10px] text-white font-medium">Reemplazar</span>
                          </button>
                          <button
                            onClick={() => handleDelete(key)}
                            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-rose/20 hover:bg-rose/40 rounded px-2 py-1"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose" />
                            <span className="text-[10px] text-rose font-medium">Eliminar</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        disabled={!tieneCaso}
                        onClick={() => setCameraSlot(key)}
                        className="flex flex-col items-center gap-2 text-text-muted py-6 hover:text-text-2 transition-colors disabled:cursor-not-allowed group"
                      >
                        <Camera className="w-7 h-7 opacity-30 group-hover:opacity-60 transition-opacity" />
                        <span className="text-[10px] opacity-0 group-hover:opacity-60 transition-opacity">Abrir cámara</span>
                      </button>
                    )}
                  </div>

                  {err && <p className="px-3 text-[10px] text-rose mb-1">{err}</p>}

                  {/* Action buttons */}
                  <div className="flex gap-1.5 px-3 py-2">
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

          {/* Personal files — sección futura */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-2">
                <FolderOpen className="w-3.5 h-3.5" /> {t('archivosPersonalFiles')}
              </div>
            </div>
            <div className="rounded-md border border-border overflow-hidden">
              <div className="grid grid-cols-3 bg-bg-2 border-b border-border px-3 py-2">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('archivosColName')}</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('archivosColSize')}</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right">{t('archivosColDate')}</span>
              </div>
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted">
                <FolderOpen className="w-10 h-10 opacity-15" />
                <p className="text-sm font-medium">{t('archivosEmptyDir')}</p>
                <p className="text-[11px]">{t('archivosEmptyDirDesc')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-border flex justify-end">
          <Button variant="outline" onClick={onClose}>{t('btnClose')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
