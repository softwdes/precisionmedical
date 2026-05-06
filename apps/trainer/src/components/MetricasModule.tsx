'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { calcIMC, calcGrasaEstimada, calcMasaMagra, getIMCCategory } from '@/lib/nutrition';
import { addMedidaCorporal, addProgresoEjercicio, addSesionEntrenamiento } from '@/actions/metricas2';

type Tab = 'resumen' | 'cuerpo' | 'fuerza' | 'adherencia' | 'logros';

interface Student { id: string; full_name: string; experience_level: string | null; }
interface Exercise { id: string; name: string; muscle_group: string | null; }

interface DatosFisicos { peso_kg: number|null; altura_cm: number|null; edad: number|null; sexo: string|null; nivel_actividad: string|null; fecha_registro: string; }
interface HistorialPeso { id: string; peso_kg: number; fecha: string; notas: string|null; }
interface PlanActivo { calorias_meta: number|null; proteinas_g: number|null; carbos_g: number|null; grasas_g: number|null; objetivo_nutricional: string|null; }
interface RutinaActiva { nombre: string; fecha_inicio: string; }
interface MedidaCorporal { id: string; fecha: string; pecho_cm: number|null; cintura_cm: number|null; cadera_cm: number|null; biceps_cm: number|null; muslo_cm: number|null; }
interface ProgresoEj { id: string; ejercicio_id: string|null; fecha: string; peso_kg: number|null; reps: number|null; sets: number|null; exercises: { name: string } | null; }
interface Sesion { id: string; fecha: string; completada: boolean; }
interface Logro { id: string; tipo: string; titulo: string; descripcion: string|null; fecha_obtenido: string; }

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmtFecha = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const fmtFechaLong = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

// ── Shared helpers ────────────────────────────────────────────────────────────

function KPICard({ label, value, unit = '', delta, color }: { label: string; value: string; unit?: string; delta?: string; color?: string }) {
  return (
    <div className="metric">
      <div className="label-caps">{label}</div>
      <div className="metric-row">
        <span className="metric-value" style={{ fontSize: 'var(--text-2xl)', color: color ?? 'var(--fg-strong)' }}>
          {value}<span style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', marginLeft: '4px' }}>{unit}</span>
        </span>
        {delta && <span className="metric-delta" style={{ color: delta.startsWith('-') ? 'var(--danger)' : 'var(--accent)' }}>{delta}</span>}
      </div>
      <div className="metric-bar">
        <span style={{ width: '60%', background: color ?? 'var(--accent)' }} />
      </div>
    </div>
  );
}

