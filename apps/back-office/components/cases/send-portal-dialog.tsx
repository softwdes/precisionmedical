'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, MessageSquare, Mail, AlertCircle, Check, Phone, Copy, ExternalLink } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Label,
} from '@precision/ui';

// B.3 — Send portal magic link · mock para Phase 1A

interface SendPortalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseInfo: {
    id: string;
    caseCode: string;
    patient: {
      firstName: string;
      lastName: string;
      phone: string | null;
      email: string | null;
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
}

export function SendPortalDialog({ open, onOpenChange, caseInfo }: SendPortalDialogProps) {
  const router = useRouter();
  const [via, setVia] = useState<'SMS' | 'EMAIL'>('SMS');
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && caseInfo) {
      setVia(caseInfo.patient.phone ? 'SMS' : 'EMAIL');
      setLanguage(caseInfo.patient.preferredLanguage ?? 'es');
      setError(null);
      setResult(null);
    }
  }, [open, caseInfo]);

  if (!caseInfo) return null;

  const handleSend = async () => {
    setError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseInfo.id}/send-portal-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ via, language }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data.sent);
      // router.refresh() se llama al cerrar el modal para no interrumpir la vista del link
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
    } catch {}
  };

  const previewTemplate = language === 'es'
    ? `Hola ${caseInfo.patient.firstName}, soy de Precision Medical. Para completar tu intake del caso ${caseInfo.caseCode}, click: [magic-link]. Expira en 24h. Dudas: (801) 375-2207.`
    : `Hi ${caseInfo.patient.firstName}, this is Precision Medical. To complete intake for case ${caseInfo.caseCode}, click: [magic-link]. Expires in 24h. Questions: (801) 375-2207.`;

  // ─── Success state ────────────────────────────────────────────────────────
  if (result) {
    const handleCloseSuccess = (open: boolean) => {
      onOpenChange(open);
      if (!open) router.refresh(); // refresh solo cuando cerrás, no al recibir resultado
    };
    return (
      <Dialog open={open} onOpenChange={handleCloseSuccess}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald">
              <Check className="w-5 h-5" />
              Portal enviado · mock Phase 1A
            </DialogTitle>
            <DialogDescription>
              Phoenix Phase 1A — el SMS NO se envió de verdad (Weave BAA pendiente). Phase 2 con BAA firmado activa el envío real.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <div className="rounded-lg border border-emerald/30 bg-emerald/5 p-4">
              <div className="flex items-center gap-2 text-xs text-emerald font-semibold uppercase tracking-wider mb-2">
                {result.via === 'SMS' ? <MessageSquare className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                {result.via} simulado enviado a {result.to}
              </div>
              <div className="text-xs text-text-2 bg-bg-1 rounded-md p-3 font-mono whitespace-pre-wrap">
                {result.messageBody}
              </div>
            </div>

            <div className="rounded-lg border border-brand/30 bg-brand/5 p-4">
              <div className="text-xs text-brand font-semibold uppercase tracking-wider mb-2">Magic link generado</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-text-1 text-[11px] font-mono bg-bg-2 rounded px-3 py-2 break-all" title={result.portalUrl}>
                  {result.portalUrl}
                </code>
                <button
                  type="button"
                  onClick={copyLink}
                  className="px-3 py-2 rounded-md bg-bg-2 hover:bg-bg-3 text-text-2 hover:text-text-1 text-xs flex items-center gap-1"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copiado' : 'Copy'}
                </button>
              </div>
              <div className="mt-2 text-[10px] text-text-muted">
                ⏱ Expira: {new Date(result.expiresAt).toLocaleString('es-US', { dateStyle: 'short', timeStyle: 'short' })}
              </div>
            </div>

            <div className="text-xs text-text-muted text-center pt-2">
              ✓ Status del caso actualizado a <code className="text-amber">INTAKE_PENDING</code><br />
              Próximo: paciente completa portal (B.5-B.9) · 24h antes de cita confirmás (B.4)
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => handleCloseSuccess(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Form state ───────────────────────────────────────────────────────────
  const canSendSms = !!caseInfo.patient.phone;
  const canSendEmail = !!caseInfo.patient.email;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-brand" />
            Enviar portal al paciente
          </DialogTitle>
          <DialogDescription>
            Magic link al portal (B.5-B.9) para que <strong className="text-text-1">{caseInfo.patient.firstName} {caseInfo.patient.lastName}</strong> complete su intake. Expira en 24h.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Patient info */}
          <div className="rounded-md border border-border bg-bg-2/30 p-3 text-xs space-y-1">
            <div className="flex items-center gap-2 text-text-1 font-semibold">
              {caseInfo.patient.firstName} {caseInfo.patient.lastName}
              <code className="text-text-muted text-[10px] font-mono">{caseInfo.caseCode}</code>
            </div>
            {caseInfo.patient.phone && (
              <div className="flex items-center gap-1.5 text-text-2 font-mono">
                <Phone className="w-3 h-3 text-text-muted" /> {caseInfo.patient.phone}
              </div>
            )}
            {caseInfo.patient.email && (
              <div className="flex items-center gap-1.5 text-text-2">
                <Mail className="w-3 h-3 text-text-muted" /> {caseInfo.patient.email}
              </div>
            )}
          </div>

          {/* Via selector */}
          <div>
            <Label>Enviar vía</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                type="button"
                disabled={!canSendSms}
                onClick={() => setVia('SMS')}
                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-md border transition-all text-sm ${
                  !canSendSms
                    ? 'bg-bg-2 border-border opacity-40 cursor-not-allowed text-text-muted'
                    : via === 'SMS'
                      ? 'bg-brand/15 border-brand/40 text-brand font-semibold'
                      : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                SMS via Weave
                {!canSendSms && <span className="text-[10px]">(sin teléfono)</span>}
              </button>
              <button
                type="button"
                disabled={!canSendEmail}
                onClick={() => setVia('EMAIL')}
                className={`flex items-center justify-center gap-2 px-3 py-3 rounded-md border transition-all text-sm ${
                  !canSendEmail
                    ? 'bg-bg-2 border-border opacity-40 cursor-not-allowed text-text-muted'
                    : via === 'EMAIL'
                      ? 'bg-brand/15 border-brand/40 text-brand font-semibold'
                      : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                }`}
              >
                <Mail className="w-4 h-4" />
                Email via Resend
                {!canSendEmail && <span className="text-[10px]">(sin email)</span>}
              </button>
            </div>
          </div>

          {/* Language */}
          <div>
            <Label>Idioma del mensaje</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => setLanguage('es')}
                className={`px-3 py-2 rounded-md border text-sm ${
                  language === 'es'
                    ? 'bg-brand/15 border-brand/40 text-brand font-semibold'
                    : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                }`}
              >
                🇪🇸 Español
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-3 py-2 rounded-md border text-sm ${
                  language === 'en'
                    ? 'bg-brand/15 border-brand/40 text-brand font-semibold'
                    : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                }`}
              >
                🇺🇸 English
              </button>
            </div>
          </div>

          {/* Template preview */}
          <div>
            <Label>Preview del mensaje</Label>
            <div className="mt-1.5 rounded-md border border-border bg-bg-2/50 p-3 text-xs text-text-2 font-mono whitespace-pre-wrap">
              {previewTemplate}
            </div>
            <div className="text-[10px] text-text-muted mt-1.5">
              ⓘ <code>[magic-link]</code> se reemplaza con el link real al hacer click en enviar.
            </div>
          </div>

          {/* Phase 1A warning */}
          <div className="rounded-md border border-amber/30 bg-amber/5 p-3 flex items-start gap-2 text-xs text-amber">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Phase 1A · Mock mode:</strong> el SMS NO se envía de verdad. Weave wire activo después de firmar BAA Weave. Por ahora simula el flujo + actualiza status.
            </div>
          </div>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending || (!canSendSms && !canSendEmail)}>
            {sending ? 'Enviando...' : <><Send className="w-3.5 h-3.5 mr-1" /> Enviar portal ahora</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
