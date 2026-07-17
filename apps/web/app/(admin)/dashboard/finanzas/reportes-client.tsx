'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { api as trpc } from '@/lib/trpc/client';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@precision/ui';
import { FileText, Download, RefreshCw } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';

type ReportData = inferRouterOutputs<AppRouter>['pettyCash']['report'];
type Boxes      = inferRouterOutputs<AppRouter>['pettyCash']['listBoxes'];

// ── Paleta de categorías (consistente con petty-cash-client) ──────────────
const CAT_COLORS: Record<string, string> = {
  UTILITIES:       '#F59E0B',
  CALACOTO:        '#8B5CF6',
  RECORDINGS:      '#06B6D4',
  VIATICOS:        '#10B981',
  FOOD:            '#F43F5E',
  MAINTENANCE:     '#3B82F6',
  OFFICE:          '#EC4899',
  TRANSPORT:       '#14B8A6',
  MEDICAL_SUPPLIES:'#A855F7',
  OTHER:           '#475569',
};
const CLINIC_COLORS = ['#6366F1','#8B5CF6','#06B6D4','#10B981','#F59E0B','#F43F5E','#3B82F6'];

const CAT_LABELS: Record<string, string> = {
  FOOD:             'Alimentación',
  CALACOTO:         'Calacoto',
  RECORDINGS:       'Grabaciones',
  MAINTENANCE:      'Limpieza',
  OFFICE:           'Papelería y oficina',
  UTILITIES:        'Servicios básicos',
  MEDICAL_SUPPLIES: 'Suministros médicos',
  TRANSPORT:        'Transporte',
  VIATICOS:         'Viáticos',
  OTHER:            'Otros',
};

function fmt(n: number) {
  return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function firstOfMonthStr() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function nDaysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function firstOfQuarterStr() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
}

// ── Canvas helpers ────────────────────────────────────────────────────────
function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement!.clientWidth;
    const h = canvas.height / dpr || canvas.parentElement!.clientWidth * 0.35;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

function isEEUUBox(name: string) {
  return ['provo','pleasant grove','spanish fork','west valley','south murray'].some(k => name.toLowerCase().includes(k));
}

