'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Search as SearchIcon, PhoneOutgoing, Phone, ArrowRight, ArrowLeft,
  User, ClipboardList, Lock,
} from 'lucide-react';
import { Button, Input, Label } from '@precision/ui';
import { TagPill, PersonAvatar, InfoCard, FormField } from '@/components/ui-phoenix';

// B.2 PreCall step · "¿cómo empezamos la llamada?"
//
// Antes de mostrar el modal grande de captura, preguntamos cómo se inicia:
//   - Search:   paciente existente (lo buscamos · click llamar a su tel guardado)
//   - Outgoing: yo voy a marcar (capturo número + nombre · click marca · iniciamos)
//
// El modo 'incoming' NO aparece acá · llega por el IncomingCallToast cuando
// el simulador (DEV) o Weave (Phase 2) dispara el evento, y abre el modal
// directamente en step='capturing' vía NewCaseInitialState (sin pasar por
// este PreCallStep).
//
// Cuando el encargado confirma, retorna PreCallResult al parent que arranca
// el timer y abre la captura completa.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ TODO · Phase 2 (post-BAA Weave) · Caller ID automation              │
// │                                                                     │
// │ Reemplazar el "Incoming manual" actual por un pop-up automático:    │
// │                                                                     │
// │  1. Weave envía webhook POST /api/integrations/weave/call-received  │
// │     con { from_number, call_id, ringing_since }                     │
// │  2. Backend hace caller ID lookup en Patient.phone                  │
// │  3. WebSocket/SSE emite al back-office:                             │
// │     { phone, patientId?, patientName?, casesCount?, ringingSince }  │
// │  4. Topbar/notification banner muestra:                             │
// │     "📞 LLAMADA · +1-801-555-XXXX · Sandra López · 1 caso previo"  │
// │  5. Click "Contestar" → abre B.2 directo en modo Incoming con       │
// │     datos prellenados (replica el flujo del PreCallStep aquí)       │
// │                                                                     │
// │ Mientras tanto: IncomingCallSimulator (visible en /front-office)    │
// │ muestra el patrón visual para validar UX antes de invertir en       │
// │ la integración real.                                                │
// └─────────────────────────────────────────────────────────────────────┘

export type PreCallMode = 'search' | 'incoming' | 'outgoing' | 'manual';

export interface PreCallResult {
  mode: PreCallMode;
  /** Si viene de search: paciente existente seleccionado */
  existingPatient?: {
    id: string;
    patientCode: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    casesCount: number;
  };
  /** Datos iniciales para prellenar el modal de captura */
  firstName: string;
  lastName: string;
  phone: string;
}

interface PatientSearchResult {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  casesCount: number;
  lastCaseCode: string | null;
  lastCaseStatus: string | null;
}

