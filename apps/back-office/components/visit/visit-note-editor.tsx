'use client';
import { localeApp } from '@/lib/fechas';

/**
 * VisitNoteEditor — nota clínica del doctor (B.18 · N1).
 *
 * Misma estructura que las plantillas: 6 secciones en editor rich text +
 * diagnósticos ICD-10 ↔ SNOMED. Los signos vitales NO están aquí (viven en el
 * nodo Triaje).
 *
 * Diferencias intencionales frente al v2:
 *   - Botón "Cargar plantilla completa" además del de cada sección.
 *   - Autoguardado cada 30 s (el v2 depende del botón manual).
 *   - Al firmar, la nota queda en solo lectura (inmutable, HIPAA).
 */

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@precision/ui';
import {
  Eraser, FileStack, Plus, X, Loader2, Check, ShieldCheck, Lock, Printer, AlertTriangle,
  Stethoscope, Unlock, Scissors, LogOut, BellRing,
} from 'lucide-react';
import { RichTextEditor, TagPill, type RichTextEditorHandle } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { MedicalHistoryButton } from '@/components/patients/medical-history-button';
import { resolveMergeFields, type SnippetMergeData } from '@/lib/snippet-merge';
import type { SnippetSection } from '@/lib/snippet-sections';
import { useSectionLabels } from '@/lib/use-section-labels';
import { useCandadoNota } from '@/lib/use-candado-nota';
import { DiagnosisPicker, type DiagnosisRow } from './diagnosis-picker';
import { TemplatePicker, type PickableTemplate } from './template-picker';
import { VisitNotePrintDialog } from './visit-note-print-dialog';
import { SnippetPanel, type SnippetItem } from './snippet-panel';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface NoteDx {
  icd10Code: string | null;
  icd10Label: string | null;
  snomedCode: string | null;
  snomedLabel: string | null;
  diagnosisId?: string | null;
}

export interface VisitNoteData {
  status: string;                 // DRAFT | SIGNED | VOIDED
  signedAt: string | null;
  signedByName: string | null;
  templateId: string | null;
  chiefComplaint: string | null;
  hpi: string | null;
  ros: string | null;
  physicalExam: string | null;
  assessment: string | null;
  plan: string | null;
  diagnoses: NoteDx[];
  /**
   * Versión de la nota. Viaja en cada guardado para que el servidor pueda
   * rechazar el PUT si alguien guardó en el medio (ver la ruta del PUT).
   * Opcional: si la pantalla que monta el editor no la trae, el control de
   * versión simplemente no actúa — no rompe nada.
   */
  updatedAt?: string | null;
}

interface Props {
  appointmentId: string;
  /**
   * Habilita el botón que abre el Historial Médico completo del paciente.
   *
   * La nota es el documento de ESTA cita; el historial es la ficha permanente
   * del paciente. El doctor necesita las dos a la vez —leer la alergia mientras
   * escribe el plan, corregir un medicamento mal cargado— y hasta ahora tenía
   * que salir de la nota a medio escribir.
   */
  patientId?: string;
  note: VisitNoteData | null;
  templates: PickableTemplate[];
  userId: string | null;
  /**
   * false para el asistente en Day Admission: puede escribir el borrador (flujo
   * de escriba) pero NO firmar — la firma es del médico y el servidor también
   * la rechaza. Default true (portal médico).
   */
  canSign?: boolean;
  /** Aviso al padre tras guardar, para que recargue la nota */
  onSaved?: () => void;
  /**
   * Guardar y SALIR. El botón se dibuja solo si el padre pasa esta función,
   * porque el destino no lo puede saber el editor: se monta en cuatro pantallas
   * y cada una vuelve a un lugar distinto (la cola del día, Mi Día, cerrar el
   * diálogo). Cada padre reusa la MISMA expresión de destino que ya usa su
   * botón de volver, para que las dos puertas no se desincronicen.
   *
   * Por qué existe: el dato ya estaba a salvo —hay autoguardado cada 2,5 s,
   * guardado al perder el foco y `flush()` con `keepalive` al desmontar—, pero
   * `Save` se DESHABILITA cuando no hay cambios pendientes, así que justo
   * después del autoguardado el doctor veía el botón gris y ninguna salida en la
   * fila; el único llamativo que quedaba era "Finish note", que firma.
   */
  onSaveExit?: () => void;
  /**
   * Avisa cuando hay cambios sin guardar. Lo usa Day Admission para NO recargar
   * la nota mientras el asistente escribe: el refresco en vivo le pisaría el
   * texto a mitad de una frase.
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * EL TURNO de la nota, cuando quien mira no es el doctor de la cita.
   *
   * `enConsulta` = el doctor está adentro con el paciente y todavía no cerró la
   * consulta: la nota es suya y acá se ve en solo lectura, en vivo. Cuando la
   * cierra, el turno pasa solo — que es el flujo real (el doctor la llena, sale,
   * y el asistente la termina en el checkout).
   *
   * Sin este prop el editor se comporta como siempre (portal del médico): es el
   * doctor, es su turno. El servidor aplica la misma regla por su cuenta, así que
   * esto es la CARA de la regla, no la regla.
   */
  turno?: { enConsulta: boolean; doctorName: string | null };
  /**
   * Avisa si AHORA MISMO se puede escribir en la nota — lo consume la tarjeta de
   * mensajes del caso para habilitar o bloquear "Citar en la nota".
   *
   * Va como callback y no como cuenta del padre porque `soloLectura` depende de
   * `tomadaUi`, que vive acá adentro: el asistente que aprieta "Tomar la nota"
   * pasa a poder escribir sin que el padre se enterara.
   */
  onPuedeEscribirChange?: (puede: boolean) => void;
  /**
   * Datos del paciente para los campos de combinación de los snippets
   * (`[Patient Name]`, `[Age]`…). Salen del contexto del paciente que la
   * consulta y Day Admission ya tienen (`mergeDataFromPatient`). Sin esto los
   * snippets se insertan igual y los campos quedan como rótulo entre corchetes,
   * para que se vea que falta completarlos.
   */
  mergeData?: SnippetMergeData | null;
}

/** Lo que el padre puede pedirle al editor desde afuera. */
export interface VisitNoteEditorHandle {
  /**
   * Agrega HTML al final del HPI, como si lo hubiera tecleado quien mira.
   *
   * Es la MITAD del puente con la mensajería: la otra mitad es que alguien
   * aprete el botón. La nota se firma, así que nada entra al cuerpo sin que una
   * persona lo decida — acá no hay auto-inyección de nada.
   */
  citarEnHpi: (html: string) => void;
}

