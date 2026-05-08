'use client';

import { useState, useEffect, useRef } from 'react';

type Country = { code: string; name: string; dial: string; flag: string };

const COUNTRIES: Country[] = [
  // Sudamérica
  { code: 'AR', name: 'Argentina',       dial: '+54',  flag: '🇦🇷' },
  { code: 'BO', name: 'Bolivia',         dial: '+591', flag: '🇧🇴' },
  { code: 'BR', name: 'Brasil',          dial: '+55',  flag: '🇧🇷' },
  { code: 'CL', name: 'Chile',           dial: '+56',  flag: '🇨🇱' },
  { code: 'CO', name: 'Colombia',        dial: '+57',  flag: '🇨🇴' },
  { code: 'EC', name: 'Ecuador',         dial: '+593', flag: '🇪🇨' },
  { code: 'GY', name: 'Guyana',          dial: '+592', flag: '🇬🇾' },
  { code: 'PY', name: 'Paraguay',        dial: '+595', flag: '🇵🇾' },
  { code: 'PE', name: 'Perú',            dial: '+51',  flag: '🇵🇪' },
  { code: 'SR', name: 'Surinam',         dial: '+597', flag: '🇸🇷' },
  { code: 'UY', name: 'Uruguay',         dial: '+598', flag: '🇺🇾' },
  { code: 'VE', name: 'Venezuela',       dial: '+58',  flag: '🇻🇪' },
  // Centroamérica y Caribe
  { code: 'BZ', name: 'Belice',          dial: '+501', flag: '🇧🇿' },
  { code: 'CR', name: 'Costa Rica',      dial: '+506', flag: '🇨🇷' },
  { code: 'CU', name: 'Cuba',            dial: '+53',  flag: '🇨🇺' },
  { code: 'DO', name: 'Rep. Dominicana', dial: '+1',   flag: '🇩🇴' },
  { code: 'SV', name: 'El Salvador',     dial: '+503', flag: '🇸🇻' },
  { code: 'GT', name: 'Guatemala',       dial: '+502', flag: '🇬🇹' },
  { code: 'HT', name: 'Haití',           dial: '+509', flag: '🇭🇹' },
  { code: 'HN', name: 'Honduras',        dial: '+504', flag: '🇭🇳' },
  { code: 'JM', name: 'Jamaica',         dial: '+1',   flag: '🇯🇲' },
  { code: 'MX', name: 'México',          dial: '+52',  flag: '🇲🇽' },
  { code: 'NI', name: 'Nicaragua',       dial: '+505', flag: '🇳🇮' },
  { code: 'PA', name: 'Panamá',          dial: '+507', flag: '🇵🇦' },
  { code: 'PR', name: 'Puerto Rico',     dial: '+1',   flag: '🇵🇷' },
  // Europa
  { code: 'ES', name: 'España',          dial: '+34',  flag: '🇪🇸' },
  // Norteamérica
  { code: 'US', name: 'Estados Unidos',  dial: '+1',   flag: '🇺🇸' },
  { code: 'CA', name: 'Canadá',          dial: '+1',   flag: '🇨🇦' },
];

function parsePhone(full: string): { country: Country; local: string } | null {
  if (!full.startsWith('+')) return null;
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (full.startsWith(c.dial)) return { country: c, local: full.slice(c.dial.length) };
  }
  return null;
}

interface PhoneFieldProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}

export default function PhoneField({ value, onChange, disabled, required, id }: PhoneFieldProps) {
  const DEFAULT = COUNTRIES.find(c => c.code === 'AR')!;

  const [selected, setSelected] = useState<Country>(() =>
    value ? (parsePhone(value)?.country ?? DEFAULT) : DEFAULT
  );
  const [local, setLocal] = useState<string>(() =>
    value ? (parsePhone(value)?.local ?? '') : ''
  );
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef   = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-detect country by IP on mount (only when field is empty)
  useEffect(() => {
    if (value) return;
    fetch('https://api.country.is/')
      .then(r => r.json())
      .then((data: { country?: string }) => {
        const cc = data.country?.toUpperCase() ?? '';
        const found = COUNTRIES.find(c => c.code === cc);
        if (found) setSelected(found);
      })
      .catch(() => {
        const cc = navigator.language.split('-')[1]?.toUpperCase() ?? '';
        const found = COUNTRIES.find(c => c.code === cc);
        if (found) setSelected(found);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync internal state when parent updates the value prop (e.g. edit modal pre-fill)
  useEffect(() => {
    const parsed = value ? parsePhone(value) : null;
    if (parsed) {
      setSelected(parsed.country);
      setLocal(parsed.local);
    } else if (!value) {
      setLocal('');
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 40);
  }, [open]);

  function selectCountry(c: Country) {
    setSelected(c);
    const digits = local.replace(/\D/g, '');
    onChange(digits ? `${c.dial}${digits}` : '');
    setOpen(false); setSearch('');
  }

  function handleLocalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setLocal(v);
    const digits = v.replace(/\D/g, '');
    onChange(digits ? `${selected.dial}${digits}` : '');
  }

  const filtered = COUNTRIES.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.dial.includes(search) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', gap: '8px', position: 'relative' }} ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(v => !v); setSearch(''); }}
        style={{
          flexShrink: 0, height: 40, padding: '0 10px',
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'var(--bg)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border-strong)'}`,
          borderRadius: 'var(--radius-xs)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: 'var(--fg)', fontFamily: 'inherit',
          transition: 'border-color 0.18s',
          whiteSpace: 'nowrap',
          boxShadow: open ? '0 0 0 3px rgba(63,248,200,0.10)' : 'none',
        }}
      >
        <span style={{ fontSize: '17px', lineHeight: 1 }}>{selected.flag}</span>
        <span style={{ fontSize: '12px', color: 'var(--fg-muted)', letterSpacing: '0.03em' }}>{selected.dial}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8"
          style={{ color: 'var(--fg-subtle)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 9999,
          width: 264, background: '#0c0c0e',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,0.72)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px 6px' }}>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar país..."
              style={{
                width: '100%', height: 32, padding: '0 10px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 5,
                color: 'var(--fg)', fontFamily: 'inherit', fontSize: '12px',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ maxHeight: 204, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--fg-muted)' }}>Sin resultados</div>
            ) : filtered.map(c => {
              const isSel = c.code === selected.code;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => selectCountry(c)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '7px 12px', border: 'none', cursor: 'pointer',
                    background: isSel ? 'rgba(63,248,200,0.07)' : 'transparent',
                    color: 'var(--fg)', fontFamily: 'inherit', textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSel ? 'rgba(63,248,200,0.07)' : 'transparent'; }}
                >
                  <span style={{ fontSize: '15px', lineHeight: 1 }}>{c.flag}</span>
                  <span style={{ flex: 1, fontSize: '12px' }}>{c.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--fg-muted)', fontFamily: 'monospace' }}>{c.dial}</span>
                  {isSel && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3FF8C8" strokeWidth="3" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <input
        id={id}
        type="tel"
        value={local}
        onChange={handleLocalChange}
        disabled={disabled}
        required={required}
        placeholder="Número"
        className="input"
        style={{ flex: 1 }}
      />
    </div>
  );
}