// ── Main component ────────────────────────────────────────────────────────
export function ReportesClient({ initialBoxes }: { initialBoxes: Boxes }) {
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo,   setDateTo]   = useState(todayStr());
  const [country,  setCountry]  = useState<'all'|'EEUU'|'Bolivia'>('all');
  const [clinicName, setClinicName] = useState('');
  const [tipo,     setTipo]     = useState<'all'|'DEPOSIT'|'EXPENSE'>('all');
  const [category, setCategory] = useState('');
  const [activePreset, setActivePreset] = useState('mes');

  // Applied filters (only update on "Generar")
  const [applied, setApplied] = useState({
    dateFrom: firstOfMonthStr(), dateTo: todayStr(),
    country: 'all' as 'all'|'EEUU'|'Bolivia', clinicName: '', tipo: 'all' as 'all'|'DEPOSIT'|'EXPENSE', category: '',
  });

  const { data, isFetching, refetch } = trpc.pettyCash.report.useQuery({
    dateFrom: applied.dateFrom, dateTo: applied.dateTo,
    country: applied.country,
    clinicName: applied.clinicName || undefined,
    type: applied.tipo,
    category: applied.category || undefined,
  }, { staleTime: 30_000 });

  function applyFilters() {
    setApplied({ dateFrom, dateTo, country, clinicName, tipo, category });
  }

  function setPreset(p: string) {
    setActivePreset(p);
    if (p === 'mes')  { setDateFrom(firstOfMonthStr()); setDateTo(todayStr()); }
    if (p === '7d')   { setDateFrom(nDaysAgoStr(7));    setDateTo(todayStr()); }
    if (p === '30d')  { setDateFrom(nDaysAgoStr(30));   setDateTo(todayStr()); }
    if (p === 'tri')  { setDateFrom(firstOfQuarterStr());setDateTo(todayStr()); }
  }

  const clinicOptions = useMemo(() => {
    if (country === 'EEUU')    return initialBoxes.filter(b => isEEUUBox(b.name)).map(b => b.name);
    if (country === 'Bolivia') return initialBoxes.filter(b => !isEEUUBox(b.name)).map(b => b.name);
    return initialBoxes.map(b => b.name);
  }, [country, initialBoxes]);

  const totalBalance = useMemo(
    () => initialBoxes.reduce((s, b) => s + Number(b.balance), 0),
    [initialBoxes],
  );

  const report = data ?? { kpis: { totalDeposits: 0, totalExpenses: 0, txCount: 0, avgAmount: 0, medianAmount: 0 }, dailySeries: [], byCategory: [], byClinic: [] } as ReportData;

  // ── Line chart ──────────────────────────────────────────────────────────
  const lineRef = useCanvas((ctx, w, h) => {
    if (!report.dailySeries.length) return;
    const pad = { top: 12, right: 16, bottom: 30, left: 56 };
    const iW = w - pad.left - pad.right;
    const iH = h - pad.top - pad.bottom;
    const n  = report.dailySeries.length;

    // Build cumulative balances from daily deltas
    let cumBo = 0, cumEe = 0;
    const ptsBo = report.dailySeries.map(d => { cumBo += d.bolivia; return cumBo; });
    const ptsEe = report.dailySeries.map(d => { cumEe += d.eeuu;    return cumEe; });

    const allV = [...ptsBo, ...ptsEe];
    const minV = Math.min(...allV, 0);
    const maxV = Math.max(...allV, 1);
    const scaleY = (v: number) => pad.top + iH - ((v - minV) / (maxV - minV)) * iH;
    const scaleX = (i: number) => pad.left + (n > 1 ? (i / (n - 1)) * iW : iW / 2);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (iH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + iW, y); ctx.stroke();
      const val = maxV - (i / 4) * (maxV - minV);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '9px system-ui'; ctx.textAlign = 'right';
      ctx.fillText(`$${Math.round(val).toLocaleString()}`, pad.left - 6, y + 3);
    }

    // Draw series
    ([
      { pts: ptsBo, color: '#6366F1' },
      { pts: ptsEe, color: '#06B6D4' },
    ] as { pts: number[]; color: string }[]).forEach(({ pts, color }) => {
      if (pts.every(v => v === 0)) return;
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + iH);
      grad.addColorStop(0, color + '28'); grad.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.moveTo(scaleX(0), pad.top + iH);
      pts.forEach((v, i) => ctx.lineTo(scaleX(i), scaleY(v)));
      ctx.lineTo(scaleX(pts.length - 1), pad.top + iH);
      ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

      ctx.beginPath();
      pts.forEach((v, i) => i === 0 ? ctx.moveTo(scaleX(i), scaleY(v)) : ctx.lineTo(scaleX(i), scaleY(v)));
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

      const last = pts[pts.length - 1] ?? 0;
      ctx.beginPath(); ctx.arc(scaleX(pts.length - 1), scaleY(last), 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    });

    // X labels (sparse)
    const step = Math.max(1, Math.floor(n / 7));
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    report.dailySeries.forEach((d, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const label = d.date.slice(5).replace('-', '/');
      ctx.fillText(label, scaleX(i), h - 6);
    });
  }, [report.dailySeries]);

  // ── Donut chart ─────────────────────────────────────────────────────────
  const donutRef = useCanvas((ctx, w, h) => {
    const size = Math.min(w, h);
    const cx = w / 2, cy = h / 2;
    const r = size * 0.40, inner = size * 0.26;
    const slices = report.byCategory.slice(0, 6);
    if (!slices.length) return;
    let angle = -Math.PI / 2;
    slices.forEach(s => {
      const end = angle + s.pct * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, angle, end); ctx.closePath();
      ctx.fillStyle = CAT_COLORS[s.category] ?? '#475569'; ctx.fill();
      angle = end;
    });
    ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = '#13161D'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `bold ${Math.round(size * 0.10)}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(`$${Math.round(report.kpis.totalExpenses / 1000)}k`, cx, cy - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = `${Math.round(size * 0.065)}px system-ui`;
    ctx.fillText('gastos', cx, cy + Math.round(size * 0.10));
  }, [report.byCategory, report.kpis.totalExpenses]);

  // ── Bar chart ────────────────────────────────────────────────────────────
  const barRef = useCanvas((ctx, w, h) => {
    const data = report.byClinic.slice(0, 8);
    if (!data.length) return;
    const maxV = Math.max(...data.map(d => d.amount), 1);
    const pad  = { top: 14, right: 8, bottom: 26, left: 8 };
    const iW = w - pad.left - pad.right;
    const iH = h - pad.top - pad.bottom;
    const gap = iW / data.length;
    const barW = gap * 0.55;
    data.forEach((d, i) => {
      const bH = Math.max((d.amount / maxV) * iH, d.amount > 0 ? 3 : 0);
      const x  = pad.left + i * gap + (gap - barW) / 2;
      const y  = pad.top + iH - bH;
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath(); (ctx as CanvasRenderingContext2D & { roundRect: (...a: unknown[]) => void }).roundRect(x, pad.top, barW, iH, 4); ctx.fill();
      if (d.amount > 0) {
        ctx.fillStyle = CLINIC_COLORS[i % CLINIC_COLORS.length] ?? '#6366F1';
        ctx.beginPath(); (ctx as CanvasRenderingContext2D & { roundRect: (...a: unknown[]) => void }).roundRect(x, y, barW, bH, 4); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(`$${(d.amount / 1000).toFixed(1)}k`, x + barW / 2, y - 3);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.font = '8.5px system-ui'; ctx.textAlign = 'center';
      const label = d.clinicName.length > 9 ? d.clinicName.slice(0, 8) + '…' : d.clinicName;
      ctx.fillText(label, x + barW / 2, h - 6);
    });
  }, [report.byClinic]);

  // ── Export CSV ───────────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    const headers = ['Categoría', 'Transacciones', 'Monto', '% del total'];
    const rows = report.byCategory.map(r => [
      CAT_LABELS[r.category] ?? r.category,
      String(r.count),
      r.amount.toFixed(2),
      `${(r.pct * 100).toFixed(1)}%`,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `reporte-caja-chica-${applied.dateFrom}-${applied.dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [report.byCategory, applied]);

  // ── Export PDF ────────────────────────────────────────────────────────────
  const handleExportPDF = useCallback(() => {
    const rows = report.byCategory.map(r => `
      <tr>
        <td>${CAT_LABELS[r.category] ?? r.category}</td>
        <td style="text-align:center">${r.count}</td>
        <td style="text-align:right;font-family:monospace;color:#dc2626">$${fmt(r.amount)}</td>
        <td style="text-align:right">${(r.pct * 100).toFixed(1)}%</td>
      </tr>`).join('');

    const clinicRows = report.byClinic.map(c => `
      <tr>
        <td>${c.clinicName}</td>
        <td>${c.country === 'EEUU' ? '🇺🇸 EEUU' : '🇧🇴 Bolivia'}</td>
        <td style="text-align:right;font-family:monospace;color:#dc2626">$${fmt(c.amount)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Reporte Caja Chica ${applied.dateFrom} – ${applied.dateTo}</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;color:#111}
h1{margin:0;font-size:20px}
.sub{color:#666;font-size:12px;margin:4px 0 20px}
.kpis{display:flex;gap:12px;margin-bottom:24px}
.kpi{background:#f3f4f6;padding:10px 16px;border-radius:8px;flex:1}
.kpi-l{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.05em}
.kpi-v{font-size:18px;font-weight:700;margin-top:4px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#666;margin:20px 0 8px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px}
th{text-align:left;border-bottom:2px solid #e5e7eb;padding:7px 8px;font-size:10px;text-transform:uppercase;color:#666}
td{padding:7px 8px;border-bottom:1px solid #f0f0f0}
@media print{body{padding:0}}
</style></head><body>
<h1>Reporte Caja Chica — Precision Medical</h1>
<p class="sub">${applied.dateFrom} – ${applied.dateTo} · Generado ${new Date().toLocaleDateString('es-ES')}</p>
<div class="kpis">
  <div class="kpi"><div class="kpi-l">Saldo actual</div><div class="kpi-v">$${fmt(totalBalance)}</div></div>
  <div class="kpi"><div class="kpi-l">Total depósitos</div><div class="kpi-v" style="color:#16a34a">$${fmt(report.kpis.totalDeposits)}</div></div>
  <div class="kpi"><div class="kpi-l">Total gastos</div><div class="kpi-v" style="color:#dc2626">$${fmt(report.kpis.totalExpenses)}</div></div>
  <div class="kpi"><div class="kpi-l">Transacciones</div><div class="kpi-v">${report.kpis.txCount}</div></div>
  <div class="kpi"><div class="kpi-l">Promedio</div><div class="kpi-v">$${fmt(report.kpis.avgAmount)}</div></div>
</div>
<h2>Desglose por categoría</h2>
<table><thead><tr><th>Categoría</th><th>Transacciones</th><th style="text-align:right">Monto</th><th style="text-align:right">%</th></tr></thead>
<tbody>${rows}</tbody></table>
<h2>Desglose por clínica / sede</h2>
<table><thead><tr><th>Clínica</th><th>Sede</th><th style="text-align:right">Monto</th></tr></thead>
<tbody>${clinicRows}</tbody></table>
</body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }, [report, applied, totalBalance]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const maxCat = report.byCategory[0]?.amount ?? 1;

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 45px)' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 210, flexShrink: 0,
        background: 'hsl(var(--background))',
        borderRight: '1px solid hsl(var(--border))',
        padding: '16px 14px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {/* Período */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>
            Período
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <p style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginBottom: 3 }}>Desde</p>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ width: '100%', background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '6px 9px', color: 'hsl(var(--foreground))', fontSize: 11.5, fontFamily: 'inherit' }} />
            </div>
            <div>
              <p style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginBottom: 3 }}>Hasta</p>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ width: '100%', background: 'hsl(var(--muted))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '6px 9px', color: 'hsl(var(--foreground))', fontSize: 11.5, fontFamily: 'inherit' }} />
            </div>
          </div>
          {/* Presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {[
              { key: 'mes', label: 'Este mes' },
              { key: '7d',  label: 'Últimos 7 días' },
              { key: '30d', label: 'Últimos 30 días' },
              { key: 'tri', label: 'Trimestre' },
            ].map(p => (
              <button key={p.key} onClick={() => setPreset(p.key)}
                style={{
                  padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                  fontSize: 12, fontFamily: 'inherit', transition: 'all 120ms',
                  background: activePreset === p.key ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: activePreset === p.key ? '#6366F1' : 'hsl(var(--muted-foreground))',
                  fontWeight: activePreset === p.key ? 600 : 400,
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sede */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>Sede</p>
          <Select value={country} onValueChange={v => { setCountry(v as typeof country); setClinicName(''); }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sedes</SelectItem>
              <SelectItem value="EEUU">🇺🇸 EEUU</SelectItem>
              <SelectItem value="Bolivia">🇧🇴 Bolivia</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Clínica */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>Clínica</p>
          <Select value={clinicName || 'all'} onValueChange={v => setClinicName(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las clínicas</SelectItem>
              {clinicOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Tipo */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>Tipo</p>
          <Select value={tipo} onValueChange={v => setTipo(v as typeof tipo)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="DEPOSIT">Depósitos</SelectItem>
              <SelectItem value="EXPENSE">Gastos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Categoría */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>Categoría</p>
          <Select value={category || 'all'} onValueChange={v => setCategory(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(CAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <button onClick={applyFilters}
          style={{
            marginTop: 'auto', width: '100%', background: '#6366F1', color: '#fff',
            border: 'none', borderRadius: 9, padding: '9px', fontSize: 12.5, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 6,
          }}>
          {isFetching
            ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />Cargando...</>
            : 'Generar reporte'}
        </button>
      </aside>

      {/* ── Content ── */}
      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, overflowX: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700 }} className="text-text-1">Reporte Financiero — Caja Chica</h1>
            <p style={{ fontSize: 12, marginTop: 2 }} className="text-text-3">
              {applied.dateFrom} – {applied.dateTo}
              {applied.country !== 'all' && ` · ${applied.country}`}
              {applied.clinicName && ` · ${applied.clinicName}`}
              {applied.tipo !== 'all' && ` · ${applied.tipo === 'DEPOSIT' ? 'Solo depósitos' : 'Solo gastos'}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleExportPDF}
              style={{ background: 'transparent', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '7px 13px', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              className="text-text-2 hover:border-brand hover:text-brand transition-colors">
              <FileText size={13} /> PDF
            </button>
            <button onClick={handleExportCSV}
              style={{ background: 'transparent', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '7px 13px', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              className="text-text-2 hover:border-brand hover:text-brand transition-colors">
              <Download size={13} /> Excel
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { label: 'Saldo actual total',   value: `$${fmt(totalBalance)}`,               color: '#6366F1', meta: `${initialBoxes.length} cajas registradas` },
            { label: 'Total depósitos',       value: `$${fmt(report.kpis.totalDeposits)}`,  color: '#10B981', meta: `en el período seleccionado` },
            { label: 'Total gastos',          value: `$${fmt(report.kpis.totalExpenses)}`,  color: '#F43F5E', meta: `${report.kpis.txCount} transacciones` },
            { label: 'Promedio / transacción',value: `$${fmt(report.kpis.avgAmount)}`,      color: '#F59E0B', meta: `Mediana $${fmt(report.kpis.medianAmount)}` },
          ].map(k => (
            <div key={k.label} style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, padding: '14px 16px' }}
              className="bg-surface border border-border">
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: k.color, borderRadius: '12px 12px 0 0' }} />
              <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }} className="text-text-3">{k.label}</p>
              <p style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</p>
              <p style={{ fontSize: 10.5, marginTop: 6 }} className="text-text-3">{k.meta}</p>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

          {/* Line chart */}
          <div style={{ gridColumn: 'span 2', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
            className="bg-surface border border-border">
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }} className="text-text-2">Evolución del saldo</p>
              <p style={{ fontSize: 10.5, marginTop: 1 }} className="text-text-3">Balance acumulado por día</p>
            </div>
            <canvas ref={lineRef} style={{ display: 'block', width: '100%', height: 130 }} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5 }} className="text-text-3">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#6366F1', flexShrink: 0 }} />Bolivia
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5 }} className="text-text-3">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#06B6D4', flexShrink: 0 }} />EEUU
              </span>
            </div>
          </div>

          {/* Donut */}
          <div style={{ borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
            className="bg-surface border border-border">
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }} className="text-text-2">Por categoría</p>
              <p style={{ fontSize: 10.5, marginTop: 1 }} className="text-text-3">Distribución de gastos</p>
            </div>
            <canvas ref={donutRef} style={{ display: 'block', width: '100%', height: 120 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 }}>
              {report.byCategory.slice(0, 5).map(s => (
                <span key={s.category} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5 }} className="text-text-3">
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CAT_COLORS[s.category] ?? '#475569', flexShrink: 0 }} />
                  {CAT_LABELS[s.category] ?? s.category} · ${fmt(s.amount)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bar chart */}
        <div style={{ borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
          className="bg-surface border border-border">
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }} className="text-text-2">Gastos por sede / clínica</p>
            <p style={{ fontSize: 10.5, marginTop: 1 }} className="text-text-3">Comparativa del período seleccionado</p>
          </div>
          <canvas ref={barRef} style={{ display: 'block', width: '100%', height: 80 }} />
        </div>

        {/* Tabla desglose */}
        <div style={{ borderRadius: 12, overflow: 'hidden' }} className="border border-border">
          <div style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            className="border-b border-border bg-surface">
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }} className="text-text-2">Desglose por categoría</p>
            <p style={{ fontSize: 11 }} className="text-text-3">{report.byCategory.length} categorías</p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="bg-bg-0">
                {['Categoría','Transacciones','Monto total','% del total','Distribución'].map(h => (
                  <th key={h} style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '9px 16px', textAlign: h === 'Distribución' ? 'left' : h.startsWith('M') || h.startsWith('%') ? 'right' : 'left' }}
                    className="text-text-3 border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.byCategory.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px 16px', fontSize: 13 }} className="text-text-3">Sin movimientos en el período seleccionado</td></tr>
              ) : report.byCategory.map((r, idx) => (
                <tr key={r.category} className="border-b border-border hover:bg-bg-2 transition-colors">
                  <td style={{ padding: '9px 16px', fontSize: 12, fontWeight: 500 }} className="text-text-1">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: CAT_COLORS[r.category] ?? '#475569', flexShrink: 0 }} />
                      {CAT_LABELS[r.category] ?? r.category}
                    </span>
                  </td>
                  <td style={{ padding: '9px 16px', fontSize: 12 }} className="text-text-2">{r.count}</td>
                  <td style={{ padding: '9px 16px', fontSize: 11.5, textAlign: 'right', fontFamily: 'monospace', color: '#F43F5E', fontWeight: 600 }}>${fmt(r.amount)}</td>
                  <td style={{ padding: '9px 16px', fontSize: 11.5, textAlign: 'right', fontFamily: 'monospace' }} className="text-text-2">{(r.pct * 100).toFixed(1)}%</td>
                  <td style={{ padding: '9px 16px', width: 120 }}>
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, width: `${(r.amount / maxCat) * 100}%`, background: CAT_COLORS[r.category] ?? '#6366F1', opacity: 0.85 }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
