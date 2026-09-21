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
  RefreshCw, X, FileArchive, CloudUpload, RotateCcw, Pencil, FolderInput, IdCard,
} from 'lucide-react';
import { Button } from '@precision/ui';
import { EmptyState, FileViewerDialog, useFileViewer } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import {
  partirNombre, unirNombre, nombreRepetido, tieneCaracteresProhibidos, LARGO_MAXIMO,
} from '@/lib/nombre-archivo';

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

/**
 * ── LO QUE EL MODAL PROMETE, AHORA CUMPLIDO ──────────────────────────────────
 *
 * El pie del diálogo dice "máximo 10 archivos, 100MB cada uno. Formatos: imágenes,
 * PDF, Word, Excel" desde siempre, y **no se validaba nada de eso**. El servidor
 * sí rechazaba lo imposible, pero contestaba un `400` pelado que en pantalla
 * salía como "HTTP 400" — un usuario intentando subir una licencia de conducir
 * de 0 bytes vio exactamente eso y no tenía forma de saber qué pasaba
 * (reportado por Erick, 2026-09-15).
 *
 * Se valida ACÁ, antes de mandar nada: el navegador ya conoce tamaño y tipo en
 * el momento de elegir el archivo.
 */
/**
 * ─── La carpeta del intake ───────────────────────────────────────────────────
 *
 * En el v2 el intake se archivaba dentro de una carpeta por caso, y esa carpeta
 * es **la más común de todo el sistema**: 643 migradas, todas en la raíz,
 * ninguna anidada y ningún caso con dos (medido el 2026-09-15). El intake de v3
 * colgaba suelto de la raíz, así que las dos generaciones lo guardaban en
 * lugares distintos.
 *
 * ── Por qué el nombre NO se traduce ────────────────────────────────────────
 *
 * `Intake Form` es el nombre con el que están guardadas esas 643 carpetas: es
 * un dato, no un texto de interfaz. La carpeta virtual usa el mismo literal
 * para que en un caso migrado y en uno nuevo se llame igual — si la tradujera,
 * el mismo cajón tendría dos nombres según de qué año es el expediente. Por eso
 * la clave de i18n dice lo mismo en los dos idiomas: pasa por i18n (regla #2)
 * pero el valor es el del archivo.
 *
 * ⚠️ Si alguna vez se normalizan los nombres de carpeta migrados, este literal
 * y los de la base tienen que moverse JUNTOS. Hoy `Intake Forms` (1 sola, en
 * plural) también entra acá.
 */
const CARPETA_INTAKE_ID = '__intake__';

/**
 * ─── La carpeta de identificación ───────────────────────────────────────────
 *
 * La foto, la licencia y la tarjeta del seguro, vistas desde el expediente.
 *
 * Hasta hoy este tab solo las NOMBRABA: un enlace que abría el diálogo de
 * archivos personales. Alcanzaba para que no parecieran perdidas, pero la
 * clínica las quiere donde están todos los demás papeles, en carpetas, como en
 * el v2 (Erick, 21-sep-2026).
 *
 * ── Por qué es virtual y no una carpeta de verdad ──────────────────────────
 *
 * Porque estos archivos NO son del caso: cuelgan del paciente con `caseId` en
 * NULL, y eso no se toca. El portal legal sirve los documentos POR CASO, así
 * que mientras no tengan caso, el bufete no puede verlos ni por error — la
 * protección es estructural y no un `if` del que alguien se pueda olvidar.
 * Decisión de Erick el 21-sep-2026: la carpeta es para la clínica y los
 * providers; los abogados no la ven hasta que la pidan.
 *
 * Y por eso también aparece SOLO cuando llega `patientId`, que lo pasa
 * únicamente la ficha del paciente. En la consulta y en Day Admission el tab se
 * monta sin él y la carpeta no existe — ahí se atiende, no se administran
 * papeles.
 */
const CARPETA_IDENTIDAD_ID = '__identidad__';

/** Los cinco nombres con los que se guardan. Mismo criterio que `ArchivosDialog`. */
const SLOTS_DE_IDENTIDAD = /^(patient_photo|dl_front|dl_back|id_card_front|id_card_back)\./i;

/** Una fila de la carpeta de identidad, tal como la manda la ruta del paciente. */
interface DocIdentidad {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
  caseId: string | null;
}

function esCarpetaDeIntake(nombre: string): boolean {
  const n = nombre.trim().toLowerCase().replace(/\s+/g, ' ');
  return n === 'intake form' || n === 'intake forms';
}

const MAX_ARCHIVOS = 10;

/**
 * 50 MB, que es **el techo real del bucket**, no una promesa de la pantalla.
 *
 * Acá decía 100 MB, igual que el pie del diálogo, y el bucket `case-documents`
 * está configurado en `file_size_limit: 52428800`. O sea que un archivo de
 * entre 50 y 100 MB pasaba TODAS las validaciones de acá, salía a Supabase y
 * volvía con un `HTTP 400` sin explicación — Storage contesta 400 con un cuerpo
 * que adentro dice 413 `EntityTooLarge`. Medido el 2026-09-15 subiendo un
 * archivo de 55 MB.
 *
 * ⚠️ Este número tiene que EMPATAR con el del bucket. Si alguien lo sube acá sin
 * subirlo allá, vuelve el mismo 400 mudo. El del bucket se cambia en el panel de
 * Supabase (o con `updateBucket`), y el proyecto tiene además su propio techo
 * global que puede ser más bajo.
 */
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Las acciones de una fila: se revelan al pasar el mouse — pero SOLO donde hay
 * mouse.
 *
 * Eran `opacity-0 group-hover:opacity-100` a secas, y en una pantalla táctil no
 * existe el hover: los botones quedaban con opacidad **0 medida**, o sea
 * invisibles y aun así clickeables. En el iPad de recepción, renombrar, mover y
 * borrar estaban ahí y había que adivinar dónde tocar (medido con Erick,
 * 20-sep-2026).
 *
 * La pregunta correcta es si el aparato tiene puntero fino, NO cuán ancha es la
 * pantalla: un iPad en horizontal mide 1024px y caería en `lg:` igual que un
 * monitor. Por eso va `@media (hover: hover)` y no un breakpoint — con un
 * breakpoint el bug seguía vivo justo en el aparato que lo tiene.
 *
 * Con mouse no cambia nada: la fila sigue limpia y las acciones aparecen al
 * acercarse, que es el diseño de siempre.
 */
const ACCIONES_DE_FILA =
  'flex items-center gap-1 justify-end transition-opacity ' +
  'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100';

