import { NextRequest, NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { fetchDbRole } from '@precision-medical/auth/v2-apps';
import { getSessionProvider } from '@/lib/get-session-provider';
import { getSessionUser } from '@/lib/session';
import {
  setPracticePrescriber,
  getScriptSurePracticeWidgetUrl,
  type ScriptSurePracticeWidget,
} from '@/lib/scriptsure-client';

/**
 * GET /api/admin/scriptsure/practice-widget?widget=message
 *
 * Widgets de ScriptSure que NO cuelgan de un paciente: la bandeja de recetas,
 * las colas y el log de auditoría. A diferencia del widget de la consulta, acá
 * no hay cita que validar — el permiso es simplemente ser un doctor con perfil
 * de prescriptor (los admins entran por el modo "ver como", igual que al resto
 * del portal).
 *
 * La sesión de ScriptSure actúa COMO el doctor, así que se hace Set Practice /
 * Prescriber antes de armar la URL: sin eso la bandeja saldría con la identidad
 * de quien haya logueado último.
 */

const VALID_WIDGETS: ScriptSurePracticeWidget[] = [
  'message',
  'prescription-queue',
  'auditlog',
  'report',
  'setting',
];

/**
 * La configuración de la practice cambia el comportamiento de TODOS los
 * prescriptores (chequeos de interacción, límites de opioides, alertas). No es
 * una pantalla de consulta: se restringe a administradores, y se valida acá —
 * esconder la pestaña en el cliente no es un permiso.
 */
const ADMIN_ONLY: ScriptSurePracticeWidget[] = ['setting'];
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const provider = await getSessionProvider();
  if (!provider) {
    return NextResponse.json({ error: 'NOT_A_PROVIDER' }, { status: 403 });
  }

  const widget = req.nextUrl.searchParams.get('widget') as ScriptSurePracticeWidget | null;
  if (!widget || !VALID_WIDGETS.includes(widget)) {
    return NextResponse.json({ error: 'INVALID_WIDGET' }, { status: 400 });
  }

  if (ADMIN_ONLY.includes(widget)) {
    const user = await getSessionUser();
    const role = user?.email ? await fetchDbRole(user.email) : null;
    if (!role || !ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
  }

  const [row, clinic] = await Promise.all([
    db.provider.findUnique({
      where: { id: provider.id },
      select: { email: true, scriptsureUserId: true },
    }),
    // Las 9 clínicas apuntan a la MISMA practice de ScriptSure (6907): allá la
    // organización es una sola y las sedes no se modelan aparte. Por eso alcanza
    // con la primera que tenga el id, sin preguntar en qué sede atiende hoy.
    db.clinic.findFirst({
      where: { scriptsurePracticeId: { not: null } },
      select: { scriptsurePracticeId: true },
    }),
  ]);

  if (!row?.scriptsureUserId || !clinic?.scriptsurePracticeId) {
    return NextResponse.json({ error: 'NOT_ONBOARDED' }, { status: 409 });
  }

  try {
    const loginEmail = row.email;
    await setPracticePrescriber(
      loginEmail,
      Number(clinic.scriptsurePracticeId),
      Number(row.scriptsureUserId),
    );
    const url = await getScriptSurePracticeWidgetUrl(
      loginEmail,
      widget,
      Number(clinic.scriptsurePracticeId),
    );
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: 'SCRIPTSURE_ERROR', message: (err as Error).message },
      { status: 502 },
    );
  }
}
