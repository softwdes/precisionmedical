/**
 * Membresías de la clínica — una sola fuente para las cuatro pantallas.
 *
 * La clínica vende membresías en un sistema aparte. Hasta que haya integración
 * en vivo llega un CSV semanal que importa `scripts/migration/membresias-semanal.mjs`;
 * acá se traduce esa fila a lo único que las pantallas necesitan saber: **tiene
 * o no tiene, y hasta cuándo**.
 *
 * Hoy es SOLO INFORMATIVA — no toca precios ni facturación (Erick, 13-sep-2026).
 *
 * ── Por qué el estado se calcula y no se guarda ─────────────────────────────
 * El origen no manda "activa": lo único que viene es `proximoPago`. Un booleano
 * guardado estaría bien el día de la importación y mentiría a partir del
 * siguiente, porque nadie lo recalcularía. Así que se deduce en cada lectura.
 *
 * ── Por qué todo viene con `corteAl` ────────────────────────────────────────
 * El dato tiene hasta siete días de atraso. Una pastilla que diga "Activa" sin
 * decir de cuándo es el dato se lee como si fuera de hoy, y en el primer corte
 * ya había dos contratos vencidos hace seis semanas. La fecha del corte viaja
 * siempre y la pastilla la muestra.
 */

import { db } from '@precision-medical/database';

export type EstadoMembresia = 'ACTIVA' | 'VENCIDA' | 'SIN';

export interface Membresia {
  estado: EstadoMembresia;
  /** `proximoPago`: el día hasta el que está paga. ISO, sin hora. */
  hasta: string | null;
  /** Días hasta el vencimiento; negativo si ya pasó. `null` si no hay fecha. */
  dias: number | null;
  plan: string;
  /** `INDIVIDUAL` · `FAMILIAR` · `EMPRESA` — texto del sistema de origen. */
  tipo: string;
  empresa: string | null;
  grupoFamiliar: string | null;
  /** De cuándo es la foto. Se muestra siempre. */
  corteAl: string;
  /** El corte más nuevo dejó de traer este contrato. Ver el importador. */
  fueraDelCorte: boolean;
}

/** `null` cuando la fecha no existe: sin fecha no hay estado que deducir. */
const aClave = (d: Date | null): string | null =>
  d ? new Date(d).toISOString().slice(0, 10) : null;

/**
 * Hoy en la zona de la clínica, como `YYYY-MM-DD`.
 *
 * Se compara CLAVE contra CLAVE y no fecha contra fecha: `proximoPago` es un
 * día de calendario guardado a medianoche UTC, y restar instantes hace que un
 * vencimiento de hoy se lea como vencido según la hora a la que se mire.
 */
const hoyClinica = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });

/** Días entre dos claves `YYYY-MM-DD`, por calendario. */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

export function estadoPorFecha(proximoPago: Date | null): { estado: EstadoMembresia; dias: number | null } {
  const hasta = aClave(proximoPago);
  // Sin fecha de próximo pago no se puede afirmar que esté al día. Se trata
  // como vencida a propósito: es el lado seguro — quien la mire va a preguntar,
  // que es justo lo que queremos, en vez de dar por buena una membresía que
  // nadie puede fechar.
  if (!hasta) return { estado: 'VENCIDA', dias: null };
  const dias = diasEntre(hoyClinica(), hasta);
  return { estado: dias >= 0 ? 'ACTIVA' : 'VENCIDA', dias };
}

const SIN: Membresia = {
  estado: 'SIN', hasta: null, dias: null, plan: '', tipo: '',
  empresa: null, grupoFamiliar: null, corteAl: '', fueraDelCorte: false,
};

/**
 * La membresía de una persona, o `SIN`.
 *
 * Si tuviera más de un contrato gana el de vencimiento más lejano: es el que
 * responde "¿hasta cuándo está cubierto?". En el primer corte no hay ninguno
 * repetido, pero un alta nueva sobre un contrato viejo lo va a producir.
 */
export async function membresiaDePaciente(patientId: string): Promise<Membresia> {
  const fila = await db.patientMembership.findFirst({
    where: { patientId },
    orderBy: [{ proximoPago: 'desc' }],
  });
  return fila ? aMembresia(fila) : SIN;
}

/** Varias personas de una sola consulta — para las listas. */
export async function membresiasDePacientes(
  patientIds: string[],
): Promise<Map<string, Membresia>> {
  if (patientIds.length === 0) return new Map();
  const filas = await db.patientMembership.findMany({
    where: { patientId: { in: patientIds } },
    orderBy: [{ proximoPago: 'desc' }],
  });
  const porPaciente = new Map<string, Membresia>();
  // Ordenado por vencimiento desc: el primero de cada paciente es el que gana.
  for (const f of filas) if (!porPaciente.has(f.patientId)) porPaciente.set(f.patientId, aMembresia(f));
  return porPaciente;
}

type Fila = Awaited<ReturnType<typeof db.patientMembership.findFirst>>;

function aMembresia(f: NonNullable<Fila>): Membresia {
  const { estado, dias } = estadoPorFecha(f.proximoPago);
  return {
    estado,
    dias,
    hasta: aClave(f.proximoPago),
    plan: f.plan,
    tipo: f.tipo,
    empresa: f.empresa,
    grupoFamiliar: f.grupoFamiliar,
    corteAl: f.corteAl.toISOString().slice(0, 10),
    fueraDelCorte: !f.enUltimoCorte,
  };
}