/** Campo de la nota ↔ sectionKey de la plantilla */
const SECTIONS = [
  { field: 'chiefComplaint', key: 'QUEJA_PRINCIPAL' },
  { field: 'hpi',            key: 'HPI' },
  { field: 'ros',            key: 'ROS' },
  { field: 'physicalExam',   key: 'EXAMEN_FISICO' },
  { field: 'assessment',     key: 'EVALUACIONES' },
  { field: 'plan',           key: 'PLAN' },
] as const;

type SectionField = typeof SECTIONS[number]['field'];

/**
 * Debounce del autoguardado: se guarda 2,5 s después de la ÚLTIMA tecla.
 *
 * Antes eran 30_000 y no era un debounce sino un plazo: el temporizador se
 * armaba cuando `dirty` pasaba a true y no se reiniciaba al seguir escribiendo,
 * así que la nota viajaba a la base 30 s después del primer caracter. Y el
 * editor se DESMONTA al cambiar de tab (`{tab === 'notes' && ...}`), lo que
 * cancelaba ese temporizador sin guardar: el doctor escribía, tocaba
 * "Laboratorios" antes de los 30 s y perdía el texto.
 */
const AUTOSAVE_MS = 2_500;

/**
 * Una celda de la fila de acciones EN TELÉFONO: dos por fila, del mismo ancho, y
 * el que queda impar toma la fila entera. Desde `sm` cada botón vuelve a medir
 * su contenido y la fila es la de siempre.
 *
 * Se aplica botón por botón en vez de con un `[&>*]` en el contenedor porque
 * `MedicalHistoryButton` devuelve un Fragment (el botón MÁS su diálogo), así que
 * "los hijos del contenedor" no es lo mismo que "los botones" y el criterio
 * dependería de que ese diálogo siga saliendo por un portal.
 *
 * El `0.25rem` es la mitad del `gap-2`.
 */
const CELDA_MOVIL = 'flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto';

/** Preferencia local: qué secciones tienen la lista de snippets abierta (JSON de campos). */
const SNIPPETS_PREF = 'pm.nota.snippets.secciones';
/** Alto del editor de cada sección; la lista de snippets de adentro se estira con él. */
const SECTION_MIN_HEIGHT = 150;

function parseDx(content: string): NoteDx[] {
  try {
    const arr = JSON.parse(content) as Array<{
      icd10Code?: string; icd10Description?: string;
      snomedCode?: string | null; snomedDescription?: string | null;
    }>;
    return Array.isArray(arr)
      ? arr.map((d) => ({
          icd10Code: d.icd10Code ?? null,
          icd10Label: d.icd10Description ?? null,
          snomedCode: d.snomedCode ?? null,
          snomedLabel: d.snomedDescription ?? null,
        }))
      : [];
  } catch { return []; }
}

// ─── Componente ──────────────────────────────────────────────────────────────

