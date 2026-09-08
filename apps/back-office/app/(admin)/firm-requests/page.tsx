import { redirect } from 'next/navigation';
import { db } from '@precision-medical/database';
import { getSessionUser } from '@/lib/session';
import { getDbUserByEmail } from '@/lib/actor';
import { canSeeFirmRequests } from '@/lib/firm-requests-access';
import { FirmRequestsClient } from '@/components/messaging/firm-requests-client';
import { CaseUrlModal } from '@/components/cases/case-url-modal';

/**
 * Pedidos de bufetes — /firm-requests
 *
 * Todo lo que los abogados pidieron desde su portal (consultas por escritorio y
 * referidos): a quién le llegó, si respondieron, quién y qué. Es el control de
 * que nada de lo que pide un bufete se pierda (Erick, 2026-09-08).
 *
 * OPT-IN como Notas clínicas: admin por rol, el resto por la casilla en su
 * ficha. La página es su propia puerta además del menú y del middleware.
 *
 * `?case=` abre el caso encima, como en el resto del back-office.
 */
export default async function FirmRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; tab?: string }>;
}): Promise<React.ReactElement> {
  const user = await getSessionUser();
  if (!user?.email) redirect('/login');
  if (!(await canSeeFirmRequests())) redirect('/dashboard');

  const [dbUser, clinics, { case: caseId, tab }] = await Promise.all([
    getDbUserByEmail(user.email),
    // Para el filtro por clínica: la del paciente sale de sus citas.
    db.clinic.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    searchParams,
  ]);
  if (!dbUser) redirect('/login');

  return (
    <>
      <FirmRequestsClient currentUserId={dbUser.id} clinics={clinics} />
      <CaseUrlModal caseId={caseId} tab={tab} />
    </>
  );
}