function WeightLineChart({ data }: { data: HistorialPeso[] }) {
  if (data.length < 2) return <div className="chart-empty"><p>Agrega al menos 2 registros de peso en Nutrición → Historial</p></div>;
  const sorted = [...data].reverse().slice(-16);
  const weights = sorted.map(d => d.peso_kg);
  const lo = Math.floor(Math.min(...weights) - 1), hi = Math.ceil(Math.max(...weights) + 1);
  const range = hi - lo || 1;
  const W = 800, H = 180, PL = 40, PR = 16, PT = 8, PB = 24;
  const pw = W - PL - PR, ph = H - PT - PB;
  const xOf = (i: number) => PL + (i / (sorted.length - 1)) * pw;
  const yOf = (v: number) => PT + (1 - (v - lo) / range) * ph;
  const line = sorted.map((d, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(d.peso_kg).toFixed(1)}`).join(' ');
  const area = line + ` L${xOf(sorted.length-1).toFixed(1)},${(PT+ph).toFixed(1)} L${PL},${(PT+ph).toFixed(1)} Z`;
  const step = Math.ceil(sorted.length / 5);
  return (
    <div className="line-chart">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '180px' }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="wGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3FF8C8" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="#3FF8C8" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0,0.25,0.5,0.75,1].map((f, i) => {
          const y = PT + f * ph;
          return <g key={i}><line x1={PL} x2={W-PR} y1={y} y2={y} stroke="var(--divider)" strokeDasharray="2 4"/><text x={PL-4} y={y+4} textAnchor="end" fontSize="10" fill="var(--fg-subtle)">{(hi - f*range).toFixed(0)}</text></g>;
        })}
        <path d={area} fill="url(#wGrad)"/>
        <path d={line} fill="none" stroke="#3FF8C8" strokeWidth="2" style={{ filter: 'drop-shadow(0 0 6px rgba(63,248,200,0.5))' }}/>
        {sorted.map((d, i) => <circle key={d.id} cx={xOf(i)} cy={yOf(d.peso_kg)} r="3" fill="#3FF8C8" stroke="var(--bg)" strokeWidth="1.5"/>)}
      </svg>
      <div className="chart-labels">
        {sorted.filter((_,i) => i % step === 0 || i === sorted.length-1).map(d => <span key={d.id}>{fmtFecha(d.fecha)}</span>)}
      </div>
    </div>
  );
}

function EmptyTab({ msg, sub }: { msg: string; sub?: string }) {
  return (
    <div className="card">
      <div className="chart-empty">
        <p>{msg}</p>
        {sub && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Tab 1: Resumen ────────────────────────────────────────────────────────────

function TabResumen({ alumnoId, historial, datos, plan, rutina, prs }: {
  alumnoId: string;
  historial: HistorialPeso[];
  datos: DatosFisicos | null;
  plan: PlanActivo | null;
  rutina: RutinaActiva | null;
  prs: ProgresoEj[];
}) {
  const sorted = [...historial].sort((a,b) => b.fecha.localeCompare(a.fecha));
  const pesoActual = sorted[0]?.peso_kg ?? datos?.peso_kg ?? null;
  const pesoAnterior = sorted[1]?.peso_kg ?? null;
  const deltaPeso = (pesoActual !== null && pesoAnterior !== null) ? pesoActual - pesoAnterior : null;
  const imc = (pesoActual && datos?.altura_cm) ? calcIMC(pesoActual, datos.altura_cm) : null;
  const imcCat = imc ? getIMCCategory(imc) : null;
  const semanasRutina = rutina?.fecha_inicio
    ? Math.floor((Date.now() - new Date(rutina.fecha_inicio).getTime()) / (7*24*60*60*1000))
    : null;

  const recentPRs = useMemo(() => {
    const map = new Map<string, ProgresoEj>();
    for (const p of prs) {
      const k = p.ejercicio_id ?? 'x';
      const existing = map.get(k);
      if (!existing || (p.peso_kg ?? 0) > (existing.peso_kg ?? 0)) map.set(k, p);
    }
    return [...map.values()].slice(0, 6);
  }, [prs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <section className="metrics-row" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)' }}>
        <KPICard label="Peso Actual" value={pesoActual?.toFixed(1) ?? '—'} unit="kg"
          {...(deltaPeso !== null ? { delta: `${deltaPeso > 0 ? '+' : ''}${deltaPeso.toFixed(1)} kg` } : {})} />
        <KPICard label="IMC" value={imc?.toFixed(1) ?? '—'} {...(imcCat ? { color: imcCat.color, delta: imcCat.label } : {})} />
        <KPICard label="Rutina Activa" value={rutina ? rutina.nombre : '—'} />
        <KPICard label="Semanas en Rutina" value={semanasRutina !== null ? semanasRutina.toString() : '—'} unit="sem" />
      </section>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Evolución de Peso</div>
              <div className="card-subtitle">Últimas {Math.min(historial.length, 16)} mediciones</div>
            </div>
          </div>
          <div className="card-body">
            <div className="chart-container"><WeightLineChart data={historial} /></div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {plan && (
            <div className="card">
              <div className="card-head">
                <div className="card-head-left">
                  <div className="card-title">Plan Nutricional</div>
                  <div className="card-subtitle">{plan.objetivo_nutricional?.replace(/_/g,' ') ?? 'Activo'}</div>
                </div>
              </div>
              <div className="card-body card-body--padded">
                <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-3xl)', color: 'var(--accent)', lineHeight: 1 }}>
                    {plan.calorias_meta?.toFixed(0) ?? '—'}
                  </div>
                  <div className="label-caps" style={{ marginTop: 'var(--space-1)' }}>kcal / día</div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'center' }}>
                  {[
                    { label: 'Proteínas', g: plan.proteinas_g, color: '#3FF8C8' },
                    { label: 'Carbos', g: plan.carbos_g, color: '#60a5fa' },
                    { label: 'Grasas', g: plan.grasas_g, color: '#fbbf24' },
                  ].map(m => (
                    <div key={m.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', color: m.color }}>
                        {m.g?.toFixed(0) ?? '—'}
                        <span style={{ fontSize: '11px', color: 'var(--fg-muted)', marginLeft: '2px' }}>g</span>
                      </div>
                      <div className="label-caps" style={{ fontSize: '10px' }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <div className="card-head-left">
                <div className="card-title">Récords Personales Recientes</div>
                <div className="card-subtitle">{recentPRs.length} ejercicios</div>
              </div>
            </div>
            <div className="card-body card-body--padded">
              {recentPRs.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--space-6)' }}>Sin PRs registrados aún</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {recentPRs.map(pr => (
                    <div key={pr.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--divider)' }}>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>{pr.exercises?.name ?? '—'}</span>
                      <span style={{ fontFamily: 'var(--font-serif)', color: 'var(--accent)', fontSize: 'var(--text-base)' }}>
                        {pr.peso_kg ? `${pr.peso_kg} kg` : ''} {pr.reps ? `× ${pr.reps}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab 2: Cuerpo ─────────────────────────────────────────────────────────────

function TabCuerpo({ alumnoId, historial, datos, medidas, isPending, onAddMedida }: {
  alumnoId: string;
  historial: HistorialPeso[];
  datos: DatosFisicos | null;
  medidas: MedidaCorporal[];
  isPending: boolean;
  onAddMedida: (m: Omit<MedidaCorporal, 'id'>) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [mForm, setMForm] = useState({ fecha: new Date().toISOString().slice(0,10), pecho_cm: '', cintura_cm: '', cadera_cm: '', biceps_cm: '', muslo_cm: '', notas: '' });
  const [mErr, setMErr] = useState('');
  const [localPending, startTr] = useTransition();

  const peso  = historial[0]?.peso_kg ?? datos?.peso_kg ?? null;
  const alt   = datos?.altura_cm ?? null;
  const edad  = datos?.edad ?? null;
  const sexo  = datos?.sexo as 'm'|'f'|null;
  const imc   = (peso && alt) ? calcIMC(peso, alt) : null;
  const cat   = imc ? getIMCCategory(imc) : null;
  const gras  = (imc && edad && sexo) ? Math.max(0, calcGrasaEstimada(imc, edad, sexo)) : null;
  const magra = (peso && gras !== null) ? calcMasaMagra(peso, gras) : null;

  const medidaActual  = medidas[0] ?? null;
  const medidaInicial = medidas[medidas.length - 1] ?? null;

  const ZONAS: { key: keyof MedidaCorporal; label: string }[] = [
    { key: 'pecho_cm',   label: 'Pecho'   },
    { key: 'cintura_cm', label: 'Cintura' },
    { key: 'cadera_cm',  label: 'Cadera'  },
    { key: 'biceps_cm',  label: 'Bíceps'  },
    { key: 'muslo_cm',   label: 'Muslo'   },
  ];

  function handleAddMedida() {
    setMErr('');
    startTr(async () => {
      const payload: Record<string,number|string> = { fecha: mForm.fecha };
      if (mForm.pecho_cm)   payload.pecho_cm   = parseFloat(mForm.pecho_cm);
      if (mForm.cintura_cm) payload.cintura_cm = parseFloat(mForm.cintura_cm);
      if (mForm.cadera_cm)  payload.cadera_cm  = parseFloat(mForm.cadera_cm);
      if (mForm.biceps_cm)  payload.biceps_cm  = parseFloat(mForm.biceps_cm);
      if (mForm.muslo_cm)   payload.muslo_cm   = parseFloat(mForm.muslo_cm);
      if (mForm.notas)      payload.notas      = mForm.notas;
      const res = await addMedidaCorporal(alumnoId, payload as Parameters<typeof addMedidaCorporal>[1]);
      if (res.error) { setMErr(res.error); return; }
      onAddMedida({ fecha: mForm.fecha, pecho_cm: mForm.pecho_cm ? parseFloat(mForm.pecho_cm) : null, cintura_cm: mForm.cintura_cm ? parseFloat(mForm.cintura_cm) : null, cadera_cm: mForm.cadera_cm ? parseFloat(mForm.cadera_cm) : null, biceps_cm: mForm.biceps_cm ? parseFloat(mForm.biceps_cm) : null, muslo_cm: mForm.muslo_cm ? parseFloat(mForm.muslo_cm) : null });
      setShowModal(false);
      setMForm({ fecha: new Date().toISOString().slice(0,10), pecho_cm: '', cintura_cm: '', cadera_cm: '', biceps_cm: '', muslo_cm: '', notas: '' });
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <section className="metrics-row" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)' }}>
        <KPICard label="Peso" value={peso?.toFixed(1) ?? '—'} unit="kg" />
        <KPICard label="IMC" value={imc?.toFixed(1) ?? '—'} {...(cat ? { color: cat.color, delta: cat.label } : {})} />
        <KPICard label="% Grasa Est." value={gras?.toFixed(1) ?? '—'} unit="%" />
        <KPICard label="Masa Magra Est." value={magra?.toFixed(1) ?? '—'} unit="kg" />
      </section>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {/* Weight chart */}
        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Evolución del Peso</div>
            </div>
          </div>
          <div className="card-body">
            <div className="chart-container"><WeightLineChart data={historial} /></div>
          </div>
        </div>

        {/* Body measurements */}
        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Medidas Corporales</div>
              <div className="card-subtitle">{medidas.length} registros</div>
            </div>
            <button className="btn btn-outline" onClick={() => setShowModal(true)}>+ Registrar</button>
          </div>
          <div className="card-body card-body--padded">
            {ZONAS.map(z => {
              const actual = medidaActual ? (medidaActual[z.key] as number|null) : null;
              const inicial = medidaInicial ? (medidaInicial[z.key] as number|null) : null;
              const pct = actual ? Math.min((actual / 120) * 100, 100) : 0;
              const delta = (actual !== null && inicial !== null && actual !== inicial) ? (actual - inicial) : null;
              return (
                <div key={z.key} style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-1)' }}>
                    <span className="label-caps">{z.label}</span>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline' }}>
                      {inicial !== null && inicial !== actual && (
                        <span style={{ fontSize: '11px', color: 'var(--fg-subtle)' }}>inicio: {inicial} cm</span>
                      )}
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', color: 'var(--fg-strong)' }}>
                        {actual !== null ? `${actual} cm` : '—'}
                      </span>
                      {delta !== null && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: delta < 0 ? '#3FF8C8' : 'var(--danger)' }}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add medida modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Registrar Medidas</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Fecha</label>
                <input className="input" type="date" value={mForm.fecha} onChange={e => setMForm(p=>({...p,fecha:e.target.value}))} />
              </div>
              <div className="form-row">
                {ZONAS.map(z => (
                  <div key={z.key} className="form-group">
                    <label className="label">{z.label} (cm)</label>
                    <input className="input" type="number" step="0.1" placeholder="—"
                      value={(mForm as Record<string,string>)[z.key] ?? ''}
                      onChange={e => setMForm(p => ({ ...p, [z.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="form-group">
                <label className="label">Notas</label>
                <input className="input" placeholder="Opcional..." value={mForm.notas} onChange={e => setMForm(p=>({...p,notas:e.target.value}))} />
              </div>
              {mErr && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{mErr}</p>}
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleAddMedida} disabled={localPending}>
                  {localPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Fuerza ─────────────────────────────────────────────────────────────

const COMPOUND = ['Sentadilla con barra','Peso muerto','Press de banca plano','Press militar','Remo con barra'];

function TabFuerza({ alumnoId, progreso, exercises, onAdd }: {
  alumnoId: string;
  progreso: ProgresoEj[];
  exercises: Exercise[];
  onAdd: (p: ProgresoEj) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ejercicio_id: '', fecha: new Date().toISOString().slice(0,10), peso_kg: '', reps: '', sets: '', notas: '' });
  const [formErr, setFormErr] = useState('');
  const [localPending, startTr] = useTransition();

  const byExercise = useMemo(() => {
    const map = new Map<string, ProgresoEj[]>();
    for (const p of progreso) {
      const k = p.ejercicio_id ?? '';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return map;
  }, [progreso]);

  const maxLoads = useMemo(() => {
    return [...byExercise.entries()].map(([id, entries]) => {
      const sorted = [...entries].sort((a,b) => (b.peso_kg??0) - (a.peso_kg??0));
      const ex = exercises.find(e => e.id === id);
      return { name: ex?.name ?? 'Ejercicio', max: sorted[0]?.peso_kg ?? null, inicial: sorted[sorted.length-1]?.peso_kg ?? null, count: entries.length };
    }).filter(x => x.max !== null).sort((a,b) => (b.max??0) - (a.max??0)).slice(0, 8);
  }, [byExercise, exercises]);

  function handleAdd() {
    if (!form.ejercicio_id) { setFormErr('Selecciona un ejercicio'); return; }
    setFormErr('');
    startTr(async () => {
      const payload = { ejercicio_id: form.ejercicio_id, fecha: form.fecha, ...(form.peso_kg ? { peso_kg: parseFloat(form.peso_kg) } : {}), ...(form.reps ? { reps: parseInt(form.reps) } : {}), ...(form.sets ? { sets: parseInt(form.sets) } : {}), ...(form.notas ? { notas: form.notas } : {}) };
      const res = await addProgresoEjercicio(alumnoId, payload as Parameters<typeof addProgresoEjercicio>[1]);
      if (res.error) { setFormErr(res.error); return; }
      const ex = exercises.find(e => e.id === form.ejercicio_id);
      onAdd({ id: Math.random().toString(36), ejercicio_id: form.ejercicio_id, fecha: form.fecha, peso_kg: form.peso_kg ? parseFloat(form.peso_kg) : null, reps: form.reps ? parseInt(form.reps) : null, sets: form.sets ? parseInt(form.sets) : null, exercises: ex ? { name: ex.name } : null });
      setShowModal(false);
      setForm({ ejercicio_id: '', fecha: new Date().toISOString().slice(0,10), peso_kg: '', reps: '', sets: '', notas: '' });
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={() => { setShowModal(true); setFormErr(''); }}>+ Registrar Ejercicio</button>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-head-left">
            <div className="card-title">Cargas Máximas — Progreso Total</div>
            <div className="card-subtitle">{maxLoads.length} ejercicios con datos</div>
          </div>
        </div>
        <div className="card-body card-body--padded">
          {maxLoads.length === 0 ? (
            <div className="empty-state">Registra sesiones de fuerza para ver el progreso</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {maxLoads.map(ex => {
                const delta = (ex.max !== null && ex.inicial !== null && ex.max !== ex.inicial) ? ex.max - ex.inicial : null;
                const pct = ex.max ? Math.min((ex.max / 200) * 100, 100) : 0;
                return (
                  <div key={ex.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-1)' }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--fg)' }}>{ex.name}</span>
                      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline' }}>
                        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', color: 'var(--accent)' }}>
                          {ex.max} kg
                        </span>
                        {delta !== null && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: delta > 0 ? '#3FF8C8' : 'var(--danger)' }}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(0)} kg
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', boxShadow: '0 0 6px var(--accent-glow)', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Registrar Ejercicio</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Ejercicio *</label>
                <select className="select" value={form.ejercicio_id} onChange={e => setForm(p => ({ ...p, ejercicio_id: e.target.value }))}>
                  <option value="">— Seleccionar —</option>
                  {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Fecha</label>
                <input className="input" type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group"><label className="label">Peso (kg)</label><input className="input" type="number" step="0.5" value={form.peso_kg} onChange={e => setForm(p => ({ ...p, peso_kg: e.target.value }))} /></div>
                <div className="form-group"><label className="label">Series</label><input className="input" type="number" value={form.sets} onChange={e => setForm(p => ({ ...p, sets: e.target.value }))} /></div>
                <div className="form-group"><label className="label">Reps</label><input className="input" type="number" value={form.reps} onChange={e => setForm(p => ({ ...p, reps: e.target.value }))} /></div>
              </div>
              {formErr && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{formErr}</p>}
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleAdd} disabled={localPending}>
                  {localPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Adherencia ─────────────────────────────────────────────────────────

function TabAdherencia({ alumnoId, sesiones, onAdd }: {
  alumnoId: string;
  sesiones: Sesion[];
  onAdd: (s: Sesion) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [sForm, setSForm] = useState({ fecha: new Date().toISOString().slice(0,10), completada: true, notas: '' });
  const [sErr, setSErr] = useState('');
  const [localPending, startTr] = useTransition();

  const completadas = sesiones.filter(s => s.completada).length;
  const perdidas    = sesiones.filter(s => !s.completada).length;
  const adherencia  = sesiones.length > 0 ? Math.round((completadas / sesiones.length) * 100) : null;

  const racha = useMemo(() => {
    const sorted = [...sesiones].filter(s => s.completada).sort((a,b) => b.fecha.localeCompare(a.fecha));
    if (!sorted.length) return 0;
    let streak = 0;
    let prev = new Date(sorted[0]!.fecha + 'T00:00:00');
    for (const s of sorted) {
      const cur = new Date(s.fecha + 'T00:00:00');
      const diff = Math.round((prev.getTime() - cur.getTime()) / (24*60*60*1000));
      if (diff <= 2) { streak++; prev = cur; } else break;
    }
    return streak;
  }, [sesiones]);

  const weeks = useMemo(() => {
    const map = new Map<string, { completadas: number; total: number }>();
    for (const s of sesiones) {
      const d = new Date(s.fecha + 'T00:00:00');
      const monday = new Date(d); monday.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
      const key = monday.toISOString().slice(0,10);
      if (!map.has(key)) map.set(key, { completadas: 0, total: 0 });
      const w = map.get(key)!;
      w.total++;
      if (s.completada) w.completadas++;
    }
    return [...map.entries()].sort((a,b) => a[0].localeCompare(b[0])).slice(-12);
  }, [sesiones]);

  const calDays = useMemo(() => {
    const set = new Set(sesiones.filter(s => s.completada).map(s => s.fecha));
    const days: { date: string; done: boolean; has: boolean }[] = [];
    const today = new Date();
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0,10);
      const allDates = new Set(sesiones.map(s => s.fecha));
      days.push({ date: key, done: set.has(key), has: allDates.has(key) });
    }
    return days;
  }, [sesiones]);

  function handleAddSesion() {
    setSErr('');
    startTr(async () => {
      const res = await addSesionEntrenamiento(alumnoId, { fecha: sForm.fecha, completada: sForm.completada, ...(sForm.notas ? { notas: sForm.notas } : {}) });
      if (res.error) { setSErr(res.error); return; }
      onAdd({ id: Math.random().toString(36), fecha: sForm.fecha, completada: sForm.completada });
      setShowModal(false);
      setSForm({ fecha: new Date().toISOString().slice(0,10), completada: true, notas: '' });
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={() => { setShowModal(true); setSErr(''); }}>+ Registrar Sesión</button>
      </div>

      <section className="metrics-row" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)' }}>
        <KPICard label="Adherencia Total" value={adherencia !== null ? `${adherencia}%` : '—'} {...(adherencia !== null ? { color: adherencia >= 75 ? '#3FF8C8' : adherencia >= 50 ? '#fbbf24' : 'var(--danger)' } : {})} />
        <KPICard label="Sesiones Completadas" value={completadas.toString()} />
        <KPICard label="Sesiones Perdidas" value={perdidas.toString()} {...(perdidas > 0 ? { color: 'var(--danger)' } : {})} />
        <KPICard label="Racha Actual" value={racha.toString()} unit="días" />
      </section>

      {/* Weekly bars */}
      {weeks.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Adherencia Semanal</div>
              <div className="card-subtitle">Últimas {weeks.length} semanas</div>
            </div>
          </div>
          <div className="card-body card-body--padded">
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', height: '100px' }}>
              {weeks.map(([week, data]) => {
                const pct = data.total > 0 ? (data.completadas / data.total) * 100 : 0;
                const color = pct >= 100 ? '#3FF8C8' : pct >= 75 ? '#fbbf24' : 'var(--danger)';
                return (
                  <div key={week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '9px', color: 'var(--fg-muted)', fontWeight: 700 }}>{Math.round(pct)}%</span>
                    <div style={{ width: '100%', height: `${Math.max(pct, 4)}px`, background: color, boxShadow: color === '#3FF8C8' ? 'var(--glow-sm)' : 'none', borderRadius: '2px 2px 0 0', transition: 'height 0.3s ease' }} />
                    <span style={{ fontSize: '9px', color: 'var(--fg-subtle)', transform: 'rotate(-45deg)', display: 'block', marginTop: '2px' }}>
                      {fmtFecha(week)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Calendar heatmap */}
      <div className="card">
        <div className="card-head">
          <div className="card-head-left">
            <div className="card-title">Mapa de Asistencia</div>
            <div className="card-subtitle">Últimas 12 semanas</div>
          </div>
        </div>
        <div className="card-body card-body--padded">
          {sesiones.length === 0 ? (
            <div className="empty-state">Registra sesiones para ver el mapa de asistencia</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {calDays.map(d => (
                <div
                  key={d.date}
                  title={d.date}
                  style={{
                    width: '12px', height: '12px', borderRadius: '2px',
                    background: d.done ? '#3FF8C8' : d.has ? 'var(--danger)' : 'var(--bg-row)',
                    border: '1px solid var(--border)',
                    opacity: d.done ? 1 : d.has ? 0.7 : 0.4,
                    boxShadow: d.done ? 'var(--glow-sm)' : 'none',
                  }}
                />
              ))}
              <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-4)', width: '100%', fontSize: 'var(--text-2xs)', color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', background: '#3FF8C8', display: 'inline-block', borderRadius: '2px' }}/> Entrenó</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', background: 'var(--danger)', display: 'inline-block', borderRadius: '2px', opacity: 0.7 }}/> No fue</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '10px', background: 'var(--bg-row)', display: 'inline-block', borderRadius: '2px', opacity: 0.4 }}/> Sin sesión</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Registrar Sesión</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Fecha</label>
                <input className="input" type="date" value={sForm.fecha} onChange={e => setSForm(p=>({...p,fecha:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="label">Estado</label>
                <select className="select" value={sForm.completada ? 'true' : 'false'} onChange={e => setSForm(p=>({...p,completada:e.target.value==='true'}))}>
                  <option value="true">Completada</option>
                  <option value="false">No completada</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Notas</label>
                <input className="input" placeholder="Opcional..." value={sForm.notas} onChange={e => setSForm(p=>({...p,notas:e.target.value}))} />
              </div>
              {sErr && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{sErr}</p>}
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleAddSesion} disabled={localPending}>
                  {localPending ? 'Guardando...' : 'Registrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 5: Logros ─────────────────────────────────────────────────────────────

const LOGRO_ICONS: Record<string, string> = {
  primera_semana: '🏆', mes_consecutivo: '🔥', tres_meses: '⭐',
  primer_pr: '💪', peso_10kg: '🏋', peso_20kg: '🏋', peso_30kg: '🏋',
  bajar_2kg: '📉', bajar_5kg: '📉', grasa_2pct: '✅', grasa_5pct: '✅',
  imc_normal: '❤️', cien_sesiones: '💯', default: '🎯',
};

function TabLogros({ alumnoId, logros }: { alumnoId: string; logros: Logro[] }) {
  const estesMes = useMemo(() => {
    const now = new Date();
    return logros.filter(l => {
      const d = new Date(l.fecha_obtenido + 'T00:00:00');
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [logros]);

  const UPCOMING = [
    { tipo: 'primera_semana', titulo: 'Primera semana completa', descripcion: 'Completa 7 días de entrenamiento' },
    { tipo: 'mes_consecutivo', titulo: '1 mes consecutivo', descripcion: 'Entrena durante 30 días seguidos' },
    { tipo: 'primer_pr', titulo: 'Primer récord personal', descripcion: 'Registra un nuevo máximo en cualquier ejercicio' },
    { tipo: 'bajar_2kg', titulo: 'Bajar 2 kg', descripcion: 'Pierde 2 kg desde el inicio' },
    { tipo: 'peso_10kg', titulo: '+10 kg en ejercicio compuesto', descripcion: 'Aumenta 10 kg en cualquier compuesto' },
  ].filter(u => !logros.find(l => l.tipo === u.tipo));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <section className="metrics-row" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)' }}>
        <KPICard label="Logros Obtenidos" value={logros.length.toString()} color="var(--accent)" />
        <KPICard label="Este Mes" value={estesMes.toString()} />
        <KPICard label="Por Desbloquear" value={UPCOMING.length.toString()} color="var(--fg-muted)" />
      </section>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Logros Desbloqueados</div>
              <div className="card-subtitle">{logros.length} obtenidos</div>
            </div>
          </div>
          <div className="card-body card-body--padded">
            {logros.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
                <p>Sin logros aún</p>
                <p style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>Registra sesiones y progreso para desbloquear</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {logros.map(l => (
                  <div key={l.id} style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: 'var(--accent-soft)', border: '1px solid var(--border-mint)', borderRadius: 'var(--radius-xs)' }}>
                    <span style={{ fontSize: '20px', flexShrink: 0 }}>{LOGRO_ICONS[l.tipo] ?? LOGRO_ICONS.default}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>{l.titulo}</div>
                      {l.descripcion && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginTop: '2px' }}>{l.descripcion}</div>}
                      <div style={{ fontSize: '10px', color: 'var(--fg-subtle)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{fmtFechaLong(l.fecha_obtenido)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-title">Próximos Logros</div>
              <div className="card-subtitle">Por desbloquear</div>
            </div>
          </div>
          <div className="card-body card-body--padded">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {UPCOMING.map(u => (
                <div key={u.tipo}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
                    <span style={{ fontSize: '16px', opacity: 0.4 }}>{LOGRO_ICONS[u.tipo] ?? LOGRO_ICONS.default}</span>
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{u.titulo}</div>
                      <div style={{ fontSize: '11px', color: 'var(--fg-subtle)' }}>{u.descripcion}</div>
                    </div>
                  </div>
                  <div style={{ height: '2px', background: 'var(--border)', borderRadius: '1px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '0%', background: 'var(--accent)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MetricasModule({ students, exercises, initialStudentId }: { students: Student[]; exercises: Exercise[]; initialStudentId?: string }) {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  const [selectedId, setSelectedId] = useState(initialStudentId ?? '');
  const [tab, setTab] = useState<Tab>('resumen');
  const [loading, setLoading] = useState(false);

  // All data per student
  const [historial,  setHistorial]  = useState<HistorialPeso[]>([]);
  const [datos,      setDatos]      = useState<DatosFisicos|null>(null);
  const [plan,       setPlan]       = useState<PlanActivo|null>(null);
  const [rutina,     setRutina]     = useState<RutinaActiva|null>(null);
  const [medidas,    setMedidas]    = useState<MedidaCorporal[]>([]);
  const [progreso,   setProgreso]   = useState<ProgresoEj[]>([]);
  const [sesiones,   setSesiones]   = useState<Sesion[]>([]);
  const [logros,     setLogros]     = useState<Logro[]>([]);

  const selected = students.find(s => s.id === selectedId);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    Promise.all([
      supabase.from('historial_peso').select('id,peso_kg,fecha,notas').eq('alumno_id', selectedId).order('fecha', { ascending: false }),
      supabase.from('alumnos_datos_fisicos').select('*').eq('alumno_id', selectedId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('planes_nutricionales').select('calorias_meta,proteinas_g,carbos_g,grasas_g,objetivo_nutricional').eq('alumno_id', selectedId).eq('activo', true).maybeSingle(),
      supabase.from('rutinas_alumno').select('nombre,fecha_inicio').eq('alumno_id', selectedId).eq('activo', true).maybeSingle(),
      supabase.from('medidas_corporales').select('id,fecha,pecho_cm,cintura_cm,cadera_cm,biceps_cm,muslo_cm').eq('alumno_id', selectedId).order('fecha', { ascending: false }),
      supabase.from('progreso_ejercicio').select('id,ejercicio_id,fecha,peso_kg,reps,sets,exercises(name)').eq('alumno_id', selectedId).order('fecha', { ascending: false }).limit(200),
      supabase.from('sesiones_entrenamiento').select('id,fecha,completada').eq('alumno_id', selectedId).order('fecha', { ascending: false }),
      supabase.from('logros').select('id,tipo,titulo,descripcion,fecha_obtenido').eq('alumno_id', selectedId).order('fecha_obtenido', { ascending: false }),
    ]).then(([h, d, p, r, m, pr, s, l]) => {
      setHistorial((h.data ?? []) as HistorialPeso[]);
      setDatos(d.data as DatosFisicos | null);
      setPlan(p.data as PlanActivo | null);
      setRutina(r.data as RutinaActiva | null);
      setMedidas((m.data ?? []) as MedidaCorporal[]);
      setProgreso((pr.data ?? []) as unknown as ProgresoEj[]);
      setSesiones((s.data ?? []) as Sesion[]);
      setLogros((l.data ?? []) as Logro[]);
      setLoading(false);
    });
  }, [selectedId, supabase]);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen',    label: 'Resumen'    },
    { key: 'cuerpo',     label: 'Cuerpo'     },
    { key: 'fuerza',     label: 'Fuerza'     },
    { key: 'adherencia', label: 'Adherencia' },
    { key: 'logros',     label: 'Logros'     },
  ];

  return (
    <div>
      {/* Student selector */}
      {!initialStudentId && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-body--padded" style={{ padding: 'var(--space-5) var(--space-6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
              <div style={{ flex: '1', minWidth: '240px' }}>
                <label className="label" style={{ marginBottom: 'var(--space-2)' }}>Alumno</label>
                <select className="select" value={selectedId} onChange={e => { setSelectedId(e.target.value); setTab('resumen'); }}>
                  <option value="">— Selecciona un alumno —</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.full_name}{s.experience_level ? ` · ${s.experience_level}` : ''}</option>)}
                </select>
              </div>
              {selected && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', color: 'var(--fg-strong)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{selected.full_name}</div>
                  {selected.experience_level && <span className="badge badge-mint-soft">{selected.experience_level}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!selectedId ? (
        <div className="card">
          <div className="chart-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <p>Selecciona un alumno para ver sus métricas</p>
          </div>
        </div>
      ) : loading ? (
        <div className="card"><div className="chart-empty"><p style={{ color: 'var(--fg-muted)' }}>Cargando datos...</p></div></div>
      ) : (
        <>
          {/* Tabs */}
          <div className="chart-tabs" style={{ marginBottom: 'var(--space-6)' }}>
            {TABS.map(t => (
              <button key={t.key} className={`chart-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'resumen' && (
            <TabResumen alumnoId={selectedId} historial={historial} datos={datos} plan={plan} rutina={rutina} prs={progreso} />
          )}
          {tab === 'cuerpo' && (
            <TabCuerpo alumnoId={selectedId} historial={historial} datos={datos} medidas={medidas} isPending={false}
              onAddMedida={m => setMedidas(prev => [{ ...m, id: Math.random().toString(36) }, ...prev])} />
          )}
          {tab === 'fuerza' && (
            <TabFuerza alumnoId={selectedId} progreso={progreso} exercises={exercises}
              onAdd={p => setProgreso(prev => [p, ...prev])} />
          )}
          {tab === 'adherencia' && (
            <TabAdherencia alumnoId={selectedId} sesiones={sesiones}
              onAdd={s => setSesiones(prev => [s, ...prev])} />
          )}
          {tab === 'logros' && (
            <TabLogros alumnoId={selectedId} logros={logros} />
          )}
        </>
      )}
    </div>
  );
}
