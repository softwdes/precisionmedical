'use client';

/**
 * IntakeFormLinkDialog — muestra el QR + link del formulario de intake.
 *
 * Usado desde B.15 cuando el paciente no ha firmado consentimientos.
 * Genera el token vía POST /api/admin/cases/[id]/generate-portal-token,
 * muestra el link con opción de copiar, el QR escaneable y botón para descargarlo.
 * Opcionalmente abre SendPortalDialog para enviar por SMS/Email.
 */

import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Download, ExternalLink, RefreshCw, Mail, MessageSquare } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button,
} from '@precision/ui';
import { SendPortalDialog, usePortalRecipient } from './send-portal-dialog';

interface IntakeFormLinkDialogProps {
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
    };
  } | null;
}

export function IntakeFormLinkDialog({ open, onOpenChange, caseInfo }: IntakeFormLinkDialogProps) {
  const [portalUrl,  setPortalUrl]  = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [copied,     setCopied]     = useState(false);
  const [qrDataUrl,  setQrDataUrl]  = useState<string>('');
  const [sendOpen,   setSendOpen]   = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Also send via" se gatea con los datos del DESTINATARIO real (el tutor si
  // el paciente es menor), no con los del paciente. El QR/link de la tablet
  // no depende de esto — generate-portal-token no exige tutor.
  const { recipient } = usePortalRecipient(caseInfo?.id, open);

  useEffect(() => {
    if (!open || !caseInfo) return;
    setPortalUrl(null);
    setQrDataUrl('');
    setError(null);
    generateToken();
  }, [open, caseInfo?.id]);   // re-genera si cambia el caso

  useEffect(() => {
    if (!portalUrl) return;
    QRCode.toDataURL(portalUrl, {
      width:  220,
      margin: 2,
      color:  { dark: '#e2e8f0', light: '#12141f' },
    }).then(setQrDataUrl).catch(() => {});
  }, [portalUrl]);

  async function generateToken() {
    if (!caseInfo) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/cases/${caseInfo.id}/generate-portal-token`, { method: 'POST' });
      const data = await res.json() as { ok?: boolean; portalUrl?: string; error?: string };
      if (!data.ok || !data.portalUrl) throw new Error(data.error ?? 'Error generating link');
      setPortalUrl(data.portalUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  function downloadQr() {
    if (!qrDataUrl || !caseInfo) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-intake-${caseInfo.caseCode}.png`;
    a.click();
  }

  if (!caseInfo) return null;

  const patientName = `${caseInfo.patient.firstName} ${caseInfo.patient.lastName}`;
  const initials    = `${caseInfo.patient.firstName[0]}${caseInfo.patient.lastName[0]}`.toUpperCase();

  // Antes de que llegue el GET (o si falla), se gatea con el paciente — igual
  // que siempre. El server valida de nuevo al enviar.
  const canSms   = recipient ? (!!recipient.phone && !recipient.guardianRequired) : !!caseInfo.patient.phone;
  const canEmail = recipient ? (!!recipient.email && !recipient.guardianRequired) : !!caseInfo.patient.email;

  return (
    <>
      <Dialog open={open && !sendOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">

          {/* Header */}
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              📋 Intake form link
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              Share the link or QR so <strong className="text-text-1">{patientName}</strong> can sign consents and complete intake.
            </DialogDescription>
          </DialogHeader>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">

            {/* Patient row */}
            <div className="flex items-center gap-3 rounded-md border border-border bg-bg-2/40 px-3 py-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald/15 flex items-center justify-center text-[11px] font-bold text-emerald shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-text-1">{patientName}</div>
                <div className="text-[10px] text-text-muted truncate">
                  {caseInfo.patient.email ?? caseInfo.patient.phone ?? 'No contact info'}
                </div>
              </div>
              <span className="font-mono text-[10px] text-cyan bg-cyan/10 border border-cyan/20 px-2 py-0.5 rounded shrink-0">
                {caseInfo.caseCode}
              </span>
            </div>

            {/* URL */}
            <div>
              <div className="text-[9px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">Form link</div>
              {loading && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-bg-2/40 px-3 py-2.5 text-[11px] text-text-muted">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Generating link...
                </div>
              )}
              {error && (
                <div className="rounded-md border border-rose/30 bg-rose/5 px-3 py-2 text-[11px] text-rose flex items-center justify-between gap-2">
                  <span>{error}</span>
                  <button type="button" onClick={generateToken} className="underline text-[10px] shrink-0">Retry</button>
                </div>
              )}
              {portalUrl && !loading && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-bg-2/40 px-3 py-2">
                  <code className="flex-1 text-[11px] font-mono text-cyan truncate min-w-0">
                    {portalUrl}
                  </code>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-bg-1 border border-border text-[10px] text-text-2 hover:border-emerald/40 hover:text-emerald transition-colors shrink-0"
                    title="Copy link"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md border border-border text-text-muted hover:text-brand-text hover:border-brand/40 transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* QR */}
            <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-bg-2/30 py-4 px-3">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code for ${patientName}'s intake form`}
                  width={180}
                  height={180}
                  className="rounded-lg border border-border/40"
                />
              ) : (
                <div className="w-[180px] h-[180px] rounded-lg bg-bg-1 border border-border animate-pulse flex items-center justify-center text-text-muted">
                  <RefreshCw className="w-6 h-6 opacity-30" />
                </div>
              )}
              <p className="text-[10px] text-text-muted text-center">
                Patient scans to complete the form on their phone
              </p>
            </div>

            {/* Also send via */}
            <div className="flex items-center gap-3 rounded-md border border-border/60 bg-bg-2/20 px-3 py-2.5">
              <span className="text-[11px] text-text-muted flex-1">Also send via</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!canSms}
                  onClick={() => setSendOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-[11px] text-text-2 hover:border-brand/40 hover:text-brand-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <MessageSquare className="w-3 h-3" /> SMS
                </button>
                <button
                  type="button"
                  disabled={!canEmail}
                  onClick={() => setSendOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-[11px] text-text-2 hover:border-brand/40 hover:text-brand-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Mail className="w-3 h-3" /> Email
                </button>
              </div>
            </div>

            {recipient?.guardianRequired && (
              <p className="text-[10px] text-amber leading-relaxed -mt-2">
                Minor with no legal guardian assigned — sending is blocked. Use the QR/link
                on the clinic tablet, or assign the guardian on the patient record.
              </p>
            )}

            <p className="text-[10px] text-text-muted flex items-center gap-1.5">
              ⏱ Link expires in 24 hours
            </p>
          </div>

          {/* Footer */}
          <DialogFooter className="px-5 pb-5 flex-row justify-between gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              onClick={downloadQr}
              disabled={!qrDataUrl}
              className="flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download QR
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* SendPortalDialog secundario para SMS/Email */}
      <SendPortalDialog
        open={sendOpen}
        onOpenChange={open => {
          setSendOpen(open);
        }}
        caseInfo={{
          id:        caseInfo.id,
          caseCode:  caseInfo.caseCode,
          patient: {
            firstName:         caseInfo.patient.firstName,
            lastName:          caseInfo.patient.lastName,
            phone:             caseInfo.patient.phone,
            email:             caseInfo.patient.email,
            preferredLanguage: 'es',
          },
        }}
      />
    </>
  );
}
