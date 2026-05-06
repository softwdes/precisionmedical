'use server';

import { getAuthContext } from '@/lib/supabase-server';

export async function getStudentCuotas(alumnoId: string, limit = 6) {
  const { supabase } = await getAuthContext();
  const { data } = await supabase
    .from('cuotas')
    .select('id, monto, fecha_pago, fecha_vencimiento, periodo, metodo_pago, estado, notas')
    .eq('alumno_id', alumnoId)
    .order('fecha_vencimiento', { ascending: false })
    .limit(limit);
  return (data ?? []) as {
    id: string; monto: number; fecha_pago: string | null;
    fecha_vencimiento: string; periodo: string;
    metodo_pago: string | null; estado: string; notas: string | null;
  }[];
}

export async function getStudentWaMensajes(alumnoId: string, limit = 5) {
  const { supabase } = await getAuthContext();
  const { data } = await supabase
    .from('whatsapp_mensajes')
    .select('id, tipo_mensaje, contenido, fecha_envio, estado')
    .eq('alumno_id', alumnoId)
    .order('fecha_envio', { ascending: false })
    .limit(limit);
  return (data ?? []) as {
    id: string; tipo_mensaje: string; contenido: string;
    fecha_envio: string; estado: string;
  }[];
}
