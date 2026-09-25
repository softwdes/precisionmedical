/**
 * GET /api/cron/auditoria → corre el auditor solo, una vez al día.
 *
 * El auditor (`runAuditScan`) ya detecta lo que Erick pidió avisar —cajas por
 * debajo del mínimo y posibles pagos duplicados— y ya manda correo cuando hay
 * críticos. **Lo que faltaba era que alguien lo corriera**: hasta hoy solo
 * arrancaba si una persona apretaba el botón en la pantalla de Agentes IA, o
 * sea justo cuando ya estaba mirando. Un auditor que solo audita cuando lo
 * miran no sirve de nada.
 *
 * Acá NO se reimplementa ninguna detección a propósito. Las dos que importan
 * tienen guardas contra falsos positivos que costaron trabajo (las cajas solo
 * cuentan si están activas y tienen al menos una transacción); una segunda copia
 * de esa lógica se separaría de la original en el primer cambio.
 *
 * Lo que este cron agrega es la BANDEJA: los críticos se insertan en
 * `notifications`, que es lo que pinta la campana del top bar del Admin. El
 * correo llegaba, pero adentro de la app no quedaba rastro.
 *
 * El aviso al TELÉFONO no sale de acá — sale de
 * `back-office/app/api/cron/alertas-admin`, que es donde vive el push. Ver la
 * cabecera de ese archivo para el por qué.
 *
 * ── El horario ──────────────────────────────────────────────────────────────
 *
 * Los crons de Vercel corren en UTC y 7:30 de Utah cambia de UTC dos veces al
 * año. Por eso entra a las dos horas posibles y la ruta pregunta si de verdad
 * es la hora local — el mismo patrón que `parte-manana` del back-office. El
 * cron de salarios de al lado NO tiene esta guarda: su comentario dice "8am
 * Utah (14 UTC)", que en invierno son las 7.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@precision-medical/auth/admin';
import { runAuditScan } from '@/lib/audit/runAuditScan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hora local de la clínica a la que corre la auditoría. */
const HORA_DE_LA_AUDITORIA = 7;

/** Quién se entera. Decisión de Erick: super admin y admin. */
const ROLES_AVISADOS = ['SUPER_ADMIN', 'ADMIN'];

/** Cuántos hallazgos se nombran en la bandeja antes de resumir. */
const MAX_DETALLADOS = 5;

function horaLocalUtah(): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver', hour: '2-digit', hour12: false,
    }).format(new Date()),
    10,
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Sin el secreto, cualquiera dispara una corrida del auditor (que además
  // llama al modelo y cuesta) y le mete filas a la bandeja de los admins.
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const hora = horaLocalUtah();
  if (hora !== HORA_DE_LA_AUDITORIA) {
    // 200 y no 4xx: un error haría que Vercel marque el cron como fallido todos
    // los días, y la corrida que no toca no es una falla.
    return NextResponse.json({ salteado: true, horaLocal: hora });
  }

  const resultado = await runAuditScan('cron');

  if (resultado.critical_count === 0) {
    return NextResponse.json({ ...resultado, avisos: 0 });
  }

  const admin = createAdminClient();

  // ── A quién avisar ─────────────────────────────────────────────────────────
  const { data: usuarios } = await admin
    .from('users')
    .select('id')
    .in('role', ROLES_AVISADOS);

  const destinatarios = (usuarios ?? []).map((u) => u.id as string);
  if (destinatarios.length === 0) {
    return NextResponse.json({ ...resultado, avisos: 0, motivo: 'sin admins' });
  }

  // ── Qué encontró ───────────────────────────────────────────────────────────
  //
  // Se releen los hallazgos de ESTA corrida para nombrarlos: "Caja X por debajo
  // del mínimo" sirve; "hay 3 hallazgos" obliga a abrir la pantalla para saber
  // si hay que hacer algo ahora.
  const { data: hallazgos } = await admin
    .from('audit_findings')
    .select('module, description')
    .eq('run_id', resultado.run_id)
    .eq('severity', 'critical')
    .limit(MAX_DETALLADOS);

  const lista = hallazgos ?? [];

  const filas = destinatarios.flatMap((userId) =>
    lista.map((h) => ({
      id: crypto.randomUUID(),
      userId,
      type: 'AGENT_ALERT' as const,
      title: h.module === 'caja_chica' ? 'Caja chica por debajo del mínimo' : 'Revisión de pagos',
      body: h.description as string,
      linkUrl: '/dashboard/ai-agents',
      createdAt: new Date().toISOString(),
    })),
  );

  if (filas.length > 0) await admin.from('notifications').insert(filas);

  return NextResponse.json({
    ...resultado,
    admins: destinatarios.length,
    detallados: lista.length,
    avisos: filas.length,
  });
}
