'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import {
  calcIMC, calcPesoIdeal, calcGrasaEstimada, calcMasaMagra,
  calcTMB, calcTDEE, calcMeta, calcMacros, getIMCCategory,
  ACTIVITY_FACTORS, ACTIVITY_LABELS,
  OBJETIVO_ADJUSTMENTS, OBJETIVO_LABELS,
  MACRO_DISTRIBUTIONS, MACRO_LABELS,
} from '@/lib/nutrition';
import { saveDatosFisicos, savePlanNutricional, addHistorialPeso } from '@/actions/nutricion';

type Tab = 'datos' | 'meta' | 'historial';

interface StudentOption {
  id: string;
  full_name: string;
}

interface DatosForm {
  peso_kg:        string;
  altura_cm:      string;
  edad:           string;
  sexo:           'm' | 'f' | '';
  nivel_actividad: string;
  notas:          string;
}

interface HistorialRow {
  id:      string;
  peso_kg: number;
  fecha:   string;
  notas:   string | null;
}

const EMPTY_DATOS: DatosForm = {
  peso_kg: '', altura_cm: '', edad: '', sexo: '', nivel_actividad: 'moderado', notas: '',
};

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtFecha(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function IMCBar({ imc }: { imc: number }) {
  const MIN = 15, MAX = 40, RANGE = MAX - MIN;
  const pct = Math.min(Math.max(((imc - MIN) / RANGE) * 100, 0), 100);
  const cat = getIMCCategory(imc);

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <div style={{ position: 'relative', height: '8px', borderRadius: '4px', overflow: 'visible' }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '4px',
          background: 'linear-gradient(to right, #60a5fa 0% 14%, #3FF8C8 14% 40%, #fbbf24 40% 60%, #f97316 60% 80%, #ef4444 80% 100%)',
          opacity: 0.75,
        }} />
        <div style={{
          position: 'absolute',
          left: `${pct}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '14px', height: '14px',
          borderRadius: '50%',
          background: cat.color,
          border: '2px solid var(--bg)',
          boxShadow: `0 0 10px ${cat.color}80`,
          zIndex: 1,
          transition: 'left 0.3s ease',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: '4px',
        fontSize: '10px', color: 'var(--fg-muted)', letterSpacing: '0.05em',
      }}>
        {['15', '18.5', '25', '30', '35', '40'].map(v => <span key={v}>{v}</span>)}
      </div>
      <div style={{
        marginTop: 'var(--space-3)',
        fontSize: 'var(--text-sm)', fontWeight: 700,
        color: cat.color, letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        IMC {imc.toFixed(1)} — {cat.label}
      </div>
    </div>
  );
}

function MacroBar({ label, gramos, calorias, color, pct }: {
  label: string; gramos: number; calorias: number; color: string; pct: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)' }}>
          {label}
        </span>
        <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-serif)', color: 'var(--fg-strong)' }}>
          {gramos.toFixed(0)}g <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>/ {calorias.toFixed(0)} kcal</span>
        </span>
      </div>
      <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          boxShadow: `0 0 6px ${color}80`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

function WeightChart({ data }: { data: HistorialRow[] }) {
  if (data.length < 2) {
    return (
      <div className="chart-empty">
        <p>Agrega al menos 2 registros para ver el gráfico</p>
      </div>
    );
  }

  const sorted = [...data].reverse();
  const weights = sorted.map(d => d.peso_kg);
  const rawMin = Math.min(...weights);
  const rawMax = Math.max(...weights);
  const padding = Math.max((rawMax - rawMin) * 0.2, 2);
  const yMin = Math.floor(rawMin - padding);
  const yMax = Math.ceil(rawMax + padding);
  const yRange = yMax - yMin;

  const W = 800, H = 200, PAD_L = 48, PAD_R = 20, PAD_T = 10, PAD_B = 30;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const xOf = (i: number) => PAD_L + (i / (sorted.length - 1)) * plotW;
  const yOf = (kg: number) => PAD_T + (1 - (kg - yMin) / yRange) * plotH;

  const linePath = sorted.map((d, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(d.peso_kg).toFixed(1)}`).join(' ');
  const areaPath = linePath + ` L${xOf(sorted.length - 1).toFixed(1)},${(PAD_T + plotH).toFixed(1)} L${PAD_L},${(PAD_T + plotH).toFixed(1)} Z`;

  const yTicks = [yMin, yMin + yRange * 0.25, yMin + yRange * 0.5, yMin + yRange * 0.75, yMax];

  const labelStep = Math.ceil(sorted.length / 6);

  return (
    <div className="line-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '200px' }}>
        <defs>
          <linearGradient id="weightGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3FF8C8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#3FF8C8" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g className="chart-grid">
          {yTicks.map((v, i) => {
            const y = yOf(v);
            return (
              <g key={i}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} />
                <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize="10" fill="var(--fg-subtle)">{v.toFixed(1)}</text>
              </g>
            );
          })}
        </g>

        <path d={areaPath} fill="url(#weightGradient)" />
        <path d={linePath} className="chart-line" />

        {sorted.map((d, i) => (
          <circle
            key={d.id}
            cx={xOf(i)} cy={yOf(d.peso_kg)} r="3"
            fill="#3FF8C8" stroke="var(--bg)" strokeWidth="1.5"
          />
        ))}
      </svg>

      <div className="chart-labels">
        {sorted
          .filter((_, i) => i % labelStep === 0 || i === sorted.length - 1)
          .map(d => <span key={d.id}>{fmtFecha(d.fecha)}</span>)}
      </div>
    </div>
  );
}

