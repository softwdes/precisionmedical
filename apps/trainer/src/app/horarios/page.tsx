'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import FormNuevaClase from '@/components/calendario/FormNuevaClase';
import DetalleClase from '@/components/calendario/DetalleClase';
import type { Clase } from '@/types/clases';
import { fechasDeClase } from '@/lib/clases';
import './fullcalendar-theme.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  green: '#1D9E75',
  blue: '#378ADD',
  purple: '#7F77DD',
  amber: '#EF9F27',
  coral: '#D85A30',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const calendarRef = useRef<FullCalendar>(null);
  const [clases, setClases] = useState<Clase[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [presetFecha, setPresetFecha] = useState<string | undefined>(undefined);
  const [presetHora, setPresetHora] = useState<string | undefined>(undefined);
  const [detailClase, setDetailClase] = useState<{ clase: Clase; fechaOcurrencia: string } | null>(null);
  const [editingClase, setEditingClase] = useState<Clase | undefined>(undefined);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchClases = useCallback(async () => {
    try {
      const res = await fetch('/api/clases', { cache: 'no-store' });
      const data: unknown = await res.json();
      if (Array.isArray(data)) setClases(data as Clase[]);
    } catch (err) {
      console.error('Error fetching clases:', err);
    }
  }, []);

  useEffect(() => { fetchClases(); }, [fetchClases]);

  const handleDatesSet = useCallback((_arg: DatesSetArg) => {
    fetchClases();
  }, [fetchClases]);

  // ── Event mapping ───────────────────────────────────────────────────────────

  const events: EventInput[] = useMemo(() => {
    const result: EventInput[] = [];
    for (const clase of clases) {
      const fechas = fechasDeClase(clase);
      const color = COLOR_MAP[clase.color] ?? '#1D9E75';
      for (const fecha of fechas) {
        const isRecurring = fecha !== clase.fecha;
        result.push({
          id: `${clase.id}-${fecha}`,
          title: `${isRecurring ? '↻ ' : ''}${clase.titulo}`,
          start: `${fecha}T${clase.hora_inicio}`,
          end: `${fecha}T${clase.hora_fin}`,
          backgroundColor: `${color}22`,
          textColor: color,
          borderColor: color,
          extendedProps: { clase, fechaOcurrencia: fecha },
        });
      }
    }
    return result;
  }, [clases]);

  // ── Interactions ────────────────────────────────────────────────────────────

  const handleDateClick = useCallback((arg: DateClickArg) => {
    const d = arg.date;
    const pad = (n: number) => String(n).padStart(2, '0');
    const fecha = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setPresetFecha(fecha);
    setPresetHora(hora);
    setShowNewModal(true);
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const { clase, fechaOcurrencia } = arg.event.extendedProps as {
      clase: Clase;
      fechaOcurrencia: string;
    };
    setDetailClase({ clase, fechaOcurrencia });
  }, []);

  const handleEventDrop = useCallback(async (arg: EventDropArg) => {
    const { event, revert } = arg;
    if (!event.start) { revert(); return; }
    const rawId = event.id.split('-').at(0);
    if (!rawId) { revert(); return; }
    const fecha = event.start.toISOString().slice(0, 10);
    try {
      const res = await fetch('/api/clases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rawId, fecha }),
      });
      if (!res.ok) { revert(); return; }
      await fetchClases();
    } catch {
      revert();
    }
  }, [fetchClases]);

  const handleEventResize = useCallback(async (arg: EventResizeDoneArg) => {
    const { event, revert } = arg;
    if (!event.end) { revert(); return; }
    const rawId = event.id.split('-').at(0);
    if (!rawId) { revert(); return; }
    const hora_fin = event.end.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
    try {
      const res = await fetch('/api/clases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rawId, hora_fin }),
      });
      if (!res.ok) { revert(); return; }
      await fetchClases();
    } catch {
      revert();
    }
  }, [fetchClases]);

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
          <section className="section-head section-head-row">
            <div>
              <span className="eyebrow">Horarios // 01</span>
              <h1>Horario de Clases</h1>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingClase(undefined);
                setPresetFecha(undefined);
                setPresetHora(undefined);
                setShowNewModal(true);
              }}
            >
              + Nueva Clase
            </button>
          </section>

          {/* FullCalendar */}
          <div className="fc-precision">
            <FullCalendar
              ref={calendarRef}
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

          {/* Leyenda */}
          <section className="card">
            <div className="card-head">
              <div className="card-title">Leyenda</div>
            </div>
            <div className="card-body card-body--padded">
              <div className="legend-row">
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: COLOR_MAP.green }} /> Personal
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: COLOR_MAP.blue }} /> Grupal
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: COLOR_MAP.purple }} /> Evaluación
                </span>
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: COLOR_MAP.amber }} /> Bloque
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)', marginLeft: 'auto' }}>
                  Haz clic en un espacio vacío para agregar · Arrastra para mover
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* FormNuevaClase modal */}
      {(showNewModal || editingClase !== undefined) && (
        <div
          className="modal-overlay"
          onClick={() => { setShowNewModal(false); setEditingClase(undefined); }}
        >
          <div
            className="modal"
            style={{ maxWidth: '580px' }}
            onClick={e => e.stopPropagation()}
          >
            <FormNuevaClase
              fecha={editingClase?.fecha ?? presetFecha}
              hora={editingClase ? undefined : presetHora}
              clase={editingClase}
              onGuardar={({ recurrencia, fecha }) => {
                setShowNewModal(false);
                setEditingClase(undefined);
                fetchClases().then(() => {
                  if (recurrencia !== 'ninguna') {
                    const api = calendarRef.current?.getApi();
                    if (api) api.changeView('dayGridMonth', fecha);
                  }
                });
              }}
              onCancelar={() => { setShowNewModal(false); setEditingClase(undefined); }}
            />
          </div>
        </div>
      )}

      {/* DetalleClase modal */}
      {detailClase && (
        <div
          className="modal-overlay"
          onClick={() => setDetailClase(null)}
        >
          <div
            className="modal"
            style={{ maxWidth: '480px' }}
            onClick={e => e.stopPropagation()}
          >
            <DetalleClase
              clase={detailClase.clase}
              fechaOcurrencia={detailClase.fechaOcurrencia}
              onEditar={() => { setEditingClase(detailClase.clase); setDetailClase(null); }}
              onEliminar={() => { setDetailClase(null); fetchClases(); }}
              onCerrar={() => setDetailClase(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
