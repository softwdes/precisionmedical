'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { buildPortalSms, MAGIC_LINK_PLACEHOLDER, smsSegments } from '@/lib/portal-message';
import {
  Send, MessageSquare, Mail, AlertCircle, Check,
  Phone, Copy, Clock,
} from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@precision/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SendPortalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseInfo: {
    id: string;
    caseCode: string;
    patient: {
      firstName: string;
      lastName:  string;
      phone:     string | null;
      email:     string | null;
      preferredLanguage?: 'es' | 'en';
    };
  } | null;
}

interface SendResult {
  via: 'SMS' | 'EMAIL';
  to: string;
  language: 'es' | 'en';
  magicToken: string;
  portalUrl: string;
  messageBody: string;
  expiresAt: string;
  /** Twilio lo aceptó. NO significa que el paciente lo haya recibido. */
  delivered: boolean;
  /** Estado inicial de Twilio (`queued`, `sent`…). */
  status: string | null;
  /** Por qué no salió. `EMAIL_NOT_WIRED` = el canal todavía no existe. */
  error: string | null;
  errorDetail: string | null;
}

type Channel  = 'SMS' | 'EMAIL';
type Lang     = 'es'  | 'en';

// ─── Destinatario real del link ────────────────────────────────────────────────
// El link no siempre va al paciente: si es menor con tutor vinculado, va al
// tutor. El server resuelve eso en GET send-portal-link (misma regla que el
// POST) — acá solo se consulta, nunca se re-implementa.

export interface PortalRecipient {
  firstName: string;
  lastName:  string;
  phone:     string | null;
  email:     string | null;
  /** true → el destinatario es el responsable legal, no el paciente */
  forGuardian: boolean;
  /** true → menor sin tutor vinculado: el envío está bloqueado por el server */
  guardianRequired: boolean;
  /** nombre del menor cuando forGuardian */
  nombrePaciente: string | null;
}

