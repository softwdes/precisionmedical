'use server';

import { createClient } from '@/lib/supabase-server';

export interface TrainerPago {
  id: string;
  periodo: string;
  monto: number;
  estado: string;
  metodo_pago: string | null;
  fecha_pago: string | null;
  frecuencia: string | null;
  planes_saas: { nombre: string } | null;
}

export async function getTrainerPagos(): Promise<TrainerPago[]> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: trainer } = await supabase
      .from('trainers')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!trainer) return [];

    const { data } = await supabase
      .from('master_pagos')
      .select('id, periodo, monto, estado, metodo_pago, fecha_pago, frecuencia, planes_saas(nombre)')
      .eq('trainer_id', trainer.id)
      .order('fecha_pago', { ascending: false, nullsFirst: false });

    return ((data ?? []) as unknown as TrainerPago[]);
  } catch {
    return [];
  }
}
