'use client';

/**
 * DocumentsTab — Explorador de archivos del caso.
 *
 * Subir, abrir y descargar FUNCIONAN: los archivos viven en Supabase Storage y
 * la ruta `/download` devuelve una URL firmada. El encabezado decía "stubbed
 * hasta AWS S3 credentials" desde el diseño original y ya no era cierto — como
 * tampoco lo era el modal de vista previa que decía "disponible cuando se
 * configure S3" mientras el visor real andaba al lado (corregido 2026-09-14).
 *
 * Lo único que sigue sin existir es la descarga MASIVA (el botón de la barra
 * avisa y no hace nada).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Folder, FolderOpen, File, FileText, FileImage, Upload,
  FolderPlus, Trash2, Download, ChevronRight, Home, Loader2,
  RefreshCw, X, FileArchive, CloudUpload, RotateCcw,
} from 'lucide-react';
import { Button } from '@precision/ui';
import { EmptyState, FileViewerDialog, useFileViewer } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DocItem {
  id: string;
  name: string;
  isFolder: boolean;
  s3Key: string | null;
  mimeType: string | null;
  size: number | null;
  parentId: string | null;
  createdAt: string;
  _count: { children: number };
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function FileIcon({ mimeType, size = 4 }: { mimeType: string | null; size?: number }) {
  const cls = `w-${size} h-${size} flex-shrink-0`;
  if (!mimeType) return <File className={`${cls} text-text-muted`} />;
  if (mimeType.startsWith('image/')) return <FileImage className={`${cls} text-cyan`} />;
  if (mimeType === 'application/pdf') return <FileText className={`${cls} text-rose`} />;
  if (mimeType.includes('word') || mimeType.includes('document')) return <FileText className={`${cls} text-brand-text`} />;
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return <FileText className={`${cls} text-emerald`} />;
  if (mimeType.includes('zip') || mimeType.includes('rar')) return <FileArchive className={`${cls} text-amber`} />;
  return <File className={`${cls} text-text-muted`} />;
}

// ─── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ onClose, onUpload, uploading }: {
  onClose: () => void;
  onUpload: (files: File[]) => void;
  uploading: boolean;
}) {
  const t  = useTranslations('phoenix.caseTabs.documents');
  const tc = useTranslations('phoenix.common');
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending]   = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) setPending(prev => [...prev, ...files]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setPending(prev => [...prev, ...files]);
    e.target.value = '';
  }

  function removeFile(idx: number) {
    setPending(prev => prev.filter((_, i) => i !== idx));
  }

  function submit() {
    if (!pending.length) return;
    onUpload(pending);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-1 border border-border rounded-xl w-full max-w-lg p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-text-1 font-semibold text-base">{t('uploadTitle')}</h2>
            <p className="text-text-muted text-xs mt-0.5">
              {t('uploadIntro')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-muted hover:text-text-1 hover:bg-bg-2 transition-colors ml-3 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`rounded-lg border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 py-10 px-6 ${
            dragOver
              ? 'border-brand bg-brand/5'
              : 'border-border/60 hover:border-brand/40 hover:bg-bg-2/40'
          }`}
        >
          <CloudUpload className={`w-10 h-10 ${dragOver ? 'text-brand-text' : 'text-text-muted'} transition-colors`} />
          <div className="text-center">
            <p className={`text-sm font-medium ${dragOver ? 'text-brand-text' : 'text-text-1'}`}>{t('uploadDropTitle')}</p>
            <p className="text-text-muted text-xs mt-0.5">{t('uploadDropHint')}</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={handleFileChange}
          />
        </div>

        {/* File hint */}
        <p className="text-[11px] text-text-muted">
          {t('uploadFootnote')}
        </p>

        {/* Pending files list */}
        {pending.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {pending.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-bg-2/60 border border-border/40 px-3 py-2">
                <FileIcon mimeType={f.type} size={4} />
                <span className="text-text-1 text-xs truncate flex-1">{f.name}</span>
                <span className="text-text-muted text-xs font-mono flex-shrink-0">{formatBytes(f.size)}</span>
                <button onClick={() => removeFile(i)} className="text-text-muted hover:text-rose transition-colors flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={uploading}>
            {tc('cancel')}
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={uploading || pending.length === 0}
            className="gap-1.5"
          >
            {uploading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo…</>
              : <><Upload className="w-3.5 h-3.5" /> {t('uploadTitle')}</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function DocumentsTab({ caseId, readOnly = false, portal = 'admin' }: {
  caseId: string;
  /**
   * Portal legal: el bufete descarga los documentos del caso —para eso firma—
   * pero no sube ni organiza nada. El expediente lo arma la clínica.
   */
  readOnly?: boolean;
  /**
   * De qué API se sirve este tab.
   *
   * NO se puede derivar de `readOnly`: el doctor también es `readOnly` y sigue
   * comiendo de `/api/admin/*`. El que cambia de puerta es el abogado, porque el
   * middleware le cierra todo lo administrativo (`middleware.ts`, rol LAWYER) —
   * por eso el tab le devolvía 403 y no llegó a ver un documento nunca.
   *
   * `attorney` apunta a `/api/attorney/cases/[id]/**`, que tiene el alcance del
   * bufete y **solo verbos de lectura**: ahí no hay a dónde mandar un borrado.
   */
  portal?: 'admin' | 'attorney';
}) {
  const t  = useTranslations('phoenix.caseTabs.documents');
  const tc = useTranslations('phoenix.common');
  /**
   * La raíz de la API según el portal. Todo fetch de este tab cuelga de acá, así
   * que agregar un endpoint nuevo obliga a decidir si el bufete también lo tiene.
   */
  const api = `/api/${portal}/cases/${caseId}`;
  // `abrirArchivo` hace su propio fetch porque distingue "S3 sin configurar"
  // del resto de los errores, así que usa `show` y no `open`.
  const viewer = useFileViewer(t('alertDownloadError'));
  const [items, setItems]           = useState<DocItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  // El nombre de la raíz se resuelve al pintar, no acá: `useState` corre una vez
  // y guardarlo traducido lo congelaría en el idioma que hubiera al montar.
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: '' }]);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);

  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen]   = useState(false);
  const [newFolderName, setNewFolderName]   = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploadOpen, setUploadOpen]         = useState(false);
  const [uploading, setUploading]           = useState(false);
  const [deleting, setDeleting]             = useState<string | null>(null);
  /** El item esperando confirmación de borrado, o `null`. */
  const [porBorrar, setPorBorrar]           = useState<DocItem | null>(null);
  /**
   * La PAPELERA: es la misma lista con el filtro dado vuelta, no otra pantalla.
   *
   * Vive acá, al lado de donde se borra, porque el que se equivoca es el que se
   * da cuenta — y mandarlo a pedirle la restauración a alguien convierte cada
   * error en un ticket (Erick, 2026-09-13). No la ve el portal del abogado:
   * este tab es de back office y providers.
   */
  const [verPapelera, setVerPapelera]       = useState(false);

  const load = useCallback(async (parentId: string | null, papelera = false) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const partes = [parentId ? `parentId=${parentId}` : '', papelera ? 'papelera=1' : ''].filter(Boolean);
      const qs = partes.length ? `?${partes.join('&')}` : '';
      const res = await fetch(`${api}/documents${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.documents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(currentParentId, verPapelera); }, [load, currentParentId, verPapelera]);

  function navigateInto(folder: DocItem) {
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentParentId(folder.id);
  }

  function navigateTo(item: BreadcrumbItem) {
    const idx = breadcrumb.findIndex(b => b.id === item.id);
    setBreadcrumb(prev => prev.slice(0, idx + 1));
    setCurrentParentId(item.id);
  }

  const allIds     = items.map(i => i.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /* ── Escritura: siempre `/api/admin/*`, a propósito ──────────────────────────
     Crear carpeta, subir y borrar no tienen equivalente en `/api/attorney/*`
     porque esas rutas no existen: el expediente lo arma la clínica. Dejarlas
     cableadas al admin es lo que hace visible la asimetría — si alguien mueve
     una a `${api}` va a dar 404 en el portal legal, que es exactamente lo que
     tiene que pasar. */
  async function createFolder() {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), isFolder: true, parentId: currentParentId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewFolderOpen(false);
      setNewFolderName('');
      load(currentParentId, verPapelera);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('alertCreateFolder'));
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleUpload(files: File[]) {
    setUploading(true);
    try {
      for (const file of files) {
        const urlRes = await fetch(`/api/admin/cases/${caseId}/documents/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            parentId: currentParentId,
          }),
        });
        const urlData = await urlRes.json();

        if (!urlRes.ok) {
          if (urlData.error === 'S3_NOT_CONFIGURED') {
            alert(t('alertS3NotConfigured'));
            break;
          }
          throw new Error(urlData.message ?? `HTTP ${urlRes.status}`);
        }

        await fetch(urlData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        await fetch(`/api/admin/cases/${caseId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            isFolder: false,
            s3Key: urlData.s3Key,
            mimeType: file.type,
            size: file.size,
            parentId: currentParentId,
          }),
        });
      }
      setUploadOpen(false);
      load(currentParentId, verPapelera);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('alertUploadError'));
    } finally {
      setUploading(false);
    }
  }

  /**
   * Pedir la confirmación. El borrado real lo hace `confirmarBorrado`.
   *
   * Se cambió el `window.confirm` del navegador por el diálogo del sistema: el
   * gris del navegador no se ve como el resto, y en algunos contextos embebidos
   * directamente no aparece — ahí el clic borraba sin preguntar nada.
   */
  function handleDelete(item: DocItem) {
    if (item.isFolder && item._count.children > 0) {
      alert(t('alertFolderNotEmpty', { name: item.name, count: item._count.children }));
      return;
    }
    setPorBorrar(item);
  }

  async function confirmarBorrado() {
    const item = porBorrar;
    if (!item) return;
    setPorBorrar(null);
    setDeleting(item.id);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/documents/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
      load(currentParentId, verPapelera);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('alertDeleteError'));
    } finally {
      setDeleting(null);
    }
  }

  /** Traerlo de vuelta de la papelera. Lo puede hacer cualquiera que vea esto. */
  async function handleRestore(item: DocItem) {
    setDeleting(item.id);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/documents/${item.id}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // El único caso que no es un fallo: su carpeta también está borrada, y
        // restaurar el archivo solo lo dejaría colgando de algo invisible.
        throw new Error(data.error === 'CARPETA_ELIMINADA'
          ? t('alertRestoreFolderFirst', { name: data.carpeta ?? '—' })
          : (data.message ?? `HTTP ${res.status}`));
      }
      load(currentParentId, verPapelera);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('alertRestoreError'));
    } finally {
      setDeleting(null);
    }
  }

  /**
   * Abre el archivo en el visor. Se llama `abrir` y no `descargar` porque es lo
   * que hace: el visor MUESTRA el archivo y adentro tiene su propio botón de
   * descargar. El nombre viejo era de cuando lo único posible era bajarlo.
   *
   * La ruta se llama igual (`/download`) porque devuelve la URL firmada, que
   * sirve para las dos cosas.
   */
  async function abrirArchivo(item: DocItem) {
    const res = await fetch(`${api}/documents/${item.id}/download`);
    const data = await res.json();
    if (!res.ok) {
      /*
       * `S3_NOT_CONFIGURED` quedó del diseño original. Hoy los archivos viven en
       * Supabase Storage y la ruta firma la URL, así que este camino no se
       * recorre — se deja porque el server todavía puede devolver ese código si
       * le faltan las variables de entorno, y ahí el mensaje sigue siendo cierto:
       * el almacenamiento no está configurado.
       */
      if (data.error === 'S3_NOT_CONFIGURED') {
        alert(t('alertDownloadS3'));
        return;
      }
      alert(data.message ?? t('alertDownloadError'));
      return;
    }
    // Modal, no pestaña nueva: el usuario no pierde el expediente donde estaba
    // y la URL firmada —que es PHI— no queda en el historial del navegador.
    viewer.show({ fileName: data.name ?? item.name, url: data.url, downloadUrl: data.downloadUrl });
  }

  /**
   * ─── El intake ───────────────────────────────────────────────────────────────
   *
   * No es una fila de `patient_documents`: es una fila FIJA que apunta a la ruta
   * que arma el PDF al vuelo. Se decidió así, y no guardando el archivo, por dos
   * razones (Erick, 2026-09-07):
   *
   *  1. **El intake cambia.** Un caso en INTAKE_PENDING todavía no tiene
   *     consentimientos ni firma. Un PDF guardado hoy sería un intake a medio
   *     llenar, y mañana —con el paciente ya firmado— el expediente seguiría
   *     mostrando la versión vieja SIN ninguna señal de que está vencida.
   *  2. **Se puede borrar.** El tab tiene botón de borrar. Que alguien borre el
   *     intake del expediente es peor que no tenerlo.
   *
   * Además `PatientDocument` no tiene campo `source`/`kind`, así que un archivo
   * generado por el sistema quedaría indistinguible de uno subido a mano.
   *
   * Se muestra SIEMPRE, aunque el intake esté incompleto: ver qué falta es la
   * mitad del valor, y el botón viejo de la vista de caso se escondía justo
   * cuando más se necesitaba (solo aparecía con `INTAKE_COMPLETED`).
   */
  const intakeFileName = `${t('intakeName')}.pdf`;
  function verIntake() {
    viewer.show({
      fileName:    intakeFileName,
      url:         `${api}/pdf`,
      downloadUrl: `${api}/pdf?download=1`,
    });
  }

  /**
   * El intake vive en la raíz del expediente, no dentro de las carpetas: adentro
   * de "Messages" una fila de intake sería mentira sobre dónde está el archivo.
   */
  const mostrarIntake = currentParentId === null;

  return (
    <>
      <FileViewerDialog {...viewer.props} />
      <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-border bg-bg-2/40">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-xs text-text-muted overflow-x-auto scroll-thin min-w-0">
            {breadcrumb.map((item, i) => (
              <span key={item.id ?? 'root'} className="flex items-center gap-1 flex-shrink-0">
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                {i === breadcrumb.length - 1 ? (
                  <span className="text-text-1 font-medium flex items-center gap-1">
                    {i === 0 && <FolderOpen className="w-3.5 h-3.5 text-brand-text" />}
                    {i > 0 && <Folder className="w-3.5 h-3.5 text-amber" />}
                    {i === 0 ? t('rootFolder') : item.name}
                  </span>
                ) : (
                  <button onClick={() => navigateTo(item)} className="hover:text-brand-text transition-colors flex items-center gap-1">
                    {i === 0 && <Home className="w-3 h-3" />}
                    {i === 0 ? t('rootFolder') : item.name}
                  </button>
                )}
              </span>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => load(currentParentId, verPapelera)} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {/* La PAPELERA. Es lectura + restaurar, así que no depende de
                `readOnly`… salvo restaurar, que sí (ver el botón de la fila).
                El icono se queda encendido mientras está activa, para que se
                note que lo que se está viendo no es la carpeta normal. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVerPapelera((v) => !v)}
              disabled={loading}
              title={t('trashTitle')}
              className={`gap-1.5 ${verPapelera ? 'text-rose' : ''}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{verPapelera ? t('trashExit') : t('trashOpen')}</span>
            </Button>
            {/* Recargar se queda: es lectura. Crear carpeta y subir, no. */}
            {!readOnly && !verPapelera && (
              <>
                <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)} className="gap-1.5">
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('btnCreateFolder')}</span>
                </Button>
                <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('uploadTitle')}</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Bulk select bar */}
        {someSelected && (
          <div className="flex items-center gap-3 px-4 py-2 bg-brand/5 border-b border-brand/20 text-sm">
            <span className="text-brand-text font-medium text-xs">{selected.size} seleccionado{selected.size !== 1 ? 's' : ''}</span>
            <button
              onClick={() => alert(t('alertBulkS3'))}
              className="flex items-center gap-1.5 text-text-2 hover:text-brand-text transition-colors text-xs"
            >
              <Download className="w-3.5 h-3.5" /> Descarga masiva
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-text-muted hover:text-text-1 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </div>
        ) : error ? (
          <div className="m-4 rounded-md border border-rose/30 bg-rose/10 px-3 py-3 text-sm text-rose">{error}</div>
        ) : items.length === 0 && !mostrarIntake ? (
          <div className="py-16">
            <EmptyState.Rich
              icon={FolderOpen}
              title={t('emptyTitle')}
              subtitle={currentParentId ? t('emptyFolderSubtitle') : t('emptyCaseSubtitle')}
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-2/60">
                <th className="px-4 py-2.5 w-9">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="accent-brand w-3.5 h-3.5 cursor-pointer"
                    title={tc('selectAll')}
                  />
                </th>
                <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('colName')}</th>
                <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell whitespace-nowrap">{t('colSize')}</th>
                <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell whitespace-nowrap">Última modificación</th>
                <th className="w-16 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {/* El intake: fila fija, no de la base. Sin casilla (no entra en la
                  selección masiva) y sin borrar (no hay nada que borrar). El
                  cyan lo separa de los archivos subidos, que van en el gris de
                  siempre — es "generado por el sistema", no "alguien lo subió". */}
              {mostrarIntake && (
                <tr
                  className="hover:bg-cyan/[0.04] group transition-colors cursor-pointer bg-cyan/[0.02]"
                  onClick={verIntake}
                >
                  <td className="px-4 py-2.5">
                    <FileText className="w-3.5 h-3.5 text-cyan mx-auto" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-text-1 group-hover:text-cyan transition-colors font-normal" title={intakeFileName}>
                        {intakeFileName}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-cyan border border-cyan/30 rounded px-1.5 py-px flex-shrink-0">
                        {t('intakeBadge')}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs font-mono hidden sm:table-cell whitespace-nowrap">—</td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs hidden md:table-cell whitespace-nowrap">
                    {/* Sin fecha a propósito: se arma en el momento, así que la
                        única fecha honesta sería "ahora" y no significa nada. */}
                    {t('intakeAlwaysCurrent')}
                  </td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={`${api}/pdf?download=1`}
                        className="p-1 rounded text-text-muted hover:text-cyan transition-colors"
                        title={tc('download')}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              )}
              {items.map(item => (
                <tr
                  key={item.id}
                  className={`hover:bg-white/[0.02] group transition-colors cursor-pointer ${selected.has(item.id) ? 'bg-brand/[0.03]' : ''}`}
                  /* Un clic en el archivo lo ABRE, en el visor de verdad.
                     Antes abría un modal aparte que nunca mostró nada: decía
                     "el preview estará disponible cuando se configure S3" —un
                     texto de cuando el almacenamiento no existía— mientras el
                     visor real ya andaba, pero colgado solo del botón de
                     descargar. Dos modales y se abría el muerto. */
                  onClick={() => item.isFolder ? navigateInto(item) : void abrirArchivo(item)}
                >
                  <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleOne(item.id)}
                      className="accent-brand w-3.5 h-3.5 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.isFolder
                        ? <Folder className="w-4 h-4 text-amber flex-shrink-0" />
                        : <FileIcon mimeType={item.mimeType} />
                      }
                      <span className="truncate text-text-1 group-hover:text-brand-text transition-colors font-normal" title={item.name}>
                        {item.name}
                      </span>
                      {item.isFolder && item._count.children > 0 && (
                        <span className="text-[10px] font-mono text-text-muted flex-shrink-0">({item._count.children})</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs font-mono hidden sm:table-cell whitespace-nowrap">
                    {item.isFolder ? '—' : formatBytes(item.size)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs hidden md:table-cell whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {!item.isFolder && (
                        <button onClick={() => void abrirArchivo(item)} className="p-1 rounded text-text-muted hover:text-brand-text transition-colors" title={tc('download')}>
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* Descargar SÍ, borrar NO: el bufete se lleva copia del
                          expediente, pero no lo modifica. */}
                      {/* En la papelera el botón es el opuesto: restaurar. Si
                          siguiera siendo el de borrar, no haría nada —ya está
                          borrado— y se leería como que la acción falló. */}
                      {!readOnly && verPapelera && (
                        <button
                          onClick={() => void handleRestore(item)}
                          disabled={deleting === item.id}
                          className="p-1 rounded text-text-muted hover:text-emerald transition-colors disabled:opacity-50"
                          title={t('restoreTitle')}
                        >
                          {deleting === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {!readOnly && !verPapelera && (
                        <button
                          onClick={() => handleDelete(item)}
                          disabled={deleting === item.id}
                          className="p-1 rounded text-text-muted hover:text-rose transition-colors disabled:opacity-50"
                          title={tc('delete')}
                        >
                          {deleting === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Folder Modal */}
      {newFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setNewFolderOpen(false); setNewFolderName(''); }}>
          <div className="bg-bg-1 border border-border rounded-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-brand-text" />
              <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('newFolderTitle')}</h2>
            </div>
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') createFolder();
                if (e.key === 'Escape') { setNewFolderOpen(false); setNewFolderName(''); }
              }}
              placeholder={t('placeholderFolder')}
              autoFocus
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setNewFolderOpen(false); setNewFolderName(''); }} disabled={creatingFolder} className="flex-1">{tc('cancel')}</Button>
              <Button size="sm" onClick={createFolder} disabled={creatingFolder || !newFolderName.trim()} className="flex-1">
                {creatingFolder ? t('creating') : t('btnCreate')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUpload={handleUpload}
          uploading={uploading}
        />
      )}


      {/* La confirmación de borrado, con el diálogo del sistema y no el del
          navegador. El texto DICE que se puede recuperar: prometerlo sin que
          fuera cierto era el problema de antes, y ahora es verdad. */}
      {porBorrar && (
        <ConfirmDialog
          open
          variant="danger"
          title={porBorrar.isFolder ? t('confirmDeleteFolderTitle') : t('confirmDeleteFileTitle')}
          description={`${porBorrar.isFolder
            ? t('confirmDeleteFolder', { name: porBorrar.name })
            : t('confirmDeleteFile', { name: porBorrar.name })} ${t('confirmDeleteRecoverable')}`}
          confirmLabel={tc('delete')}
          onConfirm={() => void confirmarBorrado()}
          onCancel={() => setPorBorrar(null)}
        />
      )}
    </>
  );
}
