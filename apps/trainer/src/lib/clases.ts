import type { Clase, NuevaClaseForm } from '@/types/clases';

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fechasDeClase(clase: Clase): string[] {
  const fechas: string[] = [clase.fecha];

  if (clase.recurrencia === 'rango' && clase.fecha_hasta) {
    let cur = addDays(clase.fecha, 1);
    while (cur <= clase.fecha_hasta) {
      fechas.push(cur);
      cur = addDays(cur, 1);
    }
  } else if (clase.recurrencia === 'frecuencia' && clase.fecha_hasta && clase.frecuencia_tipo) {
    const step = clase.frecuencia_tipo === 'diario' ? 1
               : clase.frecuencia_tipo === 'interdiario' ? 2
               : 7;
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
