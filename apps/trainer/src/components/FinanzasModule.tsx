'use client';

import { useState, useRef } from 'react';
import { useCurrencySymbol, LOCALE_DATA } from '@/lib/useCurrencySymbol';
import {
  calcEstadoCuota,
  diasHastaVencimiento,
  generarEnlaceWA,
  buildMensaje,
  DEFAULT_TEMPLATES,
} from '@/lib/payments';
import {
  createCuota,
  updateCuota,
  updateCuotaEstado,
  deleteCuota,
  logWhatsappMensaje,
  upsertPlantilla,
  upsertConfigRecordatorios,
} from '@/actions/finanzas';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Student {
  id: string;
  full_name: string;
  phone: string | null;
}

interface Cuota {
  id: string;
  alumno_id: string;
  monto: number;
  fecha_pago: string | null;
  fecha_vencimiento: string;
  periodo: string;
  metodo_pago: string | null;
  estado: string;
  notas: string | null;
  students: { full_name: string; phone: string | null } | null;
}

interface WaMensaje {
  id: string;
  alumno_id: string;
  tipo_mensaje: string;
  contenido: string;
  fecha_envio: string;
  estado: string;
  students: { full_name: string } | null;
}

interface Plantilla {
  id: string;
  tipo: string;
  nombre: string;
  contenido: string;
}

interface Config {
  id: string;
  dias_antes_vencimiento: number;
  recordatorio_dia_vencimiento: boolean;
  recordatorio_post_24h: boolean;
  recordatorio_post_48h: boolean;
  recordatorio_post_72h: boolean;
  dias_habiles: number[];
}

interface Props {
  students: Student[];
  initialCuotas: Cuota[];
  initialWaMensajes: WaMensaje[];
  initialPlantillas: Plantilla[];
  initialConfig: Config | null;
}

// ─── Helper Components ────────────────────────────────────────────────────────

