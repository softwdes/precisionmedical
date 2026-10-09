/**
 * La vista del ADMINISTRADOR: una fila por persona con lo que tiene por corregir y
 * lo que ya corrigió. Plan: docs/plan-mis-pendientes.html (pantalla de admin).
 *
 * Reusa los mismos detectores que ve cada persona en "Mis pendientes": el
 * administrador y el usuario ven la MISMA verdad, calculada por el mismo código.
 *
 * Sin ranking a propósito: los números dependen de cuánto trabajo tiene cada
 * persona (quien agenda cien citas tiene más oportunidades de equivocarse que
 * quien agenda diez), así que ordenar de "peor a mejor" castigaría al que más
 * trabaja. La tabla va por nombre.
 */

import { db } from '@precision-medical/database';
import { misPendientes, type PendienteTipo, type ResultadoPendientes } from './index';
import { corregidos, type Corregido } from './corregidos';

export interface FilaEquipo {
  userId: string;
  nombre: string;
  rol: string;
  /** Lo que tiene por corregir hoy. */
  activos: ResultadoPendientes['counts'];
  /** Lo que ya corrigió en la ventana. */
  resueltos: number;
  /**
   * Horas TÍPICAS entre el error y su corrección (la MEDIANA); `null` si no hay ninguna.
   * No el promedio: una cita que se limpió meses después de nacer arrastra el
   * promedio a cientos de horas y dice algo que no es cierto de nadie.
   */
  horasTipico: number | null;
  /** El tipo que más se repite entre lo activo; `null` si no tiene nada. */
  masFrecuente: PendienteTipo | null;
}

export interface ResumenEquipo {
  filas: FilaEquipo[];
  totales: { activos: number; resueltos: number; personas: number; conPendientes: number; horasTipico: number | null };
  dias: number;
}

const TIPOS: PendienteTipo[] = [
  'CITA_DUPLICADA', 'SMS_FALLIDO', 'CORREO_FALLIDO', 'CITA_SIN_CERRAR', 'CITA_SIN_PROVIDER', 'MENSAJE_DUPLICADO',
];

/** Cuántas personas se calculan a la vez: cada una dispara cinco consultas. */
const EN_PARALELO = 4;

export function masFrecuente(counts: ResultadoPendientes['counts']): PendienteTipo | null {
  let mejor: PendienteTipo | null = null;
  let max = 0;
  for (const t of TIPOS) if (counts[t] > max) { max = counts[t]; mejor = t; }
  return mejor;
}

export function medianaHoras(items: Corregido[]): number | null {
  if (items.length === 0) return null;
  const h = items.map((i) => i.horas).sort((a, b) => a - b);
  const m = Math.floor(h.length / 2);
  return h.length % 2 ? h[m]! : (h[m - 1]! + h[m]!) / 2;
}

/**
 * Las personas con actividad reciente: quien creó una cita o mandó un mensaje en
 * los últimos 60 días. Quien no tocó nada no puede tener nada por corregir, y así
 * no se calcula a todo el padrón.
 */
async function personasActivas(): Promise<string[]> {
  const filas = await db.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT x.id FROM (
      SELECT "createdByUserId" AS id FROM appointments
       WHERE "createdByUserId" IS NOT NULL AND "createdAt" >= now() - interval '60 days'
      UNION
      SELECT "sentByUserId" AS id FROM message_logs
       WHERE "sentByUserId" IS NOT NULL AND "createdAt" >= now() - interval '60 days'
    ) x`;
  return filas.map((f) => f.id);
}

/**
 * La vista se pide cada vez que un administrador abre o actualiza la pantalla y
 * cuesta ~5 consultas por persona. Un minuto en memoria alcanza para que dos
 * personas mirando lo mismo no la calculen dos veces, y no deja un dato viejo
 * que engañe: lo que se muestra nunca tiene más de un minuto.
 */
const VIGENCIA_MS = 60_000;
let memo: { at: number; dias: number; data: ResumenEquipo } | null = null;

export async function resumenDelEquipo(dias = 30): Promise<ResumenEquipo> {
  if (memo && memo.dias === dias && Date.now() - memo.at < VIGENCIA_MS) return memo.data;
  const data = await calcularResumen(dias);
  memo = { at: Date.now(), dias, data };
  return data;
}

async function calcularResumen(dias: number): Promise<ResumenEquipo> {
  const ids = await personasActivas();
  const usuarios = await db.user.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  // Una sola consulta para todo el equipo; se reparte por persona acá.
  const todos = await corregidos({ dias });
  const porPersona = new Map<string, Corregido[]>();
  for (const c of todos) {
    const l = porPersona.get(c.userId) ?? [];
    l.push(c);
    porPersona.set(c.userId, l);
  }

  const filas: FilaEquipo[] = [];
  for (let i = 0; i < usuarios.length; i += EN_PARALELO) {
    const tanda = usuarios.slice(i, i + EN_PARALELO);
    const calc = await Promise.all(tanda.map(async (u) => {
      const r = await misPendientes(u.id);
      const suyos = porPersona.get(u.id) ?? [];
      return {
        userId: u.id,
        nombre: `${u.firstName} ${u.lastName}`.trim(),
        rol: u.role,
        activos: r.counts,
        resueltos: suyos.length,
        horasTipico: medianaHoras(suyos),
        masFrecuente: masFrecuente(r.counts),
      } satisfies FilaEquipo;
    }));
    filas.push(...calc);
  }

  return {
    filas,
    dias,
    totales: {
      activos: filas.reduce((s, f) => s + f.activos.total, 0),
      resueltos: filas.reduce((s, f) => s + f.resueltos, 0),
      personas: filas.length,
      conPendientes: filas.filter((f) => f.activos.total > 0).length,
      horasTipico: medianaHoras(todos),
    },
  };
}
