'use client';

/**
 * DocumentsTab — Explorador de archivos del caso.
 *
 * Muestra la jerarquía de carpetas/archivos almacenados en patient_documents.
 * La descarga y subida directa a S3 están stubbed hasta que lleguen las creds.
 *
 * Pendiente (task_5fc56dfb):
 *   - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_S3_REGION
 *   - Una vez configurados: habilitar upload-url y download endpoints
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Folder, FolderOpen, File, FileText, FileImage, Upload,
  FolderPlus, Trash2, Download, ChevronRight, Home, Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@precision/ui';
import { EmptyState } from '@/components/ui-phoenix';

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
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (!mimeType) return <File className="w-4 h-4 text-text-muted flex-shrink-0" />;
  if (mimeType.startsWith('image/')) return <FileImage className="w-4 h-4 text-cyan flex-shrink-0" />;
  if (mimeType === 'application/pdf') return <FileText className="w-4 h-4 text-rose flex-shrink-0" />;
  return <File className="w-4 h-4 text-text-muted flex-shrink-0" />;
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function DocumentsTab({ caseId }: { caseId: string }) {
  const [items, setItems]           = useState<DocItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: 'Inicio' }]);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);

  // Folder creation modal
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Upload state
  const [uploading, setUploading]   = useState(false);

  // Delete confirmation
  const [deleting, setDeleting]     = useState<string | null>(null);

  const load = useCallback(async (parentId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = parentId ? `?parentId=${parentId}` : '';
      const res = await fetch(`/api/admin/cases/${caseId}/documents${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.documents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    load(currentParentId);
  }, [load, currentParentId]);

  function navigateInto(folder: DocItem) {
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentParentId(folder.id);
  }

  function navigateTo(item: BreadcrumbItem) {
    const idx = breadcrumb.findIndex(b => b.id === item.id);
    setBreadcrumb(prev => prev.slice(0, idx + 1));
    setCurrentParentId(item.id);
  }

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
      load(currentParentId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al crear carpeta');
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      // Step 1: get presigned URL
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
          alert('La subida de archivos aún no está configurada. Las credenciales S3 están pendientes.\n\nPuedes crear carpetas mientras tanto.');
          return;
        }
        throw new Error(urlData.message ?? `HTTP ${urlRes.status}`);
      }

      // Step 2: PUT directly to S3
      await fetch(urlData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      // Step 3: register in DB
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

      load(currentParentId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al subir archivo');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(item: DocItem) {
    if (item.isFolder && item._count.children > 0) {
      alert(`La carpeta "${item.name}" tiene ${item._count.children} elemento(s). Vaciala antes de eliminarla.`);
      return;
    }
    const confirmed = window.confirm(
      `¿Eliminar ${item.isFolder ? 'la carpeta' : 'el archivo'} "${item.name}"?`
    );
    if (!confirmed) return;

    setDeleting(item.id);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/documents/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
      load(currentParentId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setDeleting(null);
    }
  }

  async function handleDownload(item: DocItem) {
    const res = await fetch(`/api/admin/cases/${caseId}/documents/${item.id}/download`);
    const data = await res.json();
    if (!res.ok) {
      if (data.error === 'S3_NOT_CONFIGURED') {
        alert('La descarga aún no está disponible. Las credenciales S3 están pendientes.');
        return;
      }
      alert(data.message ?? 'Error al generar enlace de descarga');
      return;
    }
    window.open(data.url, '_blank');
  }

  return (
    <div className="rounded-lg border border-border bg-bg-1 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-brand" />
          <h3 className="text-text-1 font-semibold text-sm uppercase tracking-wider">Documentos del caso</h3>
          <span className="text-text-muted text-xs font-mono">({items.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(currentParentId)}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setNewFolderOpen(true)}
            className="gap-1.5"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nueva carpeta</span>
          </Button>

          {/* File upload input */}
          <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-bg-2 text-text-2 text-sm font-medium cursor-pointer hover:bg-bg-1 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{uploading ? 'Subiendo…' : 'Subir archivo'}</span>
            <input
              type="file"
              className="sr-only"
              disabled={uploading}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* Breadcrumb */}
      {breadcrumb.length > 1 && (
        <nav className="flex items-center gap-1 text-xs text-text-muted overflow-x-auto scroll-thin">
          {breadcrumb.map((item, i) => (
            <span key={item.id ?? 'root'} className="flex items-center gap-1 flex-shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              {i === breadcrumb.length - 1 ? (
                <span className="text-text-1 font-semibold">{item.name}</span>
              ) : (
                <button
                  onClick={() => navigateTo(item)}
                  className="hover:text-brand transition-colors flex items-center gap-1"
                >
                  {i === 0 && <Home className="w-3 h-3" />}
                  {item.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando…
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-3 text-sm text-rose">
          {error}
        </div>
      ) : items.length === 0 ? (
        <EmptyState.Rich
          icon={FolderOpen}
          title="Sin documentos"
          subtitle={
            currentParentId
              ? 'Esta carpeta está vacía. Sube un archivo o crea una subcarpeta.'
              : 'No hay documentos en este caso. Crea una carpeta o sube un archivo.'
          }
        />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-2/60 border-b border-border">
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-text-muted w-full">Nombre</th>
                <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell whitespace-nowrap">Tamaño</th>
                <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell whitespace-nowrap">Fecha</th>
                <th className="w-16 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-white/[0.02] group">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.isFolder ? (
                        <Folder className="w-4 h-4 text-amber flex-shrink-0" />
                      ) : (
                        <FileIcon mimeType={item.mimeType} />
                      )}
                      <button
                        onClick={() => item.isFolder ? navigateInto(item) : handleDownload(item)}
                        className={`truncate text-left text-text-1 hover:text-brand transition-colors ${item.isFolder ? 'font-medium' : ''}`}
                        title={item.name}
                      >
                        {item.name}
                      </button>
                      {item.isFolder && item._count.children > 0 && (
                        <span className="text-[10px] font-mono text-text-muted flex-shrink-0">
                          {item._count.children}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs font-mono hidden sm:table-cell whitespace-nowrap">
                    {item.isFolder ? '—' : formatBytes(item.size)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs hidden md:table-cell whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {!item.isFolder && (
                        <button
                          onClick={() => handleDownload(item)}
                          className="p-1 rounded text-text-muted hover:text-brand transition-colors"
                          title="Descargar"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={deleting === item.id}
                        className="p-1 rounded text-text-muted hover:text-rose transition-colors disabled:opacity-50"
                        title="Eliminar"
                      >
                        {deleting === item.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New folder modal */}
      {newFolderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => { setNewFolderOpen(false); setNewFolderName(''); }}
        >
          <div
            className="bg-bg-1 border border-border rounded-xl w-full max-w-sm p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-brand" />
              <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider">Nueva carpeta</h2>
            </div>

            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setNewFolderOpen(false); setNewFolderName(''); } }}
              placeholder="Nombre de la carpeta"
              autoFocus
              className="w-full rounded-md bg-bg-2 border border-border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none focus:border-brand"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setNewFolderOpen(false); setNewFolderName(''); }}
                disabled={creatingFolder}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={createFolder}
                disabled={creatingFolder || !newFolderName.trim()}
                className="flex-1"
              >
                {creatingFolder ? 'Creando…' : 'Crear'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
