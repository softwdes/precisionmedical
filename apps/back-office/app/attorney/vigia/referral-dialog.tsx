'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Send, Loader2, Check, AlertTriangle, ChevronDown, ChevronRight, ShieldCheck, Briefcase } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button,
} from '@precision/ui';
import { FormField, TagPill } from '@/components/ui-phoenix';
import { US_STATES } from '@/lib/us-locations';
import { ReferidoSchema, type ReferidoPayload } from '@/lib/referidos/referido';

/**
 * Portal Legal · "¿Tenés un referido?"
 *
 * El abogado manda un cliente nuevo a la clínica. Lo que se le pide es lo que
 * el wizard de nuevo caso puede usar y que él sabe (ver `lib/referidos/referido.ts`);
 * lo demás lo completa recepción con el paciente. El bufete y el abogado no se
 * eligen: salen de la sesión y se muestran como contexto.
 *
 * El seguro y el case manager van PLEGADOS: el que los sabe los despliega, el
 * que no, ni los ve. Un formulario de veinte campos no lo llena nadie desde el
 * teléfono, y este portal se usa desde el teléfono.
 *
 * NO crea nada del lado clínica: recepción valida, deduplica y elige el seguro
 * del catálogo cuando abre el wizard desde el mensaje.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  firmName: string;
  attorneyName: string | null;
  onSent?: () => void;
}

type Cliente = ReferidoPayload['cliente'];
type Accidente = ReferidoPayload['accidente'];
type Seguro = NonNullable<ReferidoPayload['seguro']>;
type CaseManager = NonNullable<ReferidoPayload['caseManager']>;

const CLIENTE_VACIO: Cliente = { firstName: '', lastName: '', phone: '', email: undefined, dateOfBirth: undefined, language: 'en' };
const ACCIDENTE_VACIO: Accidente = { date: '', city: '', state: 'UT', place: '', description: '' };
const SEGURO_VACIO: Seguro = { carrier: '', policyNumber: '', claimNumber: '', adjusterName: '', adjusterPhone: '', thirdPartyCarrier: '' };
const CM_VACIO: CaseManager = { name: '', phone: '', email: undefined };

export function ReferralDialog({ open, onClose, firmName, attorneyName, onSent }: Props): React.ReactElement {
  const t = useTranslations('phoenix.attorney');
  const [cliente, setCliente] = React.useState<Cliente>(CLIENTE_VACIO);
  const [accidente, setAccidente] = React.useState<Accidente>(ACCIDENTE_VACIO);
  const [seguro, setSeguro] = React.useState<Seguro>(SEGURO_VACIO);
  const [cm, setCm] = React.useState<CaseManager>(CM_VACIO);
  const [notes, setNotes] = React.useState('');
  const [urgente, setUrgente] = React.useState(false);
  const [seguroAbierto, setSeguroAbierto] = React.useState(false);
  const [cmAbierto, setCmAbierto] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [enviado, setEnviado] = React.useState<{ duplicados: number; respaldo: string | null } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setCliente(CLIENTE_VACIO); setAccidente(ACCIDENTE_VACIO); setSeguro(SEGURO_VACIO); setCm(CM_VACIO);
    setNotes(''); setUrgente(false); setSeguroAbierto(false); setCmAbierto(false);
    setEnviando(false); setEnviado(null); setError(null);
  }, [open]);

  const payload = (): unknown => ({
    cliente: { ...cliente, email: cliente.email ?? '', dateOfBirth: cliente.dateOfBirth ?? '' },
    accidente,
    seguro,
    caseManager: { ...cm, email: cm.email ?? '' },
    notes,
    urgente,
  });
  const valido = ReferidoSchema.safeParse(payload()).success;

  async function enviar(): Promise<void> {
    if (!valido || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch('/api/attorney/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        setError(d.error === 'SIN_DESTINATARIOS' ? t('vigiaReqNoRecipients') : t('vigiaError'));
        return;
      }
      const d = (await r.json()) as { duplicados: number; respaldo: string | null };
      setEnviado({ duplicados: d.duplicados, respaldo: d.respaldo });
      onSent?.();
    } catch {
      setError(t('vigiaError'));
    } finally {
      setEnviando(false);
    }
  }

  const seccion = 'text-[10px] uppercase tracking-wider font-semibold text-text-muted';
  const estados = US_STATES.map((s) => ({ value: s.code, label: s.name }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('refTitle')}</DialogTitle>
          <DialogDescription>{t('refSubtitle')}</DialogDescription>
        </DialogHeader>

        {enviado ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-md border border-emerald/30 bg-emerald/10 px-4 py-3">
              <Check className="w-4 h-4 text-emerald mt-0.5 shrink-0" />
              <div className="text-sm text-text-2">
                <span className="font-semibold text-emerald">{t('refSentTitle')}.</span>{' '}
                {t('refSentBody')}
              </div>
            </div>
            {enviado.duplicados > 0 && (
              <div className="rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
                {t('refSentDuplicate')}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Quién manda: contexto, no elección. */}
            <div className="flex items-center gap-2 flex-wrap text-[12px] text-text-2">
              <Briefcase className="w-3.5 h-3.5 text-brand-text" />
              <span>{t('refFrom')}</span>
              <TagPill label={firmName} colorClass="bg-brand/15 text-brand-text border-brand/30" />
              {attorneyName && <TagPill label={attorneyName} colorClass="bg-bg-2 text-text-2 border-border" />}
            </div>

            {/* Cliente */}
            <section className="space-y-3">
              <h3 className={seccion}>{t('refSecClient')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField.Input label={t('refFirstName')} required value={cliente.firstName} onChange={(v) => setCliente({ ...cliente, firstName: v })} autoFocus />
                <FormField.Input label={t('refLastName')} required value={cliente.lastName} onChange={(v) => setCliente({ ...cliente, lastName: v })} />
                <FormField.Phone label={t('refPhone')} required value={cliente.phone} onChange={(v) => setCliente({ ...cliente, phone: v })} />
                <FormField.Input label={t('refEmail')} type="email" value={cliente.email ?? ''} onChange={(v) => setCliente({ ...cliente, email: v || undefined })} />
                <FormField.Date label={t('refDob')} value={cliente.dateOfBirth ?? ''} onChange={(v) => setCliente({ ...cliente, dateOfBirth: v || undefined })} hint={t('refDobHint')} />
                <FormField.Select
                  label={t('refLanguage')}
                  value={cliente.language}
                  onChange={(v) => setCliente({ ...cliente, language: v === 'es' ? 'es' : 'en' })}
                  options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]}
                />
              </div>
            </section>

            {/* Accidente */}
            <section className="space-y-3">
              <h3 className={seccion}>{t('refSecAccident')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField.Date label={t('refAccidentDate')} required value={accidente.date} onChange={(v) => setAccidente({ ...accidente, date: v })} />
                <FormField.Input label={t('refPlace')} value={accidente.place ?? ''} onChange={(v) => setAccidente({ ...accidente, place: v })} placeholder={t('refPlacePlaceholder')} />
                <FormField.Input label={t('refCity')} value={accidente.city ?? ''} onChange={(v) => setAccidente({ ...accidente, city: v })} />
                <FormField.Select label={t('refState')} value={accidente.state ?? 'UT'} onChange={(v) => setAccidente({ ...accidente, state: v })} options={estados} />
              </div>
              <FormField.Textarea label={t('refDescription')} value={accidente.description ?? ''} onChange={(v) => setAccidente({ ...accidente, description: v })} rows={3} maxLength={2000} placeholder={t('refDescriptionPlaceholder')} />
            </section>

            {/* Seguro — plegado */}
            <section className="rounded-md bg-bg-2/40 p-3 space-y-3">
              <button type="button" onClick={() => setSeguroAbierto((v) => !v)} className="w-full flex items-center gap-2 text-left" aria-expanded={seguroAbierto}>
                {seguroAbierto ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
                <ShieldCheck className="w-3.5 h-3.5 text-cyan" />
                <span className="text-sm font-semibold text-text-1">{t('refSecInsurance')}</span>
                <span className="text-[11px] text-text-muted">{t('refOptional')}</span>
              </button>
              {seguroAbierto && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField.Input label={t('refCarrier')} value={seguro.carrier ?? ''} onChange={(v) => setSeguro({ ...seguro, carrier: v })} />
                  <FormField.Input label={t('refPolicy')} value={seguro.policyNumber ?? ''} onChange={(v) => setSeguro({ ...seguro, policyNumber: v })} />
                  <FormField.Input label={t('refClaim')} value={seguro.claimNumber ?? ''} onChange={(v) => setSeguro({ ...seguro, claimNumber: v })} />
                  <FormField.Input label={t('refThirdParty')} value={seguro.thirdPartyCarrier ?? ''} onChange={(v) => setSeguro({ ...seguro, thirdPartyCarrier: v })} hint={t('refThirdPartyHint')} />
                  <FormField.Input label={t('refAdjuster')} value={seguro.adjusterName ?? ''} onChange={(v) => setSeguro({ ...seguro, adjusterName: v })} />
                  <FormField.Phone label={t('refAdjusterPhone')} value={seguro.adjusterPhone ?? ''} onChange={(v) => setSeguro({ ...seguro, adjusterPhone: v })} />
                </div>
              )}
            </section>

            {/* Case manager — plegado */}
            <section className="rounded-md bg-bg-2/40 p-3 space-y-3">
              <button type="button" onClick={() => setCmAbierto((v) => !v)} className="w-full flex items-center gap-2 text-left" aria-expanded={cmAbierto}>
                {cmAbierto ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
                <Briefcase className="w-3.5 h-3.5 text-amber" />
                <span className="text-sm font-semibold text-text-1">{t('refSecCaseManager')}</span>
                <span className="text-[11px] text-text-muted">{t('refOptional')}</span>
              </button>
              {cmAbierto && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField.Input label={t('refCmName')} value={cm.name ?? ''} onChange={(v) => setCm({ ...cm, name: v })} />
                  <FormField.Phone label={t('refCmPhone')} value={cm.phone ?? ''} onChange={(v) => setCm({ ...cm, phone: v })} />
                  <FormField.Input label={t('refCmEmail')} type="email" value={cm.email ?? ''} onChange={(v) => setCm({ ...cm, email: v || undefined })} />
                </div>
              )}
            </section>

            <FormField.Textarea label={t('refNotes')} value={notes} onChange={setNotes} rows={3} maxLength={2000} placeholder={t('refNotesPlaceholder')} />

            <label className="flex items-center gap-2 text-sm text-text-2 cursor-pointer">
              <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="accent-amber" />
              {t('refUrgent')}
            </label>

            {error && (
              <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-rose mt-0.5 shrink-0" />
                <span className="text-[11px] text-rose">{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            {enviado ? t('vigiaReqDone') : t('vigiaReqCancel')}
          </Button>
          {!enviado && (
            <Button onClick={() => { void enviar(); }} disabled={enviando || !valido} className="w-full sm:w-auto">
              {enviando ? <Loader2 className="animate-spin" /> : <Send />}
              {t('refSend')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
