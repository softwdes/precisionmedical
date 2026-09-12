import { createAdminClient } from '@precision-medical/auth';
import type { Herramienta, ResultadoHerramienta } from '@precision-medical/agente';
import { cajasBajoMinimo } from '@/lib/audit/cajas-bajo-minimo';
import { visitasDelDia, clienteClinica, bordesDelDia, claveDia, diaHabilAMostrar } from './phoenix';
import type { AlcanceAdmin } from './alcance';

/**
 * Las herramientas de CIFO en el Admin.
 *
 * ── Las DOS fuentes, y por qué importa no confundirlas ──────────────────────
 *
 * El Admin y la clínica son dos proyectos de Supabase distintos:
 *
 *   · **Admin** (el cliente por defecto) → cajas, pagos, empleados, freelancers,
 *     billeteras. Es la plata de la empresa.
 *   · **Clínica / Phoenix** (`clienteClinica()`) → citas, pacientes, providers.
 *     Es la operación.
 *
 * Medido el 2026-09-12: en el proyecto del Admin las tablas clínicas están en
 * CERO —`appointments` 0, `patients` 0, `providers` 0—. Preguntarle las visitas
 * al cliente equivocado devuelve cero para siempre y con total convicción, que
 * es la peor falla posible en algo que existe para informar decisiones.
 *
 * Por eso cada herramienta dice de dónde saca lo suyo, arriba de todo.
 */

const n = (v: unknown): number => (v == null ? 0 : Number(v));

/** Suma redondeada a centavos: los flotantes acumulan basura si no se corta. */
const sumar = (xs: number[]): number => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

// ─── 1 · Las visitas ─────────────────────────────────────────────────────────

/**
 * FUENTE: la clínica (Phoenix).
 *
 * Es la primera pregunta de cualquiera que abre el Admin a la mañana, y la que
 * Erick puso como prioridad número uno (2026-09-12).
 */
async function visitas(): Promise<ResultadoHerramienta> {
  const v = await visitasDelDia();
  return {
    data: {
      dia: v.dia,
      // El agente necesita saber si habla de hoy o del lunes: el fin de semana
      // la clínica no abre y el número que importa es el del próximo día hábil.
      esHoy: v.esHoy,
      totalVisitas: v.total,
      porClinica: v.porClinica,
    },
    sources: ['appointments (clínica)'],
  };
}

// ─── 2 · La plata del día ────────────────────────────────────────────────────

/**
 * FUENTE: la clínica (Phoenix).
 *
 * Cuánto se cargó y cuánto se cobró en un rango. `appointment_billing` es la
 * misma tabla que usa la herramienta `saldos_y_cobros` del back-office, así que
 * los dos agentes cuentan la plata de la clínica igual.
 */
async function cobradoEnClinica(args: { dias?: number }): Promise<ResultadoHerramienta> {
  const dias = Math.min(Math.max(args.dias ?? 1, 1), 90);
  const hoy = claveDia(new Date());
  const [y, m, d] = hoy.split('-').map(Number);
  const { hasta } = bordesDelDia(hoy);
  const { desde } = bordesDelDia(claveDia(new Date(Date.UTC(y!, m! - 1, d! - (dias - 1), 12))));

  /**
   * Los nombres de columna salen del schema, no de la intuición: la primera
   * versión pedía `amountCharged` —que suena bien y no existe— y la herramienta
   * devolvía un error en vez de un número. Los reales son estos cinco.
   */
  const { data, error } = await clienteClinica()
    .from('appointment_billing')
    .select('totalCost, discount, insuranceCovered, amountPaid, balanceDue')
    .gte('updatedAt', desde.toISOString())
    .lt('updatedAt', hasta.toISOString());

  if (error) return { data: { error: error.message }, sources: [] };

  const filas = (data ?? []) as Array<Record<string, unknown>>;
  return {
    data: {
      dias,
      desde: claveDia(desde),
      /** Lo facturado antes de descuentos. */
      cargado: sumar(filas.map((f) => n(f.totalCost))),
      descuentos: sumar(filas.map((f) => n(f.discount))),
      /** Lo que ya entró — la plata de verdad. */
      cobrado: sumar(filas.map((f) => n(f.amountPaid))),
      /** Lo que falta cobrar, separado entre el paciente y el seguro. */
      porCobrarAlPaciente: sumar(filas.map((f) => n(f.balanceDue))),
      cubiertoPorSeguro: sumar(filas.map((f) => n(f.insuranceCovered))),
      movimientos: filas.length,
    },
    sources: ['appointment_billing (clínica)'],
  };
}

