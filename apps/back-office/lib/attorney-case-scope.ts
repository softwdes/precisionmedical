/**
 * El alcance de un caso para la sesión del portal legal.
 *
 * Es el guard que ya usaban `attorney/cases/[id]/history` y `.../lien`, extraído
 * porque ahora lo comparten también las rutas de documentos. Dos pasos, en este
 * orden y no en otro:
 *
 *   1. ¿Hay sesión de abogado? Si no, 403.
 *   2. ¿ESTE caso cae dentro de `lawyerCaseFilter`? Si no, **404** —no 403—
 *      porque un 403 sobre un id ajeno confirma que ese caso existe.
 *
 * ⚠️ El alcance es lo único que protege de verdad: el menú y el `readOnly` de la
 * pantalla son cosmética (ver el docblock de `lib/attorney-portal.ts`).
 */

import { NextResponse } from 'next/server';
import { db } from '@precision-medical/database';
import { getSessionLawyer } from '@/lib/get-session-lawyer';
import { lawyerCaseFilter } from '@/lib/attorney-portal';

export async function casoDelAbogado(
  caseId: string,
): Promise<{ caseId: string; deny: null } | { caseId: null; deny: NextResponse }> {
  const lawyer = await getSessionLawyer();
  if (!lawyer) {
    return { caseId: null, deny: NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }) };
  }

  const target = await db.case.findFirst({
    where:  { AND: [lawyerCaseFilter(lawyer), { id: caseId }] },
    select: { id: true },
  });
  if (!target) {
    return { caseId: null, deny: NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }) };
  }

  return { caseId: target.id, deny: null };
}
