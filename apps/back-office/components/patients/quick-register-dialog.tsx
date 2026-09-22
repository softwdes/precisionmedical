'use client';

/**
 * QuickRegisterDialog — registro rápido de paciente + caso desde la página Pacientes.
 * Crea el paciente y el caso en una sola transacción via POST /api/admin/cases.
 * Campos mínimos requeridos: nombre, apellido, fecha de nacimiento, tipo de caso.
 * Tres acciones: guardar y salir · guardar y enviar formulario · guardar y generar QR.
 * GM oculta campos específicos de MVA (accidente, bufete, abogado, quiropráctica).
 * QR: muestra panel de éxito con código del caso y link del portal inline (sin cerrar).
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { enviarPortal, describirFallo, describirAvisoCita, type CanalPortal } from '@/lib/enviar-portal';
import { idiomaDelPaciente } from '@/lib/portal-message';
import { useToast } from '@/components/ui-phoenix';
import {
  UserPlus, Car, Stethoscope, AlertCircle, QrCode, Send, Save, Clock3,
  Check, Copy, ExternalLink, RotateCcw,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button,
} from '@precision/ui';
import {
  ContactoCompartidoDialog, type CandidatoContacto, type VinculoElegido,
} from '@/components/patients/contacto-compartido-dialog';
/* Reemplaza al `LawFirmAutocomplete` privado que vivía acá y creaba el bufete
   con el nombre solo. Ver el comentario de `components/lawyers/law-firm-field`. */
import { LawFirmField } from '@/components/lawyers/law-firm-field';
import { ReferralPartnerField } from '@/components/referrals/referral-partner-field';
import type { AutoResult } from '@/components/ui-phoenix';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}{required && <span className="text-rose ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-rose mt-0.5">{error}</p>}
    </div>
  );
}

const INPUT  = 'w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-brand transition-colors';
const SELECT = `${INPUT} appearance-none`;

/**
 * El valor del select mezcla dos catálogos, así que los referidores que no son
 * bufetes llevan prefijo. El id pelado sigue siendo un BUFETE: así el precargado
 * desde un referido del portal legal (`initial.lawFirmId`) no necesita saber
 * nada de esto.
 */
const PREFIJO_REFERIDOR = 'rp:';

interface ReferidorElegido {
  id: string;
  name: string;
  type: 'CHIROPRACTOR' | 'ACCIDENT_CENTER' | 'MEDICAL_PROVIDER' | 'OTHER';
}

/** La fuente sale del referidor cuando nadie la eligió a mano. */
function fuenteDelReferidor(tipo: ReferidorElegido['type']): string {
  return tipo === 'ACCIDENT_CENTER' ? 'ACCIDENT_CENTER' : 'CHIROPRACTOR';
}

/**
 * Qué lista corresponde a cada "¿Cómo nos encontró?".
 *
 * `FIRMA` es el catálogo de bufetes; el resto son tipos de `ReferralPartner`.
 * Una fuente que no está acá (Google, Familia…) no tiene catálogo propio y
 * muestra los dos.
 */
const CATALOGO_DE_LA_FUENTE: Record<string, 'FIRMA' | ReferidorElegido['type']> = {
  LAW_FIRM:          'FIRMA',
  LAW_FIRM_REFERRAL: 'FIRMA',
  CHIROPRACTOR:      'CHIROPRACTOR',
  ACCIDENT_CENTER:   'ACCIDENT_CENTER',
};

// ─── ReferredBy Select — lista de firmas cargada desde DB ────────────────────

/**
 * El valor es el **id** del bufete, no su nombre.
 *
 * Guardaba el `label` y por eso el referido no se podía guardar: la API pide
 * `referrer.lawFirmId` para escribir `Patient.lawyerReferrerId`, y con el
 * nombre no hay forma de resolverlo sin adivinar. El dato existía en la
 * respuesta del autocomplete y se tiraba en el `.map`.
 */
function ReferredBySelect({ value, onChange, placeholder, otherLabel, firmsLabel, partnersLabel, fuente }: {
  value: string;
  /** El segundo argumento viene solo cuando lo elegido es un referidor del catálogo. */
  onChange: (v: string, partner?: ReferidorElegido) => void;
  placeholder: string; otherLabel: string;
  firmsLabel: string; partnersLabel: string;
  /**
   * Lo elegido en "¿Cómo nos encontró?". MANDA sobre esta lista: si dice
   * quiropráctico, acá se ofrecen quiroprácticos; si dice bufete, bufetes.
   *
   * Es la corrección de Erick del 2026-09-20 sobre la primera versión, que
   * mostraba los dos catálogos juntos siempre: con 10 bufetes y 13 referidores
   * en el mismo desplegable, recepción tiene que buscar en 23 nombres cuando ya
   * dijo, en el campo de al lado, cuál de los dos es.
   */
  fuente: string;
}) {
  const [firms, setFirms] = useState<Array<{ id: string; label: string }>>([]);
  const [partners, setPartners] = useState<ReferidorElegido[]>([]);

  useEffect(() => {
    fetch('/api/admin/lawyers/autocomplete')
      .then(r => r.json())
      .then(j => setFirms((j.results ?? []).map((f: { id: string; label: string }) => ({ id: f.id, label: f.label }))))
      .catch(() => {});
    /* Los que NO son bufetes. Hasta el 2026-09-20 esta lista tenía SOLO bufetes,
       así que un paciente que mandaba el quiropráctico caía siempre en "Otro…" y
       el nombre terminaba de texto suelto: en toda la base quedaron 15 valores,
       con el mismo lugar escrito de tres formas. */
    fetch('/api/admin/referral-partners')
      .then(r => r.json())
      .then(j => setPartners(j.partners ?? []))
      .catch(() => {});
  }, []);

  /* Qué catálogo pidió la fuente. `null` = no lo dice, y entonces se ofrecen
     los dos: quien todavía no eligió cómo nos encontró no puede quedar sin
     lista. */
  const pide = CATALOGO_DE_LA_FUENTE[fuente] ?? null;
  const firmsVisibles    = !pide || pide === 'FIRMA' ? firms : [];
  const partnersVisibles = !pide
    ? partners
    : pide === 'FIRMA' ? [] : partners.filter(p => p.type === pide);
  /* Los rótulos de grupo solo cuando hay dos listas que distinguir. */
  const agrupar = firmsVisibles.length > 0 && partnersVisibles.length > 0;

  const opcionesPartner = partnersVisibles.map(p => (
    <option key={p.id} value={`${PREFIJO_REFERIDOR}${p.id}`}>{p.name}</option>
  ));
  const opcionesFirma = firmsVisibles.map(f => (
    <option key={f.id} value={f.id}>{f.label}</option>
  ));

  return (
    <select
      className={SELECT}
      value={value}
      onChange={e => {
        const v = e.target.value;
        onChange(v, partners.find(p => `${PREFIJO_REFERIDOR}${p.id}` === v));
      }}
    >
      <option value="">{placeholder}</option>
      {agrupar ? (
        <>
          <optgroup label={firmsLabel}>{opcionesFirma}</optgroup>
          <optgroup label={partnersLabel}>{opcionesPartner}</optgroup>
        </>
      ) : (
        <>{opcionesFirma}{opcionesPartner}</>
      )}
      <option value="__otro__">{otherLabel}</option>
    </select>
  );
}

