import type { Clase, NuevaClaseForm } from '@/types/clases';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function fechasDeClase(clase: Clase): string[] {
  const fechas: string[] = [clase.fecha];

  if (clase.recurrencia === 'rango' && clase.fecha_hasta) {
    let cur = addDays(clase.fecha, 7);
    while (cur <= clase.fecha_hasta) {
      fechas.push(cur);
      cur = addDays(cur, 7);
    }
  } else if (clase.recurrencia === 'frecuencia' && clase.fecha_hasta && clase.frecuencia_tipo) {
    const step = clase.frecuencia_tipo === 'diario' ? 1 : 2;
    let cur = addDays(clase.fecha, step);
    while (cur <= clase.fecha_hasta) {
      fechas.push(cur);
      cur = addDays(cur, step);
    }
  }

  return fechas;
}

export function clasesEnRango(clases: Clase[], start: string, end: string): Clase[] {
  return clases.filter(c =>
    fechasDeClase(c).some(f => f >= start && f <= end)
  );
}

export async function crearClase(data: NuevaClaseForm): Promise<Clase> {
  const res = await fetch('/api/clases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'Error al crear clase');
  }
  return res.json() as Promise<Clase>;
}

export async function actualizarClase(id: string, data: NuevaClaseForm): Promise<Clase> {
  const res = await fetch('/api/clases', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'Error al actualizar clase');
  }
  return res.json() as Promise<Clase>;
}

export async function eliminarClase(id: string): Promise<void> {
  const res = await fetch(`/api/clases?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? 'Error al eliminar clase');
  }
}
