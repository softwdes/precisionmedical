'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';

const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

interface BodyMetric {
  id: string;
  measured_at: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
}

interface PersonalRecord {
  id: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  achieved_on: string;
}

interface StudentWithMetrics {
  id: string;
  full_name: string;
  latestMetric: BodyMetric | null;
}

export default function MetricsPage() {
  const [students, setStudents] = useState<StudentWithMetrics[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [chartType, setChartType] = useState<'weight' | 'bodyfat' | 'muscle'>('weight');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStudents(); }, []);
  useEffect(() => { if (selectedStudent) fetchStudentData(selectedStudent); }, [selectedStudent]);

  async function fetchStudents() {
    try {
      const res = await fetch('/api/metrics/students');
      const data = await res.json();
      setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching students:', err);
    }
    setLoading(false);
  }

  async function fetchStudentData(studentId: string) {
    try {
      const [metricsRes, recordsRes] = await Promise.all([
        fetch(`/api/metrics/${studentId}`),
        fetch(`/api/metrics/${studentId}/records`),
      ]);
      const metricsData = await metricsRes.json();
      const recordsData = await recordsRes.json();
      setMetrics(Array.isArray(metricsData) ? metricsData : []);
      setRecords(Array.isArray(recordsData) ? recordsData : []);
    } catch (err) {
      console.error('Error fetching student data:', err);
    }
  }

  const chartData = useMemo(() => {
    return [...metrics].reverse().slice(-30).map(m => ({
      date: fmtDate(m.measured_at),
      value: chartType === 'weight' ? m.weight_kg : chartType === 'bodyfat' ? m.body_fat_pct : m.muscle_mass_kg,
    }));
  }, [metrics, chartType]);

  const maxValue = useMemo(() => Math.max(...chartData.map(d => d.value || 0), 1), [chartData]);
  const avgValue = useMemo(() =>
    chartData.length > 0 ? chartData.reduce((sum, d) => sum + (d.value || 0), 0) / chartData.length : 0,
  [chartData]);
  const trend = useMemo(() =>
    chartData.length >= 2 ? ((chartData[chartData.length - 1]?.value || 0) - (chartData[0]?.value || 0)) : 0,
  [chartData]);

  return (
    <div className="app">
      <AppSidebar
        active="metricas"
        systemStatus={
          <div className="system-status-row"><span>Suscripción</span><span className="val accent">Activa</span></div>
        }
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> <span className="crumb-active">Métricas</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Telemetría // 01</span>
            <h1>Seguimiento de Progreso</h1>
          </section>

          <div className="row-between" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="student-selector">
              <label className="label-caps">Seleccionar Alumno</label>
              <select
                className="select"
                style={{ width: 'min(300px, 100%)' }}
                value={selectedStudent || ''}
                onChange={(e) => setSelectedStudent(e.target.value || null)}
              >
                <option value="">Todos los alumnos</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
            {selectedStudent && (
              <Link href={`/alumnos/${selectedStudent}`} className="btn btn-outline">
                Ver Perfil Completo
              </Link>
            )}
          </div>

          {selectedStudent ? (
            <>
              <section className="metrics-row">
                <div className="metric">
                  <div className="label-caps">Peso Actual</div>
                  <div className="metric-row">
                    <span className="metric-value">{metrics[0]?.weight_kg?.toFixed(1) || '-'} kg</span>
                    <span className="metric-delta">
                      {trend !== 0 ? `${trend > 0 ? '+' : ''}${trend.toFixed(1)} kg` : 'Sin cambio'}
                    </span>
                  </div>
                  <div className="metric-bar">
                    <span style={{ width: `${(metrics[0]?.weight_kg || 0) / maxValue * 100}%` }} />
                  </div>
                </div>
                <div className="metric">
                  <div className="label-caps">% Grasa</div>
                  <div className="metric-row">
                    <span className="metric-value">{metrics[0]?.body_fat_pct?.toFixed(1) || '-'}%</span>
                  </div>
                  <div className="metric-bar">
                    <span style={{ width: `${metrics[0]?.body_fat_pct || 0}%` }} />
                  </div>
                </div>
                <div className="metric">
                  <div className="label-caps">Masa Muscular</div>
                  <div className="metric-row">
                    <span className="metric-value">{metrics[0]?.muscle_mass_kg?.toFixed(1) || '-'} kg</span>
                  </div>
                  <div className="metric-bar">
                    <span style={{ width: `${(metrics[0]?.muscle_mass_kg || 0) / 50 * 100}%` }} />
                  </div>
                </div>
                <div className="metric">
                  <div className="label-caps">Última Medición</div>
                  <div className="metric-row">
                    <span className="metric-value">
                      {metrics[0]?.measured_at ? fmtDate(metrics[0].measured_at) : '-'}
                    </span>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <div className="card-head-left">
                    <div className="card-title">Evolución</div>
                    <div className="card-subtitle">Seguimiento a lo largo del tiempo</div>
                  </div>
                  <div className="chart-tabs">
                    {(['weight', 'bodyfat', 'muscle'] as const).map(t => (
                      <button key={t} className={`chart-tab ${chartType === t ? 'active' : ''}`} onClick={() => setChartType(t)}>
                        {t === 'weight' ? 'Peso' : t === 'bodyfat' ? '% Grasa' : 'Músculo'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="card-body">
                  <div className="chart-container">
                    {chartData.length > 0 ? (
                      <div className="line-chart">
                        <svg viewBox="0 0 800 200" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="#3FF8C8" stopOpacity="0.3"/>
                              <stop offset="100%" stopColor="#3FF8C8" stopOpacity="0"/>
                            </linearGradient>
                          </defs>
                          <g className="chart-grid">
                            {[20,60,100,140,180].map(y => <line key={y} x1="40" x2="780" y1={y} y2={y} />)}
                          </g>
                          <path
                            className="chart-area"
                            d={`M40,${200 - (chartData[0]?.value || 0) / maxValue * 180} ${chartData.map((d, i) =>
                              `L${40 + (i * 740 / (chartData.length - 1 || 1))},${200 - ((d.value || 0) / maxValue * 180)}`
                            ).join(' ')} L780,180 L40,180 Z`}
                            fill="url(#chartGradient)"
                          />
                          <path
                            className="chart-line"
                            d={`M40,${200 - (chartData[0]?.value || 0) / maxValue * 180} ${chartData.map((d, i) =>
                              `L${40 + (i * 740 / (chartData.length - 1 || 1))},${200 - ((d.value || 0) / maxValue * 180)}`
                            ).join(' ')}`}
                          />
                        </svg>
                        <div className="chart-labels">
                          {chartData.filter((_, i) => i % Math.ceil(chartData.length / 6) === 0).map((d, i) => (
                            <span key={i}>{d.date}</span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="chart-empty">
                        <p>No hay datos de métricas registrados</p>
                        <Link href={`/alumnos/${selectedStudent}`} className="btn btn-outline">
                          Agregar Primera Medición
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <div className="grid grid-2">
                <section className="card">
                  <div className="card-head">
                    <div className="card-head-left">
                      <div className="card-title">Récords Personales</div>
                      <div className="card-subtitle">{records.length} ejercicios con PR</div>
                    </div>
                  </div>
                  <div className="card-body card-body--padded">
                    {records.length > 0 ? (
                      <div className="pr-list">
                        {records.map(pr => (
                          <div key={pr.id} className="pr-item">
                            <div className="pr-exercise">{pr.exercise_name}</div>
                            <div className="pr-values">
                              <span className="pr-weight">{pr.weight_kg} kg</span>
                              <span className="pr-reps">× {pr.reps} reps</span>
                            </div>
                            <div className="pr-date">{fmtDate(pr.achieved_on)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">Sin récords registrados</div>
                    )}
                  </div>
                </section>

                <section className="card">
                  <div className="card-head">
                    <div className="card-head-left"><div className="card-title">Estadísticas</div></div>
                  </div>
                  <div className="card-body card-body--padded">
                    <div className="stats-grid">
                      <div className="stat-item">
                        <div className="stat-label">Mediciones Totales</div>
                        <div className="stat-value">{metrics.length}</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">Cambio de Peso</div>
                        <div className="stat-value">
                          {metrics.length >= 2
                            ? `${((metrics[0]?.weight_kg || 0) - (metrics[metrics.length - 1]?.weight_kg || 0)).toFixed(1)} kg`
                            : '-'}
                        </div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">Promedio</div>
                        <div className="stat-value">{avgValue.toFixed(1)} {chartType === 'weight' ? 'kg' : '%'}</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">Récords Establecidos</div>
                        <div className="stat-value">{records.length}</div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <section className="card">
              <div className="card-head">
                <div className="card-title">Resumen de Todos los Alumnos</div>
              </div>
              <div className="card-body card-body--padded">
                {loading ? (
                  <div style={{ color: 'var(--fg-muted)', padding: 'var(--space-4)' }}>Cargando...</div>
                ) : (
                  <div className="students-metrics-grid">
                    {students.map(student => (
                      <div key={student.id} className="student-metric-card">
                        <div className="student-metric-name">{student.full_name}</div>
                        <div className="student-metric-values">
                          <div className="metric-mini">
                            <span className="label-caps">Peso</span>
                            <span className="value">{student.latestMetric?.weight_kg?.toFixed(1) || '-'} kg</span>
                          </div>
                          <div className="metric-mini">
                            <span className="label-caps">% Grasa</span>
                            <span className="value">{student.latestMetric?.body_fat_pct?.toFixed(1) || '-'}%</span>
                          </div>
                          <div className="metric-mini">
                            <span className="label-caps">Músculo</span>
                            <span className="value">{student.latestMetric?.muscle_mass_kg?.toFixed(1) || '-'} kg</span>
                          </div>
                        </div>
                        <button className="btn btn-ghost btn-icon" onClick={() => setSelectedStudent(student.id)} title="Ver detalles">→</button>
                      </div>
                    ))}
                    {students.length === 0 && (
                      <div className="empty-state">No hay alumnos registrados</div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
