/**
 * Los números del parte de la mañana del administrador.
 *
 * Erick los definió el 2026-09-13, en este orden: pagos pendientes (empleados
 * **y** freelancers), los vencidos, las cajas activas bajo el mínimo, las citas
 * del día de todas las clínicas **aunque sean 0**, los no-shows y las comisiones
 * sin asignar.
 *
 * ── De dónde sale cada cosa ─────────────────────────────────────────────────
 *
 * De dos bases, y cada dato se pide donde vive:
 *
 *   · **Phoenix** (Prisma, la base de ESTE app) → citas y no-shows.
 *   · **El proyecto de auth** (`createAdminClient`, donde vive lo administrativo)
 *     → salarios, freelancers y lo que encontró el auditor.
 *
 * Lo del auditor NO se recalcula: se LEE de `audit_findings`. Las detecciones
 * tienen guardas contra falsos positivos que costaron trabajo —las cajas solo
 * cuentan si están activas y tienen al menos una transacción— y una segunda
 * copia de esa lógica se separaría de la original en el primer cambio. El
 * acople es por tabla, igual que ya lo hacía el aviso de los críticos.
 *
 * ── Lo que este archivo NO hace ────────────────────────────────────────────
 *
 * No decide si se manda ni cómo se redacta: eso es del cron. Acá solo se juntan
 * los números, para que el día que haya una pantalla que muestre el mismo parte
 * pueda pedirlos sin repetir una consulta.
 */

import { db, VIGENTES } from '@precision-medical/database';
import { createAdminClient } from '@precision-medical/auth/admin';
import { claveDia, rangoDelDia, DIA_MS, ZONA_CLINICA } from './fechas';

/** Estados de cita que NO cuentan — misma regla que `cola-intake`. */
const ESTADOS_MUERTOS = ['CANCELLED', 'NO_SHOW'] as const;

/** Qué hallazgos del auditor entran al parte, y bajo qué nombre. */
const MODULOS = {
  cajas: 'caja_chica',
  pagos: 'empleados',
  comisiones: 'comisiones',
} as const;

/**
 * Ventana hacia atrás para juntar hallazgos del auditor.
 *
 * El auditor corre a las 7:30 y esto a las 7:45. No se marca nada como
 * "avisado" —`audit_findings.status` es del flujo de revisión del Admin y no
 * corresponde tocarlo—, así que la ventana es lo que evita repetir: solo lo
 * escrito en la última media hora.
 */
const VENTANA_MIN = 30;

export interface ParteAdmin {
  citas: {
    /** `YYYY-MM-DD` del día del que habla el parte. */
    clave: string;
    /** `false` = el número es del próximo lunes porque hoy no se atiende. */
    esHoy: boolean;
    total: number;
    porClinica: Array<{ nombre: string; total: number }>;
  };
  /** Los que no vinieron AYER: hoy a las 7:45 todavía no pasó nada. */
  noShowsAyer: number;
  /** Salarios de empleados en estado pendiente. */
  salarios: { hoy: number; vencidos: number };
  /** Pagos a freelancers en estado pendiente. */
  freelancers: { hoy: number; vencidos: number };
  /** Cajas activas por debajo del mínimo, según el auditor. */
  cajasBajas: number;
  /** Posibles pagos duplicados, según el auditor. */
  pagosParaRevisar: number;
  /** Comisiones devengadas sin abogado ni proveedor, según el auditor. */
  comisionesSinAsignar: number;
  /**
   * ¿Corrió el auditor esta mañana?
   *
   * Sin esto, sus tres cifras en cero se leen igual que "no hay nada que
   * revisar", y no es lo mismo: puede ser que no haya corrido. El parte lo dice
   * en vez de callarlo — que un aviso llegue todos los días sirve justamente
   * para que el silencio deje de ser ambiguo.
   */
  auditorCorrio: boolean;
}

/**
 * El día del que hay que hablar: hoy, o el LUNES si hoy no se atiende.
 *
 * Regla de Erick (2026-09-12) para el panel del Admin, aplicada acá por el
 * mismo motivo: sábado y domingo dan cero citas porque la clínica no abre, y un
 * "hoy 0 visitas" el sábado a la mañana es cierto y no sirve para nada. Lo que
 * el administrador quiere ver el fin de semana es cómo viene el lunes.
 *
 * El parte se manda igual —eso es lo que pidió: que llegue aunque sea 0—, lo
 * que cambia es de qué día habla. Gemela de `diaHabilAMostrar` en
 * `apps/web/lib/cifo/phoenix.ts`; si un día la clínica abre sábados, las dos se
 * mueven juntas.
 */
export function diaDelParte(ahora = new Date()): { clave: string; esHoy: boolean } {
  const dia = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_CLINICA, weekday: 'short',
  }).format(ahora);

  if (dia !== 'Sat' && dia !== 'Sun') return { clave: claveDia(ahora), esHoy: true };

  const saltar = dia === 'Sat' ? 2 : 1;
  return { clave: claveDia(new Date(ahora.getTime() + saltar * DIA_MS)), esHoy: false };
}

