/**
 * GET /api/admin/memberships — el padrón de socios de la clínica.
 *
 * Es el listado que se abre desde Pacientes, al lado de Crear paciente: la
 * pregunta "¿quién tiene membresía y hasta cuándo?" hoy se contesta abriendo
 * otro sistema.
 *
 * ── Por qué es de mostrador y no del portal médico ──────────────────────────
 * Va con `admin: true`, o sea que ningún rol del portal pasa. El provider no
 * necesita el padrón entero —nombre, plan y cuánto paga cada socio— para
 * atender; lo que sí ve es la membresía del paciente que tiene delante, por la
 * ruta de UN paciente, que respeta su alcance. Mismo criterio que el resto de
 * `patients/*`: lo que la UI le esconde, la API se lo cierra.
 *
 * ── El estado no viene de la base ───────────────────────────────────────────
 * Se calcula acá con `estadoPorFecha`, la MISMA función que usa la pastilla. Si
 * el listado tuviera su propia cuenta, el día que cambie la regla —días de
 * gracia, por ejemplo— una pantalla diría "vencida" y la otra "al día" sobre el
 * mismo socio.
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { checkPatientStaff } from '@/lib/patient-access';
import { estadoPorFecha } from '@/lib/membresias';

export async function GET(): Promise<NextResponse> {
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  const filas = await db.patientMembership.findMany({
    orderBy: [{ proximoPago: 'asc' }],
    select: {
      id: true, plan: true, tipo: true, montoMensual: true,
      empresa: true, grupoFamiliar: true,
      fechaInicio: true, proximoPago: true, corteAl: true, enUltimoCorte: true,
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true } },
    },
  });

  const socios = filas.map((f) => {
    const { estado, dias } = estadoPorFecha(f.proximoPago);
    return {
      id: f.id,
      estado,
      dias,
      plan: f.plan,
      tipo: f.tipo,
      // `Decimal` no sobrevive a JSON.stringify como número: viaja como texto.
      montoMensual: f.montoMensual.toString(),
      empresa: f.empresa,
      grupoFamiliar: f.grupoFamiliar,
      desde: f.fechaInicio?.toISOString().slice(0, 10) ?? null,
      hasta: f.proximoPago?.toISOString().slice(0, 10) ?? null,
      fueraDelCorte: !f.enUltimoCorte,
      paciente: f.patient,
    };
  });

  /**
   * La fecha del corte más nuevo, para el cartel de "estos datos son del …".
   * Va una sola vez y no por fila: es una propiedad del archivo, no del socio.
   */
  const corteAl = filas.reduce<string | null>((mas, f) => {
    const d = f.corteAl.toISOString().slice(0, 10);
    return !mas || d > mas ? d : mas;
  }, null);

  return NextResponse.json({
    corteAl,
    socios,
    resumen: {
      total: socios.length,
      activas: socios.filter((s) => s.estado === 'ACTIVA').length,
      vencidas: socios.filter((s) => s.estado === 'VENCIDA').length,
    },
  });
}
