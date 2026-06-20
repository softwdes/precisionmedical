/**
 * B.5 — Walk-in Kiosk
 *
 * Ruta pública: /walkin/[clinicId]
 * Modo kiosco: tablet o iPad en recepción. Paciente walk-in ingresa nombre + teléfono
 * y el sistema crea el caso + redirige al intake wizard.
 *
 * QR en lobby display apunta a esta URL.
 * Sin auth — acceso público de recepción.
 */

import { notFound } from 'next/navigation';
import { db }       from '@precision-medical/database';
import { WalkinKiosk } from './walkin-kiosk';

interface Props { params: Promise<{ clinicId: string }> }

export async function generateMetadata({ params }: Props) {
  const { clinicId } = await params;
  const clinic = await db.clinic.findUnique({ where: { id: clinicId }, select: { name: true } });
  return { title: `Walk-in · ${clinic?.name ?? 'Precision Medical'}` };
}

export default async function WalkinPage({ params }: Props) {
  const { clinicId } = await params;

  const clinic = await db.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true },
  });

  if (!clinic) notFound();

  return <WalkinKiosk clinicId={clinic.id} clinicName={clinic.name} />;
}
