import { db } from '@precision-medical/database';
import { InsurancesClient } from './insurances-client';

// B.32 — Catálogo de Aseguradoras (PIP / Med Pay / Health)
export default async function InsurancesPage() {
  const insurances = await db.insuranceCarrier.findMany({
    where: { deletedAt: null },
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

  const activeCount   = insurances.filter((i) => i.isActive).length;
  const pipCount      = insurances.filter((i) => i.type === 'PIP').length;
  const medpayCount   = insurances.filter((i) => i.type === 'MED_PAY').length;
  const healthCount   = insurances.filter((i) => i.type === 'HEALTH').length;
  const slowCount     = insurances.filter((i) => i.responseSpeed === 'SLOW').length;
  const fastCount     = insurances.filter((i) => i.responseSpeed === 'FAST').length;
  const avgCount      = insurances.filter((i) => i.responseSpeed === 'AVERAGE').length;

  return (
    <InsurancesClient
      insurances={insurances.map((i) => ({
        id: i.id,
        name: i.name,
        legalName: i.legalName,
        shortCode: i.shortCode,
        color: i.color,
        type: i.type,
        claimsPhone: i.claimsPhone,
        claimsEmail: i.claimsEmail,
        claimsFax: i.claimsFax,
        claimsAddress: i.claimsAddress,
        portalUrl: i.portalUrl,
        hcfaChannel: i.hcfaChannel,
        preauthRequired: i.preauthRequired,
        avgResponseDays: i.avgResponseDays,
        responseSpeed: i.responseSpeed,
        notes: i.notes,
        isActive: i.isActive,
      }))}
      stats={{
        total: insurances.length,
        active: activeCount,
        pip: pipCount,
        medpay: medpayCount,
        health: healthCount,
        slow: slowCount,
        fast: fastCount,
        average: avgCount,
      }}
    />
  );
}
