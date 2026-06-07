'use client';

import { useState, useEffect } from 'react';
import {
  Search as SearchIcon, PhoneIncoming, PhoneOutgoing, Phone, ArrowRight, ArrowLeft,
  User, Calendar,
} from 'lucide-react';
import { Button, Input, Label } from '@precision/ui';
import { TagPill, PersonAvatar, InfoCard, FormField } from '@/components/ui-phoenix';

// B.2 PreCall step · "¿cómo empezamos la llamada?"
//
// Antes de mostrar el modal grande de captura, preguntamos cómo se inicia:
//   - Search: paciente existente (lo buscamos · click llamar a su tel guardado)
//   - Incoming: paciente llamó (capturamos nombre + tel · iniciamos)
//   - Outgoing: yo voy a marcar (capturo número + nombre · click marca · iniciamos)
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

export type PreCallMode = 'search' | 'incoming' | 'outgoing';

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
}: {
  onConfirm: (result: PreCallResult) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<PreCallMode | null>(null);

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
    if ((mode === 'incoming' || mode === 'outgoing') && quickFirstName.trim() && quickPhone.trim()) {
      return onConfirm({
        mode,
        firstName: quickFirstName.trim(),
        lastName: quickLastName.trim(),
        phone: quickPhone.trim(),
      });
    }
  };

  const canStart: boolean =
    (mode === 'search' && !!selectedPatient && !!selectedPatient.phone) ||
    ((mode === 'incoming' || mode === 'outgoing') && !!quickFirstName.trim() && !!quickPhone.trim());

  // ─── Mode selection (primera vista) ────────────────────────────────────
  if (!mode) {
    return (
      <div className="px-4 sm:px-6 py-5 space-y-4">
        <div>
          <h3 className="text-text-1 font-semibold text-base">¿Cómo empezamos la llamada?</h3>
          <p className="text-text-muted text-xs mt-1">
            Elegí el escenario antes de iniciar · el timer de llamada arranca después.
          </p>
        </div>

        <div className="space-y-2">
          <ModeCard
            icon={SearchIcon}
            title="Buscar paciente existente"
            subtitle="Ya está en el sistema (referido previo, llamada anterior)"
            tone="brand"
            onClick={() => setMode('search')}
          />
          <ModeCard
            icon={PhoneIncoming}
            title="Llamada entrante"
            subtitle="El paciente nos llamó · empezamos captura"
            tone="emerald"
            onClick={() => setMode('incoming')}
          />
          <ModeCard
            icon={PhoneOutgoing}
            title="Yo voy a llamar"
            subtitle="Outbound · marcar número del paciente referido por su bufete"
            tone="cyan"
            onClick={() => setMode('outgoing')}
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    );
  }

  // ─── Search mode ──────────────────────────────────────────────────────
  if (mode === 'search') {
    return (
      <div className="px-4 sm:px-6 py-5 space-y-4">
        <BackButton onClick={() => setMode(null)} label="Buscar paciente existente" />

        {!selectedPatient ? (
          <>
            <div className="relative">
              <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre, teléfono, email o código PT-..."
                className="pl-9"
                autoFocus
              />
            </div>

            {query.length >= 2 && (
              <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
                {searching && results.length === 0 ? (
                  <div className="px-3 py-4 text-text-muted text-xs text-center">Buscando...</div>
                ) : results.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <User className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
                    <div className="text-text-2 text-sm">No hay pacientes con "{query}"</div>
                    <div className="text-text-muted text-[11px] mt-1">¿Es un paciente nuevo? Volvé y elegí "Llamada entrante" o "Yo voy a llamar".</div>
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
                Escribí al menos 2 caracteres para buscar
              </div>
            )}
          </>
        ) : (
          // Selected patient → show + actions
          <InfoCard title="Paciente encontrado" icon={User} tone="brand">
            <div className="flex items-center gap-3">
              <PersonAvatar firstName={selectedPatient.firstName} lastName={selectedPatient.lastName} size={12} gradientClass="bg-gradient-brand" />
              <div className="flex-1 min-w-0">
                <div className="text-text-1 font-semibold text-sm">{selectedPatient.firstName} {selectedPatient.lastName}</div>
                <div className="text-text-muted text-[11px] mt-0.5 flex items-center gap-x-2 flex-wrap">
                  <code className="font-mono">{selectedPatient.patientCode}</code>
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
                Cambiar
              </button>
            </div>

            {selectedPatient.phone ? (
              <a
                href={`tel:${selectedPatient.phone}`}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-emerald/30 bg-emerald/10 text-emerald hover:bg-emerald/15 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span className="font-mono text-sm">{selectedPatient.phone}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-semibold">Tap para marcar</span>
              </a>
            ) : (
              <div className="text-rose text-xs italic">⚠ Este paciente no tiene teléfono guardado. Actualizalo desde su ficha primero.</div>
            )}

            {selectedPatient.lastCaseCode && (
              <div className="text-text-muted text-[11px]">
                Último caso: <code className="font-mono text-text-2">{selectedPatient.lastCaseCode}</code> · status <code className="text-text-2">{selectedPatient.lastCaseStatus}</code>
              </div>
            )}
          </InfoCard>
        )}

        <FooterActions onCancel={onCancel} onConfirm={handleStartCall} canConfirm={canStart} mode={mode} />
      </div>
    );
  }

  // ─── Incoming / Outgoing mode (form mínimo) ───────────────────────────
  const isOutgoing = mode === 'outgoing';
  return (
    <div className="px-4 sm:px-6 py-5 space-y-4">
      <BackButton
        onClick={() => setMode(null)}
        label={isOutgoing ? 'Yo voy a llamar (outbound)' : 'Llamada entrante'}
      />

      <InfoCard
        title={isOutgoing ? 'Número a marcar' : 'Datos del paciente que llama'}
        icon={isOutgoing ? PhoneOutgoing : PhoneIncoming}
        tone={isOutgoing ? 'cyan' : 'emerald'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField.Input label="Nombre" required value={quickFirstName} onChange={setQuickFirstName} placeholder="Sandra" autoFocus />
          <FormField.Input label="Apellido" value={quickLastName} onChange={setQuickLastName} placeholder="López" />
        </div>
        <FormField.Input
          label="Teléfono"
          required
          value={quickPhone}
          onChange={setQuickPhone}
          placeholder="(801) 555-0142"
          type="tel"
          hint={isOutgoing ? 'Vas a marcar este número al confirmar' : 'Número desde el que está llamando'}
        />

        {isOutgoing && quickPhone.trim() && (
          <a
            href={`tel:${quickPhone.trim()}`}
            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-emerald/30 bg-emerald/10 text-emerald hover:bg-emerald/15 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              <span className="font-mono text-sm">{quickPhone.trim()}</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider font-semibold">Tap para marcar</span>
          </a>
        )}
      </InfoCard>

      <div className="text-text-muted text-[11px] text-center">
        Al confirmar arranca el timer · vas a poder editar nombre, agregar email, fecha de nacimiento, etc.
      </div>

      <FooterActions onCancel={onCancel} onConfirm={handleStartCall} canConfirm={canStart} mode={mode} />
    </div>
  );
}

// ═══ Atoms ═══════════════════════════════════════════════════════════════

function ModeCard({
  icon: Icon, title, subtitle, tone, onClick,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  tone: 'brand' | 'emerald' | 'cyan';
  onClick: () => void;
}) {
  const toneClasses: Record<typeof tone, { border: string; bg: string; icon: string }> = {
    brand:   { border: 'border-border hover:border-brand/40',   bg: 'bg-bg-1',  icon: 'text-brand' },
    emerald: { border: 'border-border hover:border-emerald/40', bg: 'bg-bg-1',  icon: 'text-emerald' },
    cyan:    { border: 'border-border hover:border-cyan/40',    bg: 'bg-bg-1',  icon: 'text-cyan' },
  };
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
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 text-text-2 hover:text-text-1 text-xs transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Volver
      </button>
      <h3 className="text-text-1 font-semibold text-sm truncate">{label}</h3>
      <span className="w-12" /> {/* spacer */}
    </div>
  );
}

function FooterActions({
  onCancel, onConfirm, canConfirm, mode,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
  mode: PreCallMode;
}) {
  const label = mode === 'outgoing' ? 'Marqué · iniciar captura' : 'En llamada · iniciar captura';
  return (
    <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-border">
      <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">Cancelar</Button>
      <Button onClick={onConfirm} disabled={!canConfirm} className="w-full sm:w-auto">
        <Phone className="w-3.5 h-3.5 mr-1" /> {label}
        <ArrowRight className="w-3.5 h-3.5 ml-1" />
      </Button>
    </div>
  );
}
