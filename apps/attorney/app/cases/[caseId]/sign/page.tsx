/**
 * B.22 — Firma del Lien Médico (server wrapper)
 * Fetches current signature state and attorney name before rendering the client.
 */
import { notFound }   from 'next/navigation';
import { db }         from '@precision-medical/database';
import SignLienClient  from './sign-client';

type Props = { params: Promise<{ caseId: string }> };

export default async function SignLienPage({ params }: Props) {
  const { caseId } = await params;

  const c = await db.case.findUnique({
    where: { id: caseId, deletedAt: null },
    include: { attorney: { select: { firstName: true, lastName: true } } },
  });
  if (!c) notFound();

  interface RawSig { signer_type: string }
  const signatures = await db.$queryRaw<RawSig[]>`
    SELECT signer_type FROM lien_signatures WHERE case_id = ${caseId}
  `;

  const alreadySigned = signatures.some(s => s.signer_type === 'ATTORNEY');
  const patientSigned  = signatures.some(s => s.signer_type === 'PATIENT');

  const initialSignerName = c.attorney
    ? `${c.attorney.firstName} ${c.attorney.lastName}`
    : '';

  return (
    <SignLienClient
      initialSignerName={initialSignerName}
      alreadySigned={alreadySigned}
      patientSigned={patientSigned}
    />
  );
}
