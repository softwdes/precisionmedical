import { createClient } from '@/lib/supabase-server';

const LIMITE_FALLBACK = 20;

async function getPlanLimite(trainerId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('trainer_suscripciones')
    .select('planes_saas(limite_ia_diario)')
    .eq('trainer_id', trainerId)
    .single();

  const limite = (data?.planes_saas as unknown as { limite_ia_diario: number | null } | null)?.limite_ia_diario;
  return limite ?? LIMITE_FALLBACK;
}

export async function checkAndIncrementUsage(
  trainerId: string
): Promise<{ permitido: boolean; restantes: number; usadas: number; limite: number }> {
  const supabase = await createClient();
  const hoy = new Date().toISOString().split('T')[0] as string;

  const [{ data }, limite] = await Promise.all([
    supabase
      .from('ai_usage')
      .select('consultas')
      .eq('trainer_id', trainerId)
      .eq('fecha', hoy)
      .single(),
    getPlanLimite(trainerId),
  ]);

  const usadasHoy = data?.consultas ?? 0;

  if (usadasHoy >= limite) {
    return { permitido: false, restantes: 0, usadas: usadasHoy, limite };
  }

  await supabase.from('ai_usage').upsert(
    { trainer_id: trainerId, fecha: hoy, consultas: usadasHoy + 1 },
    { onConflict: 'trainer_id,fecha' }
  );

  return {
    permitido: true,
    restantes: limite - usadasHoy - 1,
    usadas: usadasHoy + 1,
    limite,
  };
}

export async function getUsageHoy(
  trainerId: string
): Promise<{ usadas: number; restantes: number; limite: number }> {
  const supabase = await createClient();
  const hoy = new Date().toISOString().split('T')[0] as string;

  const [{ data }, limite] = await Promise.all([
    supabase
      .from('ai_usage')
      .select('consultas')
      .eq('trainer_id', trainerId)
      .eq('fecha', hoy)
      .single(),
    getPlanLimite(trainerId),
  ]);

  const usadas = data?.consultas ?? 0;
  return { usadas, restantes: Math.max(0, limite - usadas), limite };
}