// ─── 3 · Las cajas ───────────────────────────────────────────────────────────

/**
 * FUENTE: el Admin.
 *
 * Llama a la MISMA función que el auditor de las 7:30, no a una copia. Si un día
 * se mueve el umbral o una guarda, se mueven los dos a la vez — el correo de la
 * mañana y lo que conteste CIFO no pueden decir cosas distintas de la misma caja.
 */
async function cajas(): Promise<ResultadoHerramienta> {
  const bajas = await cajasBajoMinimo(createAdminClient());
  return {
    data: {
      bajoElMinimo: bajas.length,
      cajas: bajas.map((c) => ({
        nombre: c.name, moneda: c.currency, saldo: c.balance,
        minimo: c.lowBalanceThreshold, falta: c.falta,
      })),
      /**
       * El dato que evita el malentendido más probable: una caja nunca usada
       * está en cero y NO es un problema. Sin esto, el modelo puede concluir que
       * "hay cinco cajas vacías" y alarmar por nada — medido el 2026-09-12, cinco
       * de las seis cajas nunca tuvieron un movimiento.
       */
      nota: 'Solo cuentan cajas activas y con al menos un movimiento. Una caja nunca usada está en cero y no es un hallazgo.',
    },
    sources: ['cash_boxes', 'cash_transactions'],
  };
}

// ─── 4 · Los pagos a empleados ───────────────────────────────────────────────

/**
 * FUENTE: el Admin.
 *
 * Los pagos del mes y los últimos movimientos. NO devuelve el `employeeId`
 * completo: el agente no necesita identificar a nadie para decir cuánto se pagó,
 * y un id que no hace falta es superficie de más.
 */
async function pagosEmpleados(): Promise<ResultadoHerramienta> {
  const sb = createAdminClient();
  const hoy = claveDia(new Date());
  const [y, m] = hoy.split('-').map(Number);
  const inicioMes = new Date(Date.UTC(y!, m! - 1, 1)).toISOString();

  const [mes, recientes, plantilla] = await Promise.all([
    sb.from('payments').select('amountLocal, bonus_amount, currencyLocal').gte('createdAt', inicioMes),
    sb.from('payments')
      .select('amountLocal, currencyLocal, period, status, paidDate')
      .order('createdAt', { ascending: false }).limit(10),
    sb.from('employees').select('id', { count: 'exact', head: true }),
  ]);

  const filas = (mes.data ?? []) as Array<{ amountLocal: unknown; bonus_amount: unknown }>;
  return {
    data: {
      empleados: plantilla.count ?? 0,
      esteMes: {
        pagos: filas.length,
        sueldos: sumar(filas.map((f) => n(f.amountLocal))),
        bonos: sumar(filas.map((f) => n(f.bonus_amount))),
      },
      ultimos: (recientes.data ?? []).map((p: Record<string, unknown>) => ({
        monto: n(p.amountLocal), moneda: p.currencyLocal,
        periodo: p.period, estado: p.status, pagado: p.paidDate,
      })),
    },
    sources: ['payments', 'employees'],
  };
}

// ─── 5 · Los freelancers ─────────────────────────────────────────────────────

