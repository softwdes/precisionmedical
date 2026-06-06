'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PhoneCall, User, Car, Scale, ShieldCheck, Check, AlertCircle, Search as SearchIcon } from 'lucide-react';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Label,
} from '@precision/ui';

// B.2 — Crear caso · Modal de 90 segundos

interface NewCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  specialties: Array<{ id: string; name: string; color: string }>;
}

interface AutoResult {
  id: string;
  label: string;
  subtitle?: string;
  shortCode?: string;
  color?: string;
}

export function NewCaseDialog({ open, onOpenChange, specialties }: NewCaseDialogProps) {
  const router = useRouter();

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [email, setEmail]         = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [language, setLanguage]   = useState<'es' | 'en'>('es');

  const [accidentDate, setAccidentDate] = useState('');
  const [accidentType, setAccidentType] = useState('AUTO');
  const [accidentLocation, setAccidentLocation] = useState('');
  const [accidentNotes, setAccidentNotes] = useState('');

  const [lawFirm, setLawFirm]     = useState<AutoResult | null>(null);
  const [attorney, setAttorney]   = useState<AutoResult | null>(null);
  const [insurance, setInsurance] = useState<AutoResult | null>(null);
  const [policyNumber, setPolicyNumber] = useState('');

  const [specialtyId, setSpecialtyId] = useState(specialties[0]?.id ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<{ caseCode: string; caseId: string } | null>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setFirstName(''); setLastName(''); setPhone(''); setEmail(''); setDateOfBirth(''); setLanguage('es');
    setAccidentDate(''); setAccidentType('AUTO'); setAccidentLocation(''); setAccidentNotes('');
    setLawFirm(null); setAttorney(null); setInsurance(null); setPolicyNumber('');
    setSpecialtyId(specialties[0]?.id ?? '');
    setSaving(false); setError(null); setSuccess(null);
  }, [open, specialties]);

  const handleSubmit = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) return setError('Nombre y apellido son obligatorios');
    if (!phone.trim()) return setError('Teléfono es obligatorio (para callback)');

    setSaving(true);
    try {
      const res = await fetch('/api/admin/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth + 'T12:00:00Z').toISOString() : null,
            preferredLanguage: language,
          },
          accident: {
            date: accidentDate ? new Date(accidentDate + 'T12:00:00Z').toISOString() : null,
            type: accidentType,
            location: accidentLocation.trim() || null,
            notes: accidentNotes.trim() || null,
          },
          legal: {
            lawFirmId: lawFirm?.id ?? null,
            attorneyId: attorney?.id ?? null,
          },
          insurance: {
            primaryInsuranceId: insurance?.id ?? null,
            primaryPolicyNumber: policyNumber.trim() || null,
          },
          specialtyId: specialtyId || null,
          caseType: 'MVA',
          source: 'PHONE_CALL',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSuccess({ caseCode: data.case.caseCode, caseId: data.case.id });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear caso');
    } finally {
      setSaving(false);
    }
  };

  // Success state
  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald/20 border-2 border-emerald flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald" />
            </div>
            <h2 className="text-xl font-bold text-text-1 mb-2">Caso creado</h2>
            <p className="text-text-2 text-sm mb-4">
              <code className="text-emerald font-mono font-bold">{success.caseCode}</code>
            </p>
            <div className="text-xs text-text-muted mb-6">
              <strong className="text-text-2">{firstName} {lastName}</strong> · estado <code className="text-rose">NEW_REFERRAL</code><br />
              Próximo paso: enviar portal del paciente por SMS (B.3)
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
              <Button onClick={() => {
                onOpenChange(false);
                router.push(`/front-office`);
              }}>
                Ir a la cola
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-emerald" />
            Nuevo caso · Captura por llamada
          </DialogTitle>
          <DialogDescription>
            Captura mínima viable durante la llamada (90 segundos). Después envías portal por SMS para que paciente complete el resto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4 max-h-[65vh] overflow-y-auto pr-2 scroll-thin">
          {/* SECCIÓN 1: PATIENT */}
          <Section icon={User} title="Datos del paciente" required>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="firstName">Nombre <span className="text-rose">*</span></Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" autoFocus />
              </div>
              <div>
                <Label htmlFor="lastName">Apellido <span className="text-rose">*</span></Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Fernández" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <Label htmlFor="phone">Teléfono callback <span className="text-rose">*</span></Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1-801-555-0000" />
              </div>
              <div>
                <Label htmlFor="email">Email (opcional)</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <Label htmlFor="dob">Fecha de nacimiento</Label>
                <Input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="lang">Idioma preferido</Label>
                <select
                  id="lang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'es' | 'en')}
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
                >
                  <option value="es">🇪🇸 Español</option>
                  <option value="en">🇺🇸 English</option>
                </select>
              </div>
            </div>
          </Section>

          {/* SECCIÓN 2: ACCIDENT */}
          <Section icon={Car} title="Datos del accidente">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="accDate">Fecha (DOL)</Label>
                <Input id="accDate" type="date" value={accidentDate} onChange={(e) => setAccidentDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="accType">Tipo</Label>
                <select
                  id="accType"
                  value={accidentType}
                  onChange={(e) => setAccidentType(e.target.value)}
                  className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
                >
                  <option value="AUTO">🚗 Auto</option>
                  <option value="MOTORCYCLE">🏍️ Motorcycle</option>
                  <option value="PEDESTRIAN">🚶 Pedestrian</option>
                  <option value="WORKPLACE">🏭 Workplace</option>
                  <option value="OTHER">📌 Other</option>
                </select>
              </div>
            </div>
            <div className="mt-3">
              <Label htmlFor="accLoc">Ubicación</Label>
              <Input id="accLoc" value={accidentLocation} onChange={(e) => setAccidentLocation(e.target.value)} placeholder="I-15 Exit 285, Provo" />
            </div>
            <div className="mt-3">
              <Label htmlFor="accNotes">Notas breves</Label>
              <textarea
                id="accNotes"
                value={accidentNotes}
                onChange={(e) => setAccidentNotes(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[50px]"
                placeholder="Rear-end · 3 vehículos · paciente reportó dolor cervical"
              />
            </div>
          </Section>

          {/* SECCIÓN 3: LEGAL */}
          <Section icon={Scale} title="Bufete + Attorney">
            <Autocomplete
              endpoint="/api/admin/lawyers/autocomplete"
              placeholder="Buscar bufete (Smith & Johnson, Brown...)"
              selected={lawFirm}
              onSelect={(r) => { setLawFirm(r); setAttorney(null); }}
            />
            {lawFirm && (
              <div className="mt-3">
                <Label>Attorney específico (opcional)</Label>
                <Autocomplete
                  endpoint="/api/admin/lawyers/autocomplete"
                  extraParams={{ firmId: lawFirm.id }}
                  placeholder="Buscar attorney del bufete..."
                  selected={attorney}
                  onSelect={setAttorney}
                />
              </div>
            )}
          </Section>

          {/* SECCIÓN 4: INSURANCE */}
          <Section icon={ShieldCheck} title="Aseguradora PIP">
            <Autocomplete
              endpoint="/api/admin/insurances/autocomplete"
              placeholder="Buscar aseguradora (GEICO, State Farm...)"
              selected={insurance}
              onSelect={setInsurance}
              renderAvatar={(r) => r.color && r.shortCode ? (
                <div className="w-7 h-7 rounded flex items-center justify-center text-white text-[9px] font-bold" style={{ background: r.color }}>
                  {r.shortCode}
                </div>
              ) : null}
            />
            {insurance && (
              <div className="mt-3">
                <Label htmlFor="policy">Número de póliza</Label>
                <Input id="policy" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="GEI-7842-PIP" />
              </div>
            )}
          </Section>

          {/* SPECIALTY (auto-defaults) */}
          {specialties.length > 0 && (
            <div>
              <Label htmlFor="specialty">Especialidad</Label>
              <select
                id="specialty"
                value={specialtyId}
                onChange={(e) => setSpecialtyId(e.target.value)}
                className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
              >
                {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <div className="flex items-center text-xs text-text-muted mr-auto">
            <Check className="w-3.5 h-3.5 mr-1 text-emerald" />
            <span>Caso → status <code className="text-rose">NEW_REFERRAL</code> · próximo: enviar portal SMS (B.3)</span>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creando...' : '✓ Crear caso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Section wrapper ────────────────────────────────────────────────────────

function Section({ icon: Icon, title, required, children }: { icon: React.ElementType; title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-2/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-brand" />
        <span className="text-text-1 font-semibold text-sm">{title}</span>
        {required && <span className="text-rose text-xs">*</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Autocomplete component ─────────────────────────────────────────────────

function Autocomplete({
  endpoint,
  extraParams,
  placeholder,
  selected,
  onSelect,
  renderAvatar,
}: {
  endpoint: string;
  extraParams?: Record<string, string>;
  placeholder: string;
  selected: AutoResult | null;
  onSelect: (result: AutoResult | null) => void;
  renderAvatar?: (r: AutoResult) => React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AutoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected) {
      setQuery('');
      setOpen(false);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, ...(extraParams ?? {}) });
        const res = await fetch(`${endpoint}?${params}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, endpoint, extraParams, selected]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-brand/10 border border-brand/30">
        {renderAvatar?.(selected)}
        <div className="flex-1">
          <div className="text-text-1 text-sm font-medium">{selected.label}</div>
          {selected.subtitle && <div className="text-text-muted text-xs">{selected.subtitle}</div>}
        </div>
        <button type="button" onClick={() => onSelect(null)} className="text-text-muted hover:text-rose text-xs">
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      {open && (results.length > 0 || loading) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-bg-1 border border-border-strong rounded-md shadow-xl max-h-60 overflow-y-auto">
          {loading && results.length === 0 ? (
            <div className="px-3 py-2 text-text-muted text-xs">Buscando...</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { onSelect(r); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left text-sm transition-colors"
              >
                {renderAvatar?.(r)}
                <div className="flex-1 min-w-0">
                  <div className="text-text-1 truncate">{r.label}</div>
                  {r.subtitle && <div className="text-text-muted text-xs truncate">{r.subtitle}</div>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