/**
 * Clasifica una fecha de vencimiento contra el día de hoy en la clínica.
 *
 * Se compara la fecha LOCAL, no el instante UTC: un pago agendado a última hora
 * de Utah tiene un UTC que cae al día siguiente, y un filtro por rango se lo
 * pierde. Es la misma sutileza documentada en
 * `apps/web/lib/audit/salarios-por-vencer.ts`, que aplica la regla del lado del
 * Admin — las dos leen la misma tabla y se mueven juntas.
 */
function cuandoVence(fecha: string, hoy: string): 'hoy' | 'vencido' | 'despues' {
  // Las columnas `@db.Date` llegan como `YYYY-MM-DD` y no hay que interpretarlas
  // en ninguna zona: ya son un día calendario.
  const clave = fecha.length === 10 ? fecha : claveDia(new Date(fecha));
  if (clave === hoy) return 'hoy';
  return clave < hoy ? 'vencido' : 'despues';
}

export async function armarParteAdmin(ahora = new Date()): Promise<ParteAdmin> {
  const hoy = claveDia(ahora);
  const dia = diaDelParte(ahora);
  const admin = createAdminClient();

  const rangoCitas = rangoDelDia(dia.clave);
  // El corte de los vencimientos es HOY, no el día del que habla el parte: un
  // sábado las citas son las del lunes, pero un salario vencido lo está hoy.
  const rangoHoy = rangoDelDia();
  const ayer = rangoDelDia(claveDia(new Date(ahora.getTime() - DIA_MS)));
  const desdeHallazgos = new Date(ahora.getTime() - VENTANA_MIN * 60 * 1000).toISOString();

  // Todo en paralelo: son seis consultas a dos bases y ninguna depende de otra.
  const [citas, noShows, hallazgos, corridas, salarios, freelancers] = await Promise.all([
    db.appointment.findMany({
      where: {
        ...VIGENTES,
        scheduledFor: { gte: rangoCitas.start, lt: rangoCitas.end },
        status: { notIn: ESTADOS_MUERTOS as unknown as never[] },
      },
      select: { clinic: { select: { name: true } } },
    }),
    db.appointment.count({
      where: {
        ...VIGENTES,
        scheduledFor: { gte: ayer.start, lt: ayer.end },
        status: 'NO_SHOW',
      },
    }),
    admin
      .from('audit_findings')
      .select('module')
      .in('module', [MODULOS.cajas, MODULOS.pagos, MODULOS.comisiones])
      .gte('created_at', desdeHallazgos),
    // La corrida en sí, para poder distinguir "no encontró nada" de "no corrió".
    admin
      .from('audit_runs')
      .select('id')
      .gte('started_at', desdeHallazgos)
      .limit(1),
    // Los pendientes con vencimiento hasta mañana: los de más adelante no son
    // del parte de hoy, y el margen de un día cubre el corrimiento de zona.
    admin
      .from('payments')
      .select('scheduledDate')
      .eq('status', 'PENDING')
      .lte('scheduledDate', new Date(rangoHoy.end.getTime() + DIA_MS).toISOString()),
    admin
      .from('freelancer_payments')
      .select('scheduledDate')
      .eq('status', 'PENDING')
      .not('scheduledDate', 'is', null)
      .lte('scheduledDate', claveDia(new Date(ahora.getTime() + DIA_MS))),
  ]);

  // ── Citas por clínica ──────────────────────────────────────────────────────
  const porClinica = new Map<string, number>();
  for (const c of citas) {
    const nombre = c.clinic?.name ?? '—';
    porClinica.set(nombre, (porClinica.get(nombre) ?? 0) + 1);
  }

  // ── Lo del auditor ─────────────────────────────────────────────────────────
  const filas = (hallazgos.data ?? []) as Array<{ module: string }>;
  const cuenta = (modulo: string): number => filas.filter((f) => f.module === modulo).length;

  // ── Vencimientos ───────────────────────────────────────────────────────────
  const contarVencimientos = (
    filasPago: Array<{ scheduledDate: string | null }> | null,
  ): { hoy: number; vencidos: number } => {
    let deHoy = 0;
    let vencidos = 0;
    for (const p of filasPago ?? []) {
      if (!p.scheduledDate) continue;
      const cuando = cuandoVence(p.scheduledDate, hoy);
      if (cuando === 'hoy') deHoy++;
      else if (cuando === 'vencido') vencidos++;
    }
    return { hoy: deHoy, vencidos };
  };

  return {
    citas: {
      clave: dia.clave,
      esHoy: dia.esHoy,
      total: citas.length,
      porClinica: [...porClinica.entries()]
        .map(([nombre, total]) => ({ nombre, total }))
        .sort((a, b) => b.total - a.total),
    },
    noShowsAyer: noShows,
    salarios: contarVencimientos(salarios.data as Array<{ scheduledDate: string | null }> | null),
    freelancers: contarVencimientos(freelancers.data as Array<{ scheduledDate: string | null }> | null),
    cajasBajas: cuenta(MODULOS.cajas),
    pagosParaRevisar: cuenta(MODULOS.pagos),
    comisionesSinAsignar: cuenta(MODULOS.comisiones),
    auditorCorrio: !corridas.error && (corridas.data?.length ?? 0) > 0,
  };
}