export const VisitNoteEditor = React.forwardRef<VisitNoteEditorHandle, Props>(function VisitNoteEditor({
  appointmentId, patientId, note, templates, userId, canSign = true, onSaved, onSaveExit, onDirtyChange, turno,
  onPuedeEscribirChange, mergeData = null,
}: Props, refExterno): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const { label: secLabel } = useSectionLabels();
  const router = useRouter();
  const pathname = usePathname();

  // ── Snippets por sección ───────────────────────────────────────────────────
  //
  // Cada sección lleva su lista "Available Snippets" DENTRO del recuadro del
  // editor, a la izquierda del texto, como en Medusa — la forma que los
  // doctores ya conocen (Erick, 2026-09-05/06). Se abre y se cierra POR SECCIÓN
  // con el enlace "Snippets" del título; arranca cerrada, y las secciones que
  // cada provider deja abiertas se recuerdan en su navegador. El HTML se inserta
  // en el cursor del editor de esa sección, con los campos del paciente ya
  // resueltos, y el editor avisa por `onChange` como si se hubiera tecleado —
  // así pasa por `setSection` y el autoguardado.
  const [snippetsAbiertos, setSnippetsAbiertos] = React.useState<Set<SectionField>>(() => new Set());
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SNIPPETS_PREF);
      if (raw) setSnippetsAbiertos(new Set((JSON.parse(raw) as string[]).filter((f): f is SectionField => SECTIONS.some((s) => s.field === f))));
    } catch { /* sin storage o valor viejo */ }
  }, []);
  const toggleSnippets = (field: SectionField): void => {
    setSnippetsAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field); else next.add(field);
      try { window.localStorage.setItem(SNIPPETS_PREF, JSON.stringify([...next])); } catch { /* sin storage */ }
      return next;
    });
  };
  const editores = React.useRef<Partial<Record<SectionField, RichTextEditorHandle | null>>>({});
  // El catálogo vive en el portal médico. Desde el back-office (Day Admission)
  // el asistente no tiene adónde ir a crear uno, así que no se le ofrece.
  const settingsHref = (key: SnippetSection): string | null =>
    pathname.startsWith('/doctor') ? `/doctor/settings/snippets/${key}` : null;

  const insertarSnippet = (field: SectionField, s: SnippetItem): void => {
    editores.current[field]?.insertHtmlAtCursor(resolveMergeFields(s.content, mergeData));
    // Telemetría, fire-and-forget: si falla, la nota ya tiene el texto.
    void fetch(`/api/admin/snippets/${s.id}/use`, { method: 'POST' }).catch(() => {});
  };

  const isSigned = note?.status === 'SIGNED';

  const [content, setContent] = React.useState<Record<SectionField, string>>(() => ({
    chiefComplaint: note?.chiefComplaint ?? '',
    hpi:            note?.hpi ?? '',
    ros:            note?.ros ?? '',
    physicalExam:   note?.physicalExam ?? '',
    assessment:     note?.assessment ?? '',
    plan:           note?.plan ?? '',
  }));
  const [dx, setDx] = React.useState<NoteDx[]>(note?.diagnoses ?? []);
  /** La hoja imprimible abierta en el visor, en vez de en otra pestaña. */
  const [printNote, setPrintNote] = React.useState(false);
  const [templateId, setTemplateId] = React.useState<string | null>(note?.templateId ?? null);

  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState('');

  const [tplTarget, setTplTarget] = React.useState<string | null | undefined>(undefined); // undefined = cerrado
  /**
   * Plantilla completa esperando confirmacion. "Cargar plantilla completa" pisa
   * las secciones Y los diagnosticos; si la nota ya tiene algo escrito se
   * pregunta antes, en vez de borrar en silencio.
   */
  const [tplPorConfirmar, setTplPorConfirmar] = React.useState<PickableTemplate | null>(null);
  /** Confirmación de "Clear all" — ver `limpiarNota`. */
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [dxPickerMode, setDxPickerMode] = React.useState<'ICD10' | 'SNOMED' | null>(null);
  const [confirmSign, setConfirmSign] = React.useState(false);
  const [signing, setSigning] = React.useState(false);

  // Ref con el estado más reciente para que el autosave no capture valores viejos
  const latest = React.useRef({ content, dx, templateId });
  React.useEffect(() => { latest.current = { content, dx, templateId }; }, [content, dx, templateId]);

  // ── Guardado parcial y control de versión ─────────────────────────────────
  //
  // Antes cada autoguardado mandaba la nota ENTERA: las 6 secciones y los
  // diagnósticos. Con dos personas en la misma nota eso es una bomba — el que
  // guardaba último pisaba todo lo del otro sin que nadie se enterara. Ahora
  // viaja solo lo que esta persona tocó, así que el doctor escribiendo el examen
  // físico y el asistente transcribiendo la queja principal ya no se cruzan.

  /** La versión que tiene esta pantalla. El servidor la compara con la de la base. */
  const version = React.useRef<string | null>(note?.updatedAt ?? null);
  /** Qué secciones tocó ESTA persona desde el último guardado. */
  const tocadas = React.useRef<Set<SectionField>>(new Set());
  const dxTocado = React.useRef(false);
  const tplTocado = React.useRef(false);
  /** "Tomé la nota" con la consulta abierta — en ref porque `flush()` no ve el estado. */
  const tomada = React.useRef(false);
  const [tomadaUi, setTomadaUi] = React.useState(false);

  /**
   * Conflicto pendiente: otra persona guardó las MISMAS secciones que esta está
   * escribiendo. No se resuelve solo — decide una persona, mirando los dos textos.
   */
  const [conflicto, setConflicto] = React.useState<{
    servidor: VisitNoteData;
    secciones: SectionField[];
  } | null>(null);
  /** Muestra el texto guardado por el otro, para poder copiar lo que falte. */
  const [verGuardado, setVerGuardado] = React.useState(false);

  /** Solo lo tocado + la versión. Es el cuerpo de todos los guardados. */
  const cuerpo = React.useCallback((): Record<string, unknown> => {
    const body: Record<string, unknown> = {};
    for (const f of tocadas.current) body[f] = latest.current.content[f];
    if (tplTocado.current) body.templateId = latest.current.templateId;
    if (dxTocado.current)  body.diagnoses  = latest.current.dx;
    if (version.current)   body.baseUpdatedAt = version.current;
    if (tomada.current)    body.takeover = true;
    return body;
  }, []);

  /** El turno: solo lectura mientras el doctor está en la consulta. */
  const sinTurno = !!turno?.enConsulta && !tomadaUi;

  /**
   * EL CANDADO. El que abrió la nota primero la edita; el resto la ve.
   *
   * `mio === null` es "todavía no se sabe" y NO bloquea: si el primer latido
   * tarda, poner la nota en solo lectura mientras tanto haría parpadear el
   * editor y le comería las primeras teclas al que sí la tiene.
   *
   * No se late en una nota firmada: es inmutable, no hay nada que bloquear.
   */
  const candado = useCandadoNota(appointmentId, !isSigned);
  const bloqueadaPorOtro = candado.mio === false;

  const soloLectura = isSigned || sinTurno || bloqueadaPorOtro;

  /**
   * En SOLO LECTURA la nota sí se actualiza con lo que trae el refresco en vivo.
   *
   * El editor ignora a propósito los cambios del prop mientras se escribe —si no,
   * el pulso le borraría el texto a quien está tecleando— pero cuando no es tu
   * turno no hay nada propio que perder, y ahí sí hace falta: el cartel promete
   * "la ves en vivo mientras el doctor escribe" y sin esto el texto se quedaba
   * congelado en la foto del momento en que se abrió el tab.
   */
  React.useEffect(() => {
    if (!soloLectura || dirty || !note) return;
    const igual = SECTIONS.every(({ field }) => (note[field] ?? '') === latest.current.content[field])
      && JSON.stringify(note.diagnoses ?? []) === JSON.stringify(latest.current.dx);
    if (igual) return;
    setContent({
      chiefComplaint: note.chiefComplaint ?? '',
      hpi:            note.hpi ?? '',
      ros:            note.ros ?? '',
      physicalExam:   note.physicalExam ?? '',
      assessment:     note.assessment ?? '',
      plan:           note.plan ?? '',
    });
    setDx(note.diagnoses ?? []);
    setTemplateId(note.templateId ?? null);
    if (note.updatedAt) version.current = note.updatedAt;
  }, [note, soloLectura, dirty]);

  const tomarLaNota = (): void => {
    tomada.current = true;
    setTomadaUi(true);
  };

  /**
   * Guardado de salida: dispara el PUT sin tocar estado de React.
   *
   * Se usa cuando el componente se va (cambio de tab, pestaña oculta): ahí un
   * `save()` normal no sirve porque sus `setState` caen en un componente que ya
   * no existe, y `keepalive` es lo que hace que el request sobreviva a la
   * navegación.
   */
  const flush = React.useCallback((): void => {
    // Con la nota bloqueada por otro no se intenta: el servidor lo rechaza igual
    // y el texto en pantalla es de alguien que no tiene el candado.
    if (isSigned || bloqueadaPorOtro) return;
    if (!tocadas.current.size && !dxTocado.current && !tplTocado.current) return;
    void fetch(`/api/admin/visit-notes/${appointmentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(cuerpo()),
    }).catch(() => undefined);
  }, [appointmentId, isSigned, bloqueadaPorOtro, cuerpo]);

  const save = React.useCallback(async (): Promise<boolean> => {
    if (isSigned) return false;
    setSaving(true);
    setError('');
    // Lo que se manda en ESTE guardado. Se recuerda porque mientras el request
    // viaja la persona sigue escribiendo: al volver solo se puede dar por
    // guardado lo que no cambió desde acá.
    const enviado = { ...latest.current.content };
    const enviadas = new Set(tocadas.current);
    const dxEnviado = dxTocado.current ? JSON.stringify(latest.current.dx) : null;
    const tplEnviado = tplTocado.current ? latest.current.templateId : undefined;
    try {
      const res = await fetch(`/api/admin/visit-notes/${appointmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo()),
      });
      if (!res.ok) {
        const d = await res.json() as {
          error?: string; note?: VisitNoteData; doctorName?: string; holderName?: string;
        };
        setSaving(false);
        if (d.error === 'NOTE_LOCKED') {
          // El servidor aplica el candado por su cuenta. Se llega acá cuando el
          // candado cambió de manos entre latido y guardado: el texto NO se
          // pierde, sigue en pantalla y en `tocadas`.
          setError(t('noteLockedSaveError', { name: d.holderName ?? '—' }));
          return false;
        }
        if (d.error === 'STALE_NOTE' && d.note) { resolverVersionNueva(d.note, enviadas); return false; }
        if (d.error === 'NOTE_IN_CONSULT') {
          // El doctor entró a la consulta mientras esta persona escribía. El
          // texto NO se perdió: sigue en pantalla, y "Tomar la nota" lo guarda.
          setError(t('noteInConsultBlocked', { name: d.doctorName ?? t('noteTheDoctor') }));
          return false;
        }
        setError(d.error === 'NOTE_ALREADY_SIGNED' ? t('noteAlreadySigned') : t('noteSaveError'));
        return false;
      }
      const d = await res.json() as { note?: VisitNoteData };
      if (d.note?.updatedAt) version.current = d.note.updatedAt;
      // Se da por guardado SOLO lo que no volvió a cambiar mientras viajaba.
      for (const f of enviadas) {
        if (latest.current.content[f] === enviado[f]) tocadas.current.delete(f);
      }
      if (dxEnviado !== null && JSON.stringify(latest.current.dx) === dxEnviado) dxTocado.current = false;
      if (tplEnviado !== undefined && latest.current.templateId === tplEnviado) tplTocado.current = false;
      const pendiente = tocadas.current.size > 0 || dxTocado.current || tplTocado.current;
      setDirty(pendiente);
      setSavedAt(new Date());
      setSaving(false);
      onSaved?.();
      return true;
    } catch {
      setError(t('noteSaveError'));
      setSaving(false);
      return false;
    }
    // `resolverVersionNueva` se define abajo y no cambia de identidad de forma
    // relevante para este callback (usa refs y setState).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId, isSigned, t, onSaved, cuerpo]);

  /**
   * Alguien guardó antes que nosotros. Qué se hace con cada sección:
   *
   *  · las que ESTA persona no tocó → se adoptan las del otro. No hay nada que
   *    perder y es lo que hace que la pantalla muestre lo último de verdad.
   *  · las que sí tocó y el otro también → conflicto. No se elige por nosotros:
   *    se muestran los dos textos y decide quien está escribiendo.
   *
   * Si no quedó ningún conflicto, se reintenta el guardado una sola vez con la
   * versión nueva — el caso normal cuando dos personas trabajan en secciones
   * distintas, y ahí no tiene sentido molestar a nadie.
   */
  function resolverVersionNueva(servidor: VisitNoteData, enviadas: Set<SectionField>): void {
    const choques: SectionField[] = [];
    const proximo = { ...latest.current.content };
    for (const { field } of SECTIONS) {
      const suyo = servidor[field] ?? '';
      if (tocadas.current.has(field) || enviadas.has(field)) {
        if (suyo !== (latest.current.content[field] ?? '')) choques.push(field);
      } else if (suyo !== proximo[field]) {
        proximo[field] = suyo;
      }
    }
    setContent(proximo);
    if (!dxTocado.current) setDx(servidor.diagnoses ?? []);
    if (servidor.updatedAt) version.current = servidor.updatedAt;

    if (choques.length === 0) {
      // Reintento único: la versión ya es la de la base, así que este PUT no
      // puede volver a chocar por lo mismo.
      void save();
      return;
    }
    setConflicto({ servidor, secciones: choques });
  }

  /** "Conservar lo mío": se guarda encima, ya con la versión nueva en mano. */
  const conservarLoMio = (): void => {
    setConflicto(null);
    setVerGuardado(false);
    void save();
  };

  /** "Traer lo guardado": se descarta lo propio en las secciones en conflicto. */
  const traerLoGuardado = (): void => {
    if (!conflicto) return;
    const proximo = { ...latest.current.content };
    for (const f of conflicto.secciones) {
      proximo[f] = conflicto.servidor[f] ?? '';
      tocadas.current.delete(f);
    }
    setContent(proximo);
    setDx(conflicto.servidor.diagnoses ?? []);
    dxTocado.current = false;
    setDirty(tocadas.current.size > 0 || tplTocado.current);
    setConflicto(null);
    setVerGuardado(false);
  };

  // Autoguardado con debounce: cada tecla reinicia el reloj (las deps incluyen
  // `content`/`dx`/`templateId`, no solo `dirty`).
  React.useEffect(() => {
    // Con un conflicto sin resolver el autoguardado se detiene: reintentar solo
    // sería martillar el mismo 409 y tapar el aviso que la persona tiene que leer.
    // `bloqueadaPorOtro` por el mismo motivo: el servidor va a devolver 409
    // `NOTE_LOCKED` cada 2,5 s, y ese martilleo tapa el banner que dice quién
    // la tiene, que es justo lo que la persona necesita leer.
    if (isSigned || sinTurno || bloqueadaPorOtro || conflicto || !dirty) return;
    const id = setTimeout(() => { void save(); }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [dirty, isSigned, sinTurno, bloqueadaPorOtro, conflicto, save, content, dx, templateId]);

  // Salidas: cambio de tab (desmontaje) y pestaña que se oculta. Las dos perdían
  // el texto porque el temporizador del autoguardado se cancelaba sin guardar.
  const dirtyRef = React.useRef(dirty);
  React.useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  React.useEffect(() => {
    const onHide = (): void => { if (document.visibilityState === 'hidden' && dirtyRef.current) flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (dirtyRef.current) flush();
    };
  }, [flush]);

  // Aviso al cerrar la pestaña con cambios sin guardar
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const setSection = (field: SectionField, html: string): void => {
    setContent((c) => ({ ...c, [field]: html }));
    // Anotar QUÉ sección se tocó es lo que permite mandar solo eso: sin esto el
    // guardado sigue siendo la nota entera y volvemos a pisar al otro.
    tocadas.current.add(field);
    setDirty(true);
    // Sostiene el candado: los 10 minutos de inactividad se miden desde la
    // última TECLA, no desde el último latido. Una pestaña abierta late igual
    // mientras su dueño almuerza.
    candado.marcarTecla();
  };

  // ── El puente con la mensajería ───────────────────────────────────────────

  React.useEffect(() => { onPuedeEscribirChange?.(!soloLectura); }, [soloLectura, onPuedeEscribirChange]);

  React.useImperativeHandle(refExterno, () => ({
    citarEnHpi: (html: string): void => {
      /* El servidor rechaza igual, pero acá el botón ya venía bloqueado: si
         llegó una llamada con la nota en solo lectura es un bug de arriba, y
         tragarlo en silencio es mejor que escribir sobre una nota firmada. */
      if (soloLectura) return;
      // Del ref y no del estado: dos citas seguidas con el mismo render
      // perderían la primera.
      const actual = latest.current.content.hpi ?? '';
      setSection('hpi', actual ? `${actual}${html}` : html);
      // El HPI puede estar fuera de la pantalla y la cita se agrega al final:
      // sin esto el botón parece no haber hecho nada.
      requestAnimationFrame(() => {
        document.getElementById('nota-hpi')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
  }), [soloLectura]);

  /** Hay algo que se pueda perder? (texto en cualquier seccion, o diagnosticos) */
  const notaTieneContenido = (): boolean =>
    dx.length > 0 ||
    SECTIONS.some(({ field }) => (content[field] ?? '').replace(/<[^>]*>/g, '').trim().length > 0);

  /**
   * Deja la nota EN CERO: las seis secciones, los diagnósticos y la marca de
   * plantilla.
   *
   * Para cuando el doctor cargó la plantilla equivocada —o la del paciente
   * anterior— y quiere arrancar de nuevo: borrar sección por sección son seis
   * operaciones, y los diagnósticos uno por uno (Erick, 1-sep-2026).
   *
   * Se lleva los diagnósticos A PROPÓSITO. Si dice "all", tiene que ser all: una
   * plantilla también trae ICD-10, y dejarlos colgando de una nota vacía son
   * diagnósticos del cuadro equivocado. Elegir otra plantilla los reemplaza solo
   * si la nueva trae los suyos, así que sin esto el error sobrevivía a "empezar
   * de cero". El costo asumido es que un diagnóstico cargado a mano DESPUÉS de
   * la plantilla también se va — el mismo riesgo que ya tiene "Cargar plantilla
   * completa", y por eso el confirm los enumera.
   *
   * Los tres se marcan como TOCADOS aunque queden vacíos. Sin eso el guardado
   * —que solo manda lo tocado— no enviaría nada: la nota se vería limpia en
   * pantalla y volvería entera al recargar.
   *
   * No hay deshacer, y es a conciencia: los autoguardados no se auditan (ver el
   * PUT de visit-notes), así que una vez guardado esto no está en ningún lado.
   * De ahí que el confirm sea `danger` y lo diga.
   */
  const limpiarNota = (): void => {
    const next = { ...content };
    for (const { field } of SECTIONS) {
      next[field] = '';
      tocadas.current.add(field);
    }
    setContent(next);
    setDx([]);
    dxTocado.current = true;
    setTemplateId(null);
    tplTocado.current = true;
    setDirty(true);
  };

  /**
   * Aplica una plantilla COMPLETA: pisa cada seccion que la plantilla traiga y
   * REEMPLAZA los diagnosticos por los suyos.
   *
   * Antes los diagnosticos se SUMABAN (dedupe por ICD-10) mientras las secciones
   * de texto se reemplazaban: el mismo clic hacia dos cosas opuestas, y cambiar
   * de plantilla acumulaba para siempre — 10 + 6 = 16, reportado por el staff.
   *
   * Se reemplaza solo lo que la plantilla TRAE, mismo criterio que las secciones:
   * una plantilla sin diagnosticos deja los que ya habia, no los borra.
   */
  const aplicarPlantillaCompleta = (tpl: PickableTemplate): void => {
    const next = { ...content };
    for (const { field, key } of SECTIONS) {
      const html = tpl.sections.find((sec) => sec.sectionKey === key)?.content ?? '';
      if (html) { next[field] = html; tocadas.current.add(field); }
    }
    setContent(next);
    const dxSection = tpl.sections.find((sec) => sec.sectionKey === 'DIAGNOSTICOS')?.content ?? '';
    const tplDx = parseDx(dxSection);
    if (tplDx.length) {
      setDx(tplDx.filter((d) => d.icd10Code));
      dxTocado.current = true;
    }
    setTemplateId(tpl.id);
    tplTocado.current = true;
    setDirty(true);
  };

  /** Aplica una plantilla: completa (todas las secciones + dx) o una sola seccion */
  const applyTemplate = (tpl: PickableTemplate): void => {
    if (tplTarget) {
      const html = tpl.sections.find((sec) => sec.sectionKey === tplTarget)?.content ?? '';
      const field = SECTIONS.find((sec) => sec.key === tplTarget)?.field;
      if (field && html) setSection(field, html);
      return;
    }
    // Nota vacia: no hay nada que perder, se aplica derecho sin estorbar.
    if (!notaTieneContenido()) { aplicarPlantillaCompleta(tpl); return; }
    setTplPorConfirmar(tpl);
  };

  const addDx = (row: DiagnosisRow): void => {
    setDx((list) => {
      if (list.some((d) => d.icd10Code === row.icd10Code)) return list;
      return [...list, {
        icd10Code: row.icd10Code,
        icd10Label: row.icd10Description,
        snomedCode: row.snomedCode,
        snomedLabel: row.snomedDescription,
        diagnosisId: row.id,
      }];
    });
    dxTocado.current = true;
    setDirty(true);
  };

  const [saliendo, setSaliendo] = React.useState(false);
  /**
   * Se apretó "Avisarle". El pedido viaja en el próximo latido, no en el clic:
   * el botón se apaga en el acto para que nadie lo apriete tres veces mientras
   * espera, y cuando el latido vuelve con `esperando` el botón se reemplaza por
   * la hora del aviso.
   */
  const [avisando, setAvisando] = React.useState(false);

  /**
   * Guarda lo que haya y recién entonces sale.
   *
   * **No sale si el guardado falló**, y esa es la regla que hace que el botón
   * sea seguro: `save()` devuelve `false` en los tres choques reales que ya
   * maneja —`STALE_NOTE` (otro guardó y hay que resolver la versión),
   * `NOTE_IN_CONSULT` (el doctor entró mientras el asistente escribía) y
   * `NOTE_ALREADY_SIGNED`—. Si en esos casos igual saliéramos, el doctor se
   * llevaría la certeza de que quedó guardado cuando no quedó, que es peor que
   * no tener el botón. El error ya está a la vista en la barra de arriba.
   *
   * Con la nota en solo lectura no hay nada que guardar y sale directo.
   */
  const guardarYSalir = async (): Promise<void> => {
    if (!onSaveExit) return;
    if (!soloLectura && dirty) {
      setSaliendo(true);
      const ok = await save();
      setSaliendo(false);
      if (!ok) return;
    }
    onSaveExit();
  };

  const handleSign = async (): Promise<void> => {
    setSigning(true);
    // Guardar antes de firmar para no perder lo último escrito
    const ok = await save();
    if (!ok && dirty) { setSigning(false); setConfirmSign(false); return; }
    try {
      const res = await fetch(`/api/admin/visit-notes/${appointmentId}/sign`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error === 'NOTE_EMPTY' ? t('noteEmptyToSign') : t('noteSignError'));
        setSigning(false);
        setConfirmSign(false);
        return;
      }
      setConfirmSign(false);
      router.refresh();
    } catch {
      setError(t('noteSignError'));
      setSigning(false);
      setConfirmSign(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de estado y acciones */}
      {/*
        * En teléfono el estado va ARRIBA y los botones abajo ocupando el ancho,
        * en vez de compartir la línea: con seis acciones el `justify-between`
        * dejaba la fila ragged y el último botón solo y descolgado.
        */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {isSigned ? (
            <>
              <TagPill label={t('noteSigned')} colorClass="bg-emerald/15 text-emerald border-emerald/30" />
              <span className="text-[11px] text-text-muted">
                {t('noteSignedBy', {
                  name: note?.signedByName ?? '',
                  date: note?.signedAt
                    ? new Date(note.signedAt).toLocaleString(localeApp(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Denver' })
                    : '',
                })}
              </span>
            </>
          ) : (
            <>
              <TagPill label={t('noteDraft')} colorClass="bg-amber/15 text-amber border-amber/30" />
              <span className="text-[11px] text-text-muted flex items-center gap-1">
                {saving ? (<><Loader2 className="w-3 h-3 animate-spin" /> {t('noteSaving')}</>)
                  : dirty ? t('noteUnsaved')
                  : savedAt ? (<><Check className="w-3 h-3 text-emerald" /> {t('noteSavedAt', { time: savedAt.toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit' }) })}</>)
                  : t('noteAutosaveHint')}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {/* Va PRIMERO y fuera del `isSigned`: consultar la ficha del paciente
              no depende de si la nota está abierta o ya firmada. */}
          {patientId && <MedicalHistoryButton patientId={patientId} className={CELDA_MOVIL} />}
          {isSigned && (
            // `type="button"` explícito: antes esto era un `<a>` y no podía
            // enviar nada. El primitivo `Button` no fija `type`, y este editor se
            // monta en tres pantallas distintas — si alguna lo envuelve en un
            // `<form>`, imprimir mandaría el formulario.
            <Button type="button" variant="ghost" className={`h-9 gap-1.5 ${CELDA_MOVIL}`} onClick={() => setPrintNote(true)}>
              <Printer className="w-3.5 h-3.5" /> {t('notePrint')}
            </Button>
          )}
          {!soloLectura && (
            <>
              {/* Va PRIMERO y separado del grupo de la derecha: es destructivo y
                  no puede quedar pegado a "Finish note". `ghost` con el rose solo
                  en hover — se lee como peligroso al apuntarlo, sin gritar desde
                  el reposo. Deshabilitado con la nota vacía: no hay nada que
                  limpiar, y esconderlo parecería que la pantalla está rota.
                  La guarda es `notaTieneContenido`, que INCLUYE los diagnósticos:
                  ahora "Clear all" también se los lleva, así que con la nota sin
                  texto pero con un ICD-10 cargado el botón sigue sirviendo. */}
              <Button
                variant="ghost"
                onClick={() => setConfirmClear(true)}
                disabled={!notaTieneContenido()}
                className={`h-9 gap-1.5 text-text-2 hover:text-rose disabled:opacity-40 ${CELDA_MOVIL}`}
              >
                <Eraser className="w-3.5 h-3.5" /> {t('noteClearAll')}
              </Button>
              {/* `ghost`, no un borde violeta a mano: un borde de color se lee
                  como aviso, y en el sistema el borde queda solo donde ES el
                  significado o donde no hay fondo que defina al control. */}
              <Button variant="ghost" onClick={() => setTplTarget(null)} className={`h-9 gap-1.5 ${CELDA_MOVIL}`}>
                <FileStack className="w-3.5 h-3.5" /> {t('noteLoadTemplate')}
              </Button>
              <Button variant="outline" onClick={() => void save()} disabled={saving || !dirty} className={`h-9 gap-1.5 ${CELDA_MOVIL}`}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {t('noteSave')}
              </Button>
            </>
          )}
          {/*
            * "Guardar y salir" va PEGADO a Save y ANTES de "Finish note", que es
            * el que firma. Dos motivos: es la continuación natural de Save, y
            * mete un botón de distancia con el que cierra la nota para siempre.
            *
            * NO se deshabilita con `!dirty`: salir siempre es válido, y el gris
            * de Save justo después del autoguardado era parte del problema.
            *
            * Va FUERA del `!soloLectura`: una nota firmada —o una que este
            * usuario no tiene el turno de escribir— tampoco tenía salida en esta
            * fila, y ahí el rótulo es solo "Salir" porque no hay nada que
            * guardar (decisión de Erick, 2026-09-10).
            */}
          {onSaveExit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void guardarYSalir()}
              disabled={saliendo}
              className={`h-9 gap-1.5 ${CELDA_MOVIL}`}
            >
              {saliendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              {soloLectura ? t('noteExit') : t('noteSaveExit')}
            </Button>
          )}
          {!soloLectura && (
            <>
              {/* Firmar es del médico: el asistente escribe el borrador y el
                  doctor lo cierra desde su portal (el servidor también lo exige) */}
              {canSign ? (
                <Button onClick={() => setConfirmSign(true)} disabled={signing} className={`h-9 gap-1.5 ${CELDA_MOVIL}`}>
                  <ShieldCheck className="w-3.5 h-3.5" /> {t('noteFinish')}
                </Button>
              ) : (
                // No es un botón: en teléfono toma la fila ENTERA en vez de
                // media celda, porque es una frase y partida en dos líneas
                // dentro de media columna se lee como un control roto.
                <span className="basis-full sm:basis-auto text-[11px] text-text-muted flex items-center gap-1.5">
                  <Lock className="w-3 h-3" /> {t('noteSignDoctorOnly')}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {isSigned && (
        <div className="rounded-md border border-emerald/25 bg-emerald/[0.06] px-3 py-2 text-[11px] text-emerald flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> {t('noteLockedHint')}
        </div>
      )}

      {/*
        * ── EL CANDADO, los tres avisos ──────────────────────────────────────
        *
        * Amber y no rose: no es un error ni algo roto, es que otra persona está
        * trabajando en la misma nota. El rose se reserva para lo que exige
        * actuar (ver la regla de las alertas de vitales).
        */}
      {bloqueadaPorOtro && !isSigned && (
        <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5 text-[11.5px] text-amber flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="flex items-start gap-1.5 flex-1">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
            <span>
              {t('noteLockedBy', {
                name: candado.porNombre ?? '—',
                time: candado.desde
                  ? new Date(candado.desde).toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit' })
                  : '—',
              })}
            </span>
          </span>
          {/* Ya avisado: se muestra la HORA en vez del botón. Un botón que se
              puede apretar cinco veces son cinco banners para el otro, y a la
              tercera dejan de mirarlos. */}
          {candado.esperando ? (
            <span className="text-[11px] text-text-2 shrink-0">
              {t('noteLockNudged', {
                time: candado.esperando.desde
                  ? new Date(candado.esperando.desde).toLocaleTimeString(localeApp(), { hour: 'numeric', minute: '2-digit' })
                  : '—',
              })}
            </span>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => { setAvisando(true); candado.avisar(); }}
              disabled={avisando}
              className="h-8 gap-1.5 shrink-0 w-full sm:w-auto"
            >
              <BellRing className="w-3.5 h-3.5" />
              {avisando ? t('noteLockNudging') : t('noteLockNudge')}
            </Button>
          )}
        </div>
      )}

      {/* Al que TIENE la nota: llega en la respuesta de su propio latido, así que
          aparece acá sin ningún canal nuevo. */}
      {candado.mio === true && candado.esperando && (
        <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5 text-[11.5px] text-amber flex items-center gap-1.5">
          <BellRing className="w-3.5 h-3.5 shrink-0" />
          {t('noteLockWanted', { name: candado.esperando.nombre ?? '—' })}
        </div>
      )}

      {/* Se soltó por 10 minutos sin actividad. El texto NO se perdió: el
          autoguardado corre cada 2,5 s, así que para cuando se cumplen los 10
          minutos hace rato que está en la base. */}
      {candado.soltado && (
        <div className="rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2.5 text-[11.5px] text-cyan flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 shrink-0" /> {t('noteLockReleased')}
        </div>
      )}

      {/* EL TURNO. La nota es del doctor mientras atiende; acá se ve en vivo y en
          solo lectura. No es un candado de conexión: se libera solo cuando el
          doctor cierra la consulta. Y si se fue sin cerrarla, "Tomar la nota"
          desbloquea — el paciente está esperando en el mostrador y una nota
          trabada no es una opción. Queda en la auditoría. */}
      {sinTurno && (
        <div className="rounded-md border border-violet/30 bg-violet/10 px-3 py-2.5 flex items-start gap-2 flex-wrap">
          <Stethoscope className="w-3.5 h-3.5 text-violet-text shrink-0 mt-px" />
          <div className="flex-1 min-w-[200px]">
            <div className="text-[12px] text-violet-text font-semibold">
              {t('noteTurnDoctor', { name: turno?.doctorName ?? t('noteTheDoctor') })}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">{t('noteTurnHint')}</div>
          </div>
          <Button variant="outline" onClick={tomarLaNota} className="h-8 gap-1.5 shrink-0">
            <Unlock className="w-3.5 h-3.5" /> {t('noteTakeOver')}
          </Button>
        </div>
      )}

      {tomadaUi && turno?.enConsulta && (
        <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {t('noteTakenOverHint')}
        </div>
      )}

      {/* CONFLICTO: el otro guardó las mismas secciones. Nada se descarta solo —
          los dos textos se ven y decide la persona. */}
      {conflicto && (
        <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber shrink-0 mt-px" />
            <div className="flex-1">
              <div className="text-[12px] text-amber font-semibold">
                {t('noteConflictTitle', {
                  sections: conflicto.secciones.map((f) => secLabel(SECTIONS.find((s) => s.field === f)!.key)).join(' · '),
                })}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">{t('noteConflictHint')}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={conservarLoMio} className="h-8">{t('noteConflictKeepMine')}</Button>
            <Button variant="outline" onClick={traerLoGuardado} className="h-8">{t('noteConflictTakeTheirs')}</Button>
            <button
              type="button"
              onClick={() => setVerGuardado((v) => !v)}
              className="text-[11px] font-semibold text-violet-text hover:underline"
            >
              {verGuardado ? t('noteConflictHideSaved') : t('noteConflictShowSaved')}
            </button>
          </div>
          {verGuardado && (
            <div className="space-y-2 pt-1">
              {conflicto.secciones.map((f) => (
                <div key={f}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-1">
                    {secLabel(SECTIONS.find((s) => s.field === f)!.key)}
                  </div>
                  <div
                    className="rte-content rounded-md bg-bg-2/60 px-3 py-2 text-[12.5px] text-text-1"
                    dangerouslySetInnerHTML={{ __html: conflicto.servidor[f] || '—' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* Secciones SOAP */}
      {SECTIONS.map(({ field, key }) => (
        /* El `id` del HPI es el ancla a la que salta `citarEnHpi`. */
        <div key={field} id={field === 'hpi' ? 'nota-hpi' : undefined} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
              {secLabel(key)}
            </span>
            {!soloLectura && (
              <div className="flex items-center gap-3">
                {/* Abre la lista de snippets DENTRO del editor de esta sección —
                    el gesto de Medusa. Violeta lleno cuando está abierta. */}
                <button
                  type="button"
                  onClick={() => toggleSnippets(field)}
                  aria-pressed={snippetsAbiertos.has(field)}
                  className={`text-[11px] font-semibold hover:underline flex items-center gap-1 ${
                    snippetsAbiertos.has(field) ? 'text-violet-text' : 'text-text-muted hover:text-text-1'
                  }`}
                >
                  <Scissors className="w-3 h-3" /> {t('snpPanelShow')}
                </button>
                <button
                  type="button"
                  onClick={() => setTplTarget(key)}
                  className="text-[11px] font-semibold text-violet-text hover:underline flex items-center gap-1"
                >
                  <FileStack className="w-3 h-3" /> {t('noteTemplatesBtn')}
                </button>
              </div>
            )}
          </div>
          {soloLectura ? (
            <div
              className="rte-content rounded-md border border-border bg-bg-2/40 px-3 py-2.5 text-[13px] text-text-1 min-h-[80px]"
              dangerouslySetInnerHTML={{ __html: content[field] || `<p class="text-text-muted">—</p>` }}
            />
          ) : (
            <RichTextEditor
              ref={(h) => { editores.current[field] = h; }}
              value={content[field]}
              onChange={(html) => setSection(field, html)}
              placeholder={t('tplWriteHere')}
              minHeight={SECTION_MIN_HEIGHT}
              // SIN `maxHeight`: la altura la da la celda del grid, no un número.
              // Acá iba `SECTION_MIN_HEIGHT + 44 + 90` (284 px) derivado del
              // MÍNIMO del editor, que no tiene relación con su altura real —
              // el bug de la lista que no se ajusta a su contenedor. El porqué
              // completo está en el docblock de `rich-text-editor.tsx`.
              sidePanel={snippetsAbiertos.has(field) ? (
                <SnippetPanel
                  bare
                  section={key}
                  settingsHref={settingsHref(key)}
                  onPick={(s) => insertarSnippet(field, s)}
                />
              ) : undefined}
            />
          )}
        </div>
      ))}

      {/* Diagnósticos */}
      <div className="space-y-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">
          {t('sec_DIAGNOSTICOS')}
        </span>
        <div className="rounded-lg bg-bg-2/30 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[13px] font-semibold text-text-1">{t('dxAdded', { count: dx.length })}</div>
              <div className="text-[11px] text-text-muted">{t('dxHint')}</div>
            </div>
            {!soloLectura && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setDxPickerMode('ICD10')}
                  className="h-9 px-3 rounded-md text-white text-[12px] font-semibold flex items-center gap-1.5"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#A78BFA)' }}
                >
                  <Plus className="w-3.5 h-3.5" /> {t('dxAddIcd')}
                </button>
                <button
                  type="button"
                  onClick={() => setDxPickerMode('SNOMED')}
                  className="h-9 px-3 rounded-md border border-border text-text-2 text-[12px] font-semibold hover:bg-white/5 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> {t('dxAddSnomed')}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="bg-bg-2/50">
                <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted">
                  <th className="px-3 py-2">ICD-10</th>
                  <th className="px-3 py-2">SNOMED</th>
                  {!soloLectura && <th className="px-3 py-2 w-10" />}
                </tr>
              </thead>
              <tbody>
                {dx.length === 0 ? (
                  <tr><td colSpan={soloLectura ? 2 : 3} className="px-3 py-6 text-center text-text-muted">{t('dxEmpty')}</td></tr>
                ) : dx.map((d, i) => (
                  <tr key={`${d.icd10Code ?? d.snomedCode}-${i}`} className="border-t border-row-sep">
                    <td className="px-3 py-2">
                      {d.icd10Code ? (
                        <>
                          <span className="font-mono text-[11px] text-violet-text">{d.icd10Code}</span>
                          <span className="text-text-2 ml-2">{d.icd10Label}</span>
                        </>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {d.snomedCode ? (
                        <>
                          <span className="font-mono text-[11px] text-cyan">{d.snomedCode}</span>
                          <span className="text-text-muted ml-2">{d.snomedLabel}</span>
                        </>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    {!soloLectura && (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => { setDx((l) => l.filter((_, idx) => idx !== i)); dxTocado.current = true; setDirty(true); }}
                          className="text-text-muted hover:text-rose transition-colors"
                          aria-label={t('dxRemove')}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modales */}
      {tplTarget !== undefined && (
        <TemplatePicker
          open
          templates={templates}
          targetSection={tplTarget}
          onClose={() => setTplTarget(undefined)}
          onPick={applyTemplate}
        />
      )}
      {dxPickerMode && (
        <DiagnosisPicker
          open
          mode={dxPickerMode}
          userId={userId}
          onClose={() => setDxPickerMode(null)}
          onPick={addDx}
        />
      )}
      {/* El confirm ENUMERA lo que se lleva —texto, diagnósticos y plantilla— en
          vez de preguntar "¿borrar todo?". Los diagnósticos son la parte que
          sorprende: son chips de otra lista y bien podrían haberse cargado a
          mano, así que nombrarlos es lo que separa un borrado aceptado de uno
          descubierto después. Y avisa que no hay vuelta atrás, porque no la hay:
          los autoguardados no se auditan, así que esto no queda en ningún lado. */}
      {confirmClear && (
        <ConfirmDialog
          open
          variant="danger"
          title={t('noteClearTitle')}
          description={t('noteClearBody')}
          confirmLabel={t('noteClearConfirm')}
          onConfirm={() => { limpiarNota(); setConfirmClear(false); }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
      {tplPorConfirmar && (
        <ConfirmDialog
          open
          variant="danger"
          title={t('tplReplaceTitle')}
          description={t('tplReplaceBody', { name: tplPorConfirmar.title, dx: dx.length })}
          confirmLabel={t('tplReplaceConfirm')}
          onConfirm={() => { aplicarPlantillaCompleta(tplPorConfirmar); setTplPorConfirmar(null); }}
          onCancel={() => setTplPorConfirmar(null)}
        />
      )}
      {confirmSign && (
        <ConfirmDialog
          open
          title={t('noteSignTitle')}
          description={t('noteSignConfirm')}
          confirmLabel={t('noteFinish')}
          onConfirm={() => void handleSign()}
          onCancel={() => setConfirmSign(false)}
        />
      )}

      {/* La hoja imprimible, en modal: firmar y volver a la consulta no debería
          costar cerrar una pestaña y buscar dónde estabas. */}
      <VisitNotePrintDialog appointmentId={printNote ? appointmentId : null} onClose={() => setPrintNote(false)} />
    </div>
  );
});
