'use server';

import { revalidatePath } from 'next/cache';
import { getAuthContext } from '@/lib/supabase-server';
import { calcEstadoCuota } from '@/lib/payments';

export async function createCuota(data: {
  alumno_id: string;
  monto: number;
  fecha_pago?: string;
  fecha_vencimiento: string;
  periodo: string;
  metodo_pago?: string;
  notas?: string;
}): Promise<{ error?: string }> {
  try {
    const { supabase, trainerId } = await getAuthContext();
    const estado = calcEstadoCuota(data.fecha_vencimiento, data.fecha_pago ?? null);
    const { error } = await supabase.from('cuotas').insert({
      trainer_id: trainerId,
      alumno_id: data.alumno_id,
      monto: data.monto,
      fecha_vencimiento: data.fecha_vencimiento,
      periodo: data.periodo,
      estado,
      ...(data.fecha_pago !== undefined ? { fecha_pago: data.fecha_pago } : {}),
      ...(data.metodo_pago !== undefined ? { metodo_pago: data.metodo_pago } : {}),
      ...(data.notas !== undefined ? { notas: data.notas } : {}),
    });
    if (error) return { error: error.message };
    revalidatePath('/finanzas');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function updateCuotaEstado(
  cuotaId: string,
  estado: string,
  fechaPago?: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();
    const { error } = await supabase
      .from('cuotas')
      .update({
        estado,
        ...(fechaPago !== undefined ? { fecha_pago: fechaPago } : {}),
      })
      .eq('id', cuotaId);
    if (error) return { error: error.message };
    revalidatePath('/finanzas');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteCuota(cuotaId: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await getAuthContext();
    const { error } = await supabase.from('cuotas').delete().eq('id', cuotaId);
    if (error) return { error: error.message };
    revalidatePath('/finanzas');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function logWhatsappMensaje(data: {
  alumno_id: string;
  tipo_mensaje: string;
  contenido: string;
}): Promise<{ error?: string }> {
  try {
    const { supabase, trainerId } = await getAuthContext();
    const { error } = await supabase.from('whatsapp_mensajes').insert({
      trainer_id: trainerId,
      alumno_id: data.alumno_id,
      tipo_mensaje: data.tipo_mensaje,
      contenido: data.contenido,
    });
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function upsertPlantilla(
  tipo: string,
  nombre: string,
  contenido: string
): Promise<{ error?: string }> {
  try {
    const { supabase, trainerId } = await getAuthContext();
    const { error } = await supabase.from('plantillas_mensaje').upsert(
      {
        trainer_id: trainerId,
        tipo,
        nombre,
        contenido,
        activo: true,
      },
      { onConflict: 'trainer_id,tipo' }
    );
    if (error) return { error: error.message };
    revalidatePath('/finanzas');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function upsertConfigRecordatorios(config: {
  dias_antes_vencimiento?: number;
  recordatorio_dia_vencimiento?: boolean;
  recordatorio_post_24h?: boolean;
  recordatorio_post_48h?: boolean;
  recordatorio_post_72h?: boolean;
  dias_habiles?: number[];
}): Promise<{ error?: string }> {
  try {
    const { supabase, trainerId } = await getAuthContext();
    const { error } = await supabase.from('config_recordatorios').upsert(
      {
        trainer_id: trainerId,
        updated_at: new Date().toISOString(),
        ...(config.dias_antes_vencimiento !== undefined
          ? { dias_antes_vencimiento: config.dias_antes_vencimiento }
          : {}),
        ...(config.recordatorio_dia_vencimiento !== undefined
          ? { recordatorio_dia_vencimiento: config.recordatorio_dia_vencimiento }
          : {}),
        ...(config.recordatorio_post_24h !== undefined
          ? { recordatorio_post_24h: config.recordatorio_post_24h }
          : {}),
        ...(config.recordatorio_post_48h !== undefined
          ? { recordatorio_post_48h: config.recordatorio_post_48h }
          : {}),
        ...(config.recordatorio_post_72h !== undefined
          ? { recordatorio_post_72h: config.recordatorio_post_72h }
          : {}),
        ...(config.dias_habiles !== undefined
          ? { dias_habiles: config.dias_habiles }
          : {}),
      },
      { onConflict: 'trainer_id' }
    );
    if (error) return { error: error.message };
    revalidatePath('/finanzas');
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}