/** Los formatos que el pie del diálogo promete. */
const TIPOS_OK = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml',
];

/**
 * Por qué NO se puede subir este archivo, o `null` si se puede.
 *
 * Devuelve la CLAVE del motivo y no un texto: los mensajes viven en i18n como
 * todo lo demás.
 */
function motivoRechazo(f: File): 'vacio' | 'grande' | 'tipo' | null {
  // Primero el vacío: un archivo de 0 bytes también falla el tipo a veces, y
  // "está vacío" explica mejor que "formato no admitido".
  if (f.size <= 0) return 'vacio';
  if (f.size > MAX_BYTES) return 'grande';
  // Sin `type` el navegador no lo reconoció — pasa con archivos sin extensión.
  // No se rechaza por eso: el servidor guarda igual y el usuario sabe qué subió.
  if (f.type && !TIPOS_OK.some((t) => f.type.startsWith(t))) return 'tipo';
  return null;
}

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

// ─── Rename Modal ──────────────────────────────────────────────────────────────

/**
 * Cambiar el nombre de un documento o de una carpeta.
 *
 * Comparte las reglas con el campo del panel de subida —extensión fija, aviso
 * de repetido, caracteres prohibidos— porque es la misma pregunta hecha en otro
 * momento. Las dos salen de `lib/nombre-archivo`.
 */