export function usePortalRecipient(caseId: string | null | undefined, open: boolean) {
  const [recipient, setRecipient] = useState<PortalRecipient | null>(null);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (!open || !caseId) { setRecipient(null); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/cases/${caseId}/send-portal-link`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: { ok?: boolean; recipient?: PortalRecipient } | null) => {
        if (!cancelled && data?.ok && data.recipient) setRecipient(data.recipient);
      })
      .catch(() => { /* fallback: se gatea con los datos del paciente */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, caseId]);

  return { recipient, loading };
}

// ─── i18n (UI labels + message templates, switch with lang toggle) ─────────────

function ui(lang: Lang) {
  const es = {
    title:        'Enviar portal al paciente',
    expiresHdr:   'el link no vence hasta revocarlo',
    via:          'Enviar por',
    viaTwilio:    'vía Twilio',
    viaMailgun:   'vía Twilio · en pruebas',
    langLabel:    'Idioma del mensaje',
    subjectLbl:   'Asunto',
    bodyLbl:      'Mensaje',
    previewLbl:   'Previsualización',
    previewTo:    'Para:',
    subjectPfx:   'Asunto:',
    smsPreview:   'Vista previa SMS',
    magicHint:    '[magic-link] se reemplaza con el link real al enviar',
    sendSms:      'Enviar por SMS',
    sendEmail:    'Enviar por Email',
    cancel:       'Cancelar',
    expiresFooter:'El link vale hasta que se lo revoque',
    sending:      'Enviando...',
    noPhone:      '(sin teléfono)',
    noEmail:      '(sin email)',
    successTitle: 'Portal enviado',
    successDesc:  'El SMS salió por Twilio. La confirmación de entrega llega en unos minutos.',
    successVia:   'Enviado por',
    notSentTitle: 'No se pudo enviar',
    notSentEmail: 'El correo no salió. Podés reintentar, o pasarle el link de abajo a mano.',
    notSentSms:   'El SMS no salió. Podés reintentar, o pasarle el link de abajo a mano.',
    retry:        'Reintentar envío',
    whyLabel:     'Motivo',
    optedOut:     'Este número respondió STOP y se dio de baja. No se le puede volver a escribir — pasale el link por otra vía.',
    magicLink:    'Magic link generado',
    copied:       '¡Copiado!',
    copy:         'Copiar',
    expires:      '🔗 Es el link del caso — el mismo que ya se le haya enviado.',
    close:        'Cerrar',
    statusUpdate: 'Estado actualizado a',
    guardianBadge:    'Responsable legal',
    guardianReceives: 'Recibe el formulario de',
    guardianRequired: 'es menor de edad y no tiene responsable legal asignado. Asignalo en la ficha del paciente antes de enviar — es quien firma los consentimientos. Si el paciente ya está en la clínica, se puede llenar en la tablet.',
    resolving:        'Verificando destinatario...',
  };
  const en: typeof es = {
    title:        'Send portal to patient',
    expiresHdr:   'link stays valid until revoked',
    via:          'Send via',
    viaTwilio:    'via Twilio',
    viaMailgun:   'via Twilio · testing',
    langLabel:    'Message language',
    subjectLbl:   'Subject',
    bodyLbl:      'Message',
    previewLbl:   'Preview',
    previewTo:    'To:',
    subjectPfx:   'Subject:',
    smsPreview:   'SMS preview',
    magicHint:    '[magic-link] is replaced with the real link when you click Send',
    sendSms:      'Send via SMS',
    sendEmail:    'Send via Email',
    cancel:       'Cancel',
    expiresFooter:'Link stays valid until revoked',
    sending:      'Sending...',
    noPhone:      '(no phone)',
    noEmail:      '(no email)',
    successTitle: 'Portal sent',
    successDesc:  'The SMS was handed to Twilio. Delivery confirmation arrives in a few minutes.',
    successVia:   'Sent via',
    notSentTitle: 'Could not send',
    notSentEmail: 'The email did not go out. You can retry, or share the link below manually.',
    notSentSms:   'The SMS did not go out. You can retry, or share the link below manually.',
    retry:        'Retry send',
    whyLabel:     'Reason',
    optedOut:     'This number replied STOP and opted out. It cannot be messaged again — share the link another way.',
    magicLink:    'Magic link generated',
    copied:       'Copied!',
    copy:         'Copy',
    expires:      '🔗 This is the case link — the same one already sent, if any.',
    close:        'Close',
    statusUpdate: 'Status updated to',
    guardianBadge:    'Legal guardian',
    guardianReceives: 'Receives the form for',
    guardianRequired: 'is a minor with no legal guardian assigned. Assign one on the patient record before sending — the guardian is who signs the consents. If the patient is at the clinic, the form can be filled on the tablet.',
    resolving:        'Checking recipient...',
  };
  return lang === 'es' ? es : en;
}

// Cuando el destinatario es el tutor, el mensaje nombra al menor — si le
// llegara el mismo texto que al paciente, no sabría de quién es el caso.
// El copy del SMS replica el que arma el server en send-portal-link.

/**
 * La vista previa arma el MISMO texto que manda el servidor, con un marcador
 * donde va el link. Antes era una copia local que se desincronizo: mostraba el
 * texto viejo mientras el servidor ya mandaba el nuevo con el opt-out.
 */
function smsTemplate(lang: Lang, _firstName: string, caseCode: string, nombrePaciente: string | null): string {
  return buildPortalSms({ lang, caseCode, nombrePaciente, portalUrl: MAGIC_LINK_PLACEHOLDER });
}

function emailSubject(lang: Lang, fullName: string, nombrePaciente: string | null): string {
  if (nombrePaciente) {
    return lang === 'es'
      ? `Recordatorio: completa el formulario de ${nombrePaciente}`
      : `Reminder: complete the information form for ${nombrePaciente}`;
  }
  return lang === 'es'
    ? `Recordatorio: completa tu formulario, ${fullName}`
    : `Reminder: complete your information form, ${fullName}`;
}

function emailBody(lang: Lang, fullName: string, nombrePaciente: string | null): string {
  if (nombrePaciente) {
    return lang === 'es'
      ? `Hola ${fullName},\n\nComo responsable legal de ${nombrePaciente}, tu clínica te recuerda completar su formulario de información antes de la próxima cita.\n\nUsa el enlace seguro que llegará a continuación para completar el registro.\n\nGracias,\nPrecision Medical`
      : `Hello ${fullName},\n\nAs the legal guardian of ${nombrePaciente}, your clinic is reminding you to complete their information form before the next visit.\n\nUse the secure link that will follow to complete the registration.\n\nThank you,\nPrecision Medical`;
  }
  return lang === 'es'
    ? `Hola ${fullName},\n\nTu clínica te recuerda completar tu formulario de información antes de tu próxima cita.\n\nUsa el enlace seguro que llegará a continuación para completar tu registro.\n\nGracias,\nPrecision Medical`
    : `Hello ${fullName},\n\nYour clinic is reminding you to complete your information form before your next visit.\n\nUse the secure link that will follow to complete your registration.\n\nThank you,\nPrecision Medical`;
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function initials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ContactDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
      ok ? 'bg-emerald shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-text-muted'
    }`} />
  );
}

