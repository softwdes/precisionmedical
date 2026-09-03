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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@precision/ui';
import {
  Eraser, FileStack, Plus, X, Loader2, Check, ShieldCheck, Lock, Printer, AlertTriangle,
  Stethoscope, Unlock,
} from 'lucide-react';
import { RichTextEditor, TagPill } from '@/components/ui-phoenix';
import { ConfirmDialog } from '@/components/ui-phoenix/confirm-dialog';
import { MedicalHistoryButton } from '@/components/patients/medical-history-button';
import { DiagnosisPicker, type DiagnosisRow } from './diagnosis-picker';
import { TemplatePicker, type PickableTemplate } from './template-picker';

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
  appointmentId, patientId, note, templates, userId, canSign = true, onSaved, onDirtyChange, turno,
  onPuedeEscribirChange,
}: Props, refExterno): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const router = useRouter();

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
  const soloLectura = isSigned || sinTurno;

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
    if (isSigned || !tocadas.current.size && !dxTocado.current && !tplTocado.current) return;
    void fetch(`/api/admin/visit-notes/${appointmentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(cuerpo()),
    }).catch(() => undefined);
  }, [appointmentId, isSigned, cuerpo]);

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
        const d = await res.json() as { error?: string; note?: VisitNoteData; doctorName?: string };
        setSaving(false);
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
    if (isSigned || sinTurno || conflicto || !dirty) return;
    const id = setTimeout(() => { void save(); }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [dirty, isSigned, sinTurno, conflicto, save, content, dx, templateId]);

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
      <div className="flex items-center justify-between gap-3 flex-wrap">
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

        <div className="flex items-center gap-2 flex-wrap">
          {/* Va PRIMERO y fuera del `isSigned`: consultar la ficha del paciente
              no depende de si la nota está abierta o ya firmada. */}
          {patientId && <MedicalHistoryButton patientId={patientId} />}
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
                className="h-9 gap-1.5 text-text-2 hover:text-rose disabled:opacity-40"
              >
                <Eraser className="w-3.5 h-3.5" /> {t('noteClearAll')}
              </Button>
              {/* `ghost`, no un borde violeta a mano: un borde de color se lee
                  como aviso, y en el sistema el borde queda solo donde ES el
                  significado o donde no hay fondo que defina al control. */}
              <Button variant="ghost" onClick={() => setTplTarget(null)} className="h-9 gap-1.5">
                <FileStack className="w-3.5 h-3.5" /> {t('noteLoadTemplate')}
              </Button>
              <Button variant="outline" onClick={() => void save()} disabled={saving || !dirty} className="h-9 gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {t('noteSave')}
              </Button>
              {/* Firmar es del médico: el asistente escribe el borrador y el
                  doctor lo cierra desde su portal (el servidor también lo exige) */}
              {canSign ? (
                <Button onClick={() => setConfirmSign(true)} disabled={signing} className="h-9 gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> {t('noteFinish')}
                </Button>
              ) : (
                <span className="text-[11px] text-text-muted flex items-center gap-1.5">
                  <Lock className="w-3 h-3" /> {t('noteSignDoctorOnly')}
                </span>
              )}
            </>
          )}
          {isSigned && (
            <Button variant="ghost" asChild className="h-9 gap-1.5">
              <a
                href={`/doctor-print/visit-note/${appointmentId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Printer className="w-3.5 h-3.5" /> {t('notePrint')}
              </a>
            </Button>
          )}
        </div>
      </div>

      {isSigned && (
        <div className="rounded-md border border-emerald/25 bg-emerald/[0.06] px-3 py-2 text-[11px] text-emerald flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> {t('noteLockedHint')}
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
                  sections: conflicto.secciones.map((f) => t(`sec_${SECTIONS.find((s) => s.field === f)!.key}`)).join(' · '),
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
                    {t(`sec_${SECTIONS.find((s) => s.field === f)!.key}`)}
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
              {t(`sec_${key}`)}
            </span>
            {!soloLectura && (
              <button
                type="button"
                onClick={() => setTplTarget(key)}
                className="text-[11px] font-semibold text-violet-text hover:underline flex items-center gap-1"
              >
                <FileStack className="w-3 h-3" /> {t('noteTemplatesBtn')}
              </button>
            )}
          </div>
          {soloLectura ? (
            <div
              className="rte-content rounded-md border border-border bg-bg-2/40 px-3 py-2.5 text-[13px] text-text-1 min-h-[80px]"
              dangerouslySetInnerHTML={{ __html: content[field] || `<p class="text-text-muted">—</p>` }}
            />
          ) : (
            <RichTextEditor
              value={content[field]}
              onChange={(html) => setSection(field, html)}
              placeholder={t('tplWriteHere')}
              minHeight={150}
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
    </div>
  );
});