function RenameModal({ item, nombresEnCarpeta, guardando, onClose, onSave }: {
  item: DocItem;
  nombresEnCarpeta: readonly string[];
  guardando: boolean;
  onClose: () => void;
  onSave: (nombre: string) => void;
}) {
  const t  = useTranslations('phoenix.caseTabs.documents');
  const tc = useTranslations('phoenix.common');
  // Una carpeta no tiene extensión: se edita el nombre entero.
  const partido = item.isFolder ? { base: item.name, ext: '' } : partirNombre(item.name);
  const [base, setBase] = useState(partido.base);

  const nombre   = unirNombre(base, partido.ext);
  const problema = !base.trim()
    ? 'vacio'
    : tieneCaracteresProhibidos(base)
      ? 'invalido'
      : nombre.length > LARGO_MAXIMO ? 'largo' : null;
  const repetido = !problema && nombreRepetido(nombre, nombresEnCarpeta);
  const sinCambio = nombre === item.name;

  function guardar() {
    if (problema || guardando) return;
    onSave(nombre);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-bg-1 border border-border rounded-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-brand-text" />
          <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider">
            {item.isFolder ? t('renameFolderTitle') : t('renameTitle')}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={base}
            onChange={e => setBase(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') guardar();
              if (e.key === 'Escape') onClose();
            }}
            aria-label={t('uploadNombreLabel')}
            autoFocus
            className={`flex-1 min-w-0 rounded-md bg-bg-2 border px-3 py-2 text-sm text-text-1 placeholder-text-muted outline-none transition-colors ${
              problema ? 'border-rose/50 focus:border-rose' : 'border-border focus:border-brand'
            }`}
          />
          {/* La extensión, a la vista y fuera del alcance. */}
          {partido.ext && (
            <span className="text-text-muted text-sm font-mono flex-shrink-0">{partido.ext}</span>
          )}
        </div>

        {problema && <p className="text-[11px] text-rose">{t(`nombre_${problema}`)}</p>}
        {repetido && <p className="text-[11px] text-amber">{t('nombreRepetido')}</p>}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={guardando} className="flex-1">
            {tc('cancel')}
          </Button>
          <Button size="sm" onClick={guardar} disabled={guardando || !!problema || sinCambio} className="flex-1">
            {guardando ? t('renameGuardando') : tc('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Mover a otra carpeta ──────────────────────────────────────────────────────

/**
 * Elegir dónde va lo que se está moviendo.
 *
 * Una LISTA de carpetas y no un árbol, a propósito: el archivador real es de un
 * solo nivel (4.755 carpetas, 6 anidadas, medido 2026-09-16). Un árbol acá sería
 * resolver un caso que no existe y complicar el que sí.
 *
 * "La raíz" es una opción más y va primera: sacar algo de una carpeta es tan
 * frecuente como meterlo, y si no estuviera, el único modo de desarchivar sería
 * arrastrar al breadcrumb — que en el teléfono no se puede.
 */
function MoveModal({ items, carpetas, origenId, moviendo, onClose, onMove }: {
  items: DocItem[];
  /** Carpetas disponibles como destino. `null` = todavía cargando. */
  carpetas: DocItem[] | null;
  /** Dónde están ahora: esa opción se muestra deshabilitada, no escondida. */
  origenId: string | null;
  moviendo: boolean;
  onClose: () => void;
  onMove: (destino: string | null) => void;
}) {
  const t  = useTranslations('phoenix.caseTabs.documents');
  const tc = useTranslations('phoenix.common');

  // Una carpeta no puede ser su propio destino. Se saca de la lista en vez de
  // dejarla y rechazarla después: ofrecer algo que va a fallar es una trampa.
  const movidos = new Set(items.map(i => i.id));
  const opciones = (carpetas ?? []).filter(c => !movidos.has(c.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-bg-1 border border-border rounded-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FolderInput className="w-4 h-4 text-brand-text" />
          <h2 className="text-text-1 font-semibold text-sm uppercase tracking-wider">{t('moveTitle')}</h2>
        </div>

        <p className="text-[12px] text-text-2">
          {items.length === 1 ? items[0].name : t('moveCount', { n: items.length })}
        </p>

        <div className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-1">
          <button
            type="button"
            disabled={moviendo || origenId === null}
            onClick={() => onMove(null)}
            className="w-full flex items-center gap-2 rounded-md px-3 min-h-11 sm:min-h-0 sm:py-2 text-left text-sm text-text-1 hover:bg-bg-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Home className="w-3.5 h-3.5 text-brand-text flex-shrink-0" />
            <span className="truncate">{t('rootFolder')}</span>
            {origenId === null && <span className="ml-auto text-[10px] text-text-muted">{t('moveYaEstaAca')}</span>}
          </button>

          {carpetas === null ? (
            <div className="flex items-center justify-center py-6 text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : opciones.length === 0 ? (
            <p className="text-[12px] text-text-muted py-4 text-center">{t('moveSinCarpetas')}</p>
          ) : opciones.map(c => (
            <button
              key={c.id}
              type="button"
              disabled={moviendo || origenId === c.id}
              onClick={() => onMove(c.id)}
              className="w-full flex items-center gap-2 rounded-md px-3 min-h-11 sm:min-h-0 sm:py-2 text-left text-sm text-text-1 hover:bg-bg-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Folder className="w-3.5 h-3.5 text-amber flex-shrink-0" />
              <span className="truncate">{c.name}</span>
              {origenId === c.id && <span className="ml-auto text-[10px] text-text-muted">{t('moveYaEstaAca')}</span>}
            </button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={onClose} disabled={moviendo} className="w-full">
          {moviendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tc('cancel')}
        </Button>
      </div>
    </div>
  );
}

// ─── Upload Modal ──────────────────────────────────────────────────────────────

/**
 * Un archivo elegido y el nombre con el que se va a guardar.
 *
 * El nombre viaja partido —lo editable por un lado, la extensión por otro—
 * porque la extensión no se toca: ver `lib/nombre-archivo`.
 */
export interface PendienteSubida {
  file: File;
  base: string;
  ext: string;
}

function UploadModal({ onClose, onUpload, uploading, nombresEnCarpeta }: {
  onClose: () => void;
  onUpload: (pendientes: PendienteSubida[]) => void;
  uploading: boolean;
  /**
   * Los nombres que ya están en la carpeta donde se va a subir, para avisar de
   * los repetidos. Avisar, no bloquear: dos "Notes" de fechas distintas con el
   * mismo nombre son un descuido, no un error del sistema.
   */
  nombresEnCarpeta: readonly string[];
}) {
  const t  = useTranslations('phoenix.caseTabs.documents');
  const tc = useTranslations('phoenix.common');
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending]   = useState<PendienteSubida[]>([]);
  /** Los que quedaron afuera y por qué. Se muestran, no se descartan callados. */
  const [rechazos, setRechazos] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Suma los que se pueden y DICE por qué quedaron afuera los otros.
   *
   * Se filtra al elegir y no al subir: el navegador ya sabe tamaño y tipo en
   * este momento, y enterarse después de apretar "Subir" —con un "HTTP 400"—
   * es lo que hizo perder una mañana.
   */
  function agregar(files: File[]) {
    if (!files.length) return;
    const buenos: PendienteSubida[] = [];
    const malos: string[] = [];
    for (const f of files) {
      const motivo = motivoRechazo(f);
      if (motivo) malos.push(t(`rechazo_${motivo}`, { name: f.name, max: MAX_BYTES / (1024 * 1024) }));
      // El nombre arranca siendo el del archivo: quien ya lo renombró en su
      // computadora no tiene que volver a escribirlo.
      else buenos.push({ file: f, ...partirNombre(f.name) });
    }
    setPending(prev => {
      const juntos = [...prev, ...buenos];
      if (juntos.length > MAX_ARCHIVOS) {
        malos.push(t('rechazo_cantidad', { max: MAX_ARCHIVOS }));
        return juntos.slice(0, MAX_ARCHIVOS);
      }
      return juntos;
    });
    setRechazos(malos);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    agregar(Array.from(e.dataTransfer.files));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    agregar(Array.from(e.target.files ?? []));
    e.target.value = '';
  }

  function removeFile(idx: number) {
    setPending(prev => prev.filter((_, i) => i !== idx));
  }

  function renombrar(idx: number, base: string) {
    setPending(prev => prev.map((p, i) => (i === idx ? { ...p, base } : p)));
  }

  /**
   * Lo que impide subir ESE archivo, o `null` si está bien.
   *
   * Solo lo que rompe algo: un nombre vacío, uno con caracteres que el sistema
   * operativo no acepta, o uno que no entra en el campo. El nombre repetido NO
   * está acá a propósito — eso se avisa y se sube igual.
   */
  function problemaDeNombre(p: PendienteSubida): 'vacio' | 'invalido' | 'largo' | null {
    if (!p.base.trim()) return 'vacio';
    if (tieneCaracteresProhibidos(p.base)) return 'invalido';
    if (unirNombre(p.base, p.ext).length > LARGO_MAXIMO) return 'largo';
    return null;
  }

  const hayProblemas = pending.some(p => problemaDeNombre(p) !== null);

  function submit() {
    if (!pending.length || hayProblemas) return;
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

        {/* Lo que quedó afuera, con el motivo. Ámbar y no rojo: no se rompió
            nada, hay archivos que no se pueden subir y hay que saber cuáles. */}
        {rechazos.length > 0 && (
          <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 space-y-1">
            {rechazos.map((m, i) => (
              <p key={i} className="text-[11px] text-amber leading-relaxed">{m}</p>
            ))}
          </div>
        )}

        {/* Pending files list — el nombre se edita ACÁ, antes de subir.
            Lo pidió el usuario porque hoy lo renombra en su computadora antes
            de arrastrarlo (Erick, 2026-09-15). La extensión va al lado, fija:
            si se pierde, el visor no sabe qué mostrar y el archivo bajado no
            abre. */}
        {pending.length > 0 && (
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {pending.map((p, i) => {
              const problema = problemaDeNombre(p);
              const repetido = !problema && nombreRepetido(unirNombre(p.base, p.ext), nombresEnCarpeta);
              return (
                <div key={i} className="rounded-md bg-bg-2/60 border border-border/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <FileIcon mimeType={p.file.type} size={4} />
                    <input
                      value={p.base}
                      onChange={e => renombrar(i, e.target.value)}
                      aria-label={t('uploadNombreLabel')}
                      className={`flex-1 min-w-0 bg-transparent text-text-1 text-xs px-1.5 py-1 rounded border transition-colors focus:outline-none ${
                        problema
                          ? 'border-rose/50 focus:border-rose'
                          : 'border-transparent hover:border-border focus:border-brand/60 focus:bg-bg-2'
                      }`}
                    />
                    <span className="text-text-muted text-xs font-mono flex-shrink-0">{p.ext}</span>
                    <span className="text-text-muted text-xs font-mono flex-shrink-0">{formatBytes(p.file.size)}</span>
                    <button onClick={() => removeFile(i)} className="text-text-muted hover:text-rose transition-colors flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {problema && (
                    <p className="text-[10.5px] text-rose mt-1 pl-6">{t(`nombre_${problema}`)}</p>
                  )}
                  {repetido && (
                    <p className="text-[10.5px] text-amber mt-1 pl-6">{t('nombreRepetido')}</p>
                  )}
                </div>
              );
            })}
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
            disabled={uploading || pending.length === 0 || hayProblemas}
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

export function DocumentsTab({ caseId, readOnly = false, portal = 'admin', onVerArchivosDelPaciente, patientId }: {
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
  /**
   * Abre los archivos de la PERSONA. Sin esto no se dibuja el aviso de abajo.
   *
   * Lo pasa la pantalla que ya tiene ese diálogo montado —el detalle del caso,
   * colgado del avatar— en vez de montar uno segundo acá: son el mismo diálogo
   * y duplicarlo traería dos estados que se desincronizan al subir una foto.
   */
  onVerArchivosDelPaciente?: () => void;
  /**
   * El paciente dueño de los documentos de identidad. Opcional: solo lo manda
   * la ficha, que es donde se administran los papeles — ver
   * `CARPETA_IDENTIDAD_ID`. Sin él, la carpeta no se dibuja.
   */
  patientId?: string;
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
  /** Los papeles de la PERSONA — ver `CARPETA_IDENTIDAD_ID`. */
  const [identidad, setIdentidad]   = useState<DocIdentidad[]>([]);
  /**
   * La firma del lien de este caso — el HECHO, no el documento.
   *
   * Llega con la misma respuesta que la lista porque la fila del lien se pinta
   * dentro de la misma tabla: pedirla aparte obligaría a esperar dos
   * respuestas para dibujar un solo cuerpo.
   *
   * `null` = no hay firma. Eso cubre dos casos a la vez —el MVA que todavía no
   * firmó y el caso general, que no lleva lien— y en los dos la respuesta es la
   * misma: no hay documento que ofrecer.
   */
  const [lien, setLien] = useState<{ firmadoEl: string; firmadoPor: string | null } | null>(null);
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
  /** El documento o la carpeta cuyo nombre se está cambiando. */
  const [porRenombrar, setPorRenombrar]     = useState<DocItem | null>(null);
  const [renombrando, setRenombrando]       = useState(false);
  /**
   * La PAPELERA: es la misma lista con el filtro dado vuelta, no otra pantalla.
   *
   * Vive acá, al lado de donde se borra, porque el que se equivoca es el que se
   * da cuenta — y mandarlo a pedirle la restauración a alguien convierte cada
   * error en un ticket (Erick, 2026-09-13). No la ve el portal del abogado:
   * este tab es de back office y providers.
   */
  const [verPapelera, setVerPapelera]       = useState(false);

  /**
   * ─── Mover a otra carpeta (Erick, 2026-09-16) ─────────────────────────────
   *
   * Los items cuyo destino se está eligiendo. Es una LISTA y no un item suelto
   * porque el mismo diálogo sirve para una fila y para la selección múltiple —
   * que ya existía y no tenía ninguna acción útil colgada.
   *
   * Medido antes de construirlo: 3.212 archivos sueltos en la raíz, 938 de
   * ellos subidos en v3. Moverlos de a uno no es una función, es un castigo.
   */
  const [porMover, setPorMover]   = useState<DocItem[] | null>(null);
  const [moviendo, setMoviendo]   = useState(false);
  /**
   * Las carpetas del caso para el selector de destino.
   *
   * Son las de la RAÍZ y no todo el árbol, a propósito: en toda la base hay
   * 4.755 carpetas y **6** anidadas (medido 2026-09-16). El archivador real es
   * de un solo nivel, así que un selector con árbol resolvería un caso que no
   * existe y complicaría el que sí. Si algún día se anidan de verdad, acá es
   * donde hay que volver.
   */
  const [carpetasRaiz, setCarpetasRaiz] = useState<DocItem[] | null>(null);
  /** La fila que se está arrastrando por encima, para pintarla como destino. */
  const [dropEn, setDropEn] = useState<string | null>(null);

  /** Tipo propio en el portapapeles del arrastre: distingue mover una FILA de
   *  soltar un archivo del escritorio, que es otra cosa y otro destino. */
  const TIPO_ARRASTRE = 'application/x-pm-doc';

  const load = useCallback(async (parentId: string | null, papelera = false) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    /**
     * La carpeta virtual del intake no existe en la base: no hay nada que
     * pedirle a la API. Su único contenido es la fila generada, que se pinta
     * aparte. Sin este corte se iría un `parentId=__intake__` que no existe y
     * la pantalla mostraría un error donde tiene que haber un intake.
     */
    if (parentId === CARPETA_INTAKE_ID || parentId === CARPETA_IDENTIDAD_ID) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const partes = [parentId ? `parentId=${parentId}` : '', papelera ? 'papelera=1' : ''].filter(Boolean);
      const qs = partes.length ? `?${partes.join('&')}` : '';
      const res = await fetch(`${api}/documents${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.documents ?? []);
      // El portal legal no lo manda (su ruta sólo devuelve `documents`), así
      // que el `?? null` deja la fila apagada ahí sin ninguna rama extra.
      setLien(data.lien ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(currentParentId, verPapelera); }, [load, currentParentId, verPapelera]);

  /**
   * Los documentos de identidad del paciente, una sola vez al montar.
   *
   * No se recargan al navegar entre carpetas: no cambian por eso, y este tab ya
   * pide la lista del caso en cada paso. Se piden con `no-store` porque el
   * diálogo de archivos personales —que está a un clic de acá— puede acabar de
   * subir una foto, y el heurístico del navegador servía la lista vieja.
   */
  useEffect(() => {
    if (!patientId) return;
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/patients/${patientId}/documents`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!vivo) return;
        setIdentidad(
          ((data.documentos ?? []) as DocIdentidad[])
            .filter(d => !d.caseId && SLOTS_DE_IDENTIDAD.test(d.name)),
        );
      } catch {
        /* Silencio a propósito: si falla, la carpeta no aparece y el tab sigue
           mostrando los documentos del caso. Un error acá no puede tapar lo
           que la pantalla vino a hacer. */
      }
    })();
    return () => { vivo = false; };
  }, [patientId]);

  function navigateInto(folder: DocItem) {
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentParentId(folder.id);
  }

  /** Entrar a la carpeta virtual del intake — la que no existe en la base. */
  function entrarAlIntake() {
    setBreadcrumb(prev => [...prev, { id: CARPETA_INTAKE_ID, name: intakeFolderName }]);
    setCurrentParentId(CARPETA_INTAKE_ID);
  }

  /** Ídem para la de identificación. */
  function entrarAIdentidad() {
    setBreadcrumb(prev => [...prev, { id: CARPETA_IDENTIDAD_ID, name: t('identityFolderName') }]);
    setCurrentParentId(CARPETA_IDENTIDAD_ID);
  }

  /**
   * Abrir uno de los documentos de identidad.
   *
   * Va por la ruta del PACIENTE y no por la del caso, porque estos archivos no
   * tienen caso. Devuelve las dos URLs firmadas —ver y bajar— igual que la del
   * expediente, así que el visor es el mismo.
   */
  async function abrirIdentidad(doc: DocIdentidad) {
    if (!patientId) return;
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/documents/${doc.id}/download`);
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? `HTTP ${res.status}`); return; }
      viewer.show({ fileName: data.name ?? doc.name, url: data.url, downloadUrl: data.downloadUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
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
      if (!res.ok) {
        // El motivo del servidor, no el número. `INVALID_PARENT` y
        // `CASE_NOT_FOUND` explican algo; "HTTP 400" no.
        const d = await res.json().catch(() => ({}));
        throw new Error(t('alertCreateFolderFallo', {
          motivo: d.message ?? d.error ?? `HTTP ${res.status}`,
        }));
      }
      setNewFolderOpen(false);
      setNewFolderName('');
      // La lista de destinos queda vieja: si acabás de crear "MRI Results" para
      // meter algo ahí, el selector tiene que ofrecerla. Se invalida el caché y
      // la próxima apertura la vuelve a pedir.
      setCarpetasRaiz(null);
      load(currentParentId, verPapelera);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('alertCreateFolder'));
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleUpload(pendientes: PendienteSubida[]) {
    setUploading(true);
    try {
      for (const p of pendientes) {
        const file = p.file;
        // El nombre ELEGIDO, no el del archivo. Es el mismo en los tres pasos:
        // el de la clave en el bucket, el de la ficha y el de los mensajes de
        // error. Si se separaran, el error diría un nombre que la persona no
        // reconoce.
        const nombre = unirNombre(p.base, p.ext);
        const urlRes = await fetch(`/api/admin/cases/${caseId}/documents/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nombre,
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
          // El nombre del archivo en el mensaje: con diez seleccionados, saber
          // que "falló uno" no alcanza para nada.
          throw new Error(t('alertUploadFallo', {
            name: nombre,
            motivo: urlData.message ?? urlData.error ?? `HTTP ${urlRes.status}`,
          }));
        }

        /*
         * ⚠️ ESTE `ok` FALTABA, y era el bug silencioso.
         *
         * La respuesta del PUT al bucket no se miraba: si Supabase rechazaba el
         * archivo, igual se creaba la fila del documento. Quedaba en la lista,
         * con su nombre y su tamaño, apuntando a un archivo que NO EXISTE — y
         * eso recién se descubre el día que alguien lo quiere abrir, que puede
         * ser meses después y en manos de un abogado.
         *
         * Encontrado revisando el 400 de la subida (Erick, 2026-09-15).
         */
        const putRes = await fetch(urlData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (!putRes.ok) {
          /**
           * El cuerpo dice el motivo; el status no.
           *
           * Storage contesta **400** cuando el archivo pasa el techo del bucket,
           * y el "413 / EntityTooLarge" solo aparece adentro del JSON. Mostrar
           * el status pelado era decir "HTTP 400" sobre lo único que la persona
           * podía entender y arreglar sola: que el archivo pesa demasiado.
           *
           * No debería llegar acá —`motivoRechazo` lo frena al elegirlo— salvo
           * que `MAX_BYTES` y el techo del bucket se desincronicen. Justo ese
           * día es cuando hace falta que el mensaje diga la verdad.
           */
          const cuerpo = await putRes.text().catch(() => '');
          const esPorTamano = /EntityTooLarge|Payload too large|maximum allowed size/i.test(cuerpo);
          throw new Error(esPorTamano
            ? t('rechazo_grande', { name: nombre, max: MAX_BYTES / (1024 * 1024) })
            : t('alertUploadFallo', { name: nombre, motivo: `HTTP ${putRes.status}` }));
        }

        const regRes = await fetch(`/api/admin/cases/${caseId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nombre,
            isFolder: false,
            s3Key: urlData.s3Key,
            mimeType: file.type,
            size: file.size,
            parentId: currentParentId,
          }),
        });
        // Y este también: el archivo llegó al bucket pero sin fila no existe
        // para el sistema. Callarlo deja un huérfano que nadie va a buscar.
        if (!regRes.ok) {
          throw new Error(t('alertUploadFallo', {
            name: nombre,
            motivo: `HTTP ${regRes.status}`,
          }));
        }
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
   * Guardar el nombre nuevo.
   *
   * La lista se recarga en vez de parchear la fila en memoria: el orden es por
   * nombre (`orderBy: [{ isFolder }, { name }]`), así que un documento
   * renombrado casi siempre cambia de lugar. Parchearlo lo dejaría con el
   * nombre nuevo en la posición vieja hasta la próxima recarga.
   */
  /**
   * ─── Mover ────────────────────────────────────────────────────────────────
   *
   * Un PATCH por item, en serie y no en paralelo: son pocos y el servidor
   * escribe un audit log por cada uno. Mandar 40 a la vez no acelera nada que
   * el usuario perciba y multiplica por 40 el pico de escritura.
   *
   * Si uno falla, se cuenta y se sigue: que el archivo 7 tenga un problema no
   * es razón para dejar los otros 39 a mitad de camino. Al final se dice
   * cuántos no pudieron.
   */
  async function moverA(items: DocItem[], destino: string | null) {
    if (items.length === 0) return;
    setMoviendo(true);
    let fallaron = 0;
    try {
      for (const item of items) {
        try {
          const res = await fetch(`/api/admin/cases/${caseId}/documents/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parentId: destino }),
          });
          if (!res.ok) fallaron++;
        } catch { fallaron++; }
      }
      if (fallaron > 0) alert(t('alertMoveFallo', { n: fallaron }));
      setPorMover(null);
      setSelected(new Set());
      load(currentParentId, verPapelera);
    } finally {
      setMoviendo(false);
    }
  }

  /**
   * Abre el selector de destino. Trae las carpetas de la raíz la primera vez y
   * las deja cacheadas: el diálogo se abre muchas veces seguidas mientras se
   * ordena un expediente y pedir la misma lista cada vez sería ruido.
   */
  async function pedirDestino(items: DocItem[]) {
    setPorMover(items);
    if (carpetasRaiz !== null) return;
    try {
      const res = await fetch(`${api}/documents`);
      const data = await res.json();
      setCarpetasRaiz((data.documents ?? []).filter((d: DocItem) => d.isFolder));
    } catch {
      setCarpetasRaiz([]);
    }
  }

  /**
   * ¿Se puede mover esto?
   *
   * La carpeta virtual del intake queda afuera de las dos puntas: no existe en
   * la base, así que no hay id que escribir como destino ni fila que mover como
   * origen. Y en la papelera no se ordena: lo borrado se restaura primero.
   */
  function sePuedeMover(item: DocItem): boolean {
    return !readOnly && !verPapelera && item.id !== CARPETA_INTAKE_ID;
  }

  /** ¿El arrastre que viene encima es una FILA nuestra, y no un archivo del
   *  escritorio? Sin esto, arrastrar un PDF desde el explorador pintaría las
   *  carpetas como destino y al soltarlo no pasaría nada. */
  function esArrastreDeFila(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes(TIPO_ARRASTRE);
  }

  /**
   * Qué se mueve al soltar.
   *
   * Si arrastraste una fila que está DENTRO de la selección, se mueve la
   * selección entera —es lo que el usuario ve marcado y lo que espera—. Si
   * arrastraste una fila de afuera, se mueve solo esa y la selección no se
   * toca: nadie quiere mover 12 archivos por agarrar el decimotercero.
   */
  function loQueSeArrastra(item: DocItem): DocItem[] {
    return selected.has(item.id) ? items.filter(i => selected.has(i.id)) : [item];
  }

  async function confirmarRenombrado(item: DocItem, nombre: string) {
    if (nombre === item.name) { setPorRenombrar(null); return; }
    setRenombrando(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/documents/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(t('alertRenameFallo', {
          motivo: d.message ?? d.error ?? `HTTP ${res.status}`,
        }));
      }
      setPorRenombrar(null);
      load(currentParentId, verPapelera);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('alertRenameFallo', { motivo: '—' }));
    } finally {
      setRenombrando(false);
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
  const lienFileName   = `${t('lienName')}.pdf`;
  function verIntake() {
    viewer.show({
      fileName:    intakeFileName,
      url:         `${api}/pdf`,
      downloadUrl: `${api}/pdf?download=1`,
    });
  }

  /**
   * El acuerdo firmado. Va SIEMPRE por `/api/admin/*`, nunca por `api`: la
   * ruta del portal legal exige la firma del ABOGADO y le daría 409 a la
   * clínica por una regla que no es suya. Y el bufete no ve esta fila —no le
   * llega el dato— así que acá nadie golpea la puerta equivocada.
   */
  function verLien() {
    viewer.show({
      fileName:    lienFileName,
      url:         `/api/admin/cases/${caseId}/lien`,
      downloadUrl: `/api/admin/cases/${caseId}/lien`,
    });
  }

  /**
   * ─── Dónde se ve el intake ─────────────────────────────────────────────────
   *
   * Antes: suelto en la raíz. Ahora: **dentro de la carpeta del intake**, como
   * en el v2 (Erick, 2026-09-15).
   *
   * La carpeta puede ser de dos clases y la diferencia importa:
   *
   *  · **La real**, en los 643 casos migrados que ya la traen. Ahí el intake
   *    generado se muestra ADENTRO, junto al escaneado del v2. No se crea una
   *    carpeta paralela: el caso vería dos cajones que parecen el mismo y nadie
   *    sabría cuál abrir.
   *  · **Una virtual**, en los casos que no la tienen. No es una fila de la
   *    base a propósito — por la misma razón que el intake tampoco lo es: una
   *    carpeta real se puede renombrar (desde hoy), se puede mandar a la
   *    papelera, y alguien puede subirle cualquier cosa adentro. Y habría que
   *    crearla en los ~2.400 casos que no la tienen.
   *
   * En la papelera no aparece ninguna de las dos: ahí se listan cosas borradas
   * y el intake no se puede borrar.
   */
  const intakeFolderName = t('intakeFolderName');

  /** ¿El caso ya trae la carpeta del v2? Entonces esa manda. */
  const hayCarpetaReal = items.some(i => i.isFolder && esCarpetaDeIntake(i.name));

  /** El nombre de la carpeta en la que estamos parados ahora. */
  const carpetaActual = breadcrumb[breadcrumb.length - 1]?.name ?? '';

  const dentroDelIntake =
    currentParentId === CARPETA_INTAKE_ID ||
    (currentParentId !== null && esCarpetaDeIntake(carpetaActual));

  const mostrarIntake = !verPapelera && dentroDelIntake;
  const mostrarCarpetaVirtual = !verPapelera && currentParentId === null && !hayCarpetaReal;

  /* La de identidad solo en la raíz, y solo si el paciente tiene algo guardado:
     una carpeta vacía en cada expediente sería una fila que no dice nada. */
  const mostrarCarpetaIdentidad =
    !verPapelera && currentParentId === null && identidad.length > 0;
  const dentroDeIdentidad = currentParentId === CARPETA_IDENTIDAD_ID;

  /**
   * Adentro de la carpeta virtual no se puede subir ni crear carpetas: no hay
   * un `parentId` de verdad al que colgarlas. Mostrar los botones ahí sería
   * ofrecer algo que no puede funcionar.
   */
  const carpetaSoloLectura =
    currentParentId === CARPETA_INTAKE_ID || currentParentId === CARPETA_IDENTIDAD_ID;

  return (
    <>
      <FileViewerDialog {...viewer.props} />
      {/* ─── Dónde están los papeles de la PERSONA ───────────────────────────
          Este tab lista los documentos DEL CASO. La licencia de conducir, la
          tarjeta del seguro y la foto de perfil no están acá y no es un olvido:
          cuelgan del paciente con `caseId` en NULL, a propósito, por dos razones
          que no se tocan (ver `lib/fotos-identidad.ts`) — el portal legal sirve
          todos los documentos de un caso, y 180 pacientes tienen dos o más casos
          vivos, así que una licencia no pertenece a ninguno en particular.

          Lo que faltaba era decirlo. El staff abría este tab, veía una sola
          carpeta y concluía que la licencia no estaba guardada (reportado
          2026-09-17). No es un enlace de más: es la única señal de que esos
          papeles existen y viven al lado.

          Sólo con `onVerArchivosDelPaciente`, o sea sólo donde el diálogo ya
          está montado. El portal legal no lo recibe —ni debe: los documentos de
          identidad del paciente no son suyos. */}
      {onVerArchivosDelPaciente && !readOnly && (
        <button
          type="button"
          onClick={onVerArchivosDelPaciente}
          className="w-full mb-2 flex items-center gap-2 rounded-lg border border-cyan/25 bg-cyan/[0.04] hover:bg-cyan/[0.08] transition-colors px-3 min-h-11 sm:min-h-0 sm:py-2 text-left"
        >
          <IdCard className="w-3.5 h-3.5 text-cyan shrink-0" />
          <span className="text-[12px] text-text-2 flex-1 min-w-0">{t('personalFilesHint')}</span>
          <ChevronRight className="w-3.5 h-3.5 text-cyan shrink-0" />
        </button>
      )}

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
                  /* El breadcrumb también recibe: es la única forma de SACAR
                     algo de una carpeta arrastrando. Sin esto el arrastre sería
                     de ida nomás — se puede archivar, no desarchivar. */
                  <button
                    onClick={() => navigateTo(item)}
                    onDragOver={e => {
                      if (item.id === CARPETA_INTAKE_ID || !esArrastreDeFila(e)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDropEn(`bc:${item.id ?? 'root'}`);
                    }}
                    onDragLeave={() => setDropEn(null)}
                    onDrop={e => {
                      if (item.id === CARPETA_INTAKE_ID || !esArrastreDeFila(e)) return;
                      e.preventDefault();
                      setDropEn(null);
                      const arrastrado = items.find(i => i.id === e.dataTransfer.getData(TIPO_ARRASTRE));
                      if (arrastrado) void moverA(loQueSeArrastra(arrastrado), item.id);
                    }}
                    className={`hover:text-brand-text transition-colors flex items-center gap-1 rounded px-1 ${
                      dropEn === `bc:${item.id ?? 'root'}` ? 'bg-brand/15 ring-1 ring-brand/50 text-brand-text' : ''
                    }`}
                  >
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
            {!readOnly && !verPapelera && !carpetaSoloLectura && (
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
            {/* Estaba en español duro con su plural a mano —"seleccionado{s}"—
                así que a un usuario en inglés le salía en castellano. */}
            <span className="text-brand-text font-medium text-xs">{t('bulkSelected', { n: selected.size })}</span>
            {/* Mover la selección entera. Es la razón por la que esta barra
                existía sin tener nada útil que ofrecer: con 3.212 archivos
                sueltos en la raíz, ordenarlos de a uno no es viable. */}
            {!readOnly && !verPapelera && (
              <button
                onClick={() => void pedirDestino(items.filter(i => selected.has(i.id) && sePuedeMover(i)))}
                className="flex items-center gap-1.5 text-text-2 hover:text-brand-text transition-colors text-xs"
              >
                <FolderInput className="w-3.5 h-3.5" /> {t('moveTitle')}
              </button>
            )}
            <button
              onClick={() => alert(t('alertBulkS3'))}
              className="flex items-center gap-1.5 text-text-2 hover:text-brand-text transition-colors text-xs"
            >
              <Download className="w-3.5 h-3.5" /> {t('bulkDownload')}
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
        ) : items.length === 0 && !mostrarIntake && !mostrarCarpetaVirtual
             && !mostrarCarpetaIdentidad && !dentroDeIdentidad ? (
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
                {/* En una carpeta virtual no hay nada que seleccionar: sus
                    filas no llevan casilla porque no son de la base. La de
                    "todos" quedaba igual y no hacía nada — una casilla que no
                    marca nada es peor que ninguna. Vale para identificación y
                    también para el intake, que arrastraba lo mismo. */}
                <th className="px-4 py-2.5 w-9">
                  {!carpetaSoloLectura && (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="accent-brand w-3.5 h-3.5 cursor-pointer"
                      title={tc('selectAll')}
                    />
                  )}
                </th>
                <th className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('colName')}</th>
                <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell whitespace-nowrap">{t('colSize')}</th>
                <th className="text-right px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden md:table-cell whitespace-nowrap">Última modificación</th>
                <th className="w-16 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {/* La carpeta del intake cuando el caso no trae la del v2. No es
                  una fila de la base: sin casilla, sin renombrar y sin borrar.
                  Va primero porque las carpetas van antes que los archivos, y
                  la API ya ordena así (`isFolder: 'desc'`). */}
              {mostrarCarpetaVirtual && (
                <tr
                  className="hover:bg-cyan/[0.04] group transition-colors cursor-pointer bg-cyan/[0.02]"
                  onClick={entrarAlIntake}
                >
                  <td className="px-4 py-2.5">
                    <Folder className="w-3.5 h-3.5 text-cyan mx-auto" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-text-1 group-hover:text-cyan transition-colors font-normal" title={intakeFolderName}>
                        {intakeFolderName}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-cyan border border-cyan/30 rounded px-1.5 py-px flex-shrink-0">
                        {t('intakeBadge')}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs font-mono hidden sm:table-cell whitespace-nowrap">—</td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs hidden md:table-cell whitespace-nowrap">
                    {t('intakeAlwaysCurrent')}
                  </td>
                  <td className="px-3 py-2.5" />
                </tr>
              )}
              {/* La carpeta de identificación. Mismas reglas que la del intake:
                  no es una fila de la base, no se selecciona, no se renombra y
                  no se borra. Va en cyan por lo mismo — no la subió nadie acá. */}
              {mostrarCarpetaIdentidad && (
                <tr
                  className="hover:bg-cyan/[0.04] group transition-colors cursor-pointer bg-cyan/[0.02]"
                  onClick={entrarAIdentidad}
                >
                  <td className="px-4 py-2.5">
                    <Folder className="w-3.5 h-3.5 text-cyan mx-auto" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-text-1 group-hover:text-cyan transition-colors font-normal" title={t('identityFolderName')}>
                        {t('identityFolderName')}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-cyan border border-cyan/30 rounded px-1.5 py-px flex-shrink-0">
                        {t('identityBadge')}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs font-mono hidden sm:table-cell whitespace-nowrap">—</td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs hidden md:table-cell whitespace-nowrap">
                    {t('identityCount', { count: identidad.length })}
                  </td>
                  <td className="px-3 py-2.5" />
                </tr>
              )}
              {/* Adentro de la carpeta: los papeles de la persona. Se abren y se
                  bajan; no se mueven ni se borran desde acá, porque no son del
                  caso — eso se hace en Archivos personales, que es su dueño. */}
              {dentroDeIdentidad && identidad.map(doc => (
                <tr
                  key={doc.id}
                  className="hover:bg-cyan/[0.04] group transition-colors cursor-pointer"
                  onClick={() => { void abrirIdentidad(doc); }}
                >
                  <td className="px-4 py-2.5"><FileIcon mimeType={doc.mimeType} /></td>
                  <td className="px-3 py-2.5">
                    <span className="truncate text-text-1 group-hover:text-cyan transition-colors" title={doc.name}>
                      {doc.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs font-mono hidden sm:table-cell whitespace-nowrap">
                    {formatBytes(doc.size)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs hidden md:table-cell whitespace-nowrap">
                    {formatDate(doc.createdAt)}
                  </td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <div className={ACCIONES_DE_FILA}>
                      {/* El mismo botón que las filas del caso: abre el visor,
                          que es donde está la descarga. */}
                      <button
                        onClick={() => { void abrirIdentidad(doc); }}
                        className="p-1 rounded text-text-muted hover:text-brand-text transition-colors"
                        title={tc('download')}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
                    <div className={ACCIONES_DE_FILA}>
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
              {/* El LIEN, al lado del formulario de admisión.
                  Las dos cosas que el paciente firma en el intake de un MVA, en
                  el mismo cajón. Hasta el 2026-09-17 el acuerdo firmado sólo lo
                  podía abrir el bufete: acá no aparecía nunca, y en el tab Caso
                  el botón de imprimir vivía adentro de un `isAttorney`. La
                  clínica lo hace firmar y era la única que no podía verlo.

                  Sólo si hay firma del paciente. Sin firma no hay acuerdo que
                  mostrar, y un caso que no es MVA no lleva lien — la ausencia de
                  firma ya lo dice, no hace falta mirar el tipo de caso. */}
              {mostrarIntake && lien && (
                <tr
                  className="hover:bg-cyan/[0.04] group transition-colors cursor-pointer bg-cyan/[0.02]"
                  onClick={verLien}
                >
                  <td className="px-4 py-2.5">
                    <FileText className="w-3.5 h-3.5 text-cyan mx-auto" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-text-1 group-hover:text-cyan transition-colors font-normal" title={lienFileName}>
                        {lienFileName}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-cyan border border-cyan/30 rounded px-1.5 py-px flex-shrink-0">
                        {t('intakeBadge')}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs font-mono hidden sm:table-cell whitespace-nowrap">—</td>
                  <td className="px-3 py-2.5 text-right text-text-muted text-xs hidden md:table-cell whitespace-nowrap">
                    {/* Acá SÍ va una fecha, al revés que el formulario: la firma
                        ocurrió en un momento y ese momento es el dato que
                        importa de un documento legal. */}
                    {formatDate(lien.firmadoEl)}
                  </td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <div className={ACCIONES_DE_FILA}>
                      <a
                        href={`/api/admin/cases/${caseId}/lien`}
                        target="_blank"
                        rel="noopener"
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
                  /* Arrastrar la fila para archivarla. Es el ATAJO, no el
                     camino: en móvil el arrastre no existe (Regla #4) y por eso
                     el botón "Mover a…" hace lo mismo desde el menú. */
                  draggable={sePuedeMover(item)}
                  onDragStart={e => {
                    if (!sePuedeMover(item)) return;
                    e.dataTransfer.effectAllowed = 'move';
                    // Tipo propio: así una carpeta sabe que lo que viene es una
                    // fila y no un PDF del escritorio.
                    e.dataTransfer.setData(TIPO_ARRASTRE, item.id);
                    e.dataTransfer.setData('text/plain', item.name);
                  }}
                  onDragEnd={() => setDropEn(null)}
                  /* Una CARPETA es destino; un archivo no. Soltar sobre un
                     archivo no significa nada, así que ni se pinta. */
                  onDragOver={e => {
                    if (!item.isFolder || !sePuedeMover(item) || !esArrastreDeFila(e)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropEn(item.id);
                  }}
                  onDragLeave={e => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropEn(null);
                  }}
                  onDrop={e => {
                    if (!item.isFolder || !sePuedeMover(item) || !esArrastreDeFila(e)) return;
                    e.preventDefault();
                    setDropEn(null);
                    const id = e.dataTransfer.getData(TIPO_ARRASTRE);
                    const arrastrado = items.find(i => i.id === id);
                    // Soltar una carpeta sobre sí misma no es un error, es un
                    // gesto sin efecto: se ignora en silencio.
                    if (!arrastrado || arrastrado.id === item.id) return;
                    void moverA(loQueSeArrastra(arrastrado).filter(i => i.id !== item.id), item.id);
                  }}
                  className={`hover:bg-white/[0.02] group transition-colors cursor-pointer ${selected.has(item.id) ? 'bg-brand/[0.03]' : ''} ${
                    dropEn === item.id ? 'bg-brand/10 ring-1 ring-inset ring-brand/50' : ''
                  }`}
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
                    <div className={ACCIONES_DE_FILA}>
                      {!item.isFolder && (
                        <button onClick={() => void abrirArchivo(item)} className="p-1 rounded text-text-muted hover:text-brand-text transition-colors" title={tc('download')}>
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* Renombrar. En la papelera no: lo que está borrado no
                          se edita, se restaura primero. */}
                      {!readOnly && !verPapelera && (
                        <button
                          onClick={() => setPorRenombrar(item)}
                          className="p-1 rounded text-text-muted hover:text-brand-text transition-colors"
                          title={t('renameTitle')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {/* Mover. El mismo acto que arrastrar la fila, con botón:
                          el arrastre no existe en una pantalla táctil, y con el
                          teclado tampoco. Este es el camino, no el respaldo. */}
                      {sePuedeMover(item) && (
                        <button
                          onClick={() => void pedirDestino(loQueSeArrastra(item))}
                          className="p-1 rounded text-text-muted hover:text-brand-text transition-colors"
                          title={t('moveTitle')}
                        >
                          <FolderInput className="w-3.5 h-3.5" />
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

      {/* Renombrar. Hasta hoy el nombre se fijaba al subir y no se podía tocar
          nunca más (Erick, 2026-09-15). La extensión se muestra al lado del
          campo y NO se edita: si se pierde, el visor no sabe qué mostrar y el
          archivo descargado no abre. Las carpetas no tienen extensión, así que
          ahí el campo es el nombre entero. */}
      {porRenombrar && (
        <RenameModal
          item={porRenombrar}
          nombresEnCarpeta={items.filter(i => i.id !== porRenombrar.id).map(i => i.name)}
          guardando={renombrando}
          onClose={() => setPorRenombrar(null)}
          onSave={nuevo => void confirmarRenombrado(porRenombrar, nuevo)}
        />
      )}

      {/* Elegir carpeta destino. Lo abren el botón de la fila, el de la barra
          de selección y nadie más: el arrastre mueve derecho, sin preguntar. */}
      {porMover && porMover.length > 0 && (
        <MoveModal
          items={porMover}
          carpetas={carpetasRaiz}
          origenId={currentParentId}
          moviendo={moviendo}
          onClose={() => setPorMover(null)}
          onMove={destino => void moverA(porMover, destino)}
        />
      )}

      {/* Upload Modal */}
      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUpload={handleUpload}
          uploading={uploading}
          nombresEnCarpeta={items.map(i => i.name)}
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
