/**
 * B.37 — Lobby HIPAA Display
 * Ruta pública: /lobby/[clinicId]
 *
 * Pantalla de TV para sala de espera. Muestra el estado de los pacientes
 * del día de forma ANÓNIMA (sin PHI). Solo iniciales + 2 dígitos.
 *
 * Sin auth — es una pantalla pública de sala de espera.
 * Sin sidebar, sin nav — fullscreen TV display.
 */

import { notFound }      from 'next/navigation';
import { db }            from '@precision-medical/database';
import { LobbyDisplay }  from './lobby-display';

interface Props {
  params: Promise<{ clinicId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { clinicId } = await params;
  const clinic = await db.clinic.findUnique({
    where:  { id: clinicId },
    select: { name: true },
  });
  if (!clinic) return { title: 'Sala de Espera · Waiting Room' };
  return {
    title:    `${clinic.name} · Sala de Espera · Waiting Room`,
    robots:   'noindex, nofollow',   // TV display — don't index
  };
}

export default async function LobbyPage({ params }: Props) {
  const { clinicId } = await params;

  const clinic = await db.clinic.findUnique({
    where:  { id: clinicId },
    select: { id: true, name: true },
  });

  if (!clinic) notFound();

  return (
    <LobbyDisplay
      clinicId={clinic.id}
      clinicName={clinic.name}
    />
  );
}
