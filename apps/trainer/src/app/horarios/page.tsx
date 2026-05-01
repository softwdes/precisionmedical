'use client';

import { useState, useCallback, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type {
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core';
import type { DateClickArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';
import './fullcalendar-theme.css';

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const BLOCK_TYPE_LABELS: Record<string, string> = {
  personal: 'Personal',
  break: 'Descanso',
  meal: 'Comida',
};

const BLOCK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  available: { bg: '#3FF8C8', text: '#00120E', border: '#3FF8C8' },
  personal: { bg: '#161C1B', text: '#6B7472', border: '#243029' },
  break: { bg: '#1F2624', text: '#4A5250', border: '#1A211F' },
  meal: { bg: '#1F2624', text: '#4A5250', border: '#1A211F' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

function toDatetimeLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Create-block modal
  const [showModal, setShowModal] = useState(false);
  const [preset, setPreset] = useState<{ starts_at: string; ends_at: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Event-detail modal
  const [selectedBlock, setSelectedBlock] = useState<{
    block: AvailabilityBlock;
    bookings: Booking[];
  } | null>(null);

  // Track current calendar range so we can refetch after mutations
  const currentRangeRef = useRef<{ start: Date; end: Date } | null>(null);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchSchedule = useCallback(async (start: Date, end: Date) => {
    try {
      const [ar, br] = await Promise.all([
        fetch(`/api/availability?start=${start.toISOString()}&end=${end.toISOString()}`),
        fetch(`/api/bookings?start=${start.toISOString()}&end=${end.toISOString()}`),
      ]);
      const [ad, bd] = await Promise.all([ar.json(), br.json()]);
      setAvailability(Array.isArray(ad) ? ad : []);
      setBookings(Array.isArray(bd) ? bd : []);
    } catch (err) {
      console.error('Error fetching schedule:', err);
    }
  }, []);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    currentRangeRef.current = { start: arg.start, end: arg.end };
    fetchSchedule(arg.start, arg.end);
  }, [fetchSchedule]);

  // ── Event mapping ───────────────────────────────────────────────────────────

  const events: EventInput[] = availability.map(block => {
    const bks = bookings.filter(b => b.trainer_availability_id === block.id);
    const colors = BLOCK_COLORS[block.block_type] ?? BLOCK_COLORS.personal!;
    const hasBookings = bks.length > 0;

    let title: string;
    if (block.block_type === 'available') {
      const free = block.capacity - bks.length;
      title = `${free}/${block.capacity} libre`;
      if (hasBookings) {
        title += ' · ' + bks.map(b => b.student?.full_name || 'Reservado').join(', ');
      }
    } else {
      title = BLOCK_TYPE_LABELS[block.block_type] ?? block.block_type;
    }

    return {
      id: block.id,
      title,
      start: block.starts_at,
      end: block.ends_at,
      backgroundColor: colors.bg,
      textColor: colors.text,
      borderColor: hasBookings ? '#5BFFD0' : colors.border,
      extendedProps: { block, bookings: bks },
    };
  });

  // ── Interactions ────────────────────────────────────────────────────────────

  const handleDateClick = useCallback((arg: DateClickArg) => {
    const start = arg.date;
    const end = new Date(start.getTime() + 60 * 60_000);
    setPreset({ starts_at: toDatetimeLocal(start), ends_at: toDatetimeLocal(end) });
    setFormError('');
    setShowModal(true);
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const { block, bookings } = arg.event.extendedProps as {
      block: AvailabilityBlock;
      bookings: Booking[];
    };
    setSelectedBlock({ block, bookings });
  }, []);

  const handleEventDrop = useCallback(async (arg: EventDropArg) => {
    const { event, revert } = arg;
    if (!event.start || !event.end) { revert(); return; }
    try {
      const res = await fetch('/api/availability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: event.id,
          starts_at: event.start.toISOString(),
          ends_at: event.end.toISOString(),
        }),
      });
      if (!res.ok) revert();
    } catch {
      revert();
    }
  }, []);

  const handleEventResize = useCallback(async (arg: EventResizeDoneArg) => {
    const { event, revert } = arg;
    if (!event.start || !event.end) { revert(); return; }
    try {
      const res = await fetch('/api/availability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: event.id,
          starts_at: event.start.toISOString(),
          ends_at: event.end.toISOString(),
        }),
      });
      if (!res.ok) revert();
    } catch {
      revert();
    }
  }, []);

  // ── Create block ────────────────────────────────────────────────────────────

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
          block_type: fd.get('block_type') ?? 'available',
          starts_at: fd.get('starts_at'),
          ends_at: fd.get('ends_at'),
          capacity: Number(fd.get('capacity') ?? 1),
          session_duration_min: Number(fd.get('session_duration_min') ?? 60),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Error al guardar');
      }
      setShowModal(false);
      if (currentRangeRef.current) {
        fetchSchedule(currentRangeRef.current.start, currentRangeRef.current.end);
      }
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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
            Panel del Entrenador <span className="sep">//</span>{' '}
            <span className="crumb-active">Horarios</span>
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

          {/* FullCalendar */}
          <div className="fc-precision">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="timeGridWeek"
              locale={esLocale}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay',
              }}
              buttonText={{
                today: 'Hoy',
                month: 'Mes',
                week: 'Semana',
                day: 'Día',
              }}
              slotMinTime="06:00:00"
              slotMaxTime="20:00:00"
              slotDuration="00:30:00"
              allDaySlot={false}
              nowIndicator={true}
              editable={true}
              droppable={true}
              selectable={true}
              selectMirror={true}
              dayMaxEvents={true}
              events={events}
              datesSet={handleDatesSet}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              height="auto"
            />
          </div>

          {/* Leyenda + botón nuevo */}
          <section className="card">
            <div className="card-head">
              <div className="card-title">Leyenda</div>
              <button className="btn btn-primary" onClick={() => { setPreset(null); setFormError(''); setShowModal(true); }}>
                + Nuevo Bloque
              </button>
            </div>
            <div className="card-body card-body--padded">
              <div className="legend-row">
                <span className="legend-item"><span className="legend-dot available" /> Disponible</span>
                <span className="legend-item"><span className="legend-dot personal" /> Personal</span>
                <span className="legend-item"><span className="legend-dot break" /> Descanso</span>
                <span className="legend-item"><span className="legend-dot meal" /> Comida</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginLeft: 'auto' }}>
                  Haz clic en un espacio vacío para agregar · Arrastra para mover
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ══ CREATE BLOCK MODAL ══ */}
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
                <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: '6px', fontSize: '13px', color: '#ff6b6b' }}>
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
                  <input type="datetime-local" name="starts_at" className="input" required defaultValue={preset?.starts_at ?? ''} />
                </div>
                <div className="form-group">
                  <label className="label">Fin</label>
                  <input type="datetime-local" name="ends_at" className="input" required defaultValue={preset?.ends_at ?? ''} />
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

      {/* ══ EVENT DETAIL MODAL ══ */}
      {selectedBlock && (
        <div className="modal-overlay" onClick={() => setSelectedBlock(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)', color: 'var(--accent)' }}>
                  {selectedBlock.block.block_type === 'available'
                    ? 'Bloque Disponible'
                    : BLOCK_TYPE_LABELS[selectedBlock.block.block_type] ?? selectedBlock.block.block_type}
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>
                  {new Date(selectedBlock.block.starts_at).toLocaleString('es', {
                    weekday: 'short', day: 'numeric', month: 'short',
                    hour: '2-digit', minute: '2-digit',
                  })}
                  {' → '}
                  {new Date(selectedBlock.block.ends_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedBlock(null)}>✕</button>
            </div>

            <div className="modal-body">
              {selectedBlock.block.block_type === 'available' && (
                <div className="info-list">
                  <div className="info-row">
                    <span className="info-label">Capacidad</span>
                    <span className="info-value">{selectedBlock.block.capacity} alumno{selectedBlock.block.capacity !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Disponibles</span>
                    <span className="info-value" style={{ color: 'var(--accent)' }}>
                      {selectedBlock.block.capacity - selectedBlock.bookings.length}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Duración sesión</span>
                    <span className="info-value">{selectedBlock.block.session_duration_min} min</span>
                  </div>
                </div>
              )}

              {selectedBlock.bookings.length > 0 && (
                <div>
                  <div className="label" style={{ marginBottom: '8px' }}>Reservas</div>
                  <div className="info-list">
                    {selectedBlock.bookings.map(b => (
                      <div key={b.id} className="info-row">
                        <span className="info-value">{b.student?.full_name || 'Alumno'}</span>
                        <span className="badge badge-mint-soft">{b.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedBlock.bookings.length === 0 && selectedBlock.block.block_type === 'available' && (
                <div style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>Sin reservas aún.</div>
              )}
            </div>

            <div className="modal-actions" style={{ padding: '12px 24px' }}>
              <button className="btn btn-outline" onClick={() => setSelectedBlock(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
