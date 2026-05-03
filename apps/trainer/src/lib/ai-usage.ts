import { createClient } from '@/lib/supabase-server';

export const LIMITE_DIARIO = 100;

export async function checkAndIncrementUsage(
  trainerId: string
): Promise<{ permitido: boolean; restantes: number; usadas: number }> {
  const supabase = await createClient();
  const hoy = new Date().toISOString().split('T')[0] as string;

  const { data } = await supabase
    .from('ai_usage')
    .select('consultas')
    .eq('trainer_id', trainerId)
    .eq('fecha', hoy)
    .single();

  const usadasHoy = data?.consultas ?? 0;

  if (usadasHoy >= LIMITE_DIARIO) {
    return { permitido: false, restantes: 0, usadas: usadasHoy };
  }

  await supabase.from('ai_usage').upsert(
    { trainer_id: trainerId, fecha: hoy, consultas: usadasHoy + 1 },
    { onConflict: 'trainer_id,fecha' }
  );

  return {
    permitido: true,
    restantes: LIMITE_DIARIO - usadasHoy - 1,
    usadas: usadasHoy + 1,
  };
}

export async function getUsageHoy(
  trainerId: string
): Promise<{ usadas: number; restantes: number }> {
  const supabase = await createClient();
  const hoy = new Date().toISOString().split('T')[0] as string;

  const { data } = await supabase
    .from('ai_usage')
    .select('consultas')
    .eq('trainer_id', trainerId)
    .eq('fecha', hoy)
    .single();

  const usadas = data?.consultas ?? 0;
  return { usadas, restantes: Math.max(0, LIMITE_DIARIO - usadas) };
}
