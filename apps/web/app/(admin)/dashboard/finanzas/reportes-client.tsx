'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api as trpc } from '@/lib/trpc/client';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@precision/ui';
import { FileText, Download, RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@precision-medical/api';
import { construirWorkbookCajaChica, nombreArchivoCajaChica } from './reporte-excel';

type ReportData = inferRouterOutputs<AppRouter>['pettyCash']['report'];
type Boxes      = inferRouterOutputs<AppRouter>['pettyCash']['listBoxes'];

// ── Paleta ─────────────────────────────────────────────────────────────────
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
/**
 * Las diez categorías de gasto. Los NOMBRES no están acá: ya vivían en
 * `pettyCash.categories` del diccionario, en los dos idiomas, y este archivo
 * tenía una segunda copia sin traducir. Queda solo el orden.
 */
const CAT_KEYS = [
  'FOOD', 'CALACOTO', 'RECORDINGS', 'MAINTENANCE', 'OFFICE',
  'UTILITIES', 'MEDICAL_SUPPLIES', 'TRANSPORT', 'VIATICOS', 'OTHER',
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const todayStr       = () => new Date().toISOString().slice(0, 10);
const firstOfMonth   = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const nDaysAgo       = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const firstOfQuarter = () => { const d = new Date(); return new Date(d.getFullYear(), Math.floor(d.getMonth()/3)*3, 1).toISOString().slice(0, 10); };
const isEEUUBox      = (name: string) => ['provo','pleasant grove','spanish fork','west valley','south murray'].some(k => name.toLowerCase().includes(k));

// ── Canvas hook ─────────────────────────────────────────────────────────────
function useCanvas(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: unknown[],
) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Use useEffect via a stable callback pattern
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const schedule = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.parentElement!.clientWidth;
    const h   = canvas.offsetHeight || 120;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width  = `${w}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    drawRef.current(ctx, w, h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const callbackRef = useCallback((node: HTMLCanvasElement | null) => {
    (ref as React.MutableRefObject<HTMLCanvasElement | null>).current = node;
    if (node) {
      // Draw after paint
      requestAnimationFrame(schedule);
      // Redraw on resize
      const ro = new ResizeObserver(schedule);
      ro.observe(node.parentElement!);
      (node as HTMLCanvasElement & { _ro?: ResizeObserver })._ro = ro;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  // Redraw when deps change
  useCallback(() => { requestAnimationFrame(schedule); }, deps)();

  return callbackRef;
}

// ── FilterSidebar ────────────────────────────────────────────────────────────
interface Filters {
  dateFrom: string; dateTo: string;
  country: 'all'|'EEUU'|'Bolivia';
  clinicName: string;
  tipo: 'all'|'DEPOSIT'|'EXPENSE';
  category: string;
}

function FilterSidebar({
  filters, setFilters, onApply, clinicOptions, isFetching, onClose,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  onApply: () => void;
  clinicOptions: string[];
  isFetching: boolean;
  onClose?: () => void;
}) {
  const t    = useTranslations('finance');
  const tc   = useTranslations('common');
  const tCat = useTranslations('pettyCash.categories');

  const [activePreset, setActivePreset] = useState('mes');

  function setPreset(p: string) {
    setActivePreset(p);
    const map: Record<string, { dateFrom: string; dateTo: string }> = {
      mes:  { dateFrom: firstOfMonth(),   dateTo: todayStr() },
      '7d': { dateFrom: nDaysAgo(7),      dateTo: todayStr() },
      '30d':{ dateFrom: nDaysAgo(30),     dateTo: todayStr() },
      tri:  { dateFrom: firstOfQuarter(), dateTo: todayStr() },
    };
    if (map[p]) setFilters(f => ({ ...f, ...map[p] }));
  }

  const labelCls = 'text-[10px] font-bold uppercase tracking-[0.08em] text-text-3 mb-2 block';
  const presetCls = (active: boolean) =>
    `w-full text-left px-3 py-[7px] rounded-lg text-[12.5px] transition-all cursor-pointer border-none font-sans ${
      active ? 'bg-brand/10 text-brand-text font-semibold' : 'bg-transparent text-text-2 hover:bg-bg-2 hover:text-text-1'
    }`;

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Mobile close */}
      {onClose && (
        <div className="flex items-center justify-between md:hidden">
          <span className="text-sm font-semibold text-text-1">{t('filters')}</span>
          <button onClick={onClose} className="p-1 text-text-3 hover:text-text-1"><X size={16} /></button>
        </div>
      )}

      {/* Período */}
      <div>
        <span className={labelCls}>{t('period')}</span>
        <div className="flex flex-col gap-1.5">
          <div>
            <p className="text-[10.5px] text-text-3 mb-1">{t('from')}</p>
            <input type="date" value={filters.dateFrom}
              onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
              className="w-full bg-bg-2 border border-border rounded-lg px-2.5 py-1.5 text-[11.5px] text-text-1 font-sans" />
          </div>
          <div>
            <p className="text-[10.5px] text-text-3 mb-1">{t('to')}</p>
            <input type="date" value={filters.dateTo}
              onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
              className="w-full bg-bg-2 border border-border rounded-lg px-2.5 py-1.5 text-[11.5px] text-text-1 font-sans" />
          </div>
        </div>
        <div className="flex flex-col gap-1 mt-2">
          {[{k:'mes',l:'presetMonth'},{k:'7d',l:'preset7d'},{k:'30d',l:'preset30d'},{k:'tri',l:'presetQuarter'}].map(p => (
            <button key={p.k} onClick={() => setPreset(p.k)} className={presetCls(activePreset === p.k)}>{t(p.l)}</button>
          ))}
        </div>
      </div>

      {/* Sede */}
      <div>
        <span className={labelCls}>{t('site')}</span>
        <Select value={filters.country} onValueChange={v => setFilters(f => ({ ...f, country: v as Filters['country'], clinicName: '' }))}>
          <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allSites')}</SelectItem>
            <SelectItem value="EEUU">🇺🇸 EEUU</SelectItem>
            <SelectItem value="Bolivia">🇧🇴 Bolivia</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clínica */}
      <div>
        <span className={labelCls}>{t('clinic')}</span>
        <Select value={filters.clinicName || 'all'} onValueChange={v => setFilters(f => ({ ...f, clinicName: v === 'all' ? '' : v }))}>
          <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allClinics')}</SelectItem>
            {clinicOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tipo */}
      <div>
        <span className={labelCls}>{t('type')}</span>
        <Select value={filters.tipo} onValueChange={v => setFilters(f => ({ ...f, tipo: v as Filters['tipo'] }))}>
          <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            <SelectItem value="DEPOSIT">{t('deposits')}</SelectItem>
            <SelectItem value="EXPENSE">{t('expenses')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Categoría */}
      <div>
        <span className={labelCls}>{t('category')}</span>
        <Select value={filters.category || 'all'} onValueChange={v => setFilters(f => ({ ...f, category: v === 'all' ? '' : v }))}>
          <SelectTrigger className="h-8 text-xs w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allCategories')}</SelectItem>
            {CAT_KEYS.map(k => <SelectItem key={k} value={k}>{tCat(k)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <button
        onClick={() => { onApply(); onClose?.(); }}
        className="mt-auto w-full bg-brand text-white rounded-[9px] py-2.5 text-[12.5px] font-bold font-sans flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
      >
        {isFetching
          ? <><RefreshCw size={13} className="animate-spin" />{tc('loading')}</>
          : t('generate')}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ReportesClient({ initialBoxes }: { initialBoxes: Boxes }) {
  const t    = useTranslations('finance');
  const tc   = useTranslations('common');
  const tCat = useTranslations('pettyCash.categories');
  const locale = useLocale();

  const defaultFilters: Filters = {
    dateFrom: firstOfMonth(), dateTo: todayStr(),
    country: 'all', clinicName: '', tipo: 'all', category: '',
  };
  const [filters,  setFilters]  = useState<Filters>(defaultFilters);
  const [applied,  setApplied]  = useState<Filters>(defaultFilters);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, isFetching } = trpc.pettyCash.report.useQuery({
    dateFrom: applied.dateFrom, dateTo: applied.dateTo,
    country: applied.country,
    clinicName: applied.clinicName || undefined,
    type: applied.tipo,
    category: applied.category || undefined,
  }, { staleTime: 30_000 });

  const report: ReportData = data ?? {
    kpis: { totalDeposits: 0, totalExpenses: 0, txCount: 0, avgAmount: 0, medianAmount: 0 },
    dailySeries: [], byCategory: [], byClinic: [],
  };

  const totalBalance = useMemo(
    () => initialBoxes.reduce((s, b) => s + Number(b.balance), 0),
    [initialBoxes],
  );

  const clinicOptions = useMemo(() => {
    if (filters.country === 'EEUU')    return initialBoxes.filter(b => isEEUUBox(b.name)).map(b => b.name);
    if (filters.country === 'Bolivia') return initialBoxes.filter(b => !isEEUUBox(b.name)).map(b => b.name);
    return initialBoxes.map(b => b.name);
  }, [filters.country, initialBoxes]);

  // ── Line chart ───────────────────────────────────────────────────────────
  const lineRef = useCanvas((ctx, w, h) => {
    if (!report.dailySeries.length) return;
    const pad = { top: 12, right: 12, bottom: 28, left: 52 };
    const iW = w - pad.left - pad.right;
    const iH = h - pad.top - pad.bottom;
    const n  = report.dailySeries.length;
    let cumBo = 0, cumEe = 0;
    const ptsBo = report.dailySeries.map(d => { cumBo += d.bolivia; return cumBo; });
    const ptsEe = report.dailySeries.map(d => { cumEe += d.eeuu;    return cumEe; });
    const allV = [...ptsBo, ...ptsEe];
    const minV = Math.min(...allV, 0);
    const maxV = Math.max(...allV, 1);
    const sy = (v: number) => pad.top + iH - ((v - minV) / (maxV - minV)) * iH;
    const sx = (i: number) => pad.left + (n > 1 ? (i / (n-1)) * iW : iW / 2);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (iH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + iW, y); ctx.stroke();
      const val = maxV - (i / 4) * (maxV - minV);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '9px system-ui'; ctx.textAlign = 'right';
      ctx.fillText(`$${Math.round(val).toLocaleString()}`, pad.left - 4, y + 3);
    }
    // Series
    ([{ pts: ptsBo, color: '#6366F1' }, { pts: ptsEe, color: '#06B6D4' }] as {pts:number[];color:string}[]).forEach(({pts, color}) => {
      if (pts.every(v => v === 0)) return;
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + iH);
      grad.addColorStop(0, color + '28'); grad.addColorStop(1, color + '00');
      ctx.beginPath(); ctx.moveTo(sx(0), pad.top + iH);
      pts.forEach((v, i) => ctx.lineTo(sx(i), sy(v)));
      ctx.lineTo(sx(pts.length-1), pad.top + iH); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath(); pts.forEach((v, i) => i === 0 ? ctx.moveTo(sx(i), sy(v)) : ctx.lineTo(sx(i), sy(v)));
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      const last = pts[pts.length-1] ?? 0;
      ctx.beginPath(); ctx.arc(sx(pts.length-1), sy(last), 4, 0, Math.PI*2); ctx.fillStyle = color; ctx.fill();
    });
    // X labels
    const step = Math.max(1, Math.floor(n / Math.min(7, Math.floor(w / 60))));
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    report.dailySeries.forEach((d, i) => {
      if (i % step !== 0 && i !== n-1) return;
      ctx.fillText(d.date.slice(5).replace('-','/'), sx(i), h - 6);
    });
  }, [report.dailySeries]);

  // ── Donut chart ──────────────────────────────────────────────────────────
  const donutRef = useCanvas((ctx, w, h) => {
    const size = Math.min(w, h);
    const cx = w/2, cy = h/2, r = size*0.42, inner = size*0.27;
    const slices = report.byCategory.slice(0, 6);
    if (!slices.length) return;
    let angle = -Math.PI/2;
    slices.forEach(s => {
      const end = angle + s.pct * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, angle, end); ctx.closePath();
      ctx.fillStyle = CAT_COLORS[s.category] ?? '#475569'; ctx.fill();
      angle = end;
    });
    ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI*2); ctx.fillStyle = '#13161D'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `bold ${Math.round(size*0.10)}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(`$${Math.round(report.kpis.totalExpenses/1000)}k`, cx, cy - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = `${Math.round(size*0.065)}px system-ui`;
    ctx.fillText('gastos', cx, cy + Math.round(size*0.10));
  }, [report.byCategory, report.kpis.totalExpenses]);

  // ── Bar chart ────────────────────────────────────────────────────────────
  const barRef = useCanvas((ctx, w, h) => {
    const data = report.byClinic.slice(0, 8);
    if (!data.length) return;
    const maxV = Math.max(...data.map(d => d.amount), 1);
    const pad = { top: 14, right: 8, bottom: 26, left: 8 };
    const iW = w - pad.left - pad.right, iH = h - pad.top - pad.bottom;
    const gap = iW / data.length, barW = gap * 0.55;
    data.forEach((d, i) => {
      const bH = Math.max((d.amount/maxV)*iH, d.amount > 0 ? 3 : 0);
      const x = pad.left + i*gap + (gap-barW)/2, y = pad.top + iH - bH;
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath(); (ctx as unknown as {roundRect:(...a:unknown[])=>void}).roundRect(x, pad.top, barW, iH, 4); ctx.fill();
      if (d.amount > 0) {
        ctx.fillStyle = CLINIC_COLORS[i % CLINIC_COLORS.length] ?? '#6366F1';
        ctx.beginPath(); (ctx as unknown as {roundRect:(...a:unknown[])=>void}).roundRect(x, y, barW, bH, 4); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(`$${(d.amount/1000).toFixed(1)}k`, x+barW/2, y-3);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.font = '8.5px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(d.clinicName.length > 9 ? d.clinicName.slice(0,8)+'…' : d.clinicName, x+barW/2, h-6);
    });
  }, [report.byClinic]);

  // ── Exports ───────────────────────────────────────────────────────────────
  // El botón dice Excel, así que entrega un Excel (SpreadsheetML, el mismo
  // formato que employees/reporte-horas-client). Antes bajaba un CSV separado
  // por comas y el Excel de acá lo abría TODO en la columna A: el separador de
  // lista de Windows en es-PE/es-BO es ';', no ','. Medido 2026-09-09 en la
  // máquina de Erick. Además llevaba solo la tabla de categorías, menos de lo
  // que ya trae el PDF de al lado.
  const handleExportExcel = useCallback(() => {
    const xml  = construirWorkbookCajaChica(report, applied, totalBalance,
      Object.fromEntries(CAT_KEYS.map(k => [k, tCat(k)])));
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = nombreArchivoCajaChica(applied);
    // En el documento antes del click: un ancla suelta no dispara la descarga
    // en todos los navegadores, y revocar la URL es lo último que pasa.
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [report, applied, totalBalance]);

  const handleExportPDF = useCallback(() => {
    const catRows = report.byCategory.map(r=>`<tr><td>${tCat(r.category)}</td><td style="text-align:center">${r.count}</td><td style="text-align:right;color:#dc2626">$${fmt(r.amount)}</td><td style="text-align:right">${(r.pct*100).toFixed(1)}%</td></tr>`).join('');
    const clinicRows = report.byClinic.map(c=>`<tr><td>${c.clinicName}</td><td>${c.country==='EEUU'?'🇺🇸':'🇧🇴'} ${c.country}</td><td style="text-align:right;color:#dc2626">$${fmt(c.amount)}</td></tr>`).join('');
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${t('pdfTitle')}</title>
<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0}.sub{color:#666;font-size:12px;margin:4px 0 20px}.kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}.kpi{background:#f3f4f6;padding:10px 16px;border-radius:8px;flex:1;min-width:120px}.kpi-l{font-size:10px;color:#666;text-transform:uppercase}.kpi-v{font-size:17px;font-weight:700;margin-top:4px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#666;margin:18px 0 8px}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;border-bottom:2px solid #e5e7eb;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#666}td{padding:6px 8px;border-bottom:1px solid #f0f0f0}@media print{body{padding:0}}</style>
</head><body>
<h1>${t('pdfHeading')}</h1>
<p class="sub">${applied.dateFrom} – ${applied.dateTo} · ${t('pdfGenerated', { fecha: new Date().toLocaleDateString(locale) })}</p>
<div class="kpis">
  <div class="kpi"><div class="kpi-l">${t('currentBalance')}</div><div class="kpi-v">$${fmt(totalBalance)}</div></div>
  <div class="kpi"><div class="kpi-l">${t('deposits')}</div><div class="kpi-v" style="color:#16a34a">$${fmt(report.kpis.totalDeposits)}</div></div>
  <div class="kpi"><div class="kpi-l">${t('expenses')}</div><div class="kpi-v" style="color:#dc2626">$${fmt(report.kpis.totalExpenses)}</div></div>
  <div class="kpi"><div class="kpi-l">${t('transactions')}</div><div class="kpi-v">${report.kpis.txCount}</div></div>
  <div class="kpi"><div class="kpi-l">${t('average')}</div><div class="kpi-v">$${fmt(report.kpis.avgAmount)}</div></div>
</div>
<h2>${t('byCategory')}</h2>
<table><thead><tr><th>${t('category')}</th><th>${t('transactions')}</th><th style="text-align:right">${t('amount')}</th><th style="text-align:right">%</th></tr></thead><tbody>${catRows}</tbody></table>
<h2>${t('byClinicSite')}</h2>
<table><thead><tr><th>${t('clinic')}</th><th>${t('site')}</th><th style="text-align:right">${t('amount')}</th></tr></thead><tbody>${clinicRows}</tbody></table>
</body></html>`;
    const win = window.open('','_blank');
    if (win){win.document.write(html);win.document.close();win.print();}
  }, [report, applied, totalBalance]);

  const maxCat = report.byCategory[0]?.amount ?? 1;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside
            className="absolute top-0 left-0 bottom-0 w-72 bg-bg-1 border-r border-border p-5 overflow-y-auto z-50"
            onClick={e => e.stopPropagation()}
          >
            <FilterSidebar
              filters={filters} setFilters={setFilters}
              onApply={() => setApplied(filters)}
              clinicOptions={clinicOptions} isFetching={isFetching}
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-h-[calc(100vh-45px)] overflow-hidden w-full">

        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-[210px] flex-shrink-0 bg-bg-1 border-r border-border p-4 gap-0">
          <FilterSidebar
            filters={filters} setFilters={setFilters}
            onApply={() => setApplied(filters)}
            clinicOptions={clinicOptions} isFetching={isFetching}
          />
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 overflow-hidden p-4 sm:p-5 flex flex-col gap-4">

          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile filtros button */}
              <button onClick={() => setDrawerOpen(true)}
                className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-2 bg-bg-2 shrink-0">
                <SlidersHorizontal size={13} /> {t('filters')}
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-[17px] font-bold text-text-1 truncate">{t('reportTitle')}</h1>
                <p className="text-[11px] text-text-3 mt-0.5 truncate">
                  {applied.dateFrom} – {applied.dateTo}
                  {applied.country !== 'all' && ` · ${applied.country}`}
                  {applied.clinicName && ` · ${applied.clinicName}`}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={handleExportPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[11.5px] font-semibold text-text-2 bg-transparent hover:border-brand hover:text-brand-text transition-colors">
                <FileText size={13} /> <span className="hidden sm:inline">PDF</span>
              </button>
              <button onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[11.5px] font-semibold text-text-2 bg-transparent hover:border-brand hover:text-brand-text transition-colors">
                <Download size={13} /> <span className="hidden sm:inline">Excel</span>
              </button>
            </div>
          </div>

          {/* KPIs — 2 cols mobile, 4 cols desktop */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {[
              { label: t('kpiTotalBalance'),  value: `$${fmt(totalBalance)}`,              color: '#6366F1', meta: t('boxesCount', { total: initialBoxes.length }) },
              { label: t('kpiTotalDeposits'), value: `$${fmt(report.kpis.totalDeposits)}`, color: '#10B981', meta: t('inPeriod') },
              { label: t('kpiTotalExpenses'), value: `$${fmt(report.kpis.totalExpenses)}`, color: '#F43F5E', meta: t('txCount', { total: report.kpis.txCount }) },
              { label: t('kpiAvgPerTx'),      value: `$${fmt(report.kpis.avgAmount)}`,     color: '#F59E0B', meta: t('median', { monto: `$${fmt(report.kpis.medianAmount)}` }) },
            ].map(k => (
              <div key={k.label} className="relative overflow-hidden rounded-xl border border-border bg-surface p-3 sm:p-4">
                <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl" style={{ background: k.color }} />
                <p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-text-3 mb-2">{k.label}</p>
                <p className="text-lg sm:text-[22px] font-extrabold leading-none tabular-nums" style={{ color: k.color }}>{k.value}</p>
                <p className="text-[10px] text-text-3 mt-1.5">{k.meta}</p>
              </div>
            ))}
          </div>

          {/* Charts — stacked on mobile, 2+1 grid on lg */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 min-w-0">

            {/* Line chart — full width on mobile, 2/3 on desktop */}
            <div className="lg:col-span-2 min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-4 flex flex-col gap-2.5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-2">{t('balanceEvolution')}</p>
                <p className="text-[10.5px] text-text-3 mt-0.5">{t('cumulativeByDay')}</p>
              </div>
              <div className="w-full overflow-hidden">
                <canvas ref={lineRef} className="w-full" style={{ height: 130 }} />
              </div>
              <div className="flex gap-4 flex-wrap">
                <span className="flex items-center gap-1.5 text-[10.5px] text-text-3">
                  <span className="w-2 h-2 rounded-sm bg-brand flex-shrink-0" />Bolivia
                </span>
                <span className="flex items-center gap-1.5 text-[10.5px] text-text-3">
                  <span className="w-2 h-2 rounded-sm bg-cyan flex-shrink-0" />EEUU
                </span>
              </div>
            </div>

            {/* Donut — full width on mobile, 1/3 on desktop */}
            <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-4 flex flex-col gap-2.5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-2">{t('byCategory')}</p>
                <p className="text-[10.5px] text-text-3 mt-0.5">{t('expenseDistribution')}</p>
              </div>
              <div className="w-full overflow-hidden">
                <canvas ref={donutRef} className="w-full" style={{ height: 120 }} />
              </div>
              <div className="flex flex-col gap-1.5">
                {report.byCategory.slice(0, 5).map(s => (
                  <span key={s.category} className="flex items-center gap-1.5 text-[10.5px] text-text-3">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: CAT_COLORS[s.category] ?? '#475569' }} />
                    {tCat(s.category)} · ${fmt(s.amount)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div className="overflow-hidden rounded-xl border border-border bg-surface p-4 flex flex-col gap-2.5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-2">{t('expensesByClinic')}</p>
              <p className="text-[10.5px] text-text-3 mt-0.5">{t('periodComparison')}</p>
            </div>
            <div className="w-full overflow-hidden">
              <canvas ref={barRef} className="w-full" style={{ height: 80 }} />
            </div>
          </div>

          {/* Tabla desglose */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-2">{t('categoryBreakdown')}</p>
              <p className="text-[11px] text-text-3">{t('categoriesCount', { total: report.byCategory.length })}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr className="bg-bg-0">
                    {[t('category'), t('colTx'), t('colAmountTotal'), t('colPctTotal'), t('colDistribution')].map((h, i) => (
                      <th key={h} className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-text-3 px-4 py-2.5 border-b border-border"
                        style={{ textAlign: i >= 2 && i < 4 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.byCategory.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-sm text-text-3">{t('noMovements')}</td></tr>
                  ) : report.byCategory.map(r => (
                    <tr key={r.category} className="border-b border-border hover:bg-bg-2 transition-colors">
                      <td className="px-4 py-2.5 text-[12px] font-medium text-text-1">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: CAT_COLORS[r.category] ?? '#475569' }} />
                          {tCat(r.category)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-text-2">{r.count}</td>
                      <td className="px-4 py-2.5 text-[11.5px] text-right font-mono font-semibold text-rose-text">${fmt(r.amount)}</td>
                      <td className="px-4 py-2.5 text-[11.5px] text-right font-mono text-text-2">{(r.pct*100).toFixed(1)}%</td>
                      <td className="px-4 py-2.5 w-[100px]">
                        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full opacity-80" style={{ width: `${(r.amount/maxCat)*100}%`, background: CAT_COLORS[r.category] ?? '#6366F1' }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