// ─── AttorneySelect — miembros del firm seleccionado ─────────────────────────

interface MemberOption { id: string; label: string; subtitle: string; }

function AttorneySelect({
  firmId, value, onChange, placeholder, selectPlaceholder,
}: {
  firmId: string; value: string; onChange: (v: string) => void;
  placeholder: string; selectPlaceholder: string;
}) {
  const [members, setMembers] = useState<MemberOption[]>([]);

  useEffect(() => {
    if (!firmId) { setMembers([]); return; }
    fetch(`/api/admin/lawyers/autocomplete?firmId=${firmId}`)
      .then(r => r.json())
      .then(j => setMembers(j.results ?? []))
      .catch(() => {});
  }, [firmId]);

  if (!firmId) {
    return (
      <input
        className={INPUT}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <select className={SELECT} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{selectPlaceholder}</option>
      {members.map(m => (
        <option key={m.id} value={m.label}>{m.label}{m.subtitle ? ` — ${m.subtitle}` : ''}</option>
      ))}
      <option value="__otro__">Otro…</option>
    </select>
  );
}

// ─── QR Success panel ─────────────────────────────────────────────────────────

interface SuccessInfo {
  caseCode:    string;
  patientCode: string;
  patientName: string;
  caseId:      string;
  patientId:   string;
  portalUrl:   string;
}

function QrSuccessPanel({ info, onNewPatient, onClose, patientsBase }: {
  info: SuccessInfo;
  onNewPatient: () => void;
  onClose: () => void;
  /**
   * Dónde vive la ficha del paciente para QUIEN está mirando: `/patients` en la
   * clínica, `/doctor/patients` en el portal. Estaba escrito fijo, así que al
   * provider "Ver paciente" le abría una pestaña nueva en una ruta
   * administrativa y el middleware lo rebotaba a `/doctor` — un botón que no
   * lleva a ningún lado.
   */
  patientsBase: string;
}) {
  const t = useTranslations('quickRegister');
  const [copied,    setCopied]    = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(info.portalUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#e2e8f0', light: '#12141f' },
    }).then(setQrDataUrl).catch(() => {});
  }, [info.portalUrl]);

  function copyLink() {
    navigator.clipboard.writeText(info.portalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-caso-${info.caseCode}.png`;
    a.click();
  }

  return (
    <div className="flex flex-col sm:flex-row gap-0 min-h-[420px]">

      {/* ── Columna izquierda: QR ─────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center gap-4 px-8 py-8 sm:w-72 shrink-0 bg-bg-2/40 border-b sm:border-b-0 sm:border-r border-border">
        <div className="flex items-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-3 py-1">
          <Check className="w-3 h-3 text-emerald" />
          <span className="text-[11px] font-medium text-emerald">{t('qrRegistered')}</span>
        </div>

        <div className="rounded-xl border border-border p-3 bg-[#12141f] flex flex-col items-center gap-2">
          {qrDataUrl
            ? <img src={qrDataUrl} alt="QR" width={200} height={200} className="rounded-lg" />
            : <div className="w-[200px] h-[200px] rounded-lg bg-bg-1 animate-pulse" />
          }
          <p className="text-[10px] text-text-muted text-center">{t('qrScanHint')}</p>
        </div>

        <button
          type="button"
          onClick={downloadQr}
          disabled={!qrDataUrl}
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-border bg-bg-1 px-3 py-1.5 text-[11px] text-text-2 hover:border-brand/40 hover:text-brand-text transition-colors disabled:opacity-40"
        >
          <QrCode className="w-3.5 h-3.5" />
          {t('qrDownload')}
        </button>
      </div>

      {/* ── Columna derecha: info + acciones ──────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-5 px-6 py-8">

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-bg-1 p-4 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{t('qrPatient')}</p>
              <p className="text-base font-bold text-text-1">{info.patientName}</p>
              <p className="text-[11px] text-brand-text font-mono mt-0.5">{info.patientCode}</p>
            </div>
            <div className="h-px bg-border" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{t('qrCaseCode')}</p>
              <p className="text-lg font-bold text-text-1 font-mono tracking-wide">{info.caseCode}</p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">{t('qrPortalLink')}</p>
          <div className="flex items-center gap-2 min-w-0 rounded-md border border-border bg-bg-2 px-3 py-2">
            <span className="flex-1 min-w-0 text-[11px] text-text-muted truncate font-mono">{info.portalUrl}</span>
            <button
              type="button"
              onClick={copyLink}
              className="text-text-muted hover:text-brand-text transition-colors shrink-0"
              title={t('qrCopyLink')}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          {copied && <p className="text-[10px] text-emerald">{t('qrCopied')}</p>}
        </div>

        <div className="flex-1" />

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onNewPatient} className="flex items-center justify-center gap-1.5 text-xs">
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              {t('qrNewRecord')}
            </Button>
            <Button
              onClick={() => window.open(`${patientsBase}/${info.patientId}`, '_blank')}
              className="flex items-center justify-center gap-1.5 text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              {t('qrViewPatient')}
            </Button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full text-[11px] text-text-muted hover:text-text-1 transition-colors py-1"
          >
            {t('qrClose')}
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/** Lo que un referido del bufete puede precargar acá. Todo opcional. */
export interface ReferidoPrecarga {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  /** `YYYY-MM-DD`, como lo espera el input de fecha. */
  dateOfBirth?: string;
  language?: 'es' | 'en';
  caseType?: 'MVA' | 'GENERAL';
  accidentDate?: string;
  description?: string;
  /** El bufete que refirió, ya resuelto a su id — no el nombre. */
  lawFirmId?: string;
  lawFirm?: string;
  attorney?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * Provider de la sesión cuando el alta se hace desde el portal médico.
   *
   * Se guarda como "quién trajo al paciente" (`Patient.providerReferrerId`), y
   * de eso depende que el provider VEA lo que acaba de crear: su lista y su
   * ficha se recortan por "lo atiendo o lo traje yo", y un paciente recién dado
   * de alta todavía no tiene ninguna cita.
   */
  providerId?: string;
  /**
   * Nombre tecleado en el buscador que abrió este diálogo, para precargarlo.
   *
   * Nace del alta desde el selector de paciente de una cita: si recepción ya
   * escribió "Juan Perez" y no apareció, volver a pedirle el nombre es hacerle
   * repetir lo que acaba de escribir con el paciente al teléfono.
   */
  initialFirstName?: string;
  initialLastName?: string;
  /**
   * Precarga COMPLETA, hoy solo desde un REFERIDO del bufete.
   *
   * Es el camino corto del referido: el mismo dato que llena el wizard de tres
   * pasos entra acá, y el que atiende solo confirma y guarda. Lo que no viene
   * (el bufete no lo sabe) se deja vacío para que lo complete la clínica.
   */
  initial?: ReferidoPrecarga;
  /**
   * El referido que se está convirtiendo. Viaja al POST para que el referido
   * pase a CREADO y el bufete deje de verlo como "sin respuesta".
   *
   * Sin esto, convertir por el camino corto dejaba el referido PENDIENTE para
   * siempre: la API ya sabía marcarlo, era el diálogo el que no lo mandaba.
   */
  referralId?: string;
  /**
   * Se llama apenas el alta responde OK, ANTES de que el diálogo se cierre o
   * muestre el panel del QR — así quien lo abrió ya tiene el paciente aunque el
   * usuario se quede mirando el código.
   *
   * Existe para el alta desde una cita: el paciente recién creado se elige solo
   * y, como el alta rápida crea paciente Y caso en la misma transacción, ese
   * caso queda como único del paciente y también se auto-selecciona.
   */
  onCreated?: (creado: {
    patientId: string;
    patientCode: string | null;
    firstName: string;
    lastName: string;
    phone: string | null;
    caseId: string | null;
    caseCode: string | null;
  }) => void;
}

type SaveMode = 'exit' | 'form' | 'qr';

/**
 * Lo que se elige en "Tipo de caso". `SIN_CASO` no es un tipo: es la decisión
 * de NO abrir expediente todavía y dejarlo para cuando se agende la cita.
 */
type TipoElegido = 'MVA' | 'GENERAL' | 'SIN_CASO';

export function QuickRegisterDialog({
  open, onOpenChange, providerId, initialFirstName, initialLastName, initial, referralId, onCreated,
}: Props) {
  const t      = useTranslations('quickRegister');
  /* Los textos del desvío de GM viven en `caseWizard`: son los mismos en las
     tres pantallas que crean casos y no se duplican por namespace. */
  const tcw    = useTranslations('caseWizard');
  const tpe    = useTranslations('phoenix.portalEnvio');
  const tac    = useTranslations('phoenix.avisoCita');
  const toast  = useToast();
  const router = useRouter();
  /** GM ya existente del paciente — se ofrece abrirlo en vez de crear otro. */
  const [gmExistente, setGmExistente] = useState<{ id: string; caseCode: string } | null>(null);

  const REFERRAL_OPTIONS = [
    { value: 'WALK_IN',          label: t('referralWalkIn') },
    { value: 'PHONE_CALL',       label: t('referralPhone') },
    { value: 'LAW_FIRM',         label: t('referralLawFirm') },
    { value: 'PATIENT_REFERRAL', label: t('referralPatient') },
    { value: 'GOOGLE',           label: t('referralGoogle') },
    { value: 'GOOGLE_MAPS',      label: t('referralGoogleMaps') },
    { value: 'FACEBOOK',         label: t('referralFacebook') },
    { value: 'INSTAGRAM',        label: t('referralInstagram') },
    { value: 'TIKTOK',           label: t('referralTikTok') },
    { value: 'FAMILY',           label: t('referralFamily') },
    { value: 'CHIROPRACTOR',     label: t('referralChiro') },
    { value: 'INSURANCE',        label: t('referralInsurance') },
    { value: 'OTHER',            label: t('referralOther') },
  ];

  // Patient basics
  const [firstName,  setFirstName]  = useState(initialFirstName ?? '');
  const [lastName,   setLastName]   = useState(initialLastName ?? '');
  const [dob,        setDob]        = useState('');
  const [phone,      setPhone]      = useState('');
  const [email,      setEmail]      = useState('');
  const [language,   setLanguage]   = useState('en');
  const [howFound,         setHowFound]         = useState('');
  const [howFoundOther,    setHowFoundOther]    = useState('');
  const [referredBy,       setReferredBy]       = useState('');
  const [referredByFreeText, setReferredByFreeText] = useState('');
  /** Tipo del referidor elegido, cuando salió del catálogo. Decide la fuente. */
  const [referidorTipo, setReferidorTipo] = useState<ReferidorElegido['type'] | null>(null);

  // Case info
  /**
   * Tipo de caso — o ninguno.
   *
   * `SIN_CASO` es el DEFAULT y no crea `Case`: solo el paciente. Antes esto
   * arrancaba en `'MVA'`, y una respuesta que viene contestada nadie la
   * corrige: medido en la base el 22-sep-2026, **594 de 1.112 casos MVA no
   * tienen ni fecha de accidente ni bufete** — el 53%. Casi todos son GM mal
   * tipados nacidos de este `useState`.
   *
   * No se reemplazó por "ninguna opción marcada" porque eso no resuelve nada:
   * `Case.caseType` es NOT NULL con `@default(GENERAL)`, así que guardar sin
   * elegir crearía un caso GM EN SILENCIO. Y un GM mal tipado es peor que un
   * MVA mal tipado: el MVA canta (no tiene fecha de accidente ni bufete) y el
   * GM no canta nada, no hay con qué encontrarlo después.
   *
   * La tercera opción dice en pantalla qué va a pasar, no bloquea nada, y el
   * camino ya existe: sin caso, el diálogo de citas muestra "Crear caso acá" y
   * abre el wizard, que es donde se decide el tipo con el paciente agendando.
   */
  const [caseType,     setCaseType]     = useState<TipoElegido>('SIN_CASO');
  const [accidentDate, setAccidentDate] = useState('');
  const [lawFirmId,    setLawFirmId]    = useState('');
  const [lawFirm,      setLawFirm]      = useState('');
  const [attorney,     setAttorney]     = useState('');
  /** El quiropráctico del catálogo. Antes era texto libre — ver el campo. */
  const [chiroPartner, setChiroPartner] = useState<AutoResult | null>(null);
  /**
   * Lo último que puso el auto-llenado desde "¿Quién lo refirió?".
   *
   * Sin esto, cambiar el referidor dejaría al quiropráctico anterior colgado; y
   * pisar siempre sería peor, porque borraría lo que recepción eligió a mano.
   * Solo se pisa lo que puso el auto-llenado.
   */
  const autoChiro = useRef<string | null>(null);
  const [description,  setDescription]  = useState('');

  // UI state
  const [saving,      setSaving]      = useState(false);
  /** Contacto ya en uso: abre el diálogo que pregunta el parentesco. */
  const [candidatosContacto, setCandidatosContacto] = useState<CandidatoContacto[]>([]);
  /** El modo del intento que chocó — el reintento tiene que repetirlo. */
  const modoPendiente = useRef<SaveMode>('exit');
  const [error,       setError]       = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);

  const isMVA   = caseType === 'MVA';
  /** Sin caso: no se crea expediente, solo el paciente. */
  const sinCaso = caseType === 'SIN_CASO';

  /**
   * Repone la precarga cada vez que se ABRE, no solo al montar.
   *
   * Con `useState(initial)` sola, el segundo alta desde el mismo buscador salía
   * con el nombre de la primera: el componente sigue montado y `reset()` deja
   * los campos vacíos. Sin `initialFirstName` no hace nada, así que el alta desde
   * Pacientes no cambia.
   */
  useEffect(() => {
    if (!open) return;
    if (initialFirstName !== undefined) setFirstName(initialFirstName);
    if (initialLastName  !== undefined) setLastName(initialLastName);
    /**
     * La precarga del referido pisa lo que venga del buscador: si llegamos acá
     * desde un referido, el dato del bufete es el bueno. Campo por campo y solo
     * si vino algo, para no borrar lo que ya escribió quien atiende.
     */
    const i = initial;
    if (!i) return;
    if (i.firstName)    setFirstName(i.firstName);
    if (i.lastName)     setLastName(i.lastName);
    if (i.phone)        setPhone(i.phone);
    if (i.email)        setEmail(i.email);
    if (i.dateOfBirth)  setDob(i.dateOfBirth);
    if (i.language)     setLanguage(i.language);
    if (i.caseType)     setCaseType(i.caseType);
    if (i.accidentDate) setAccidentDate(i.accidentDate);
    if (i.description)  setDescription(i.description);
    if (i.lawFirmId)    setLawFirmId(i.lawFirmId);
    if (i.lawFirm)      setLawFirm(i.lawFirm);
    if (i.attorney)     setAttorney(i.attorney);
    /**
     * Con bufete referidor, la FUENTE es el bufete. Lo dejamos puesto para que
     * no haya que decir dos veces lo mismo — es la misma regla que ya aplica el
     * guardado cuando hay bufete elegido y no hay fuente.
     */
    if (i.lawFirmId) { setReferredBy(i.lawFirmId); setHowFound('LAW_FIRM'); }
  }, [open, initialFirstName, initialLastName, initial]);

  function reset() {
    setFirstName(''); setLastName(''); setDob(''); setPhone('');
    setEmail(''); setLanguage('es'); setHowFound(''); setHowFoundOther(''); setReferredBy(''); setReferredByFreeText(''); setReferidorTipo(null);
    setCaseType('SIN_CASO'); setAccidentDate(''); setLawFirmId(''); setLawFirm('');
    setAttorney(''); setChiroPartner(null); autoChiro.current = null; setDescription('');
    setError(''); setFieldErrors({}); setSuccessInfo(null);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    const today = new Date().toISOString().slice(0, 10);
    const minDOB = `${new Date().getFullYear() - 120}-01-01`;

    if (!firstName.trim()) errs.firstName = t('errFirstName');
    if (!lastName.trim())  errs.lastName  = t('errLastName');
    if (!dob) {
      errs.dob = t('errDob');
    } else if (dob > today) {
      errs.dob = t('errDobFuture');
    } else if (dob < minDOB) {
      errs.dob = t('errDobOld');
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = t('errEmail');
    if (phone.trim() && phone.replace(/\D/g, '').length < 10)
      errs.phone = t('errPhone');
    if (accidentDate && accidentDate > today)
      errs.accidentDate = t('errAccidentFuture');

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  /** Suelta el referidor y, con él, lo que el auto-llenado había puesto abajo. */
  function limpiarReferidor() {
    setReferredBy('');
    setReferidorTipo(null);
    setReferredByFreeText('');
    if (chiroPartner && chiroPartner.id === autoChiro.current) {
      setChiroPartner(null);
      autoChiro.current = null;
    }
  }

  function clearFieldError(field: string) {
    setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  /**
   * @param contacto Respuesta del diálogo de contacto compartido. Solo viaja en
   *   el reintento; con ella el servidor deja de frenar porque el contacto ya lo
   *   revisó una persona.
   */
  async function handleSave(mode: SaveMode, contacto?: { vinculo: VinculoElegido | null }) {
    if (!validate()) return;
    // El reintento del diálogo tiene que repetir el MISMO modo (guardar / enviar
    // formulario / QR): si no, elegir "es un familiar" cambiaba lo que el botón
    // iba a hacer.
    modoPendiente.current = mode;
    setSaving(true);
    setError('');

    try {
      const dobIso = dob ? new Date(dob + 'T12:00:00').toISOString() : null;
      const accIso = accidentDate ? new Date(accidentDate + 'T12:00:00').toISOString() : null;

      /* Un solo desplegable, dos catálogos. El prefijo dice cuál — ver
         `PREFIJO_REFERIDOR`. */
      const referidorDelCatalogo = referredBy.startsWith(PREFIJO_REFERIDOR)
        ? referredBy.slice(PREFIJO_REFERIDOR.length)
        : '';
      const referidorBufete = referredBy && referredBy !== '__otro__' && !referidorDelCatalogo
        ? referredBy
        : '';

      /**
       * ─── Sin caso: solo el paciente ────────────────────────────────────
       *
       * Otra ruta, no un `if` adentro del payload de casos: `POST
       * /api/admin/cases` crea paciente + caso + seguimiento + token del portal
       * + cita en UNA transacción, y todo lo que viene después del `case.create`
       * depende de él. Meterle una bifurcación "no crees el caso" sería poner un
       * camino que no se usa nunca en el medio del alta que sí se usa siempre.
       *
       * `POST /api/admin/patients` ya hacía exactamente esto —código de
       * paciente, chequeo de contacto compartido, audit log— y solo le faltaba
       * aceptar los tres campos del referidor, que se le agregaron.
       */
      if (sinCaso) {
        const resPac = await fetch('/api/admin/patients', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(contacto ? { contactoYaRevisado: true, contactLink: contacto.vinculo } : {}),
            firstName:         firstName.trim(),
            lastName:          lastName.trim(),
            phone:             phone.replace(/\D/g, '') || null,
            email:             email.trim() || null,
            dateOfBirth:       dobIso,
            preferredLanguage: language,
            referralSource: (howFound
              || (referidorTipo ? fuenteDelReferidor(referidorTipo) : '')
              || (referidorBufete ? 'LAW_FIRM' : 'WALK_IN')),
            referralSourceOther: referredByFreeText.trim() || howFoundOther.trim() || null,
            ...(referidorBufete      ? { lawyerReferrerId:  referidorBufete }      : {}),
            ...(referidorDelCatalogo ? { referralPartnerId: referidorDelCatalogo } : {}),
            ...(providerId ? { providerReferrerId: providerId } : {}),
          }),
        });

        const jsonPac = await resPac.json().catch(() => ({}));
        if (!resPac.ok) {
          /* El mismo desvío que el alta con caso: el contacto compartido no
             bloquea, pregunta el parentesco y reintenta. */
          if (Array.isArray(jsonPac.candidatos) && jsonPac.candidatos.length > 0) {
            setCandidatosContacto(jsonPac.candidatos as CandidatoContacto[]);
            return;
          }
          setError(jsonPac.message ?? 'An error occurred. Please try again.');
          return;
        }

        /* `caseId: null` es el dato que importa río abajo: el diálogo de citas
           lo lee y muestra "Crear caso acá", que es donde ahora se decide si es
           MVA o GM. */
        onCreated?.({
          patientId:   jsonPac.patient?.id         ?? '',
          patientCode: jsonPac.patient?.patientCode ?? null,
          firstName:   firstName.trim(),
          lastName:    lastName.trim(),
          phone:       phone.trim() || null,
          caseId:      null,
          caseCode:    null,
        });

        toast.success(t('savedPatientNoCase'));
        reset();
        onOpenChange(false);
        router.refresh();
        return;
      }

      const res = await fetch('/api/admin/cases', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Solo en el reintento — ver `handleSave`.
          ...(contacto ? { contactoYaRevisado: true, contactLink: contacto.vinculo } : {}),
          // Cierra el círculo del referido: la API lo marca CREADO y ata el hilo
          // al caso, de forma idempotente (el mensaje les llegó a cuatro personas).
          ...(referralId ? { referralId } : {}),
          patient: {
            firstName:         firstName.trim(),
            lastName:          lastName.trim(),
            phone:             phone.replace(/\D/g, '') || null,
            email:             email.trim() || null,
            dateOfBirth:       dobIso,
            preferredLanguage: language as 'es' | 'en',
          },
          accident: {
            date:  isMVA ? accIso : null,
            type:  isMVA ? 'AUTO' : 'OTHER',
            notes: description.trim() || null,
          },
          legal: {
            lawyerStatus:    'HAS',
            lawFirmId:       isMVA ? (lawFirmId || null) : null,
            caseManagerName: isMVA ? (attorney.trim() || null) : null,
            firmPhone:       null,
          },
          insurance:    { primaryInsuranceId: null },
          caseType:     isMVA ? 'MVA' : 'GENERAL',
          /**
           * El REFERIDO del paciente. Los dos campos estaban en pantalla y no
           * viajaban: se elegía el bufete que mandó al paciente y el dato se
           * perdía al guardar. Por eso `Patient.lawyerReferrerId` estaba casi
           * vacío (59 de 6.264) — ver el comentario de `referrer` en la API.
           *
           * Con bufete elegido y sin fuente, la fuente ES el bufete: quien carga
           * no tiene por qué decir dos veces lo mismo.
           */
          ...(referidorBufete ? { referrer: { lawFirmId: referidorBufete } } : {}),
          /* Y el referidor que no es bufete, que hasta hoy no tenía dónde ir:
             terminaba de texto en `referralSourceOther` o no se guardaba. */
          ...(referidorDelCatalogo ? { referralPartnerId: referidorDelCatalogo } : {}),
          source: (howFound
            || (referidorTipo ? fuenteDelReferidor(referidorTipo) : '')
            || (referidorBufete ? 'LAW_FIRM' : 'WALK_IN')) as 'WALK_IN',
          /* Texto libre: gana el de "Referido por" — es más específico que "de
             qué manera nos encontró". */
          sourceOther: referredByFreeText.trim() || howFoundOther.trim() || null,
          ...(providerId ? { providerReferrerId: providerId } : {}),
          /**
           * `formDelivery` era el string 'SEND_NOW' y la API espera
           * `{ sendEmail, sendSms }` desde que el envío se partió por canal.
           * Con el contrato viejo zod rechazaba el alta entera con 422: el botón
           * "Guardar y enviar formulario" no guardaba NADA. No se vio porque
           * este diálogo llevaba seis semanas sin botón que lo abriera.
           */
          formDelivery: mode === 'form'
            ? { sendEmail: !!email.trim(), sendSms: !!phone.replace(/\D/g, '') }
            : null,
          consents: {
            hipaa: false, assignedParties: false,
            treatment: false, financial: false, medicalHistory: false,
            lawFirm:      isMVA ? (lawFirm.trim() || null) : null,
            attorney:     isMVA ? (attorney.trim() || null) : null,
            /* El NOMBRE sigue yendo al JSON del caso, que es lo que leen el
               wizard y la ficha; el id va aparte, a `case_tracking`. */
            chiropractor: isMVA ? (chiroPartner?.label ?? null) : null,
          },
          chiroPartnerId: isMVA ? (chiroPartner?.id ?? null) : null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        /**
         * El contacto ya lo usa alguien. Mismo diálogo que en el alta de caso
         * completa — una familia que comparte el correo del papá no puede
         * quedarse afuera solo porque entró por el alta rápida.
         */
        if (Array.isArray(json.candidatos) && json.candidatos.length > 0) {
          setCandidatosContacto(json.candidatos as CandidatoContacto[]);
          return;
        }
        /* GM: un caso por paciente. Se guarda cuál es para ofrecer abrirlo. */
        if (json.error === 'GM_CASE_ALREADY_EXISTS' && json.caso?.id) {
          setGmExistente({ id: json.caso.id, caseCode: json.caso.caseCode });
          setError('');
          return;
        }
        if (json.error === 'INVALID_PAYLOAD' && json.details?.fieldErrors) {
          const fields = json.details.fieldErrors as Record<string, string[]>;
          const msgs = Object.entries(fields)
            .flatMap(([path, errs]) => errs.map(e => `${path}: ${e}`));
          setError(msgs.length ? msgs.join(' · ') : (json.message ?? 'Please check all required fields.'));
        } else {
          setError(json.message ?? 'An error occurred. Please try again.');
        }
        return;
      }

      /**
       * Se avisa ACÁ, antes de ramificar por modo: en 'qr' el diálogo se queda
       * abierto mostrando el código, y quien nos abrió no puede quedarse
       * esperando a que el usuario lo cierre para enterarse de que el paciente
       * ya existe.
       */
      onCreated?.({
        patientId:   json.patient?.id         ?? '',
        patientCode: json.patient?.patientCode ?? null,
        firstName:   firstName.trim(),
        lastName:    lastName.trim(),
        phone:       phone.trim() || null,
        caseId:      json.case?.id       ?? null,
        caseCode:    json.case?.caseCode ?? null,
      });

      /**
       * El envío REAL del formulario.
       *
       * `formDelivery` en el POST de arriba no manda nada: marca la intención y
       * ya. Este diálogo confiaba en eso, así que "Guardar y enviar formulario"
       * guardaba y no enviaba —seis semanas sin que se notara, porque tampoco
       * había forma de enterarse: el caso quedaba marcado como enviado igual—.
       *
       * Va después de `onCreated` a propósito: el alta ya está hecha y quien
       * nos abrió ya la tiene. Lo que sigue es el formulario, y si no sale, el
       * paciente igual existe.
       */
      /**
       * El recordatorio de la cita, si el alta agendó una.
       *
       * `POST /api/admin/cases` lo devuelve en `recordatorioCita` —o `null` si
       * no se agendó nada, que es distinto de "se intentó y falló"—. Se avisa
       * antes del formulario porque es el mismo paciente y el mismo momento:
       * quien está mirando la pantalla puede resolver los dos de una.
       */
      const avisoCita = describirAvisoCita(json.recordatorioCita, 'recordatorio', tac);
      if (avisoCita) toast.info(avisoCita, { durationMs: 9000 });

      const caseIdCreado = json.case?.id ?? '';
      if (mode === 'form' && caseIdCreado) {
        const canales: CanalPortal[] = [
          ...(email.trim()                ? ['EMAIL' as const] : []),
          ...(phone.replace(/\D/g, '')    ? ['SMS'   as const] : []),
        ];
        if (canales.length > 0) {
          const envio = await enviarPortal({
            caseId: caseIdCreado,
            canales,
            // El idioma que se acaba de elegir en el alta, normalizado por la
            // misma regla que usa el servidor — acá había una cuarta copia del
            // `=== 'en' ? 'en' : 'es'` con español de respaldo.
            language: idiomaDelPaciente(language),
          });
          if (envio.fallidos.length > 0) {
            /**
             * El aviso va por TOAST, y el diálogo se cierra igual.
             *
             * La tentación es dejarlo abierto con el error adentro, pero acá el
             * paciente YA se creó: el único botón que queda a mano es
             * "Guardar", y volver a apretarlo crea el alta de nuevo. Un error
             * que invita a duplicar al paciente es peor que el envío que falló.
             *
             * El toast dura más que el default porque hay que leer el motivo y
             * decidir algo, no solo enterarse.
             */
            toast.info(
              `${tpe('tituloFallo')} ${envio.fallidos.map((r) => describirFallo(r, tpe)).join(' · ')}`,
              { durationMs: 9000 },
            );
          }
        }
      }

      if (mode === 'qr') {
        const caseId = caseIdCreado;
        let portalUrl = `/portal?case=${caseId}`;
        if (caseId) {
          const tokenRes = await fetch(`/api/admin/cases/${caseId}/generate-portal-token`, { method: 'POST' });
          const tokenJson = await tokenRes.json().catch(() => ({}));
          if (tokenJson.portalUrl) portalUrl = tokenJson.portalUrl;
        }
        setSuccessInfo({
          caseCode:    json.case?.caseCode       ?? '—',
          patientCode: json.patient?.patientCode ?? '—',
          patientName: `${firstName.trim()} ${lastName.trim()}`,
          caseId,
          patientId:   json.patient?.id          ?? '',
          portalUrl,
        });
      } else {
        router.refresh();
        reset();
        onOpenChange(false);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl p-0 max-h-[92vh] flex flex-col">

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-brand-text" />
            <DialogTitle className="text-base font-semibold text-text-1">
              {t('title')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[12px] text-text-muted mt-0.5">
            {t('subtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {successInfo ? (
            <QrSuccessPanel
              info={successInfo}
              onNewPatient={reset}
              onClose={() => { router.refresh(); reset(); onOpenChange(false); }}
              patientsBase={providerId ? '/doctor/patients' : '/patients'}
            />
          ) : (

            <div className="px-6 py-4 space-y-6">

              {/* Notice */}
              <div className="flex items-start gap-2.5 rounded-md border border-amber/30 bg-amber/[0.08] px-3 py-2.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-amber leading-snug">
                  {t('requiredNotice')}
                </p>
              </div>

              {/* ── Sección 1: Datos básicos ─────────────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-brand-text" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-1">
                    {t('sectionPatient')}
                  </h3>
                </div>
                <p className="text-[11px] text-text-muted -mt-2">
                  {t('sectionPatientSub')}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={t('firstName')} required error={fieldErrors.firstName}>
                    <input
                      className={`${INPUT} ${fieldErrors.firstName ? 'border-rose' : ''}`}
                      value={firstName}
                      onChange={e => { setFirstName(e.target.value); clearFieldError('firstName'); }}
                      placeholder={t('firstName')}
                    />
                  </Field>
                  <Field label={t('lastName')} required error={fieldErrors.lastName}>
                    <input
                      className={`${INPUT} ${fieldErrors.lastName ? 'border-rose' : ''}`}
                      value={lastName}
                      onChange={e => { setLastName(e.target.value); clearFieldError('lastName'); }}
                      placeholder={t('lastName')}
                    />
                  </Field>
                  <Field label={t('dob')} required error={fieldErrors.dob}>
                    <input
                      type="date"
                      className={`${INPUT} [color-scheme:dark] ${fieldErrors.dob ? 'border-rose' : ''}`}
                      value={dob}
                      max={new Date().toISOString().split('T')[0]}
                      min={`${new Date().getFullYear() - 120}-01-01`}
                      onChange={e => { setDob(e.target.value); clearFieldError('dob'); }}
                    />
                  </Field>
                  <Field label={t('phone')} error={fieldErrors.phone}>
                    <input
                      className={`${INPUT} ${fieldErrors.phone ? 'border-rose' : ''}`}
                      value={phone}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        let fmt = digits;
                        if (digits.length > 6) fmt = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
                        else if (digits.length > 3) fmt = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
                        else if (digits.length > 0) fmt = `(${digits}`;
                        setPhone(fmt);
                        clearFieldError('phone');
                      }}
                      placeholder="(000) 000-0000"
                      maxLength={14}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label={t('email')} error={fieldErrors.email}>
                    <input
                      type="email"
                      className={`${INPUT} ${fieldErrors.email ? 'border-rose' : ''}`}
                      value={email}
                      onChange={e => { setEmail(e.target.value); clearFieldError('email'); }}
                      placeholder="name@example.com"
                    />
                  </Field>
                  <Field label={t('preferredLanguage')}>
                    <select className={SELECT} value={language} onChange={e => setLanguage(e.target.value)}>
                      <option value="es">{t('langEs')}</option>
                      <option value="en">{t('langEn')}</option>
                    </select>
                  </Field>
                  <Field label={t('howFound')}>
                    <select className={SELECT} value={howFound} onChange={e => {
                      setHowFound(e.target.value);
                      if (e.target.value !== 'OTHER') setHowFoundOther('');
                      /* La lista de al lado cambia con la fuente, así que lo que
                         estuviera elegido puede no estar más entre las opciones.
                         Un `<select>` con un value que no existe se ve VACÍO y
                         sigue mandando el id viejo al guardar: hay que soltarlo. */
                      limpiarReferidor();
                    }}>
                      <option value="">{t('selectOption')}</option>
                      {REFERRAL_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {howFound === 'OTHER' && (
                      <input
                        className={`${INPUT} mt-1.5`}
                        placeholder={t('specifyHowFound')}
                        value={howFoundOther}
                        onChange={e => setHowFoundOther(e.target.value)}
                        autoFocus
                      />
                    )}
                  </Field>
                  <Field label={t('referredBy')}>
                    <ReferredBySelect
                      value={referredBy}
                      onChange={(v, partner) => {
                        setReferredBy(v);
                        setReferidorTipo(partner?.type ?? null);
                        if (v !== '__otro__') setReferredByFreeText('');
                        /* Lo que pidió recepción: si quien lo refirió es el
                           quiropráctico, no hay que volver a escribirlo abajo.
                           Solo pisa lo vacío o lo que puso este mismo automatismo. */
                        if (partner) {
                          if (!chiroPartner || chiroPartner.id === autoChiro.current) {
                            setChiroPartner({ id: partner.id, label: partner.name });
                            autoChiro.current = partner.id;
                          }
                        } else if (chiroPartner && chiroPartner.id === autoChiro.current) {
                          setChiroPartner(null);
                          autoChiro.current = null;
                        }
                      }}
                      placeholder={t('selectOption')}
                      /* "Otro" a secas no decía que abajo aparece una cajita para
                         escribir: la salida existía y no se veía. */
                      otherLabel={t('otherTyped')}
                      firmsLabel={t('groupFirms')}
                      partnersLabel={t('groupPartners')}
                      fuente={howFound}
                    />
                    {referredBy === '__otro__' && (
                      <input
                        className={`${INPUT} mt-1.5`}
                        placeholder={t('typeReferredBy')}
                        value={referredByFreeText}
                        onChange={e => setReferredByFreeText(e.target.value)}
                        autoFocus
                      />
                    )}
                  </Field>
                </div>
              </div>

              {/* ── Sección 2: Información del caso ──────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-brand-text" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-1">
                    {t('sectionCase')}
                  </h3>
                </div>
                <p className="text-[11px] text-text-muted -mt-2">
                  {t('sectionCaseSub')}
                </p>

                <Field label={t('caseType')} required>
                  {/*
                    Tres opciones, no dos, y la que viene marcada es "todavía
                    no". Ver el comentario del `useState`: con MVA puesto de
                    fábrica, el 53% de los casos MVA de la base salieron sin
                    fecha de accidente ni bufete.

                    Una columna en el teléfono: son tres tarjetas con texto y
                    apretarlas de a tres en 375px es pedir un error de dedo en
                    la decisión más importante de la pantalla.
                  */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(['MVA', 'GENERAL', 'SIN_CASO'] as const).map(ct => {
                      const active = caseType === ct;
                      return (
                        <button
                          key={ct}
                          type="button"
                          onClick={() => setCaseType(ct)}
                          className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm font-medium transition-all text-left
                            ${active
                              ? 'border-brand bg-brand/10 text-brand-text'
                              : 'border-border bg-bg-2 text-text-muted hover:border-brand/40'
                            }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0
                            ${active ? 'border-brand' : 'border-text-muted/40'}`}>
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-brand block" />}
                          </span>
                          {ct === 'MVA'     && <><Car className="w-3.5 h-3.5 shrink-0" /> MVA</>}
                          {ct === 'GENERAL' && <><Stethoscope className="w-3.5 h-3.5 shrink-0" /> GM</>}
                          {ct === 'SIN_CASO' && (
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                <Clock3 className="w-3.5 h-3.5 shrink-0" /> {t('caseTypeNone')}
                              </span>
                              {/* El subtítulo dice el EFECTO, no el nombre de la
                                  opción: quien la deja puesta tiene que saber
                                  qué va a pasar sin tener que preguntar. */}
                              <span className="block text-[10px] font-normal text-text-muted mt-0.5 leading-tight">
                                {t('caseTypeNoneHint')}
                              </span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                {/* Qué pasa con "todavía no", dicho una vez y completo. Sustituye
                    a los campos del caso que se pliegan abajo: sin esto la
                    sección queda vacía y parece que algo se rompió. */}
                {sinCaso && (
                  <div className="rounded-md border border-cyan/30 bg-cyan/5 px-3 py-2 text-[11px] text-cyan-text">
                    {t('caseNoneExplain')}
                  </div>
                )}

                {isMVA && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label={t('accidentDate')} error={fieldErrors.accidentDate}>
                      <input
                        type="date"
                        className={`${INPUT} [color-scheme:dark] ${fieldErrors.accidentDate ? 'border-rose' : ''}`}
                        value={accidentDate}
                        max={new Date().toISOString().split('T')[0]}
                        onChange={e => { setAccidentDate(e.target.value); clearFieldError('accidentDate'); }}
                      />
                    </Field>
                    <Field label={t('lawFirm')}>
                      {/* Esta pantalla ya podía crear bufetes, pero **con el
                          nombre solo** (`{ entityType: 'FIRM', firmName }`) — y
                          eso es justo lo que ensucia el catálogo: un bufete sin
                          teléfono no sirve para lo único que se necesita
                          después, que es llamarlo. Ahora usa el campo
                          compartido, que abre el formulario completo y avisa de
                          los parecidos antes de crear otro. */}
                      <LawFirmField
                        selected={lawFirmId ? { id: lawFirmId, label: lawFirm } : null}
                        onSelect={(r) => { setLawFirmId(r?.id ?? ''); setLawFirm(r?.label ?? ''); setAttorney(''); }}
                        placeholder={t('searchFirm')}
                      />
                    </Field>
                    <Field label={t('attorney')}>
                      <AttorneySelect
                        firmId={lawFirmId}
                        value={attorney}
                        onChange={setAttorney}
                        placeholder={t('attorneyPlaceholder')}
                        selectPlaceholder={t('selectAttorney')}
                      />
                    </Field>
                    <Field label={t('chiropractor')}>
                      <ReferralPartnerField
                        selected={chiroPartner}
                        onSelect={(r) => { setChiroPartner(r); autoChiro.current = null; }}
                        placeholder={t('searchChiro')}
                        tipoPorDefecto="CHIROPRACTOR"
                      />
                    </Field>
                  </div>
                )}

                {/* La descripción es del CASO (`accident.notes`), así que sin
                    caso no tiene dónde guardarse. Se pliega en vez de quedar
                    escribible y perderse al guardar — un campo que acepta texto
                    y lo tira es peor que uno que no está. El wizard la vuelve a
                    pedir al abrir el caso, minutos después, al agendar. */}
                {!sinCaso && (
                  <Field label={t('caseDescription')}>
                    <textarea
                      rows={3}
                      className={INPUT}
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder={t('caseDescriptionPlaceholder')}
                    />
                  </Field>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-rose/30 bg-rose/10 px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 text-rose shrink-0" />
                  <p className="text-[11.5px] text-rose">{error}</p>
                </div>
              )}

              {/* GM: ya tiene su caso. Ámbar: es un desvío, no un error. */}
              {gmExistente && (
                <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2.5 space-y-2">
                  <p className="text-[11.5px] text-amber leading-snug">
                    {tcw('gmAlreadyExists', { caseCode: gmExistente.caseCode })}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm" variant="outline"
                      className="border-amber/50 text-amber hover:bg-amber/10"
                      onClick={() => {
                        const destino = gmExistente.id;
                        setGmExistente(null);
                        onOpenChange(false);
                        router.push(`/front-office/${destino}`);
                      }}
                    >
                      {tcw('gmOpenExisting')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setGmExistente(null)}>
                      {tcw('gmBack')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!successInfo && (
          <div className="px-4 sm:px-6 py-3 border-t border-border shrink-0 flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => { reset(); onOpenChange(false); }}
              disabled={saving}
              className="shrink-0"
            >
              {t('cancel')}
            </Button>

            <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
              {/*
                El formulario y el QR cuelgan del CASO: `IntakeSubmission.caseId`
                es obligatorio y único, y el token del portal es `Case.portalToken`.
                Sin caso no hay a qué colgarlos.

                Los botones se MUESTRAN y se bloquean explicando, no desaparecen
                (regla de Erick): un botón que se esfuma no enseña nada, y acá lo
                que hay que entender es que la decisión de arriba tiene esta
                consecuencia. El motivo va en un renglón al lado, no solo en el
                `title` — un tooltip no existe en una tablet.
              */}
              {sinCaso && (
                <p className="text-[11px] text-text-muted basis-full text-right sm:basis-auto sm:text-left">
                  {t('needsCaseForFormQr')}
                </p>
              )}

              <Button
                variant="outline"
                onClick={() => handleSave('exit')}
                disabled={saving}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5 shrink-0" />
                {saving ? t('saving') : t('saveExit')}
              </Button>

              <Button
                variant="outline"
                onClick={() => handleSave('form')}
                disabled={saving || sinCaso}
                title={sinCaso ? t('needsCaseForFormQr') : undefined}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                {t('saveForm')}
              </Button>

              <Button
                onClick={() => handleSave('qr')}
                disabled={saving || sinCaso}
                title={sinCaso ? t('needsCaseForFormQr') : undefined}
                className="flex items-center gap-1.5 whitespace-nowrap bg-cyan hover:bg-cyan/90 text-white border-cyan"
              >
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                {saving ? t('saving') : t('saveQr')}
              </Button>
            </div>
          </div>
        )}

      </DialogContent>

      {/* El contacto ya lo usa alguien — mismo diálogo que en el alta completa. */}
      <ContactoCompartidoDialog
        open={candidatosContacto.length > 0}
        onClose={() => { setCandidatosContacto([]); setSaving(false); }}
        candidatos={candidatosContacto}
        nombreNuevo={[firstName.trim(), lastName.trim()].filter(Boolean).join(' ')}
        emailNuevo={email.trim() || null}
        telefonoNuevo={phone.trim() || null}
        onUsarExistente={(id) => {
          // Acá no se puede "seguir con el que existe": este diálogo SIEMPRE crea
          // un caso nuevo. Se lleva a la ficha del paciente, que es donde se abre
          // un caso para alguien que ya está en el sistema.
          setCandidatosContacto([]);
          setSaving(false);
          router.push(`/patients/${id}`);
        }}
        onVincular={(v) => {
          setCandidatosContacto([]);
          void handleSave(modoPendiente.current, { vinculo: v });
        }}
        onCrearSuelto={() => {
          setCandidatosContacto([]);
          void handleSave(modoPendiente.current, { vinculo: null });
        }}
      />
    </Dialog>
  );
}