/** FUENTE: el Admin. Quiénes están activos y qué se les pagó en 90 días. */
async function pagosFreelancers(): Promise<ResultadoHerramienta> {
  const sb = createAdminClient();
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const [gente, pagos] = await Promise.all([
    /**
     * `'ACTIVE'` en MAYÚSCULAS. La ruta vieja del chat filtraba por `'active'`
     * en minúsculas y devolvía cero freelancers **siempre** — otro bicho que
     * nadie vio porque ese agente ya fallaba antes de llegar acá. Verificado
     * contra los datos el 2026-09-12: los ocho están en `ACTIVE`.
     */
    sb.from('freelancers').select('id, nombre, pais, modalidad, tarifaBase, moneda')
      .eq('status', 'ACTIVE').is('deletedAt', null),
    sb.from('freelancer_payments').select('freelancerId, monto, moneda, descripcion, fechaPago')
      .gte('fechaPago', desde).order('fechaPago', { ascending: false }),
  ]);

  const porPersona = new Map<string, number>();
  for (const p of (pagos.data ?? []) as Array<{ freelancerId: string; monto: unknown }>) {
    porPersona.set(p.freelancerId, (porPersona.get(p.freelancerId) ?? 0) + n(p.monto));
  }

  return {
    data: {
      activos: (gente.data ?? []).length,
      pagos90dias: (pagos.data ?? []).length,
      total90dias: sumar((pagos.data ?? []).map((p: Record<string, unknown>) => n(p.monto))),
      // Con nombre: son proveedores de la empresa, no pacientes. El alcance del
      // Admin es la plata, y acá el nombre ES el dato accionable.
      porPersona: (gente.data ?? []).map((f: Record<string, unknown>) => ({
        nombre: f.nombre, pais: f.pais, modalidad: f.modalidad,
        tarifa: n(f.tarifaBase), moneda: f.moneda,
        pagado90dias: Math.round((porPersona.get(String(f.id)) ?? 0) * 100) / 100,
      })),
    },
    sources: ['freelancers', 'freelancer_payments'],
  };
}

// ─── 6 · Las billeteras ──────────────────────────────────────────────────────

/** FUENTE: el Admin. El saldo disponible para operar. */
async function billeteras(): Promise<ResultadoHerramienta> {
  const { data, error } = await createAdminClient()
    .from('wallets').select('name, currency, balance');
  if (error) return { data: { error: error.message }, sources: [] };
  return {
    data: {
      billeteras: (data ?? []).map((w: Record<string, unknown>) => ({
        nombre: w.name, moneda: w.currency, saldo: n(w.balance),
      })),
    },
    sources: ['wallets'],
  };
}

// ─── El registro ─────────────────────────────────────────────────────────────

const SIN_ARGS = { type: 'object', properties: {}, additionalProperties: false } as const;

export const HERRAMIENTAS_ADMIN: readonly Herramienta<AlcanceAdmin>[] = [
  {
    name: 'visitas_de_la_clinica',
    description: 'Cuántas visitas hay agendadas en las clínicas y cómo se reparten entre ellas. Si es fin de semana devuelve el próximo lunes, porque la clínica no abre sábado ni domingo. Usala para la primera pregunta de panorama.',
    parameters: SIN_ARGS,
    run: () => visitas(),
  },
  {
    name: 'cobrado_en_la_clinica',
    description: 'Cuánto se cargó y cuánto se cobró en la clínica en los últimos N días (1 = hoy). Es la plata que genera la operación, distinta de las cajas y los sueldos.',
    parameters: {
      type: 'object',
      properties: { dias: { type: 'number', description: 'Cuántos días hacia atrás, contando hoy. Por defecto 1.' } },
      additionalProperties: false,
    },
    run: (_a: AlcanceAdmin, args: { dias?: number }) => cobradoEnClinica(args),
  },
  {
    name: 'cajas_bajo_el_minimo',
    description: 'Las cajas chicas cuyo saldo quedó por debajo de su mínimo, con cuánto falta para reponerlas. Usa el mismo criterio que el auditor que corre todas las mañanas.',
    parameters: SIN_ARGS,
    run: () => cajas(),
  },
  {
    name: 'pagos_a_empleados',
    description: 'Los sueldos y bonos pagados este mes, cuántos empleados hay y los últimos diez pagos con su estado y período.',
    parameters: SIN_ARGS,
    run: () => pagosEmpleados(),
  },
  {
    name: 'pagos_a_freelancers',
    description: 'Los freelancers activos, su tarifa y cuánto se les pagó en los últimos 90 días, por persona.',
    parameters: SIN_ARGS,
    run: () => pagosFreelancers(),
  },
  {
    name: 'saldo_de_billeteras',
    description: 'El saldo de cada billetera de la empresa. Es la plata disponible para operar.',
    parameters: SIN_ARGS,
    run: () => billeteras(),
  },
] as const;

export { diaHabilAMostrar };
