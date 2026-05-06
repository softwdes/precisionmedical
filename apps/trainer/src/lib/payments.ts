export function calcEstadoCuota(
  fechaVencimiento: string,
  fechaPago: string | null
): 'pagado' | 'pendiente' | 'vencido' {
  if (fechaPago) return 'pagado';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento + 'T00:00:00');
  if (venc < today) return 'vencido';
  return 'pendiente';
}

export function diasHastaVencimiento(fechaVencimiento: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento + 'T00:00:00');
  const diff = venc.getTime() - today.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export function generarEnlaceWA(telefono: string, mensaje: string): string {
  const tel = telefono.replace(/\D/g, '');
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
}

export function buildMensaje(
  template: string,
  vars: {
    nombre?: string;
    monto?: string;
    fecha_vencimiento?: string;
    proxima_fecha?: string;
  }
): string {
  let result = template;
  if (vars.nombre !== undefined) result = result.replaceAll('{nombre}', vars.nombre);
  if (vars.monto !== undefined) result = result.replaceAll('{monto}', vars.monto);
  if (vars.fecha_vencimiento !== undefined) result = result.replaceAll('{fecha_vencimiento}', vars.fecha_vencimiento);
  if (vars.proxima_fecha !== undefined) result = result.replaceAll('{proxima_fecha}', vars.proxima_fecha);
  return result;
}

export const DEFAULT_TEMPLATES: Record<string, string> = {
  vencimiento:
    'Hola {nombre}! 👋 Te recuerdo que tu cuota vence el {fecha_vencimiento}. El monto es de {monto}. Cualquier consulta estoy a disposición. ¡Saludos!',
  vencido:
    'Hola {nombre}, te contacto porque tu cuota de {monto} está vencida desde el {fecha_vencimiento}. Por favor, regulariza tu situación para continuar con tus entrenamientos. ¡Gracias!',
  cobro:
    'Hola {nombre}! Confirmamos el recibo de tu pago de {monto}. Tu próximo vencimiento es el {proxima_fecha}. ¡Gracias por tu puntualidad! 💪',
  bienvenida:
    'Hola {nombre}! 🎉 Bienvenido/a a nuestro equipo. Estamos muy contentos de tenerte. Te informo que tu primera cuota vence el {fecha_vencimiento} y es de {monto}. ¡Nos vemos en el gym!',
  rutina:
    'Hola {nombre}! 💪 Tu nueva rutina de entrenamiento ya está lista. Ingresá a la app para verla. Cualquier duda estoy disponible. ¡A darle con todo!',
};