function ChannelTab({
  active, disabled, color, icon: Icon, label, sub, badge, onClick,
}: {
  active: boolean; disabled: boolean; color: 'cyan' | 'brand';
  icon: React.ElementType; label: string; sub: string;
  /** Sin badge = el canal existe pero todavia no envia. */
  badge?: string;
  onClick: () => void;
}) {
  const activeClass = color === 'cyan'
    ? 'bg-cyan/10 border-cyan/30'
    : 'bg-brand/10 border-brand/30';
  const iconColor = active
    ? (color === 'cyan' ? 'text-cyan' : 'text-brand-text')
    : 'text-text-muted';
  const textColor = active
    ? (color === 'cyan' ? 'text-cyan' : 'text-brand-text')
    : 'text-text-2';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative flex items-center gap-2 px-3 py-2.5 rounded-md border transition-all text-left
        ${disabled ? 'opacity-40 cursor-not-allowed bg-bg-2 border-border' : 'cursor-pointer'}
        ${!disabled && active ? activeClass : !disabled ? 'bg-bg-2 border-border hover:border-border/60 hover:bg-bg-3' : ''}
      `}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-[12.5px] font-semibold ${textColor}`}>{label}</div>
        <div className={`text-[9.5px] font-medium opacity-70 ${textColor}`}>{sub}</div>
      </div>
      {badge && (
        <span className={`absolute top-1 right-1.5 text-[7.5px] font-bold uppercase tracking-wide px-1 py-px rounded border ${
          badge === 'Live'
            ? 'bg-emerald/15 text-emerald border-emerald/25'
            : 'bg-amber/15 text-amber border-amber/25'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Main dialog ───────────────────────────────────────────────────────────────

export function SendPortalDialog({ open, onOpenChange, caseInfo }: SendPortalDialogProps) {
  const router = useRouter();

  const [channel,  setChannel]  = useState<Channel>('SMS');
  const [lang,     setLang]     = useState<Lang>('es');
  const [subject,  setSubject]  = useState('');
  const [body,     setBody]     = useState('');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [result,   setResult]   = useState<SendResult | null>(null);
  const [copied,   setCopied]   = useState(false);

  // El destinatario real puede ser el tutor (menor con responsable legal
  // vinculado) — lo resuelve el server con la misma regla que usa al enviar.
  const { recipient: resolved, loading: resolvingDest } = usePortalRecipient(caseInfo?.id, open);

  /**
   * La PANTALLA va en el idioma del staff · el MENSAJE en el del paciente.
   *
   * Eran la misma variable: `ui(lang)`, donde `lang` es el idioma del SMS. El
   * resultado era que un paciente registrado en español volvía todo el diálogo
   * al español —"Portal enviado", "Expira", "Enviado por SMS"— para una
   * recepcionista que tiene la app en inglés. Y el toggle de al lado dice
   * "Idioma del mensaje", así que el propio diálogo ya declaraba que ese valor
   * era del mensaje y no de la interfaz.
   *
   * Reportado el 2026-09-02: el tester leyó el diálogo entero en español con la
   * app en inglés.
   */
  const localeStaff: Lang = useLocale() === 'es' ? 'es' : 'en';
  const L = ui(localeStaff);
  const fullName = caseInfo ? `${caseInfo.patient.firstName} ${caseInfo.patient.lastName}` : '';

  // Mientras el GET no llegó (o falló), se gatea con los datos del paciente —
  // igual que antes de existir la resolución. El server valida de nuevo al enviar.
  const dest = resolved ?? (caseInfo ? {
    firstName: caseInfo.patient.firstName,
    lastName:  caseInfo.patient.lastName,
    phone:     caseInfo.patient.phone,
    email:     caseInfo.patient.email,
    forGuardian: false,
    guardianRequired: false,
    nombrePaciente: null,
  } : null);
  const destName  = dest ? `${dest.firstName} ${dest.lastName}` : '';
  const nombrePaciente = dest?.forGuardian ? dest.nombrePaciente : null;

  // Reset on open
  useEffect(() => {
    if (open && caseInfo) {
      const initLang = caseInfo.patient.preferredLanguage ?? 'es';
      const initCh: Channel = caseInfo.patient.phone ? 'SMS' : 'EMAIL';
      setChannel(initCh);
      setLang(initLang);
      setError(null);
      setResult(null);
    }
  }, [open, caseInfo]);

  // Cuando llega el destinatario resuelto, re-elegir el canal con SUS datos
  // (el tutor puede tener teléfono aunque el menor no, y viceversa)
  useEffect(() => {
    if (!resolved) return;
    setChannel(resolved.phone ? 'SMS' : 'EMAIL');
  }, [resolved]);

  // Sync email subject/body when lang or recipient changes
  useEffect(() => {
    if (!caseInfo || !destName) return;
    setSubject(emailSubject(lang, destName, nombrePaciente));
    setBody(emailBody(lang, destName, nombrePaciente));
  }, [lang, destName, nombrePaciente, caseInfo]);

  if (!caseInfo || !dest) return null;

  const sendBlocked  = dest.guardianRequired;
  const canSendSms   = !!dest.phone  && !sendBlocked;
  const canSendEmail = !!dest.email && !sendBlocked;

  const smsText = smsTemplate(lang, dest.firstName, caseInfo.caseCode, nombrePaciente);
  // Con el link real, no con el marcador: el marcador tiene 12 caracteres y el
  // link ~50, asi que contar sobre la vista previa subestimaria el costo.
  const smsInfo = smsSegments(smsText.replace(MAGIC_LINK_PLACEHOLDER, 'https://forms.lienmaster.net/c/pt_m9x2k4a8b3n7q1'));

  const handleSend = async () => {
    setError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseInfo.id}/send-portal-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          via: channel,
          language: lang,
          ...(channel === 'EMAIL' ? { subject, body } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { sent: SendResult };
      setResult(data.sent);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar portal');
    } finally {
      setSending(false);
    }
  };

  const copyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const handleCloseSuccess = (v: boolean) => {
    onOpenChange(v);
    if (!v) router.refresh();
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (result) {
    return (
      <Dialog open={open} onOpenChange={handleCloseSuccess}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-4 border-b border-border">
            <DialogHeader>
              <DialogTitle className={`flex items-center gap-2 text-sm ${result.delivered ? 'text-emerald' : 'text-amber'}`}>
                <Check className="w-4 h-4" />
                {result.delivered ? L.successTitle : L.notSentTitle}
              </DialogTitle>
              <p className="text-[11px] text-text-muted mt-1">
                {result.delivered
                  ? L.successDesc
                  : result.error === 'OPTED_OUT' ? L.optedOut
                  : result.via === 'EMAIL'       ? L.notSentEmail
                  : L.notSentSms}
              </p>
            </DialogHeader>
          </div>

          <div className="px-5 py-4 space-y-3">
            {/* El motivo exacto del fallo. Sin esto la pantalla decia "no se
                pudo enviar" y el unico camino era abrir los logs de Vercel —
                cuando el backend ya devuelve la causa y como resolverla. */}
            {!result.delivered && result.errorDetail && (
              <div className="rounded-md border border-amber/30 bg-amber/5 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber mb-1">
                  {L.whyLabel}
                </div>
                <p className="text-[11.5px] text-text-2 leading-relaxed">{result.errorDetail}</p>
              </div>
            )}

            {/* Via + message */}
            <div className={`rounded-md p-3.5 border ${result.delivered ? 'border-emerald/25 bg-emerald/5' : 'border-amber/25 bg-amber/5'}`}>
              <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-2 ${result.delivered ? 'text-emerald' : 'text-amber'}`}>
                {result.via === 'SMS' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                {L.successVia} {result.via} · {result.to}
              </div>
              <p className="text-[11.5px] text-text-2 font-mono whitespace-pre-wrap leading-relaxed bg-bg-1 rounded px-2.5 py-2">
                {result.messageBody}
              </p>
            </div>

            {/* Magic link */}
            <div className="rounded-md border border-brand/25 bg-brand/5 p-3.5">
              <div className="text-[10px] text-brand-text font-semibold uppercase tracking-wider mb-2">{L.magicLink}</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[10.5px] font-mono text-text-1 bg-bg-2 rounded px-2.5 py-1.5 break-all">
                  {result.portalUrl}
                </code>
                <button
                  type="button"
                  onClick={copyLink}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-bg-2 hover:bg-bg-3 text-text-2 hover:text-text-1 text-[11px] transition-colors flex-shrink-0"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald" /> : <Copy className="w-3 h-3" />}
                  {copied ? L.copied : L.copy}
                </button>
              </div>
              {/**
                * Antes decía "⏱ Expira: <fecha>" con el `expiresAt` que devuelve
                * el server. Esa fecha nunca fue real: `cases.portalToken` no
                * tiene columna de expiración y nadie la valida. Y ahora que el
                * token se REUSA en vez de re-emitirse, lo que el staff necesita
                * saber es otra cosa: que este es el mismo link de siempre, no
                * uno nuevo que reemplace al anterior.
                */}
              <p className="mt-1.5 text-[10px] text-text-muted">
                {L.expires}
              </p>
            </div>

            <p className="text-[10px] text-text-muted text-center">
              ✓ {L.statusUpdate} <code className="text-amber">INTAKE_PENDING</code>
            </p>
          </div>

          <div className="px-5 pb-5 flex justify-end">
            {/* Reintentar solo si tiene sentido. NO se ofrece cuando el numero
                se dio de baja con STOP: reintentar ahi es ilegal (TCPA), no un
                problema tecnico. Tampoco en email, que todavia no existe. */}
            {!result.delivered
              && result.error !== 'OPTED_OUT'
              && result.error !== 'NOT_IN_TEST_ALLOWLIST' && (
              <Button
                variant="outline"
                disabled={sending}
                onClick={() => { setResult(null); void handleSend(); }}
              >
                {sending ? L.sending : L.retry}
              </Button>
            )}
            <Button onClick={() => handleCloseSuccess(false)}>{L.close}</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Form state ─────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] p-0 overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-sm">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,rgba(99,102,241,.2),rgba(6,182,212,.1))', border: '1px solid rgba(99,102,241,.22)' }}>
                <Send className="w-3.5 h-3.5 text-brand-text" />
              </div>
              {L.title}
            </DialogTitle>
            <p className="text-[11.5px] text-text-2 mt-1">
              Magic link (B.5–B.9) · <strong className="text-text-1 font-semibold">{fullName}</strong> · {L.expiresHdr}
            </p>
          </DialogHeader>
        </div>

        {/* Scrollable body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 flex flex-col gap-4">

          {/* Recipient card — el tutor cuando el paciente es menor */}
          <div className="flex items-center gap-3 rounded-md border border-border bg-bg-2/40 px-3 py-2.5">
            <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)' }}>
              {initials(dest.firstName, dest.lastName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold text-text-1 flex items-center gap-2 flex-wrap">
                {destName}
                {dest.forGuardian && (
                  <span className="text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-px rounded bg-violet/15 text-violet-text border border-violet/25">
                    {L.guardianBadge}
                  </span>
                )}
                <code className="text-[10px] text-text-muted font-mono">{caseInfo.caseCode}</code>
              </div>
              {dest.forGuardian && (
                <div className="text-[10px] text-text-muted mt-0.5">
                  {L.guardianReceives} <span className="text-text-2 font-medium">{nombrePaciente}</span>
                </div>
              )}
              <div className="flex flex-col gap-0.5 mt-1">
                <div className="flex items-center gap-1.5 text-[11px] text-text-2">
                  <ContactDot ok={!!dest.phone} />
                  <Phone className="w-2.5 h-2.5 text-text-muted" />
                  <span className="font-mono text-[10.5px]">{dest.phone ?? L.noPhone}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-text-2">
                  <ContactDot ok={!!dest.email} />
                  <Mail className="w-2.5 h-2.5 text-text-muted" />
                  <span className="font-mono text-[10.5px]">{dest.email ?? L.noEmail}</span>
                </div>
              </div>
            </div>
            {resolvingDest && (
              <span className="text-[9.5px] text-text-muted flex-shrink-0">{L.resolving}</span>
            )}
          </div>

          {/* Menor sin responsable legal → el server rechaza el envío (400).
              Se avisa acá para que nadie llegue a un botón que va a fallar. */}
          {sendBlocked && (
            <div className="flex items-start gap-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11.5px] text-amber leading-relaxed">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
              <span><strong className="font-semibold">{fullName}</strong> {L.guardianRequired}</span>
            </div>
          )}

          {/* Channel selector */}
          <div>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-1.5">{L.via}</p>
            <div className="grid grid-cols-2 gap-2">
              <ChannelTab
                active={channel === 'SMS'} disabled={!canSendSms} color="cyan"
                icon={MessageSquare} label="SMS" sub={L.viaTwilio} badge="Live"
                onClick={() => setChannel('SMS')}
              />
              {/* Badge "Prueba" y no "Live": el correo YA sale por Twilio, pero
                  su Email API es "Powered by SendGrid" y Twilio no firma BAA
                  para SendGrid. Hasta contratar un proveedor que lo cubra,
                  EMAIL_TEST_ALLOWLIST acota los destinos y un envío a alguien
                  fuera de la lista se rechaza con el motivo. */}
              <ChannelTab
                active={channel === 'EMAIL'} disabled={!canSendEmail} color="brand"
                icon={Mail} label="Email" sub={L.viaMailgun} badge="Prueba"
                onClick={() => setChannel('EMAIL')}
              />
            </div>
          </div>

          {/* Language toggle */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">{L.langLabel}</p>
            <div className="flex items-center bg-bg-2 border border-border rounded-md p-0.5 gap-0.5">
              {(['es', 'en'] as const).map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`px-3 py-1.5 rounded text-[11.5px] font-semibold transition-all flex items-center gap-1 ${
                    lang === l
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-text-2 hover:text-text-1'
                  }`}
                >
                  {l === 'es' ? '🇪🇸 Español' : '🇺🇸 English'}
                </button>
              ))}
            </div>
          </div>

          {/* ── SMS panel ── */}
          {channel === 'SMS' && (
            <div className="flex flex-col gap-2">
              <div className="rounded-md border border-border overflow-hidden">
                {/* Preview header */}
                <div className="flex items-center justify-between px-3 py-2 bg-bg-2/60 border-b border-border">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                    <MessageSquare className="w-2.5 h-2.5" />
                    {L.smsPreview}
                  </div>
                  {/* Segmentos, no "x / 160": el link empuja el mensaje a 2, y
                      cada segmento se factura aparte. Un "227/160" en rojo no
                      dice nada util; "2 segmentos" si. */}
                  <span className="text-[10px] text-text-muted tabular-nums">
                    {smsInfo.chars} car · {smsInfo.segments} seg
                  </span>
                </div>
                {/* Bubble */}
                <div className="px-3 py-3 bg-bg-2/30 flex flex-col gap-2">
                  <div className="max-w-[88%] bg-bg-1 rounded-xl rounded-tl-sm px-3 py-2.5 text-[12px] text-text-2 leading-relaxed border border-border">
                    {smsText.split('[magic-link]').map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <code className="text-cyan text-[10px] bg-cyan/10 px-1 py-px rounded">
                            [magic-link]
                          </code>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-[9.5px] text-text-muted">
                    <Clock className="w-2.5 h-2.5" />
                    Twilio · Precision Medical · (801) 375-2207
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-text-muted flex items-center gap-1">
                <span className="text-[9px] text-text-muted">ⓘ</span>
                {L.magicHint}
              </p>
            </div>
          )}

          {/* ── Email panel ── */}
          {channel === 'EMAIL' && (
            <div className="flex flex-col gap-3">
              {/* Subject */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">
                  {L.subjectLbl}
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg-2/50 px-3 py-2 text-[12.5px] text-text-1 outline-none focus:border-brand/40 transition-colors"
                />
              </div>

              {/* Body */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">
                  {L.bodyLbl}
                </label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={5}
                  className="w-full rounded-md border border-border bg-bg-2/50 px-3 py-2 text-[12.5px] text-text-2 leading-relaxed outline-none focus:border-brand/40 transition-colors resize-none font-sans"
                />
              </div>

              {/* Preview — always visible, no toggle */}
              <div className="rounded-md border border-border overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-bg-2/60 border-b border-border text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  {L.previewLbl}
                </div>

                {/* Subject line */}
                <div className="px-3 py-2 bg-bg-2/30 border-b border-border text-[11.5px] text-text-2">
                  <span className="text-text-muted">{L.subjectPfx}</span>{' '}
                  <span className="text-text-1 font-medium">{subject}</span>
                </div>

                {/* Email body preview */}
                <div className="px-3 py-3 bg-bg-1/60">
                  <p className="text-[11px] text-text-muted mb-2">
                    <span className="uppercase tracking-wider font-semibold text-[9.5px]">{L.previewTo}</span>{' '}
                    <code className="font-mono text-text-1">{dest.email}</code>
                  </p>
                  <div className="text-[11.5px] text-text-2 leading-relaxed whitespace-pre-wrap">
                    {body.split('[magic-link]').map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <code className="text-brand-text text-[10.5px] bg-brand/10 px-1 py-px rounded">
                            [magic-link]
                          </code>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-text-muted flex items-center gap-1">
                <span className="text-[9px]">ⓘ</span>
                {L.magicHint}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-[12px] text-rose">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
              {error}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border flex items-center gap-2 flex-shrink-0">
          {/* Expires note */}
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted mr-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald inline-block shadow-[0_0_4px_rgba(16,185,129,.5)]" />
            {L.expiresFooter}
          </div>

          <Button
            variant="outline"
            className="h-8 px-4 text-[12.5px]"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            {L.cancel}
          </Button>

          <button
            type="button"
            disabled={sending || (channel === 'SMS' ? !canSendSms : !canSendEmail)}
            onClick={handleSend}
            className={`h-8 px-4 rounded-md text-[12.5px] font-semibold text-white flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              channel === 'SMS'
                ? 'bg-cyan hover:brightness-110 shadow-[0_4px_12px_rgba(6,182,212,.30)]'
                : 'bg-brand hover:brightness-110 shadow-[0_4px_12px_rgba(99,102,241,.32)]'
            }`}
          >
            <Send className="w-3 h-3" />
            {sending ? L.sending : (channel === 'SMS' ? L.sendSms : L.sendEmail)}
          </button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