export default function NutricionModule({ students, initialStudentId }: { students: StudentOption[]; initialStudentId?: string }) {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  const [selectedAlumno, setSelectedAlumno] = useState(initialStudentId ?? '');
  const [tab, setTab] = useState<Tab>('datos');
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saveMsg, setSaveMsg] = useState('');
  const [saveMsgType, setSaveMsgType] = useState<'ok' | 'error'>('ok');

  // Tab 1
  const [datos, setDatos] = useState<DatosForm>(EMPTY_DATOS);

  // Tab 2
  const [objetivo, setObjetivo] = useState<keyof typeof OBJETIVO_ADJUSTMENTS>('mantenimiento');
  const [distribucion, setDistribucion] = useState<keyof typeof MACRO_DISTRIBUTIONS>('estandar');

  // Tab 3
  const [historial, setHistorial] = useState<HistorialRow[]>([]);
  const [nuevoPeso, setNuevoPeso] = useState('');
  const [nuevaFecha, setNuevaFecha] = useState(new Date().toISOString().slice(0, 10));
  const [nuevaNotas, setNuevaNotas] = useState('');

  useEffect(() => {
    if (!selectedAlumno) return;
    loadStudentData(selectedAlumno);
  }, [selectedAlumno]);

  async function loadStudentData(alumnoId: string) {
    setLoading(true);
    setSaveMsg('');

    const [datosRes, historialRes] = await Promise.all([
      supabase.from('alumnos_datos_fisicos').select('*')
        .eq('alumno_id', alumnoId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('historial_peso').select('*')
        .eq('alumno_id', alumnoId).order('fecha', { ascending: false }),
    ]);

    if (datosRes.data) {
      const d = datosRes.data;
      setDatos({
        peso_kg:        d.peso_kg?.toString() ?? '',
        altura_cm:      d.altura_cm?.toString() ?? '',
        edad:           d.edad?.toString() ?? '',
        sexo:           (d.sexo as 'm' | 'f') ?? '',
        nivel_actividad: d.nivel_actividad ?? 'moderado',
        notas:          d.notas ?? '',
      });
    } else {
      setDatos(EMPTY_DATOS);
    }

    setHistorial((historialRes.data ?? []) as HistorialRow[]);
    setLoading(false);
  }

  // ── Derived calculations ─────────────────────────────────────────────────────
  const peso    = parseFloat(datos.peso_kg);
  const altura  = parseFloat(datos.altura_cm);
  const edad    = parseInt(datos.edad);
  const sexo    = datos.sexo as 'm' | 'f';
  const nAct    = datos.nivel_actividad as keyof typeof ACTIVITY_FACTORS;

  const valid = !isNaN(peso) && !isNaN(altura) && !isNaN(edad) && (sexo === 'm' || sexo === 'f')
    && peso >= 20 && peso <= 350
    && altura >= 100 && altura <= 250
    && edad >= 10 && edad <= 110;

  const imc        = valid ? calcIMC(peso, altura) : null;
  const pesoIdeal  = valid ? calcPesoIdeal(altura, sexo) : null;
  const grasaPct   = (valid && imc !== null) ? Math.max(0, calcGrasaEstimada(imc, edad, sexo)) : null;
  const masaMagra  = (valid && grasaPct !== null) ? calcMasaMagra(peso, grasaPct) : null;

  const tmb   = valid ? calcTMB(peso, altura, edad, sexo) : null;
  const tdee  = tmb ? calcTDEE(tmb, nAct) : null;
  const meta  = tdee ? calcMeta(tdee, objetivo) : null;
  const macros = meta ? calcMacros(meta, distribucion) : null;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function showMsg(msg: string, type: 'ok' | 'error') {
    setSaveMsg(msg);
    setSaveMsgType(type);
    setTimeout(() => setSaveMsg(''), 3000);
  }

  function handleSaveDatos() {
    if (!selectedAlumno || !valid) return;
    startTransition(async () => {
      const res = await saveDatosFisicos(selectedAlumno, {
        peso_kg: peso, altura_cm: altura, edad, sexo,
        nivel_actividad: nAct,
        ...(datos.notas ? { notas: datos.notas } : {}),
      });
      showMsg(res.error ? `Error: ${res.error}` : 'Datos físicos guardados', res.error ? 'error' : 'ok');
    });
  }

  function handleSavePlan() {
    if (!selectedAlumno || !meta || !macros) return;
    startTransition(async () => {
      const res = await savePlanNutricional(selectedAlumno, {
        objetivo_nutricional: objetivo,
        distribucion_macros:  distribucion,
        proteinas_g:          macros.proteinas_g,
        carbos_g:             macros.carbos_g,
        grasas_g:             macros.grasas_g,
        calorias_meta:        meta,
      });
      showMsg(res.error ? `Error: ${res.error}` : 'Plan nutricional guardado', res.error ? 'error' : 'ok');
    });
  }

  function handleAddPeso() {
    if (!selectedAlumno || !nuevoPeso) return;
    const kg = parseFloat(nuevoPeso);
    if (isNaN(kg) || kg <= 0) return;
    startTransition(async () => {
      const res = nuevaNotas
        ? await addHistorialPeso(selectedAlumno, kg, nuevaFecha, nuevaNotas)
        : await addHistorialPeso(selectedAlumno, kg, nuevaFecha);
      if (!res.error) {
        const fecha = nuevaFecha;
        setHistorial(prev => [
          { id: Math.random().toString(36), peso_kg: kg, fecha, notas: nuevaNotas || null },
          ...prev,
        ]);
        setNuevoPeso('');
        setNuevaNotas('');
      }
      showMsg(res.error ? `Error: ${res.error}` : 'Peso registrado', res.error ? 'error' : 'ok');
    });
  }

  // ── Chart data ────────────────────────────────────────────────────────────────
  const chartData = useMemo(() => historial.slice(0, 20), [historial]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Student selector */}
      {!initialStudentId && <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-body--padded" style={{ padding: 'var(--space-5) var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '240px' }}>
              <label className="label" style={{ marginBottom: 'var(--space-2)' }}>Seleccionar Alumno</label>
              <select
                className="select"
                value={selectedAlumno}
                onChange={e => setSelectedAlumno(e.target.value)}
              >
                <option value="">— Selecciona un alumno —</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
            {saveMsg && (
              <div style={{
                padding: 'var(--space-2) var(--space-4)',
                background: saveMsgType === 'ok' ? 'var(--accent-soft)' : 'rgba(255,107,107,0.1)',
                border: `1px solid ${saveMsgType === 'ok' ? 'var(--border-mint)' : 'rgba(255,107,107,0.3)'}`,
                borderRadius: 'var(--radius-xs)',
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: saveMsgType === 'ok' ? 'var(--accent)' : 'var(--danger)',
              }}>
                {saveMsg}
              </div>
            )}
          </div>
        </div>
      </div>}

      {initialStudentId && saveMsg && (
        <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-2) var(--space-4)', background: saveMsgType === 'ok' ? 'var(--accent-soft)' : 'rgba(255,107,107,0.1)', border: `1px solid ${saveMsgType === 'ok' ? 'var(--border-mint)' : 'rgba(255,107,107,0.3)'}`, borderRadius: 'var(--radius-xs)', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: saveMsgType === 'ok' ? 'var(--accent)' : 'var(--danger)' }}>{saveMsg}</div>
      )}

      {!selectedAlumno ? (
        <div className="card">
          <div className="chart-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2a9 9 0 00-9 9c0 4.17 2.84 7.67 6.69 8.69L12 22l2.31-2.31C18.16 18.67 21 15.17 21 11a9 9 0 00-9-9z"/>
            </svg>
            <p>Selecciona un alumno para gestionar su nutrición</p>
          </div>
        </div>
      ) : loading ? (
        <div className="card">
          <div className="chart-empty">
            <p style={{ color: 'var(--fg-muted)' }}>Cargando datos...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="chart-tabs" style={{ marginBottom: 'var(--space-6)' }}>
            {(['datos', 'meta', 'historial'] as Tab[]).map(t => (
              <button
                key={t}
                className={`chart-tab${tab === t ? ' active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'datos' ? 'Datos Físicos' : t === 'meta' ? 'Meta Calórica' : 'Historial de Peso'}
              </button>
            ))}
          </div>

          {/* ── TAB 1: Datos físicos ──────────────────────────────────────── */}
          {tab === 'datos' && (
            <div className="grid grid-2" style={{ alignItems: 'start' }}>
              {/* Form */}
              <div className="card">
                <div className="card-head">
                  <div className="card-head-left">
                    <div className="card-title">Datos Antropométricos</div>
                    <div className="card-subtitle">Perfil físico actual del alumno</div>
                  </div>
                </div>
                <div className="card-body card-body--padded">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="label">Peso actual (kg)</label>
                        <input
                          className="input"
                          type="number" step="0.1" placeholder="70.5" min="20" max="350"
                          value={datos.peso_kg}
                          onChange={e => setDatos(p => ({ ...p, peso_kg: e.target.value }))}
                        />
                        {datos.peso_kg !== '' && (peso < 20 || peso > 350) && (
                          <div style={{ fontSize: '12px', color: '#ff6b6b', marginTop: '4px' }}>Ingresa un valor entre 20 y 350 kg</div>
                        )}
                      </div>
                      <div className="form-group">
                        <label className="label">Altura (cm)</label>
                        <input
                          className="input"
                          type="number" step="0.5" placeholder="175" min="100" max="250"
                          value={datos.altura_cm}
                          onChange={e => setDatos(p => ({ ...p, altura_cm: e.target.value }))}
                        />
                        {datos.altura_cm !== '' && (altura < 100 || altura > 250) && (
                          <div style={{ fontSize: '12px', color: '#ff6b6b', marginTop: '4px' }}>Ingresa un valor entre 100 y 250 cm</div>
                        )}
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="label">Edad</label>
                        <input
                          className="input"
                          type="number" placeholder="28" min="10" max="110"
                          value={datos.edad}
                          onChange={e => setDatos(p => ({ ...p, edad: e.target.value }))}
                        />
                        {datos.edad !== '' && (edad < 10 || edad > 110) && (
                          <div style={{ fontSize: '12px', color: '#ff6b6b', marginTop: '4px' }}>Ingresa una edad entre 10 y 110 años</div>
                        )}
                      </div>
                      <div className="form-group">
                        <label className="label">Sexo</label>
                        <select
                          className="select"
                          value={datos.sexo}
                          onChange={e => setDatos(p => ({ ...p, sexo: e.target.value as 'm' | 'f' | '' }))}
                        >
                          <option value="">— Seleccionar —</option>
                          <option value="m">Masculino</option>
                          <option value="f">Femenino</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="label">Nivel de actividad</label>
                      <select
                        className="select"
                        value={datos.nivel_actividad}
                        onChange={e => setDatos(p => ({ ...p, nivel_actividad: e.target.value }))}
                      >
                        {(Object.keys(ACTIVITY_LABELS) as (keyof typeof ACTIVITY_LABELS)[]).map(k => (
                          <option key={k} value={k}>{ACTIVITY_LABELS[k]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="label">Notas</label>
                      <textarea
                        className="textarea"
                        placeholder="Observaciones, lesiones, preferencias..."
                        value={datos.notas}
                        onChange={e => setDatos(p => ({ ...p, notas: e.target.value }))}
                        style={{ minHeight: '72px' }}
                      />
                    </div>
                    <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--divider)' }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleSaveDatos}
                        disabled={!valid || isPending}
                        style={{ width: '100%' }}
                      >
                        {isPending ? 'Guardando...' : 'Guardar Datos Físicos'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Calculations */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                {/* IMC Card */}
                <div className="card">
                  <div className="card-head">
                    <div className="card-head-left">
                      <div className="card-title">Índice de Masa Corporal</div>
                      <div className="card-subtitle">Clasificación según OMS</div>
                    </div>
                  </div>
                  <div className="card-body card-body--padded">
                    {imc !== null ? (
                      <IMCBar imc={imc} />
                    ) : (
                      <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                        Completa peso y altura para calcular el IMC
                      </p>
                    )}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="card">
                  <div className="card-head">
                    <div className="card-head-left">
                      <div className="card-title">Composición Corporal Estimada</div>
                      <div className="card-subtitle">Cálculos basados en datos ingresados</div>
                    </div>
                  </div>
                  <div className="card-body card-body--padded">
                    <div className="stats-grid">
                      <StatCard
                        label="IMC"
                        value={imc !== null ? imc.toFixed(1) : '—'}
                        unit=""
                        color={imc ? getIMCCategory(imc).color : 'var(--fg-muted)'}
                      />
                      <StatCard
                        label="Peso Ideal"
                        value={pesoIdeal !== null ? pesoIdeal.toFixed(1) : '—'}
                        unit="kg"
                      />
                      <StatCard
                        label="% Grasa Est."
                        value={grasaPct !== null ? grasaPct.toFixed(1) : '—'}
                        unit="%"
                      />
                      <StatCard
                        label="Masa Magra Est."
                        value={masaMagra !== null ? masaMagra.toFixed(1) : '—'}
                        unit="kg"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: Meta calórica ──────────────────────────────────────── */}
          {tab === 'meta' && (
            <div className="grid grid-2" style={{ alignItems: 'start' }}>
              {/* Settings column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                {/* TMB / TDEE step display */}
                <div className="card">
                  <div className="card-head">
                    <div className="card-head-left">
                      <div className="card-title">Cálculo Metabólico</div>
                      <div className="card-subtitle">Fórmula Mifflin-St Jeor</div>
                    </div>
                  </div>
                  <div className="card-body card-body--padded">
                    {!valid ? (
                      <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                        Completa los datos físicos en la pestaña anterior primero
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        <CalcStep label="TMB (Tasa Metabólica Basal)" value={`${tmb?.toFixed(0)} kcal`} step="01" />
                        <CalcStep label={`TDEE × ${ACTIVITY_FACTORS[nAct]}`} value={`${tdee?.toFixed(0)} kcal`} step="02" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Objective selector */}
                <div className="card">
                  <div className="card-head">
                    <div className="card-head-left">
                      <div className="card-title">Objetivo</div>
                    </div>
                  </div>
                  <div className="card-body card-body--padded">
                    <div className="form-group">
                      <label className="label">Objetivo nutricional</label>
                      <select
                        className="select"
                        value={objetivo}
                        onChange={e => setObjetivo(e.target.value as keyof typeof OBJETIVO_ADJUSTMENTS)}
                      >
                        {(Object.keys(OBJETIVO_LABELS) as (keyof typeof OBJETIVO_LABELS)[]).map(k => (
                          <option key={k} value={k}>{OBJETIVO_LABELS[k]}</option>
                        ))}
                      </select>
                    </div>
                    {meta !== null && (
                      <div style={{
                        marginTop: 'var(--space-4)',
                        padding: 'var(--space-4)',
                        background: 'var(--accent-soft)',
                        border: '1px solid var(--border-mint)',
                        borderRadius: 'var(--radius-xs)',
                        textAlign: 'center',
                      }}>
                        <div className="label-caps" style={{ marginBottom: 'var(--space-1)' }}>Meta calórica diaria</div>
                        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-3xl)', color: 'var(--accent)', lineHeight: 1 }}>
                          {meta.toFixed(0)}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginTop: 'var(--space-1)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>kcal / día</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Macro distribution selector */}
                <div className="card">
                  <div className="card-head">
                    <div className="card-head-left">
                      <div className="card-title">Distribución de Macros</div>
                    </div>
                  </div>
                  <div className="card-body card-body--padded">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {(Object.keys(MACRO_LABELS) as (keyof typeof MACRO_LABELS)[]).map(k => (
                        <label key={k} style={{
                          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                          padding: 'var(--space-3) var(--space-4)',
                          background: distribucion === k ? 'var(--accent-soft)' : 'var(--bg)',
                          border: `1px solid ${distribucion === k ? 'var(--border-mint)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                          fontSize: 'var(--text-xs)', fontWeight: distribucion === k ? 700 : 400,
                          color: distribucion === k ? 'var(--accent)' : 'var(--fg)',
                          transition: 'all var(--t)',
                        }}>
                          <input
                            type="radio" name="distribucion" value={k}
                            checked={distribucion === k}
                            onChange={() => setDistribucion(k)}
                            style={{ accentColor: 'var(--accent)' }}
                          />
                          {MACRO_LABELS[k]}
                        </label>
                      ))}
                    </div>
                    <div style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--divider)', marginTop: 'var(--space-4)' }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleSavePlan}
                        disabled={!meta || isPending}
                        style={{ width: '100%' }}
                      >
                        {isPending ? 'Guardando...' : 'Guardar Plan Nutricional'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Macro bars column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                <div className="card">
                  <div className="card-head">
                    <div className="card-head-left">
                      <div className="card-title">Distribución de Macronutrientes</div>
                      <div className="card-subtitle">Gramos y calorías por macro</div>
                    </div>
                  </div>
                  <div className="card-body card-body--padded">
                    {!macros ? (
                      <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                        Completa los datos físicos primero
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                        <MacroBar
                          label="Proteínas"
                          gramos={macros.proteinas_g}
                          calorias={macros.proteinas_g * 4}
                          color="#3FF8C8"
                          pct={MACRO_DISTRIBUTIONS[distribucion].proteinas * 100}
                        />
                        <MacroBar
                          label="Carbohidratos"
                          gramos={macros.carbos_g}
                          calorias={macros.carbos_g * 4}
                          color="#60a5fa"
                          pct={MACRO_DISTRIBUTIONS[distribucion].carbos * 100}
                        />
                        <MacroBar
                          label="Grasas"
                          gramos={macros.grasas_g}
                          calorias={macros.grasas_g * 9}
                          color="#fbbf24"
                          pct={MACRO_DISTRIBUTIONS[distribucion].grasas * 100}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {macros && (
                  <div className="metrics-row" style={{ borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)' }}>
                    <div className="metric">
                      <div className="label-caps">Proteínas</div>
                      <div className="metric-row">
                        <span className="metric-value" style={{ fontSize: 'var(--text-xl)', color: '#3FF8C8' }}>
                          {macros.proteinas_g.toFixed(0)}g
                        </span>
                      </div>
                      <div className="metric-bar"><span style={{ width: `${MACRO_DISTRIBUTIONS[distribucion].proteinas * 100}%`, background: '#3FF8C8' }} /></div>
                    </div>
                    <div className="metric">
                      <div className="label-caps">Carbos</div>
                      <div className="metric-row">
                        <span className="metric-value" style={{ fontSize: 'var(--text-xl)', color: '#60a5fa' }}>
                          {macros.carbos_g.toFixed(0)}g
                        </span>
                      </div>
                      <div className="metric-bar"><span style={{ width: `${MACRO_DISTRIBUTIONS[distribucion].carbos * 100}%`, background: '#60a5fa' }} /></div>
                    </div>
                    <div className="metric">
                      <div className="label-caps">Grasas</div>
                      <div className="metric-row">
                        <span className="metric-value" style={{ fontSize: 'var(--text-xl)', color: '#fbbf24' }}>
                          {macros.grasas_g.toFixed(0)}g
                        </span>
                      </div>
                      <div className="metric-bar"><span style={{ width: `${MACRO_DISTRIBUTIONS[distribucion].grasas * 100}%`, background: '#fbbf24' }} /></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 3: Historial de peso ──────────────────────────────────── */}
          {tab === 'historial' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              {/* Add entry form */}
              <div className="card">
                <div className="card-head">
                  <div className="card-head-left">
                    <div className="card-title">Registrar Peso</div>
                  </div>
                </div>
                <div className="card-body card-body--padded">
                  <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: '1', minWidth: '120px' }}>
                      <label className="label">Peso (kg)</label>
                      <input
                        className="input"
                        type="number" step="0.1" placeholder="70.5"
                        value={nuevoPeso}
                        onChange={e => setNuevoPeso(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddPeso()}
                      />
                    </div>
                    <div className="form-group" style={{ flex: '1', minWidth: '140px' }}>
                      <label className="label">Fecha</label>
                      <input
                        className="input"
                        type="date"
                        value={nuevaFecha}
                        onChange={e => setNuevaFecha(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ flex: '2', minWidth: '200px' }}>
                      <label className="label">Notas (opcional)</label>
                      <input
                        className="input"
                        type="text" placeholder="Mañana en ayunas..."
                        value={nuevaNotas}
                        onChange={e => setNuevaNotas(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddPeso()}
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={handleAddPeso}
                      disabled={!nuevoPeso || isPending}
                      style={{ height: '40px', alignSelf: 'flex-end', flexShrink: 0 }}
                    >
                      + Agregar
                    </button>
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="card">
                <div className="card-head">
                  <div className="card-head-left">
                    <div className="card-title">Evolución del Peso</div>
                    <div className="card-subtitle">Últimos {Math.min(chartData.length, 20)} registros</div>
                  </div>
                </div>
                <div className="card-body">
                  <div className="chart-container">
                    <WeightChart data={chartData} />
                  </div>
                </div>
              </div>

              {/* History table */}
              <div className="card">
                <div className="card-head">
                  <div className="card-head-left">
                    <div className="card-title">Registro Completo</div>
                    <div className="card-subtitle">{historial.length} entradas</div>
                  </div>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  {historial.length === 0 ? (
                    <div className="empty-state">Sin registros de peso aún</div>
                  ) : (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Peso (kg)</th>
                            <th>Cambio</th>
                            <th>Notas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historial.map((row, idx) => {
                            const prev = historial[idx + 1];
                            const delta = prev ? row.peso_kg - prev.peso_kg : null;
                            const deltaColor = delta === null ? 'var(--fg-muted)'
                              : delta < 0 ? '#3FF8C8'
                              : delta > 0 ? 'var(--danger)'
                              : 'var(--fg-muted)';
                            return (
                              <tr key={row.id}>
                                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', letterSpacing: '0.04em' }}>
                                  {fmtFecha(row.fecha)}
                                </td>
                                <td>
                                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', color: 'var(--fg-strong)' }}>
                                    {row.peso_kg.toFixed(1)}
                                  </span>
                                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginLeft: '4px' }}>kg</span>
                                </td>
                                <td>
                                  {delta !== null && (
                                    <span style={{
                                      fontSize: 'var(--text-xs)', fontWeight: 700,
                                      textTransform: 'uppercase', letterSpacing: '0.06em',
                                      color: deltaColor,
                                    }}>
                                      {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg
                                    </span>
                                  )}
                                </td>
                                <td style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
                                  {row.notas || '—'}
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
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, unit, color }: {
  label: string; value: string; unit: string; color?: string;
}) {
  return (
    <div className="stat-item">
      <div className="stat-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', color: color ?? 'var(--fg-strong)' }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>{unit}</span>}
      </div>
    </div>
  );
}

function CalcStep({ label, value, step }: { label: string; value: string | undefined; step: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: 'var(--space-3) var(--space-4)',
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xs)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{
          width: '22px', height: '22px', borderRadius: '50%',
          background: 'var(--accent)', color: 'var(--fg-on-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', fontWeight: 700, flexShrink: 0,
        }}>{step}</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
      </div>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', color: 'var(--accent)' }}>
        {value ?? '—'}
      </span>
    </div>
  );
}