function StatusBadge({ estado }: { estado: string }) {
  const styles: Record<string, React.CSSProperties> = {
    pagado: { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' },
    pendiente: { background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' },
    vencido: { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' },
    enviado: { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' },
    fallido: { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' },
  };
  const style = styles[estado] ?? { background: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)' };
  return (
    <span
      className="badge"
      style={{
        ...style,
        borderRadius: '4px',
        padding: '2px 8px',
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        display: 'inline-block',
      }}
    >
      {estado}
    </span>
  );
}

function MetodoTag({ metodo }: { metodo: string }) {
  const labels: Record<string, string> = {
    efectivo: 'Efectivo',
    yape_plin: 'Yape/Plin',
    transferencia: 'Transferencia',
    tarjeta_debito: 'Débito',
    tarjeta_credito: 'Crédito',
    mercado_pago: 'Mercado Pago',
  };
  return (
    <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>
      {labels[metodo] ?? metodo}
    </span>
  );
}

interface AlertaBannerProps {
  vencidos: number;
  proximos: number;
}

function AlertaBanner({ vencidos, proximos }: AlertaBannerProps) {
  if (vencidos === 0 && proximos === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
      {vencidos > 0 && (
        <div
          style={{
            borderLeft: '4px solid #ef4444',
            background: 'rgba(239,68,68,0.08)',
            padding: '12px 16px',
            borderRadius: '0 8px 8px 0',
            color: '#ef4444',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <strong>{vencidos}</strong> cuota{vencidos !== 1 ? 's' : ''} vencida{vencidos !== 1 ? 's' : ''} — requiere{vencidos !== 1 ? 'n' : ''} acción urgente
        </div>
      )}
      {proximos > 0 && (
        <div
          style={{
            borderLeft: '4px solid #f97316',
            background: 'rgba(249,115,22,0.08)',
            padding: '12px 16px',
            borderRadius: '0 8px 8px 0',
            color: '#f97316',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <strong>{proximos}</strong> cuota{proximos !== 1 ? 's' : ''} vence{proximos !== 1 ? 'n' : ''} en los próximos 7 días
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


function formatFecha(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFechaHora(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function fmtPeriodo(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MESES_FULL[parseInt(m, 10) - 1] ?? ym} ${y}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}`;
}

// ─── WA Composer ─────────────────────────────────────────────────────────────

const WA_COMPOSER_TYPES = [
  { tipo: 'vencimiento',   label: 'Recordatorio' },
  { tipo: 'vencido',       label: 'Cuota Vencida' },
  { tipo: 'cobro',         label: 'Cobro Confirmado' },
  { tipo: 'bienvenida',    label: 'Bienvenida' },
  { tipo: 'rutina',        label: 'Nueva Rutina' },
  { tipo: 'personalizado', label: 'Personalizado' },
];

const WA_GREEN = '#25D366';

function WaChipIcon({ tipo }: { tipo: string }) {
  const p = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const;
  if (tipo === 'vencimiento') return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
  if (tipo === 'vencido')     return <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  if (tipo === 'cobro')       return <svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
  if (tipo === 'bienvenida')  return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (tipo === 'rutina')      return <svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
  return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FinanzasModule({
  students,
  initialCuotas,
  initialWaMensajes,
  initialPlantillas,
  initialConfig,
}: Props) {
  const { format: formatMonto, locale: currencyLocale, saveLocale } = useCurrencySymbol();
  const [activeTab, setActiveTab] = useState<'cobros' | 'vencimientos' | 'whatsapp' | 'historial' | 'configuracion'>('cobros');
  const [cuotas, setCuotas] = useState<Cuota[]>(initialCuotas);
  const [waMensajes, setWaMensajes] = useState<WaMensaje[]>(initialWaMensajes);
  const [plantillas, setPlantillas] = useState<Plantilla[]>(initialPlantillas);
  const [config, setConfig] = useState<Config | null>(initialConfig);

  // ── Tab 1: Cobros ──
  const [showRegistrarModal, setShowRegistrarModal] = useState(false);
  const [showCobrarModal, setShowCobrarModal] = useState(false);
  const [cobrarTarget, setCobrarTarget] = useState<Cuota | null>(null);

  // Registrar form
  const [fAlumno, setFAlumno] = useState('');
  const [fMonto, setFMonto] = useState('');
  const [fFechaPago, setFFechaPago] = useState('');
  const [fFechaVenc, setFFechaVenc] = useState('');
  const [fPeriodo, setFPeriodo] = useState(currentMonthStr());
  const [fMetodo, setFMetodo] = useState('');
  const [fNotas, setFNotas] = useState('');
  const [fAbrirWA, setFAbrirWA] = useState(false);
  const [fSaving, setFSaving] = useState(false);
  const [fError, setFError] = useState('');

  // Cobrar quick form
  const [cFechaPago, setCFechaPago] = useState(todayStr());
  const [cMetodo, setCMetodo] = useState('efectivo');
  const [cSaving, setCobrarSaving] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Cuota | null>(null);
  const [editMonto, setEditMonto] = useState('');
  const [editPeriodo, setEditPeriodo] = useState('');
  const [editFechaVenc, setEditFechaVenc] = useState('');
  const [editFechaPago, setEditFechaPago] = useState('');
  const [editMetodo, setEditMetodo] = useState('');
  const [editEstado, setEditEstado] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cuota | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // WA Composer modal
  const [showWAComposer, setShowWAComposer] = useState(false);
  const [waComposerCuota, setWaComposerCuota] = useState<Cuota | null>(null);
  const [waComposerTipo, setWaComposerTipo] = useState('vencimiento');
  const [waComposerMsg, setWaComposerMsg] = useState('');
  const [waComposerCopied, setWaComposerCopied] = useState(false);
  const waComposerTARef = useRef<HTMLTextAreaElement>(null);

  // ── Tab 3: WhatsApp ──
  const [waAlumno, setWaAlumno] = useState('');
  const [waTipo, setWaTipo] = useState('vencimiento');
  const [waCustom, setWaCustom] = useState('');
  const [waCopied, setWaCopied] = useState(false);
  const waTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Tab 4: Historial ──
  const [histMes, setHistMes] = useState(currentMonthStr());

  // ── Tab 5: Configuración ──
  const [cfgDias, setCfgDias] = useState(config?.dias_antes_vencimiento ?? 5);
  const [cfgDiaVenc, setCfgDiaVenc] = useState(config?.recordatorio_dia_vencimiento ?? true);
  const [cfgPost24, setCfgPost24] = useState(config?.recordatorio_post_24h ?? true);
  const [cfgPost48, setCfgPost48] = useState(config?.recordatorio_post_48h ?? false);
  const [cfgPost72, setCfgPost72] = useState(config?.recordatorio_post_72h ?? false);
  const [cfgHabiles, setCfgHabiles] = useState<number[]>(config?.dias_habiles ?? [1, 2, 3, 4, 5]);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgError, setCfgError] = useState('');

  // Plantillas state: tipo -> contenido
  const getPlantillaContent = (tipo: string): string => {
    const found = plantillas.find(p => p.tipo === tipo);
    return found?.contenido ?? DEFAULT_TEMPLATES[tipo] ?? '';
  };
  const [tplVencimiento, setTplVencimiento] = useState(() => getPlantillaContent('vencimiento'));
  const [tplVencido, setTplVencido] = useState(() => getPlantillaContent('vencido'));
  const [tplCobro, setTplCobro] = useState(() => getPlantillaContent('cobro'));
  const [tplBienvenida, setTplBienvenida] = useState(() => getPlantillaContent('bienvenida'));
  const [tplRutina, setTplRutina] = useState(() => getPlantillaContent('rutina'));
  const [tplSaving, setTplSaving] = useState(false);
  const [tplError, setTplError] = useState('');

  // ─── KPI Computations ──────────────────────────────────────────────────────

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const cobradoEsteMes = cuotas
    .filter(c => {
      if (c.estado !== 'pagado' || !c.fecha_pago) return false;
      const fp = new Date(c.fecha_pago.slice(0, 10) + 'T00:00:00');
      return fp.getFullYear() === currentYear && fp.getMonth() === currentMonth;
    })
    .reduce((sum, c) => sum + c.monto, 0);

  const pendienteCobro = cuotas
    .filter(c => c.estado === 'pendiente' || c.estado === 'vencido')
    .reduce((sum, c) => sum + c.monto, 0);

  // Most recent cuota per student
  const latestByStudent = new Map<string, Cuota>();
  for (const c of cuotas) {
    const existing = latestByStudent.get(c.alumno_id);
    if (!existing || c.fecha_vencimiento > existing.fecha_vencimiento) {
      latestByStudent.set(c.alumno_id, c);
    }
  }
  const alumnosAlDia = Array.from(latestByStudent.values()).filter(c => c.estado === 'pagado').length;

  const vencidosCount = cuotas.filter(c => c.estado === 'vencido').length;
  const proximos7 = cuotas.filter(c => {
    if (c.estado !== 'pendiente') return false;
    const dias = diasHastaVencimiento(c.fecha_vencimiento);
    return dias >= 0 && dias <= 7;
  });
  const vencidosPorVencer = vencidosCount + proximos7.length;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  async function handleRegistrarPago() {
    if (!fAlumno || !fMonto || !fFechaVenc || !fPeriodo) {
      setFError('Completá los campos obligatorios.');
      return;
    }
    setFSaving(true);
    setFError('');
    const result = await createCuota({
      alumno_id: fAlumno,
      monto: parseFloat(fMonto),
      fecha_vencimiento: fFechaVenc,
      periodo: fPeriodo,
      ...(fFechaPago ? { fecha_pago: fFechaPago } : {}),
      ...(fMetodo ? { metodo_pago: fMetodo } : {}),
      ...(fNotas ? { notas: fNotas } : {}),
    });
    setFSaving(false);
    if (result.error) {
      setFError(result.error);
      return;
    }
    // Optimistic update
    const student = students.find(s => s.id === fAlumno);
    const newCuota: Cuota = {
      id: crypto.randomUUID(),
      alumno_id: fAlumno,
      monto: parseFloat(fMonto),
      fecha_pago: fFechaPago || null,
      fecha_vencimiento: fFechaVenc,
      periodo: fPeriodo,
      metodo_pago: fMetodo || null,
      estado: calcEstadoCuota(fFechaVenc, fFechaPago || null),
      notas: fNotas || null,
      students: student ? { full_name: student.full_name, phone: student.phone } : null,
    };
    setCuotas(prev => [newCuota, ...prev]);

    if (fAbrirWA && fFechaPago && student?.phone) {
      const tpl = DEFAULT_TEMPLATES['cobro'] ?? '';
      const proxDate = new Date(fFechaVenc.slice(0, 10) + 'T00:00:00');
      proxDate.setMonth(proxDate.getMonth() + 1);
      const msg = buildMensaje(tpl, {
        nombre: student.full_name,
        monto: formatMonto(parseFloat(fMonto)),
        fecha_vencimiento: formatFecha(fFechaVenc),
        proxima_fecha: formatFecha(proxDate.toISOString().slice(0, 10)),
      });
      window.open(generarEnlaceWA(student.phone, msg), '_blank');
    }

    // Reset
    setFAlumno('');
    setFMonto('');
    setFFechaPago('');
    setFFechaVenc('');
    setFPeriodo(currentMonthStr());
    setFMetodo('');
    setFNotas('');
    setFAbrirWA(false);
    setShowRegistrarModal(false);
  }

  async function handleCobrarRapido() {
    if (!cobrarTarget) return;
    setCobrarSaving(true);
    const result = await updateCuotaEstado(cobrarTarget.id, 'pagado', cFechaPago);
    setCobrarSaving(false);
    if (result.error) return;
    setCuotas(prev =>
      prev.map(c =>
        c.id === cobrarTarget.id
          ? { ...c, estado: 'pagado', fecha_pago: cFechaPago, metodo_pago: cMetodo }
          : c
      )
    );
    setShowCobrarModal(false);
    setCobrarTarget(null);
  }

  function openCobrarModal(cuota: Cuota) {
    setCobrarTarget(cuota);
    setCFechaPago(todayStr());
    setCMetodo('efectivo');
    setShowCobrarModal(true);
  }

  function openEditModal(cuota: Cuota) {
    setEditTarget(cuota);
    setEditMonto(String(cuota.monto));
    setEditPeriodo(cuota.periodo);
    setEditFechaVenc(cuota.fecha_vencimiento);
    setEditFechaPago(cuota.fecha_pago ?? todayStr());
    setEditMetodo(cuota.metodo_pago ?? '');
    setEditEstado(cuota.estado);
    setEditError('');
    setShowEditModal(true);
  }

  async function handleEditSave() {
    if (!editTarget) return;
    if (!editMonto || !editPeriodo || !editFechaVenc) {
      setEditError('Completá los campos obligatorios.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    const result = await updateCuota(editTarget.id, {
      monto: parseFloat(editMonto),
      periodo: editPeriodo,
      fecha_vencimiento: editFechaVenc,
      fecha_pago: editFechaPago || null,
      metodo_pago: editMetodo || null,
      estado: editEstado,
    });
    setEditSaving(false);
    if (result.error) { setEditError(result.error); return; }
    setCuotas(prev =>
      prev.map(c =>
        c.id === editTarget.id
          ? { ...c, monto: parseFloat(editMonto), periodo: editPeriodo, fecha_vencimiento: editFechaVenc, fecha_pago: editFechaPago || null, metodo_pago: editMetodo || null, estado: editEstado }
          : c
      )
    );
    setShowEditModal(false);
    setEditTarget(null);
  }

  function openDeleteModal(cuota: Cuota) {
    setDeleteTarget(cuota);
    setShowDeleteModal(true);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    const result = await deleteCuota(deleteTarget.id);
    setDeleteSaving(false);
    if (result.error) return;
    setCuotas(prev => prev.filter(c => c.id !== deleteTarget.id));
    setShowDeleteModal(false);
    setDeleteTarget(null);
  }

  function openWA(cuota: Cuota, tipo: string = 'vencimiento') {
    const tel = cuota.students?.phone ?? '';
    if (!tel) return;
    const tpl = DEFAULT_TEMPLATES[tipo] ?? DEFAULT_TEMPLATES['vencimiento'] ?? '';
    const proxDate = new Date(cuota.fecha_vencimiento.slice(0, 10) + 'T00:00:00');
    proxDate.setMonth(proxDate.getMonth() + 1);
    const msg = buildMensaje(tpl, {
      nombre: cuota.students?.full_name ?? '',
      monto: formatMonto(cuota.monto),
      fecha_vencimiento: formatFecha(cuota.fecha_vencimiento),
      proxima_fecha: formatFecha(proxDate.toISOString().slice(0, 10)),
    });
    window.open(generarEnlaceWA(tel, msg), '_blank');
    void logWhatsappMensaje({
      alumno_id: cuota.alumno_id,
      tipo_mensaje: tipo,
      contenido: msg,
    });
  }

  function buildComposerMsg(cuota: Cuota, tipo: string): string {
    if (tipo === 'personalizado') return '';
    const tpl = getPlantillaContent(tipo);
    const proxDate = new Date(cuota.fecha_vencimiento.slice(0, 10) + 'T00:00:00');
    proxDate.setMonth(proxDate.getMonth() + 1);
    const proxima_fecha = formatFecha(proxDate.toISOString().slice(0, 10));
    return buildMensaje(tpl, {
      nombre: cuota.students?.full_name ?? '',
      monto: formatMonto(cuota.monto),
      fecha_vencimiento: formatFecha(cuota.fecha_vencimiento),
      proxima_fecha,
    });
  }

  function openWAComposer(cuota: Cuota, tipo: string = 'vencimiento') {
    setWaComposerCuota(cuota);
    setWaComposerTipo(tipo);
    setWaComposerMsg(buildComposerMsg(cuota, tipo));
    setWaComposerCopied(false);
    setShowWAComposer(true);
  }

  function handleComposerTipo(tipo: string) {
    setWaComposerTipo(tipo);
    if (waComposerCuota) setWaComposerMsg(buildComposerMsg(waComposerCuota, tipo));
  }

  function insertComposerVar(variable: string) {
    const ta = waComposerTARef.current;
    if (!ta) { setWaComposerMsg(prev => prev + variable); return; }
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = waComposerMsg.slice(0, s) + variable + waComposerMsg.slice(e);
    setWaComposerMsg(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + variable.length, s + variable.length); });
  }

  async function handleWAComposerSend() {
    if (!waComposerCuota) return;
    const tel = waComposerCuota.students?.phone ?? '';
    if (!tel) return;
    window.open(generarEnlaceWA(tel, waComposerMsg), '_blank');
    void logWhatsappMensaje({ alumno_id: waComposerCuota.alumno_id, tipo_mensaje: waComposerTipo, contenido: waComposerMsg });
    setWaMensajes(prev => [{
      id: crypto.randomUUID(),
      alumno_id: waComposerCuota.alumno_id,
      tipo_mensaje: waComposerTipo,
      contenido: waComposerMsg,
      fecha_envio: new Date().toISOString(),
      estado: 'enviado',
      students: { full_name: waComposerCuota.students?.full_name ?? '' },
    }, ...prev]);
    setShowWAComposer(false);
  }

  // ─── Vencimientos Tab Data ──────────────────────────────────────────────────

  const cuotasVencidas = Array.from(latestByStudent.values()).filter(c => c.estado === 'vencido');
  const cuotasProximas7 = cuotas.filter(c => {
    if (c.estado !== 'pendiente') return false;
    const dias = diasHastaVencimiento(c.fecha_vencimiento);
    return dias >= 0 && dias <= 7;
  });

  // ─── WhatsApp Tab ──────────────────────────────────────────────────────────

  const waStudent = students.find(s => s.id === waAlumno);
  const waLatestCuota = waStudent ? latestByStudent.get(waStudent.id) : undefined;

  function getWaPreviewText(): string {
    if (waTipo === 'personalizado') return waCustom;
    const tpl = DEFAULT_TEMPLATES[waTipo] ?? '';
    const proxima_fecha = (() => {
      if (!waLatestCuota) return '{proxima_fecha}';
      const d = new Date(waLatestCuota.fecha_vencimiento.slice(0, 10) + 'T00:00:00');
      d.setMonth(d.getMonth() + 1);
      return formatFecha(d.toISOString().slice(0, 10));
    })();
    return buildMensaje(tpl, {
      nombre: waStudent?.full_name ?? '{nombre}',
      monto: waLatestCuota ? formatMonto(waLatestCuota.monto) : '{monto}',
      fecha_vencimiento: waLatestCuota ? formatFecha(waLatestCuota.fecha_vencimiento) : '{fecha_vencimiento}',
      proxima_fecha,
    });
  }

  async function handleWAEnviar() {
    if (!waStudent?.phone) return;
    const msg = getWaPreviewText();
    window.open(generarEnlaceWA(waStudent.phone, msg), '_blank');
    const result = await logWhatsappMensaje({
      alumno_id: waAlumno,
      tipo_mensaje: waTipo,
      contenido: msg,
    });
    if (!result.error) {
      setWaMensajes(prev => [
        {
          id: crypto.randomUUID(),
          alumno_id: waAlumno,
          tipo_mensaje: waTipo,
          contenido: msg,
          fecha_envio: new Date().toISOString(),
          estado: 'enviado',
          students: { full_name: waStudent.full_name },
        },
        ...prev,
      ]);
    }
  }

  function insertVar(variable: string) {
    if (waTipo !== 'personalizado') return;
    const ta = waTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = waCustom.slice(0, start);
    const after = waCustom.slice(end);
    setWaCustom(before + variable + after);
  }

  // ─── Historial Tab ─────────────────────────────────────────────────────────

  const historialCuotas = cuotas.filter(c => c.periodo === histMes);
  const historialTotal = historialCuotas
    .filter(c => c.estado === 'pagado')
    .reduce((sum, c) => sum + c.monto, 0);

  const last12Months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(currentYear, currentMonth - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    last12Months.push(`${d.getFullYear()}-${mm}`);
  }

  function exportCSV() {
    const headers = ['Fecha Pago', 'Alumno', 'Período', 'Monto', 'Método', 'Estado', 'Notas'];
    const rows = historialCuotas.map(c => [
      c.fecha_pago ? formatFecha(c.fecha_pago) : '—',
      c.students?.full_name ?? '',
      c.periodo,
      String(c.monto),
      c.metodo_pago ?? '',
      c.estado,
      c.notas ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finanzas-${histMes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Config Handlers ───────────────────────────────────────────────────────

  async function handleSaveConfig() {
    setCfgSaving(true);
    setCfgError('');
    const result = await upsertConfigRecordatorios({
      dias_antes_vencimiento: cfgDias,
      recordatorio_dia_vencimiento: cfgDiaVenc,
      recordatorio_post_24h: cfgPost24,
      recordatorio_post_48h: cfgPost48,
      recordatorio_post_72h: cfgPost72,
      dias_habiles: cfgHabiles,
    });
    setCfgSaving(false);
    if (result.error) setCfgError(result.error);
  }

  async function handleSavePlantillas() {
    setTplSaving(true);
    setTplError('');
    const tiposContenidos: Array<[string, string, string]> = [
      ['vencimiento', 'Recordatorio de vencimiento', tplVencimiento],
      ['vencido', 'Cuota vencida', tplVencido],
      ['cobro', 'Confirmación de cobro', tplCobro],
      ['bienvenida', 'Bienvenida', tplBienvenida],
      ['rutina', 'Nueva rutina', tplRutina],
    ];
    for (const [tipo, nombre, contenido] of tiposContenidos) {
      const result = await upsertPlantilla(tipo, nombre, contenido);
      if (result.error) {
        setTplError(result.error);
        setTplSaving(false);
        return;
      }
    }
    setTplSaving(false);
    setPlantillas([
      { id: crypto.randomUUID(), tipo: 'vencimiento', nombre: 'Recordatorio de vencimiento', contenido: tplVencimiento },
      { id: crypto.randomUUID(), tipo: 'vencido', nombre: 'Cuota vencida', contenido: tplVencido },
      { id: crypto.randomUUID(), tipo: 'cobro', nombre: 'Confirmación de cobro', contenido: tplCobro },
      { id: crypto.randomUUID(), tipo: 'bienvenida', nombre: 'Bienvenida', contenido: tplBienvenida },
      { id: crypto.randomUUID(), tipo: 'rutina', nombre: 'Nueva rutina', contenido: tplRutina },
    ]);
  }

  function toggleDiaHabil(dia: number) {
    setCfgHabiles(prev =>
      prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]
    );
  }

  // ─── Student rows for Tab 1 ────────────────────────────────────────────────

  const studentRows = students.map(s => {
    const latest = latestByStudent.get(s.id);
    return { student: s, cuota: latest ?? null };
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  const tabs: Array<{ key: typeof activeTab; label: string }> = [
    { key: 'cobros', label: 'Cobros' },
    { key: 'vencimientos', label: 'Vencimientos' },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'historial', label: 'Historial' },
    { key: 'configuracion', label: 'Configuración' },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="chart-tabs" style={{ marginBottom: '24px' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`chart-tab${activeTab === t.key ? ' active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: COBROS ────────────────────────────────────────────────── */}
      {activeTab === 'cobros' && (
        <div>
          {/* KPI Row */}
          <div className="metrics-row" style={{ marginBottom: '24px' }}>
            <div className="metric">
              <div className="label-caps">Cobrado este mes</div>
              <div className="metric-value">{formatMonto(cobradoEsteMes)}</div>
            </div>
            <div className="metric">
              <div className="label-caps">Pendiente de cobro</div>
              <div className="metric-value">{formatMonto(pendienteCobro)}</div>
            </div>
            <div className="metric">
              <div className="label-caps">Alumnos al día</div>
              <div className="metric-value">{alumnosAlDia}</div>
            </div>
            <div className="metric">
              <div className="label-caps">Vencidos / por vencer</div>
              <div className="metric-value">{vencidosPorVencer}</div>
            </div>
          </div>

          {/* Alert banners */}
          <AlertaBanner vencidos={vencidosCount} proximos={proximos7.length} />

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button className="btn btn-primary" onClick={() => setShowRegistrarModal(true)}>
              + Registrar pago
            </button>
          </div>

          {/* Student table */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">Estado de pagos por alumno</div>
              <div className="card-subtitle">{students.length} alumnos activos</div>
            </div>
            <div className="card-body">
              {studentRows.length === 0 ? (
                <div className="empty-state">No hay alumnos activos</div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Alumno</th>
                        <th>Próximo vencimiento</th>
                        <th>Estado</th>
                        <th>Monto</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentRows.map(({ student, cuota }) => (
                        <tr key={student.id}>
                          <td>{student.full_name}</td>
                          <td>
                            {cuota
                              ? formatFecha(cuota.fecha_vencimiento)
                              : <span style={{ color: 'var(--text-muted, #94a3b8)' }}>Sin cuota</span>}
                          </td>
                          <td>
                            {cuota ? <StatusBadge estado={cuota.estado} /> : '—'}
                          </td>
                          <td>
                            {cuota ? formatMonto(cuota.monto) : '—'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              {cuota && cuota.estado !== 'pagado' && (
                                <button
                                  className="btn btn-outline"
                                  style={{ fontSize: '12px', padding: '4px 10px' }}
                                  onClick={() => openCobrarModal(cuota)}
                                >
                                  Cobrar
                                </button>
                              )}
                              {student.phone && cuota && (
                                <button
                                  className="btn btn-ghost"
                                  style={{ fontSize: '12px', padding: '4px 10px' }}
                                  onClick={() => openWAComposer(cuota, cuota.estado === 'vencido' ? 'vencido' : 'vencimiento')}
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-label="WhatsApp">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                  </svg>
                                </button>
                              )}
                              {cuota && (
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '4px 7px', color: '#94a3b8' }}
                                  title="Editar"
                                  onClick={() => openEditModal(cuota)}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                              )}
                              {cuota && (
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '4px 7px', color: '#ef4444' }}
                                  title="Eliminar"
                                  onClick={() => openDeleteModal(cuota)}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: VENCIMIENTOS ──────────────────────────────────────────── */}
      {activeTab === 'vencimientos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Vencidos */}
          <div className="card">
            <div
              className="card-head"
              style={{ borderLeft: '4px solid #ef4444', paddingLeft: '16px' }}
            >
              <div className="card-title" style={{ color: '#ef4444' }}>
                Vencidos — Acción Urgente
              </div>
              <div className="card-subtitle">{cuotasVencidas.length} cuota{cuotasVencidas.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="card-body">
              {cuotasVencidas.length === 0 ? (
                <div className="empty-state">No hay cuotas vencidas</div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Alumno</th>
                        <th>Venció</th>
                        <th>Días atrás</th>
                        <th>Monto</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuotasVencidas.map(c => {
                        const diasAtras = Math.abs(diasHastaVencimiento(c.fecha_vencimiento));
                        return (
                          <tr key={c.id}>
                            <td>{c.students?.full_name ?? '—'}</td>
                            <td>{formatFecha(c.fecha_vencimiento)}</td>
                            <td>
                              <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                hace {diasAtras} día{diasAtras !== 1 ? 's' : ''}
                              </span>
                            </td>
                            <td>{formatMonto(c.monto)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <button
                                  className="btn btn-outline"
                                  style={{ fontSize: '12px', padding: '4px 10px' }}
                                  onClick={() => openCobrarModal(c)}
                                >
                                  Cobrar
                                </button>
                                {c.students?.phone && (
                                  <button
                                    className="btn btn-ghost"
                                    style={{ fontSize: '12px', padding: '4px 8px', color: WA_GREEN }}
                                    title="Enviar WhatsApp"
                                    onClick={() => openWAComposer(c, 'vencido')}
                                  >
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                  </button>
                                )}
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '4px 7px', color: '#94a3b8' }}
                                  title="Editar"
                                  onClick={() => openEditModal(c)}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '4px 7px', color: '#ef4444' }}
                                  title="Eliminar"
                                  onClick={() => openDeleteModal(c)}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Próximos 7 días */}
          <div className="card">
            <div
              className="card-head"
              style={{ borderLeft: '4px solid #f97316', paddingLeft: '16px' }}
            >
              <div className="card-title" style={{ color: '#f97316' }}>
                Próximos 7 días
              </div>
              <div className="card-subtitle">{cuotasProximas7.length} cuota{cuotasProximas7.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="card-body">
              {cuotasProximas7.length === 0 ? (
                <div className="empty-state">No hay cuotas próximas a vencer</div>
              ) : (
                <>
                  <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-outline"
                      onClick={() => {
                        const first = cuotasProximas7.at(0);
                        if (first) openWA(first, 'vencimiento');
                      }}
                    >
                      Enviar recordatorio masivo ({cuotasProximas7.length})
                    </button>
                  </div>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Alumno</th>
                          <th>Vencimiento</th>
                          <th>Días restantes</th>
                          <th>Monto</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cuotasProximas7.map(c => {
                          const dias = diasHastaVencimiento(c.fecha_vencimiento);
                          return (
                            <tr key={c.id}>
                              <td>{c.students?.full_name ?? '—'}</td>
                              <td>{formatFecha(c.fecha_vencimiento)}</td>
                              <td>
                                <span style={{ color: '#f97316', fontWeight: 600 }}>
                                  {dias === 0 ? 'hoy' : `en ${dias} día${dias !== 1 ? 's' : ''}`}
                                </span>
                              </td>
                              <td>{formatMonto(c.monto)}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  {c.students?.phone && (
                                    <button
                                      className="btn btn-ghost"
                                      style={{ fontSize: '12px', padding: '4px 8px', color: WA_GREEN }}
                                      title="Enviar WhatsApp"
                                      onClick={() => openWAComposer(c, 'vencimiento')}
                                    >
                                      <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                    </button>
                                  )}
                                  <button
                                    className="btn btn-ghost"
                                    style={{ padding: '4px 7px', color: '#94a3b8' }}
                                    title="Editar"
                                    onClick={() => openEditModal(c)}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                  <button
                                    className="btn btn-ghost"
                                    style={{ padding: '4px 7px', color: '#ef4444' }}
                                    title="Eliminar"
                                    onClick={() => openDeleteModal(c)}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: WHATSAPP ──────────────────────────────────────────────── */}
      {activeTab === 'whatsapp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Envío Individual */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">Envío Individual</div>
            </div>
            <div className="card-body card-body--padded">
              <div className="form-row">
                <div className="form-group">
                  <label className="label">Alumno</label>
                  <select
                    className="select"
                    value={waAlumno}
                    onChange={e => setWaAlumno(e.target.value)}
                  >
                    <option value="">Seleccionar alumno...</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}{s.phone ? ` — ${s.phone}` : ' (sin teléfono)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Tipo de mensaje</label>
                  <select
                    className="select"
                    value={waTipo}
                    onChange={e => setWaTipo(e.target.value)}
                  >
                    <option value="vencimiento">Recordatorio de vencimiento</option>
                    <option value="cobro">Confirmación de cobro</option>
                    <option value="bienvenida">Bienvenida</option>
                    <option value="rutina">Nueva rutina</option>
                    <option value="personalizado">Personalizado</option>
                  </select>
                </div>
              </div>

              {waTipo === 'personalizado' && (
                <div className="form-group">
                  <label className="label">Variables disponibles</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {['{nombre}', '{fecha_vencimiento}', '{monto}', '{proxima_fecha}'].map(v => (
                      <button
                        key={v}
                        className="btn btn-ghost"
                        style={{ fontSize: '12px', padding: '2px 8px', fontFamily: 'monospace' }}
                        onClick={() => insertVar(v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <textarea
                    ref={waTextareaRef}
                    className="input"
                    rows={4}
                    value={waCustom}
                    onChange={e => setWaCustom(e.target.value)}
                    placeholder="Escribí tu mensaje personalizado..."
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
              )}

              {/* WA Preview bubble */}
              {waAlumno && (
                <div className="form-group">
                  <label className="label">Vista previa</label>
                  <div
                    style={{
                      background: '#e5ddd5',
                      borderRadius: '8px',
                      padding: '16px',
                      minHeight: '80px',
                    }}
                  >
                    <div
                      style={{
                        background: '#dcf8c6',
                        borderRadius: '8px 8px 0 8px',
                        padding: '10px 14px',
                        maxWidth: '80%',
                        marginLeft: 'auto',
                        color: '#303030',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {getWaPreviewText() || '(mensaje vacío)'}
                      <div style={{ fontSize: '11px', color: '#667781', textAlign: 'right', marginTop: '4px' }}>
                        {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(getWaPreviewText());
                    setWaCopied(true);
                    setTimeout(() => setWaCopied(false), 2000);
                  }}
                  disabled={!waAlumno}
                >
                  {waCopied ? '¡Copiado!' : 'Copiar texto'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => void handleWAEnviar()}
                  disabled={!waAlumno || !waStudent?.phone}
                >
                  Enviar a WhatsApp
                </button>
              </div>
              {waAlumno && !waStudent?.phone && (
                <p style={{ color: '#f97316', fontSize: '13px', marginTop: '8px' }}>
                  Este alumno no tiene teléfono registrado.
                </p>
              )}
            </div>
          </div>

          {/* Historial de mensajes */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">Historial de mensajes</div>
              <div className="card-subtitle">{waMensajes.length} mensajes</div>
            </div>
            <div className="card-body">
              {waMensajes.length === 0 ? (
                <div className="empty-state">No hay mensajes enviados aún</div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha / Hora</th>
                        <th>Alumno</th>
                        <th>Tipo</th>
                        <th>Estado</th>
                        <th>Mensaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waMensajes.map(m => (
                        <tr key={m.id}>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '13px' }}>{formatFechaHora(m.fecha_envio)}</td>
                          <td>{m.students?.full_name ?? '—'}</td>
                          <td style={{ fontSize: '12px', textTransform: 'capitalize' }}>{m.tipo_mensaje}</td>
                          <td><StatusBadge estado={m.estado} /></td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.contenido.slice(0, 80)}{m.contenido.length > 80 ? '…' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: HISTORIAL ─────────────────────────────────────────────── */}
      {activeTab === 'historial' && (
        <div>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Historial de cobros</div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <select
                  className="select"
                  style={{ width: 'auto', minWidth: '160px' }}
                  value={histMes}
                  onChange={e => setHistMes(e.target.value)}
                >
                  {last12Months.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button className="btn btn-outline" onClick={exportCSV}>
                  Exportar CSV
                </button>
              </div>
            </div>
            <div className="card-body">
              {historialCuotas.length === 0 ? (
                <div className="empty-state">No hay cuotas para el período {histMes}</div>
              ) : (
                <>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Fecha pago</th>
                          <th>Alumno</th>
                          <th>Período</th>
                          <th>Monto</th>
                          <th>Método</th>
                          <th>Estado</th>
                          <th>Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historialCuotas.map(c => (
                          <tr key={c.id}>
                            <td>{c.fecha_pago ? formatFecha(c.fecha_pago) : '—'}</td>
                            <td>{c.students?.full_name ?? '—'}</td>
                            <td>{fmtPeriodo(c.periodo)}</td>
                            <td>{formatMonto(c.monto)}</td>
                            <td>{c.metodo_pago ? <MetodoTag metodo={c.metodo_pago} /> : '—'}</td>
                            <td><StatusBadge estado={c.estado} /></td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>
                              {c.notas ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div
                    style={{
                      padding: '16px',
                      borderTop: '1px solid var(--border, rgba(255,255,255,0.08))',
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '12px',
                      alignItems: 'center',
                    }}
                  >
                    <span className="label-caps">Total cobrado ({histMes})</span>
                    <span className="metric-value" style={{ fontSize: '20px' }}>
                      {formatMonto(historialTotal)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: CONFIGURACIÓN ─────────────────────────────────────────── */}
      {activeTab === 'configuracion' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Moneda */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">Moneda</div>
              <div className="card-subtitle">Se aplica a todos los montos en la app</div>
            </div>
            <div className="card-body card-body--padded">
              <div className="form-group">
                <label className="label">País / Moneda</label>
                <select
                  className="select"
                  style={{ maxWidth: '320px' }}
                  value={currencyLocale}
                  onChange={e => saveLocale(e.target.value)}
                >
                  {Object.entries(LOCALE_DATA).map(([key, d]) => (
                    <option key={key} value={key}>{d.label}</option>
                  ))}
                </select>
              </div>
              <p style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
                Símbolo actual: <strong style={{ color: '#ccc' }}>{(LOCALE_DATA[currencyLocale] ?? LOCALE_DATA['es-AR']!).symbol}</strong>
              </p>
            </div>
          </div>

          {/* Recordatorios */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">Recordatorios Automáticos</div>
            </div>
            <div className="card-body card-body--padded">
              <div className="form-group">
                <label className="label">Días antes para avisar</label>
                <select
                  className="select"
                  style={{ width: 'auto', minWidth: '120px' }}
                  value={String(cfgDias)}
                  onChange={e => setCfgDias(parseInt(e.target.value, 10))}
                >
                  <option value="3">3 días</option>
                  <option value="5">5 días</option>
                  <option value="7">7 días</option>
                </select>
              </div>

              <div className="form-group">
                <label className="label">Enviar recordatorio</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { key: 'dia', label: 'El día del vencimiento', val: cfgDiaVenc, set: setCfgDiaVenc },
                    { key: '24h', label: '24h después del vencimiento', val: cfgPost24, set: setCfgPost24 },
                    { key: '48h', label: '48h después del vencimiento', val: cfgPost48, set: setCfgPost48 },
                    { key: '72h', label: '72h después del vencimiento', val: cfgPost72, set: setCfgPost72 },
                  ].map(item => (
                    <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={item.val}
                        onChange={e => item.set(e.target.checked)}
                        style={{ width: '16px', height: '16px' }}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="label">Días hábiles de envío</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { n: 1, l: 'L' },
                    { n: 2, l: 'M' },
                    { n: 3, l: 'X' },
                    { n: 4, l: 'J' },
                    { n: 5, l: 'V' },
                    { n: 6, l: 'S' },
                    { n: 7, l: 'D' },
                  ].map(d => (
                    <button
                      key={d.n}
                      onClick={() => toggleDiaHabil(d.n)}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        border: '2px solid',
                        borderColor: cfgHabiles.includes(d.n)
                          ? 'var(--accent, #6366f1)'
                          : 'var(--border, rgba(255,255,255,0.12))',
                        background: cfgHabiles.includes(d.n)
                          ? 'var(--accent, #6366f1)'
                          : 'transparent',
                        color: cfgHabiles.includes(d.n) ? '#fff' : 'var(--text-muted, #94a3b8)',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '13px',
                      }}
                    >
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>

              {cfgError && (
                <p style={{ color: '#ef4444', fontSize: '13px' }}>{cfgError}</p>
              )}
              <button
                className="btn btn-primary"
                onClick={() => void handleSaveConfig()}
                disabled={cfgSaving}
              >
                {cfgSaving ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          </div>

          {/* Plantillas */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">Plantillas de Mensajes</div>
              <div className="card-subtitle">Usá las variables para personalizar el mensaje</div>
            </div>
            <div className="card-body card-body--padded">
              {[
                { tipo: 'vencimiento', label: 'Recordatorio de vencimiento', val: tplVencimiento, set: setTplVencimiento },
                { tipo: 'vencido', label: 'Cuota vencida', val: tplVencido, set: setTplVencido },
                { tipo: 'cobro', label: 'Confirmación de cobro', val: tplCobro, set: setTplCobro },
                { tipo: 'bienvenida', label: 'Bienvenida', val: tplBienvenida, set: setTplBienvenida },
                { tipo: 'rutina', label: 'Nueva rutina', val: tplRutina, set: setTplRutina },
              ].map(item => (
                <div key={item.tipo} className="form-group" style={{ marginBottom: '20px' }}>
                  <label className="label">{item.label}</label>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    {['{nombre}', '{fecha_vencimiento}', '{monto}', '{proxima_fecha}'].map(v => (
                      <button
                        key={v}
                        className="btn btn-ghost"
                        style={{ fontSize: '11px', padding: '2px 6px', fontFamily: 'monospace' }}
                        onClick={() => item.set(prev => prev + v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="input"
                    rows={3}
                    value={item.val}
                    onChange={e => item.set(e.target.value)}
                    style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '13px' }}
                  />
                </div>
              ))}

              {tplError && (
                <p style={{ color: '#ef4444', fontSize: '13px' }}>{tplError}</p>
              )}
              <button
                className="btn btn-primary"
                onClick={() => void handleSavePlantillas()}
                disabled={tplSaving}
              >
                {tplSaving ? 'Guardando...' : 'Guardar plantillas'}
              </button>
            </div>
          </div>

          {/* WhatsApp Integration info */}
          <div className="card">
            <div className="card-head">
              <div className="card-title">Integración WhatsApp</div>
            </div>
            <div className="card-body card-body--padded">
              <div
                style={{
                  padding: '16px',
                  border: '1px solid var(--border, rgba(255,255,255,0.08))',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <div className="label-caps" style={{ marginBottom: '6px' }}>Modo actual</div>
                <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>WhatsApp Web (wa.me/)</div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted, #94a3b8)', margin: 0 }}>
                  Los mensajes se abren directamente en WhatsApp Web o la app móvil. No requiere configuración adicional.
                  Cada envío abre una nueva ventana con el mensaje prellenado.
                </p>
              </div>
              <div
                style={{
                  padding: '16px',
                  border: '1px solid var(--border, rgba(255,255,255,0.08))',
                  borderRadius: '8px',
                  opacity: 0.6,
                }}
              >
                <div className="label-caps" style={{ marginBottom: '6px' }}>WhatsApp Business API (próximamente)</div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted, #94a3b8)', margin: 0 }}>
                  Permite envío automatizado sin intervención manual, plantillas aprobadas por Meta,
                  y reportes de entrega. Requiere una cuenta de WhatsApp Business verificada y configuración de API.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Registrar Pago ─────────────────────────────────────────── */}
      {showRegistrarModal && (
        <div className="modal-overlay" onClick={() => setShowRegistrarModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px', width: '100%' }}>
            <div className="modal-header">
              <div className="card-title">Registrar pago</div>
              <button
                className="btn btn-ghost"
                onClick={() => setShowRegistrarModal(false)}
                style={{ padding: '4px 8px' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Alumno *</label>
                <select
                  className="select"
                  value={fAlumno}
                  onChange={e => setFAlumno(e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="label">Monto *</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={fMonto}
                    onChange={e => setFMonto(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label className="label">Período *</label>
                  <input
                    className="input"
                    type="month"
                    value={fPeriodo}
                    onChange={e => setFPeriodo(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="label">Fecha de pago</label>
                  <input
                    className="input"
                    type="date"
                    value={fFechaPago}
                    onChange={e => setFFechaPago(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Fecha de vencimiento *</label>
                  <input
                    className="input"
                    type="date"
                    value={fFechaVenc}
                    onChange={e => setFFechaVenc(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Método de pago</label>
                <select
                  className="select"
                  value={fMetodo}
                  onChange={e => setFMetodo(e.target.value)}
                >
                  <option value="">Sin especificar</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="yape_plin">Yape/Plin</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta_debito">Tarjeta débito</option>
                  <option value="tarjeta_credito">Tarjeta crédito</option>
                  <option value="mercado_pago">Mercado Pago</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Notas</label>
                <input
                  className="input"
                  type="text"
                  value={fNotas}
                  onChange={e => setFNotas(e.target.value)}
                  placeholder="Observaciones opcionales"
                />
              </div>
              {fFechaPago && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={fAbrirWA}
                    onChange={e => setFAbrirWA(e.target.checked)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  Abrir WhatsApp para confirmar el cobro
                </label>
              )}
              {fError && (
                <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px' }}>{fError}</p>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowRegistrarModal(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void handleRegistrarPago()}
                disabled={fSaving}
              >
                {fSaving ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: WA Composer ───────────────────────────────────────────── */}
      {showWAComposer && waComposerCuota && (
        <div className="modal-overlay" onClick={() => setShowWAComposer(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', width: '100%' }}>

            {/* Header */}
            <div className="modal-header" style={{ borderBottom: '1px solid #1e1e1e', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: WA_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {waComposerCuota.students?.full_name ?? 'Alumno'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
                    {waComposerCuota.students?.phone ?? 'Sin teléfono'} · <StatusBadge estado={waComposerCuota.estado} />
                  </div>
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => setShowWAComposer(false)} style={{ padding: '4px 8px', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* Template chips */}
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: '10px' }}>
                  Tipo de mensaje
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {WA_COMPOSER_TYPES.map(t => {
                    const active = waComposerTipo === t.tipo;
                    return (
                      <button
                        key={t.tipo}
                        onClick={() => handleComposerTipo(t.tipo)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '6px 13px', borderRadius: '20px', cursor: 'pointer',
                          border: `1px solid ${active ? WA_GREEN : '#2a2a2a'}`,
                          background: active ? 'rgba(37,211,102,0.1)' : '#161616',
                          color: active ? WA_GREEN : '#666',
                          fontSize: '12px', fontWeight: 600,
                          transition: 'all 0.15s',
                        }}
                      >
                        <WaChipIcon tipo={t.tipo} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* WA Preview */}
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: '10px' }}>
                  Vista previa
                </div>
                <div style={{ background: '#e5ddd5', borderRadius: '10px', padding: '16px', minHeight: '72px' }}>
                  <div style={{
                    background: '#dcf8c6', borderRadius: '8px 8px 0 8px',
                    padding: '10px 14px', maxWidth: '88%', marginLeft: 'auto',
                    color: '#111', fontSize: '13.5px', lineHeight: '1.55',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {waComposerMsg || <span style={{ color: '#aaa', fontStyle: 'italic' }}>El mensaje aparecerá aquí…</span>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px', marginTop: '5px' }}>
                      <span style={{ fontSize: '11px', color: '#667781' }}>
                        {new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <svg viewBox="0 0 18 11" width="18" height="11" fill="#53bdeb">
                        <path d="M17.394.614a.5.5 0 0 0-.707 0l-8.04 8.04-2.04-2.04a.5.5 0 1 0-.707.707l2.394 2.393a.5.5 0 0 0 .707 0L17.394 1.32a.5.5 0 0 0 0-.707zM13.394.614a.5.5 0 0 0-.707 0L5.354 8.348l-.354-.353a.5.5 0 1 0-.707.707l.708.707a.5.5 0 0 0 .707 0l7.686-7.688a.5.5 0 0 0 0-.707z"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Editor */}
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: '8px' }}>
                  Editar mensaje
                </div>
                <textarea
                  ref={waComposerTARef}
                  className="input"
                  rows={5}
                  value={waComposerMsg}
                  onChange={e => setWaComposerMsg(e.target.value)}
                  placeholder="Escribí tu mensaje aquí…"
                  style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.55', fontSize: '13px' }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#444' }}>Insertar variable:</span>
                  {['{nombre}', '{monto}', '{fecha_vencimiento}', '{proxima_fecha}'].map(v => (
                    <button
                      key={v}
                      className="btn btn-ghost"
                      style={{ fontSize: '11px', padding: '2px 8px', fontFamily: 'monospace', color: '#888', border: '1px solid #2a2a2a', borderRadius: '4px' }}
                      onClick={() => insertComposerVar(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {!waComposerCuota.students?.phone && (
                <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', fontSize: '13px', color: '#ef4444' }}>
                  Este alumno no tiene teléfono registrado — no se puede enviar por WhatsApp.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowWAComposer(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-outline"
                onClick={() => {
                  void navigator.clipboard.writeText(waComposerMsg);
                  setWaComposerCopied(true);
                  setTimeout(() => setWaComposerCopied(false), 2000);
                }}
                disabled={!waComposerMsg}
              >
                {waComposerCopied ? '¡Copiado!' : 'Copiar texto'}
              </button>
              <button
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '8px 18px', borderRadius: '6px', border: 'none',
                  background: waComposerCuota.students?.phone ? WA_GREEN : '#333',
                  color: waComposerCuota.students?.phone ? '#fff' : '#666',
                  fontWeight: 700, fontSize: '13px', cursor: waComposerCuota.students?.phone ? 'pointer' : 'not-allowed',
                }}
                disabled={!waComposerCuota.students?.phone || !waComposerMsg}
                onClick={() => void handleWAComposerSend()}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Enviar a WhatsApp
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── MODAL: Editar Cuota ──────────────────────────────────────────── */}
      {showEditModal && editTarget && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', width: '100%' }}>
            <div className="modal-header">
              <div className="card-title">Editar cuota — {editTarget.students?.full_name}</div>
              <button className="btn btn-ghost" onClick={() => setShowEditModal(false)} style={{ padding: '4px 8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="label">Monto *</label>
                  <input className="input" type="number" min="0" step="0.01" value={editMonto} onChange={e => setEditMonto(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label">Período *</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                      className="select"
                      style={{ flex: 1 }}
                      value={editPeriodo.split('-')[1] ?? '01'}
                      onChange={e => setEditPeriodo(`${editPeriodo.split('-')[0]}-${e.target.value}`)}
                    >
                      {MESES_FULL.map((m, i) => (
                        <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                      ))}
                    </select>
                    <select
                      className="select"
                      style={{ width: '90px' }}
                      value={editPeriodo.split('-')[0] ?? String(new Date().getFullYear())}
                      onChange={e => setEditPeriodo(`${e.target.value}-${editPeriodo.split('-')[1] ?? '01'}`)}
                    >
                      {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="label">Vencimiento *</label>
                  <input className="input" type="date" value={editFechaVenc} onChange={e => setEditFechaVenc(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="label">Fecha de pago</label>
                  <input className="input" type="date" value={editFechaPago} onChange={e => setEditFechaPago(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="label">Método de pago</label>
                  <select className="select" value={editMetodo} onChange={e => setEditMetodo(e.target.value)}>
                    <option value="">Sin especificar</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="yape_plin">Yape/Plin</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta_debito">Tarjeta débito</option>
                    <option value="tarjeta_credito">Tarjeta crédito</option>
                    <option value="mercado_pago">Mercado Pago</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Estado</label>
                  <select className="select" value={editEstado} onChange={e => setEditEstado(e.target.value)}>
                    <option value="pendiente">Pendiente</option>
                    <option value="pagado">Pagado</option>
                    <option value="vencido">Vencido</option>
                  </select>
                </div>
              </div>
              {editError && <p style={{ color: '#ef4444', fontSize: '13px' }}>{editError}</p>}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => void handleEditSave()} disabled={editSaving}>
                {editSaving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Confirmar Eliminación ─────────────────────────────────── */}
      {showDeleteModal && deleteTarget && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', width: '100%' }}>
            <div className="modal-header">
              <div className="card-title">Eliminar cuota</div>
              <button className="btn btn-ghost" onClick={() => setShowDeleteModal(false)} style={{ padding: '4px 8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '14px', color: '#ccc' }}>
                ¿Eliminar la cuota de <strong>{deleteTarget.students?.full_name}</strong> por <strong>{formatMonto(deleteTarget.monto)}</strong> ({fmtPeriodo(deleteTarget.periodo)})?
              </p>
              <p style={{ fontSize: '13px', color: '#ef4444', marginTop: '8px' }}>Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowDeleteModal(false)}>Cancelar</button>
              <button
                className="btn"
                style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                onClick={() => void handleDeleteConfirm()}
                disabled={deleteSaving}
              >
                {deleteSaving ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Cobrar Rápido ──────────────────────────────────────────── */}
      {showCobrarModal && cobrarTarget && (
        <div className="modal-overlay" onClick={() => setShowCobrarModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', width: '100%' }}>
            <div className="modal-header">
              <div className="card-title">Registrar cobro</div>
              <button
                className="btn btn-ghost"
                onClick={() => setShowCobrarModal(false)}
                style={{ padding: '4px 8px' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '14px', marginBottom: '16px' }}>
                <strong>{cobrarTarget.students?.full_name}</strong> — {formatMonto(cobrarTarget.monto)}
              </p>
              <div className="form-group">
                <label className="label">Fecha de pago</label>
                <input
                  className="input"
                  type="date"
                  value={cFechaPago}
                  onChange={e => setCFechaPago(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="label">Método de pago</label>
                <select
                  className="select"
                  value={cMetodo}
                  onChange={e => setCMetodo(e.target.value)}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="yape_plin">Yape/Plin</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta_debito">Tarjeta débito</option>
                  <option value="tarjeta_credito">Tarjeta crédito</option>
                  <option value="mercado_pago">Mercado Pago</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowCobrarModal(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void handleCobrarRapido()}
                disabled={cSaving}
              >
                {cSaving ? 'Guardando...' : 'Confirmar cobro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