export function PreCallStep({
  onConfirm,
  onCancel,
  initialMode,
}: {
  onConfirm: (result: PreCallResult) => void;
  onCancel: () => void;
  initialMode?: PreCallMode;
}) {
  const t = useTranslations('phoenix.frontOffice.precall');
  const [mode, setMode] = useState<PreCallMode | null>(initialMode ?? null);

  // Ref para el input oculto del dial pad (siempre se declara — reglas de hooks)
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);

  // Quick capture state (incoming / outgoing)
  const [quickFirstName, setQuickFirstName] = useState('');
  const [quickLastName, setQuickLastName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');

  // Reset on mode change
  useEffect(() => {
    setQuery('');
    setResults([]);
    setSelectedPatient(null);
    setQuickFirstName('');
    setQuickLastName('');
    setQuickPhone('');
  }, [mode]);

  // Debounced search
  useEffect(() => {
    if (mode !== 'search' || query.length < 2 || selectedPatient) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/patients/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, mode, selectedPatient]);

  const handleStartCall = () => {
    if (mode === 'search' && selectedPatient) {
      return onConfirm({
        mode,
        existingPatient: {
          id: selectedPatient.id,
          patientCode: selectedPatient.patientCode,
          firstName: selectedPatient.firstName,
          lastName: selectedPatient.lastName,
          phone: selectedPatient.phone,
          email: selectedPatient.email,
          casesCount: selectedPatient.casesCount,
        },
        firstName: selectedPatient.firstName,
        lastName: selectedPatient.lastName,
        phone: selectedPatient.phone ?? '',
      });
    }
    if (mode === 'outgoing' && quickPhone.replace(/\D/g, '').length >= 10) {
      const d = quickPhone.replace(/\D/g, '');
      const fmtPhone = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6,10)}`;
      return onConfirm({
        mode,
        firstName: quickFirstName.trim(),
        lastName: quickLastName.trim(),
        phone: fmtPhone,
      });
    }
  };

  const canStart: boolean =
    (mode === 'search' && !!selectedPatient) ||
    (mode === 'outgoing' && quickPhone.replace(/\D/g, '').length >= 10);

  // ─── Mode selection (primera vista) ────────────────────────────────────
  if (!mode) {
    return (
      <div className="px-4 sm:px-6 py-5 space-y-4">
        <div>
          <h3 className="text-text-1 font-semibold text-base">{t('title')}</h3>
          <p className="text-text-muted text-xs mt-1">{t('subtitle')}</p>
        </div>

        <div className="space-y-2">
          <ModeCard
            icon={PhoneOutgoing}
            title={t('outgoingTitle')}
            subtitle={t('outgoingSubtitle')}
            tone="cyan"
            onClick={() => setMode('outgoing')}
          />
          <ModeCard
            icon={SearchIcon}
            title={t('searchTitle')}
            subtitle={t('searchSubtitle')}
            tone="brand"
            onClick={() => setMode('search')}
          />
          <ModeCard
            icon={ClipboardList}
            title={t('manualTitle')}
            subtitle={t('manualSubtitle')}
            tone="amber"
            onClick={() => onConfirm({ mode: 'manual', firstName: '', lastName: '', phone: '' })}
          />
        </div>

        <div className="rounded-md border border-border bg-bg-2/40 px-3 py-2 text-[11px] text-text-muted">
          <span className="text-text-2 font-semibold">{t('incomingNote')}</span>{' '}{t('incomingNoteText')}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
        </div>
      </div>
    );
  }

  // ─── Search mode ──────────────────────────────────────────────────────
  if (mode === 'search') {
    return (
      <div className="px-4 sm:px-6 py-5 space-y-4">
        <BackButton onClick={() => setMode(null)} label={t('backSearch')} />

        {!selectedPatient ? (
          <>
            <div className="relative">
              <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="pl-9"
                autoFocus
              />
            </div>

            {query.length >= 2 && (
              <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
                {searching && results.length === 0 ? (
                  <div className="px-3 py-4 text-text-muted text-xs text-center">{t('searching')}</div>
                ) : results.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <User className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
                    <div className="text-text-2 text-sm">{t('noPatientTitle', { query })}</div>
                    <div className="text-text-muted text-[11px] mt-1">{t('noPatientSubtitle')}</div>
                  </div>
                ) : (
                  <div className="max-h-[280px] overflow-y-auto scroll-thin divide-y divide-border/40">
                    {results.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPatient(p)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02] text-left transition-colors"
                      >
                        <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={9} gradientClass="bg-gradient-brand" />
                        <div className="flex-1 min-w-0">
                          <div className="text-text-1 text-sm font-medium truncate">{p.firstName} {p.lastName}</div>
                          <div className="text-text-muted text-[11px] flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-0.5">
                            <code className="font-mono">{p.patientCode}</code>
                            {p.phone && <span className="font-mono">· {p.phone}</span>}
                            {p.casesCount > 0 && <span>· {p.casesCount} caso{p.casesCount > 1 ? 's' : ''}</span>}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {query.length < 2 && (
              <div className="text-text-muted text-[11px] text-center py-4">
                {t('minChars')}
              </div>
            )}
          </>
        ) : (
          // Selected patient → verify + continue
          <InfoCard title={t('patientVerifyTitle')} icon={User} tone="brand">
            <div className="flex items-center gap-3">
              <PersonAvatar firstName={selectedPatient.firstName} lastName={selectedPatient.lastName} size={12} gradientClass="bg-gradient-brand" />
              <div className="flex-1 min-w-0">
                <div className="text-text-1 font-semibold text-sm">{selectedPatient.firstName} {selectedPatient.lastName}</div>
                <div className="text-text-muted text-[11px] mt-0.5 flex items-center gap-x-2 flex-wrap">
                  <code className="font-mono">{selectedPatient.patientCode}</code>
                  {selectedPatient.phone && <span className="font-mono">· {selectedPatient.phone}</span>}
                  {selectedPatient.email && <span>· {selectedPatient.email}</span>}
                  {selectedPatient.casesCount > 0 && (
                    <span>· {selectedPatient.casesCount} caso{selectedPatient.casesCount > 1 ? 's' : ''} previo{selectedPatient.casesCount > 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPatient(null)}
                className="text-text-muted hover:text-rose text-xs shrink-0"
              >
                {t('changePatient')}
              </button>
            </div>

            {selectedPatient.lastCaseCode && (
              <div className="text-text-muted text-[11px]">
                {t('lastCase')} <code className="font-mono text-text-2">{selectedPatient.lastCaseCode}</code> · {t('lastCaseStatus')} <code className="text-text-2">{selectedPatient.lastCaseStatus}</code>
              </div>
            )}

            <div className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-[11px] text-brand">
              {t('patientVerifyHint')}
            </div>
          </InfoCard>
        )}

        <FooterActions onCancel={onCancel} onConfirm={handleStartCall} canConfirm={canStart} mode={mode} t={t} />
      </div>
    );
  }

  // ─── Outgoing mode con dial pad ───────────────────────────────────────
  const digits = quickPhone.replace(/\D/g, '').slice(0, 10);
  const formatted = digits.length === 0 ? ''
    : digits.length <= 3 ? `(${digits}`
    : digits.length <= 6 ? `(${digits.slice(0,3)}) ${digits.slice(3)}`
    : `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;

  function pressKey(k: string) {
    setQuickPhone(p => {
      const d = p.replace(/\D/g, '');
      return d.length < 10 ? d + k : d;
    });
    phoneInputRef.current?.focus();
  }
  function backspace() {
    setQuickPhone(p => p.replace(/\D/g, '').slice(0, -1));
    phoneInputRef.current?.focus();
  }

  const KEYS: Array<{ d: string; l?: string }> = [
    { d: '1' }, { d: '2', l: 'ABC' }, { d: '3', l: 'DEF' },
    { d: '4', l: 'GHI' }, { d: '5', l: 'JKL' }, { d: '6', l: 'MNO' },
    { d: '7', l: 'PQRS' }, { d: '8', l: 'TUV' }, { d: '9', l: 'WXYZ' },
    { d: '*' }, { d: '0', l: '+' },
  ];

  return (
    <div className="px-4 sm:px-6 pt-3 pb-5 space-y-3">
      <BackButton onClick={() => setMode(null)} label={t('backOutgoing')} />

      {/* Name fields */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted mb-1">
            {t('manualFirstName')}
          </div>
          <input
            type="text"
            value={quickFirstName}
            onChange={(e) => setQuickFirstName(e.target.value)}
            placeholder="María"
            className="w-full rounded-md border border-border bg-bg-2 px-3 py-1.5 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-cyan focus:ring-1 focus:ring-cyan/20 transition-colors"
          />
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted mb-1">
            {t('manualLastName')}
          </div>
          <input
            type="text"
            value={quickLastName}
            onChange={(e) => setQuickLastName(e.target.value)}
            placeholder="García"
            className="w-full rounded-md border border-border bg-bg-2 px-3 py-1.5 text-sm text-text-1 placeholder:text-text-muted outline-none focus:border-cyan focus:ring-1 focus:ring-cyan/20 transition-colors"
          />
        </div>
      </div>

      {/* Phone screen — clickable para teclado físico */}
      <div
        className="rounded-lg border border-border bg-bg-0 px-4 py-2.5 relative overflow-hidden cursor-text"
        onClick={() => phoneInputRef.current?.focus()}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cyan/5 to-transparent pointer-events-none" />
        <div className="text-[8px] font-bold uppercase tracking-widest text-cyan mb-1 flex items-center gap-1.5">
          <PhoneOutgoing className="w-2.5 h-2.5" />
          {t('manualPhone')}
        </div>
        <div className="font-mono text-2xl font-bold tracking-wider text-text-1 min-h-[2rem] flex items-center">
          {formatted || <span className="text-text-muted text-lg font-normal">(___) ___-____</span>}
          {/* cursor parpadeante */}
          <span className="inline-block w-0.5 h-6 bg-cyan rounded-full ml-1 animate-[blink_1s_step-end_infinite] opacity-70" />
        </div>
        {/* input real oculto — captura teclado físico */}
        <input
          ref={phoneInputRef}
          type="tel"
          inputMode="numeric"
          autoFocus
          value={digits}
          onChange={(e) => setQuickPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          onKeyDown={(e) => { if (e.key === 'Enter' && canStart) handleStartCall(); }}
          className="absolute opacity-0 w-0 h-0 pointer-events-none"
          aria-label="Número de teléfono"
        />
      </div>

      {/* Dial pad */}
      <div className="grid grid-cols-3 gap-2 px-4">
        {KEYS.map(({ d, l }) => (
          <button
            key={d}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); pressKey(d); }}
            className="flex flex-col items-center justify-center h-12 rounded-full bg-bg-2 border border-border hover:bg-bg-1 hover:border-border-strong active:scale-95 transition-all select-none"
          >
            <span className="text-lg font-semibold text-text-1 leading-none">{d}</span>
            {l && <span className="text-[7px] font-semibold tracking-widest text-text-muted mt-0.5">{l}</span>}
          </button>
        ))}
        {/* Backspace key */}
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); backspace(); }}
          className="flex items-center justify-center h-12 rounded-full bg-transparent hover:bg-bg-2 active:scale-95 transition-all select-none text-text-muted hover:text-text-2"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"/>
            <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
          </svg>
        </button>
      </div>

      {/* Call button */}
      <div className="flex items-center justify-between px-4 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-text-muted hover:text-text-2 text-[11px] transition-colors"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={handleStartCall}
          disabled={!canStart}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all
            ${canStart
              ? 'bg-gradient-to-br from-emerald-600 to-emerald shadow-[0_4px_20px_rgba(16,185,129,0.6)] animate-pulse hover:animate-none hover:scale-105 active:scale-95 cursor-pointer'
              : 'bg-bg-2 border border-border/60 opacity-40 cursor-not-allowed'
            }`}
        >
          <Phone className="w-5 h-5 text-white" />
        </button>
        <span className="w-12" />
      </div>
    </div>
  );
}

// ═══ Atoms ═══════════════════════════════════════════════════════════════

function ModeCard({
  icon: Icon, title, subtitle, tone, onClick, disabled, disabledBadge,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  tone: 'brand' | 'emerald' | 'cyan' | 'amber';
  onClick: () => void;
  disabled?: boolean;
  disabledBadge?: string;
}) {
  const toneClasses: Record<typeof tone, { border: string; bg: string; icon: string }> = {
    brand:   { border: 'border-border hover:border-brand/40',   bg: 'bg-bg-1',  icon: 'text-brand' },
    emerald: { border: 'border-border hover:border-emerald/40', bg: 'bg-bg-1',  icon: 'text-emerald' },
    cyan:    { border: 'border-border hover:border-cyan/40',    bg: 'bg-bg-1',  icon: 'text-cyan' },
    amber:   { border: 'border-border hover:border-amber/40',   bg: 'bg-bg-1',  icon: 'text-amber' },
  };
  if (disabled) {
    return (
      <div className="w-full rounded-lg border border-border/40 bg-bg-1/40 px-4 py-3 flex items-center gap-3 opacity-50 cursor-not-allowed">
        <div className="w-10 h-10 rounded-md bg-bg-2/60 border border-border/40 flex items-center justify-center text-text-muted shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-text-2 font-semibold text-sm">{title}</div>
          <div className="text-text-muted text-[11px] mt-0.5">{subtitle}</div>
        </div>
        {disabledBadge && (
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted border border-border/60 rounded px-1.5 py-0.5 shrink-0">
            <Lock className="w-2.5 h-2.5" /> {disabledBadge}
          </span>
        )}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border ${toneClasses[tone].border} ${toneClasses[tone].bg} px-4 py-3 transition-colors flex items-center gap-3 group`}
    >
      <div className={`w-10 h-10 rounded-md bg-bg-2 border border-border flex items-center justify-center ${toneClasses[tone].icon} shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-text-1 font-semibold text-sm">{title}</div>
        <div className="text-text-muted text-[11px] mt-0.5">{subtitle}</div>
      </div>
      <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-1 transition-colors shrink-0" />
    </button>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  const t = useTranslations('phoenix.frontOffice.precall');
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 text-text-2 hover:text-text-1 text-xs transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> {t('backBtn')}
      </button>
      <h3 className="text-text-1 font-semibold text-sm truncate">{label}</h3>
      <span className="w-12" /> {/* spacer */}
    </div>
  );
}

function FooterActions({
  onCancel, onConfirm, canConfirm, mode, t,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
  mode: PreCallMode;
  t: ReturnType<typeof useTranslations>;
}) {
  const label = mode === 'outgoing'
    ? t('startOutgoingBtn')
    : mode === 'manual'
      ? t('startManualBtn')
      : t('startSearchBtn');
  return (
    <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-border">
      <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">{t('cancel')}</Button>
      <Button onClick={onConfirm} disabled={!canConfirm} className="w-full sm:w-auto">
        {label}
        <ArrowRight className="w-3.5 h-3.5 ml-1" />
      </Button>
    </div>
  );
}
