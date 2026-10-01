/**
 * GET /api/admin/message-logs/conversaciones — la pestaña *Actionable*.
 *
 * Una fila por CONVERSACIÓN, no por mensaje. Es la diferencia con
 * `/api/admin/message-logs`, que es el registro de envíos: acá la pregunta no
 * es "¿este mensaje llegó?" sino "¿con quién hay algo pendiente?".
 *
 * `?pendientes=1` deja solo las que esperan respuesta. La definición de
 * pendiente, y por qué no es "sin leer", está en `lib/conversaciones-sms.ts`.
 *
 * Va bajo `message-logs` a propósito: el middleware ya gobierna ese prefijo con
 * el módulo `patients`, así que quien ve los mensajes ve las conversaciones.
 * Son el mismo dato mirado de dos formas, no dos permisos.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { checkPatientStaff } from '@/lib/patient-access';
import { contarPendientes, listarConversaciones } from '@/lib/conversaciones-sms';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const acceso = await checkPatientStaff({ admin: true });
  if (acceso.deny) return acceso.deny;

  const { searchParams } = new URL(req.url);
  const soloPendientes = searchParams.get('pendientes') === '1';
  const q = searchParams.get('q')?.trim() || undefined;

  const [conversaciones, pendientes] = await Promise.all([
    listarConversaciones({ soloPendientes, q }),
    /**
     * El contador va SIEMPRE sin filtrar por búsqueda: es el mismo número del
     * badge del menú, y si cambiara al escribir en el buscador dejaría de ser
     * un indicador para pasar a ser otra columna de la lista.
     */
    contarPendientes(),
  ]);

  return NextResponse.json({ conversaciones, pendientes });
}
