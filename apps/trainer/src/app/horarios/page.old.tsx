'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';

type CalendarView = 'day' | 'week' | 'month';

const MONTHS_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const WEEK_DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const WEEK_DAYS_FULL  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// 30-min slots 6:00 → 19:30 (28 slots)
const TIME_SLOTS = Array.from({ length: 28 }, (_, i) => ({
  h: 6 + Math.floor(i / 2),
  m: i % 2 === 0 ? 0 : 30,
}));

const SLOT_PX = 32; // px per 30-min slot

function pad(n: number) { return String(n).padStart(2, '0'); }

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateLocal(s: string): Date {
  const [y, mo, d] = s.split('-').map(Number);
  return new Date(y!, mo! - 1, d!);
}

function toDatetimeLocal(d: Date) {
  return `${localDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(d: Date, includeYear?: boolean) {
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return includeYear ? `${base} ${d.getFullYear()}` : base;
}

interface AvailabilityBlock {
  id: string;
  starts_at: string;
  ends_at: string;
  block_type: string;
  capacity: number;
  session_duration_min: number;
}

interface Booking {
  id: string;
  status: string;
  student_id?: string;
  trainer_availability_id?: string;
  student?: { full_name: string };
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  personal: 'Personal',
  break: 'Descanso',
  meal: 'Comida',
};

export default function SchedulePage() {
  const [view, setView]               = useState<CalendarView>('week');
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([]);
  const [bookings, setBookings]        = useState<Booking[]>([]);
  const [showModal, setShowModal]      = useState(false);
  const [preset, setPreset]            = useState<{ starts_at: string; ends_at: string } | null>(null);
  const [formError, setFormError]      = useState('');
  const [saving, setSaving]            = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [today, setToday]              = useState('');
  const [mounted, setMounted]          = useState(false);

  useEffect(() => {
    const now = new Date();
    setSelectedDate(localDateStr(now));
    setToday(now.toDateString());
    setMounted(true);
  }, []);

  // ── helpers ──────────────────────────────────────────────────────────────

  function getStartOfWeek(dateStr: string): Date {
    const d = parseDateLocal(dateStr);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  function getWeekDates(): Date[] {
    const start = getStartOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return d;
    });
  }

  function getMonthDates(): { date: Date; inMonth: boolean }[] {
    const [y, mo] = selectedDate.split('-').map(Number);
    const month = mo! - 1;
    const firstDay = new Date(y!, month, 1);
    const start = new Date(firstDay);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: day, inMonth: day.getMonth() === month };
    });
  }

  function getBlocksForSlot(date: Date, h: number, m: number): AvailabilityBlock[] {
    const dateStr = date.toDateString();
    return availability.filter(block => {
      const bs = new Date(block.starts_at);
      return bs.toDateString() === dateStr && bs.getHours() === h && bs.getMinutes() === m;
    });
  }

  function getBlocksForDay(date: Date): AvailabilityBlock[] {
    const dateStr = date.toDateString();
    return availability.filter(b => new Date(b.starts_at).toDateString() === dateStr);
  }

  function getBookingsForBlock(blockId: string): Booking[] {
    return bookings.filter(b => b.trainer_availability_id === blockId);
  }

  function durationMin(startsAt: string, endsAt: string): number {
    return (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000;
  }

  // ── data fetch ────────────────────────────────────────────────────────────

  const fetchSchedule = useCallback(async () => {
    if (!selectedDate) return;
    let start: Date, end: Date;
    if (view === 'day') {
      start = parseDateLocal(selectedDate);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    } else if (view === 'week') {
      start = getStartOfWeek(selectedDate);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    } else {
      const [y, mo] = selectedDate.split('-').map(Number);
      const firstOfMonth = new Date(y!, mo! - 1, 1);
      start = new Date(firstOfMonth);
      start.setDate(start.getDate() - start.getDay());
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 42);
    }
    try {
      const [ar, br] = await Promise.all([
        fetch(`/api/availability?start=${start.toISOString()}&end=${end.toISOString()}`),
        fetch(`/api/bookings?start=${start.toISOString()}&end=${end.toISOString()}`),
      ]);
      const ad = await ar.json();
      const bd = await br.json();
      setAvailability(Array.isArray(ad) ? ad : []);
      setBookings(Array.isArray(bd) ? bd : []);
    } catch (err) {
      console.error('Error fetching schedule:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, view]);

  useEffect(() => { if (mounted) fetchSchedule(); }, [fetchSchedule, mounted]);

  // ── navigation ────────────────────────────────────────────────────────────

  function navigate(dir: number) {
    const d = parseDateLocal(selectedDate);
    if (view === 'day')   d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setSelectedDate(localDateStr(d));
  }

  // ── modal ─────────────────────────────────────────────────────────────────

  function openSlotModal(date: Date, h: number, m: number) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
    const end   = new Date(start.getTime() + 60 * 60000);
    setPreset({ starts_at: toDatetimeLocal(start), ends_at: toDatetimeLocal(end) });
    setFormError('');
    setShowModal(true);
  }

  function openEmptyModal() {
    setPreset(null);
    setFormError('');
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setFormError('');
    setSaving(true);
    try {
      const res = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_type:          fd.get('block_type') ?? 'available',
          starts_at:           fd.get('starts_at'),
          ends_at:             fd.get('ends_at'),
          capacity:            Number(fd.get('capacity') ?? 1),
          session_duration_min: Number(fd.get('session_duration_min') ?? 60),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Error al guardar');
      }
      setShowModal(false);
      await fetchSchedule();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const weekDates  = useMemo(() => mounted && selectedDate ? getWeekDates()  : [], [mounted, selectedDate]);
  const monthDates = useMemo(() => mounted && selectedDate && view === 'month' ? getMonthDates() : [], [mounted, selectedDate, view]);

  const navLabel = useMemo(() => {
    if (!mounted || !selectedDate) return '—';
    const d = parseDateLocal(selectedDate);
    if (view === 'day')   return `${WEEK_DAYS_FULL[d.getDay()]}, ${fmtDate(d, true)}`;
    if (view === 'week') {
      const dates = getWeekDates();
      return `${fmtDate(dates[0]!)} — ${fmtDate(dates[6]!, true)}`;
    }
    return `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, selectedDate, view]);

  // ── slot renderer (shared day/week) ───────────────────────────────────────

  function renderSlotCell(date: Date, h: number, m: number, key: string | number) {
    const blocks  = getBlocksForSlot(date, h, m);
    const isEmpty = blocks.length === 0;
    return (
      <div
        key={key}
        className={`slot-cell${isEmpty ? ' slot-cell--empty' : ''}`}
        style={{ minHeight: SLOT_PX }}
        onClick={() => isEmpty && openSlotModal(date, h, m)}
        title={isEmpty ? `Agregar bloque ${pad(h)}:${pad(m)}` : undefined}
      >
        {blocks.map(block => {
          const bks    = getBookingsForBlock(block.id);
          const dur    = durationMin(block.starts_at, block.ends_at);
          const height = Math.max(Math.round((dur / 30) * SLOT_PX), SLOT_PX);
          return (
            <div
              key={block.id}
              className={`schedule-block ${block.block_type}${bks.length > 0 ? ' has-bookings' : ''}`}
              style={{ height }}
            >
              {block.block_type === 'available' && (
                <span className="block-capacity">{block.capacity - bks.length}/{block.capacity} libre</span>
              )}
              {block.block_type !== 'available' && (
                <span className="block-type">{BLOCK_TYPE_LABELS[block.block_type] ?? block.block_type}</span>
              )}
              {bks.map(b => (
                <div key={b.id} className="booking-chip">{b.student?.full_name || 'Reservado'}</div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  // ── time cell renderer ────────────────────────────────────────────────────

  function TimeCell({ h, m }: { h: number; m: number }) {
    return (
      <div
        className="time-cell"
        style={{
          fontSize: m === 0 ? 'var(--text-xs)' : '10px',
          color: m === 0 ? 'var(--fg-muted)' : 'var(--fg-subtle)',
          fontWeight: m === 0 ? 600 : 400,
        }}
      >
        {pad(h)}:{pad(m)}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <AppSidebar
        active="horarios"
        systemStatus={
          <div className="system-status-row">
            <span>Suscripción</span><span className="val accent">Activa</span>
          </div>
        }
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> <span className="crumb-active">Horarios</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Protocolo // 01</span>
            <h1>Gestión de Horarios</h1>
          </section>

          {/* ── Controls bar ── */}
          <div className="cal-controls">
            <div className="week-nav">
              <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>◀</button>
              <span className="week-label">{navLabel}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => navigate(1)}>▶</button>
            </div>

            <div className="view-toggle">
              {(['day','week','month'] as const).map(v => (
                <button
                  key={v}
                  className={`view-toggle-btn${view === v ? ' active' : ''}`}
                  onClick={() => setView(v)}
                >
                  {v === 'day' ? 'Día' : v === 'week' ? 'Semana' : 'Mes'}
                </button>
              ))}
            </div>

            <button className="btn btn-primary" onClick={openEmptyModal}>+ Nuevo Bloque</button>
          </div>

          {!mounted && (
            <div className="calendar-scroll">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'400px', color:'var(--fg-muted)' }}>
                Cargando...
              </div>
            </div>
          )}

          {/* ══ DAY VIEW ══ */}
          {mounted && view === 'day' && (() => {
            const date = parseDateLocal(selectedDate);
            const isToday = date.toDateString() === today;
            return (
              <div className="calendar-scroll">
                <div className="calendar-grid" style={{ minWidth: '300px' }}>
                  <div className="calendar-header" style={{ gridTemplateColumns: '72px 1fr' }}>
                    <div className="time-column" />
                    <div className={`day-header${isToday ? ' today' : ''}`} style={{ cursor: 'default' }}>
                      <span className="day-name">{WEEK_DAYS_FULL[date.getDay()]}</span>
                      <span className="day-num">{date.getDate()}</span>
                    </div>
                  </div>
                  <div className="calendar-body">
                    {TIME_SLOTS.map(({ h, m }) => (
                      <div key={`${h}-${m}`} className="time-row" style={{ gridTemplateColumns: '72px 1fr', minHeight: SLOT_PX }}>
                        <TimeCell h={h} m={m} />
                        {renderSlotCell(date, h, m, `slot-${h}-${m}`)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ══ WEEK VIEW ══ */}
          {mounted && view === 'week' && (
            <div className="calendar-scroll">
              <div className="calendar-grid">
                <div className="calendar-header">
                  <div className="time-column" />
                  {weekDates.map((date, i) => (
                    <div
                      key={i}
                      className={`day-header${date.toDateString() === today ? ' today' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => { setSelectedDate(localDateStr(date)); setView('day'); }}
                      title={`Ver ${WEEK_DAYS_FULL[date.getDay()]}`}
                    >
                      <span className="day-name">{WEEK_DAYS_SHORT[date.getDay()]}</span>
                      <span className="day-num">{date.getDate()}</span>
                    </div>
                  ))}
                </div>
                <div className="calendar-body">
                  {TIME_SLOTS.map(({ h, m }) => (
                    <div key={`${h}-${m}`} className="time-row" style={{ minHeight: SLOT_PX }}>
                      <TimeCell h={h} m={m} />
                      {weekDates.map((date, dayIdx) => renderSlotCell(date, h, m, dayIdx))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ MONTH VIEW ══ */}
          {mounted && view === 'month' && (
            <div className="month-grid">
              {WEEK_DAYS_SHORT.map(d => (
                <div key={d} className="month-day-header">{d}</div>
              ))}
              {monthDates.map(({ date, inMonth }, i) => {
                const blocks  = getBlocksForDay(date);
                const isToday = date.toDateString() === today;
                return (
                  <div
                    key={i}
                    className={`month-day-cell${!inMonth ? ' other-month' : ''}${isToday ? ' today-cell' : ''}`}
                    onClick={() => { setSelectedDate(localDateStr(date)); setView('day'); }}
                    title={`Ver ${fmtDate(date, true)}`}
                  >
                    <div className="month-day-num">{date.getDate()}</div>
                    {blocks.slice(0, 3).map(block => {
                      const bs = new Date(block.starts_at);
                      return (
                        <div key={block.id} className={`month-block-dot ${block.block_type}`}>
                          {pad(bs.getHours())}:{pad(bs.getMinutes())}
                          {block.block_type === 'available' && ' ·'}
                        </div>
                      );
                    })}
                    {blocks.length > 3 && (
                      <div className="month-block-more">+{blocks.length - 3} más</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Legend ── */}
          <section className="card">
            <div className="card-head"><div className="card-title">Leyenda</div></div>
            <div className="card-body card-body--padded">
              <div className="legend-row">
                <span className="legend-item"><span className="legend-dot available" /> Disponible</span>
                <span className="legend-item"><span className="legend-dot personal" /> Personal</span>
                <span className="legend-item"><span className="legend-dot break" /> Descanso</span>
                <span className="legend-item"><span className="legend-dot meal" /> Comida</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginLeft: 'auto' }}>
                  Haz clic en un espacio vacío para agregar un bloque
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ══ MODAL ══ */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', color: 'var(--accent)' }}>
                  Nuevo Bloque
                </h2>
                {preset && (
                  <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>
                    {preset.starts_at.replace('T', ' ').slice(0, 16)} → {preset.ends_at.slice(11, 16)}
                  </div>
                )}
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => !saving && setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className="modal-body">
              {formError && (
                <div style={{ padding:'10px 14px', background:'rgba(255,80,80,0.1)', border:'1px solid rgba(255,80,80,0.3)', borderRadius:'6px', fontSize:'13px', color:'#ff6b6b' }}>
                  {formError}
                </div>
              )}

              <div className="form-group">
                <label className="label">Tipo de Bloque</label>
                <select name="block_type" className="select" defaultValue="available">
                  <option value="available">Disponible — sesión con alumno</option>
                  <option value="personal">Personal</option>
                  <option value="break">Descanso</option>
                  <option value="meal">Comida</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="label">Inicio</label>
                  <input
                    type="datetime-local"
                    name="starts_at"
                    className="input"
                    required
                    defaultValue={preset?.starts_at ?? ''}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Fin</label>
                  <input
                    type="datetime-local"
                    name="ends_at"
                    className="input"
                    required
                    defaultValue={preset?.ends_at ?? ''}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="label">Capacidad (alumnos)</label>
                  <input type="number" name="capacity" className="input" defaultValue="1" min="1" max="20" />
                </div>
                <div className="form-group">
                  <label className="label">Duración de sesión</label>
                  <select name="session_duration_min" className="select" defaultValue="60">
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                    <option value="90">90 min</option>
                  </select>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : 'Crear Bloque'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
