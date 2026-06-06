'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Search,
  Stethoscope,
  Scale,
  ShieldCheck,
  DollarSign,
  FileText,
  X,
  ArrowRight,
} from 'lucide-react';

// B.34 — Patient Global Search ⌘K
// Command palette transversal. Busca catalogos + (Phase 2) PHI con RLS.

interface SearchResults {
  specialties: Array<{ id: string; name: string; color: string; isActive: boolean }>;
  lawyers: Array<{ id: string; kind: string; firmName: string | null; memberName: string | null; email: string; memberRole: string | null; parentFirmId: string | null }>;
  insurances: Array<{ id: string; name: string; shortCode: string; color: string; type: string }>;
  services: Array<{ id: string; code: string; shortDescription: string; type: string; currentFee: number; category: string }>;
  diagnoses: Array<{ id: string; icd10Code: string; icd10Description: string; snomedCode: string | null; piRelevant: boolean }>;
}

const EMPTY_RESULTS: SearchResults = {
  specialties: [], lawyers: [], insurances: [], services: [], diagnoses: [],
};

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): React.ReactElement | null {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults(EMPTY_RESULTS);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? EMPTY_RESULTS);
        }
      } catch {
        setResults(EMPTY_RESULTS);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  // Reset query when closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(EMPTY_RESULTS);
    }
  }, [open]);

  const go = useCallback((href: string) => {
    onOpenChange(false);
    router.push(href);
  }, [router, onOpenChange]);

  const totalResults =
    results.specialties.length +
    results.lawyers.length +
    results.insurances.length +
    results.services.length +
    results.diagnoses.length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Palette */}
      <Command
        className="relative w-full max-w-2xl bg-bg-1 border border-border-strong rounded-xl shadow-2xl overflow-hidden"
        shouldFilter={false}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar bufetes, aseguradoras, servicios, diagnósticos, especialidades..."
            className="flex-1 bg-transparent text-sm text-text-1 placeholder:text-text-muted focus:outline-none"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          )}
          <kbd className="text-[10px] font-mono bg-bg-3 border border-border px-1.5 py-0.5 rounded text-text-muted">ESC</kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          {query.length === 0 && (
            <div className="px-3 py-12 text-center">
              <div className="text-text-2 text-sm mb-2">Escribe al menos 2 caracteres</div>
              <div className="text-text-muted text-xs">
                Busca transversal en todos los catálogos del back-office
              </div>
              <div className="mt-6 flex flex-wrap gap-2 justify-center text-xs text-text-muted">
                <kbd className="bg-bg-2 border border-border px-2 py-0.5 rounded">Stethoscope</kbd>
                <kbd className="bg-bg-2 border border-border px-2 py-0.5 rounded">Bufetes</kbd>
                <kbd className="bg-bg-2 border border-border px-2 py-0.5 rounded">GEICO</kbd>
                <kbd className="bg-bg-2 border border-border px-2 py-0.5 rounded">99213</kbd>
                <kbd className="bg-bg-2 border border-border px-2 py-0.5 rounded">cervicalgia</kbd>
              </div>
            </div>
          )}

          {query.length >= 2 && totalResults === 0 && !loading && (
            <Command.Empty className="px-3 py-12 text-center text-text-muted text-sm">
              No se encontró nada para "<span className="text-text-1 font-mono">{query}</span>"
            </Command.Empty>
          )}

          {/* Specialties */}
          {results.specialties.length > 0 && (
            <Command.Group heading={<GroupHeading icon={Stethoscope} label="Especialidades" count={results.specialties.length} />}>
              {results.specialties.map((sp) => (
                <ResultItem
                  key={sp.id}
                  value={`specialty-${sp.id}`}
                  onSelect={() => go('/admin/specialties')}
                  icon={
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sp.color, boxShadow: `0 0 8px ${sp.color}80` }} />
                  }
                  title={sp.name}
                  subtitle="Especialidad"
                />
              ))}
            </Command.Group>
          )}

          {/* Lawyers */}
          {results.lawyers.length > 0 && (
            <Command.Group heading={<GroupHeading icon={Scale} label="Bufetes" count={results.lawyers.length} />}>
              {results.lawyers.map((l) => (
                <ResultItem
                  key={l.id}
                  value={`lawyer-${l.id}`}
                  onSelect={() => go(l.kind === 'FIRM' ? `/admin/lawyers/${l.id}` : `/admin/lawyers/${l.parentFirmId ?? ''}`)}
                  icon={
                    <div className="w-7 h-7 rounded bg-gradient-cyan flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                      {l.kind === 'FIRM' ? firmInitials(l.firmName ?? '') : (l.memberName?.[0] ?? '?')}
                    </div>
                  }
                  title={l.kind === 'FIRM' ? (l.firmName ?? '—') : (l.memberName ?? l.email)}
                  subtitle={l.kind === 'FIRM' ? 'Bufete' : `${l.memberRole ?? 'Member'} · ${l.email}`}
                />
              ))}
            </Command.Group>
          )}

          {/* Insurances */}
          {results.insurances.length > 0 && (
            <Command.Group heading={<GroupHeading icon={ShieldCheck} label="Aseguradoras" count={results.insurances.length} />}>
              {results.insurances.map((ins) => (
                <ResultItem
                  key={ins.id}
                  value={`insurance-${ins.id}`}
                  onSelect={() => go('/admin/insurances')}
                  icon={
                    <div className="w-7 h-7 rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: ins.color }}>
                      {ins.shortCode}
                    </div>
                  }
                  title={ins.name}
                  subtitle={`${ins.type} · Aseguradora`}
                />
              ))}
            </Command.Group>
          )}

          {/* Services */}
          {results.services.length > 0 && (
            <Command.Group heading={<GroupHeading icon={DollarSign} label="Servicios CPT" count={results.services.length} />}>
              {results.services.map((s) => (
                <ResultItem
                  key={s.id}
                  value={`service-${s.id}`}
                  onSelect={() => go('/admin/services')}
                  icon={<code className="text-brand font-mono text-xs font-bold w-16 truncate">{s.code}</code>}
                  title={s.shortDescription}
                  subtitle={`${s.type} · ${s.category} · $${s.currentFee.toFixed(2)}`}
                />
              ))}
            </Command.Group>
          )}

          {/* Diagnoses */}
          {results.diagnoses.length > 0 && (
            <Command.Group heading={<GroupHeading icon={FileText} label="Diagnósticos" count={results.diagnoses.length} />}>
              {results.diagnoses.map((d) => (
                <ResultItem
                  key={d.id}
                  value={`diagnosis-${d.id}`}
                  onSelect={() => go('/admin/diagnoses')}
                  icon={<code className="text-brand font-mono text-xs font-bold w-16 truncate">{d.icd10Code}</code>}
                  title={d.icd10Description}
                  subtitle={d.snomedCode ? `ICD-10 + SNOMED ${d.snomedCode}${d.piRelevant ? ' · 🩸 PI' : ''}` : `Solo ICD-10${d.piRelevant ? ' · 🩸 PI' : ''}`}
                />
              ))}
            </Command.Group>
          )}
        </Command.List>

        <div className="border-t border-border px-4 py-2 text-[10px] text-text-muted flex items-center justify-between">
          <span>
            <kbd className="bg-bg-2 border border-border px-1 py-0.5 rounded font-mono">↑↓</kbd> navegar
            <kbd className="bg-bg-2 border border-border px-1 py-0.5 rounded font-mono ml-2">↵</kbd> abrir
          </span>
          <span>Phoenix Global Search · B.34</span>
        </div>
      </Command>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function GroupHeading({ icon: Icon, label, count }: { icon: React.ElementType; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-text-muted text-[10px] uppercase tracking-wider font-semibold">
      <Icon className="w-3 h-3" />
      <span>{label}</span>
      <span className="opacity-60 font-mono">({count})</span>
    </div>
  );
}

function ResultItem({
  value,
  onSelect,
  icon,
  title,
  subtitle,
}: {
  value: string;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer aria-selected:bg-brand/15 hover:bg-white/5 group transition-colors"
    >
      <div className="flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-text-1 text-sm truncate">{title}</div>
        <div className="text-text-muted text-[11px] truncate">{subtitle}</div>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-aria-selected:opacity-100 transition-opacity" />
    </Command.Item>
  );
}

function firmInitials(name: string): string {
  return name.split(/[\s&]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
