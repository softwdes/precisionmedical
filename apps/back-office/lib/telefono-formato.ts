/**
 * El teléfono como se escribe en pantalla: `(385) 244-7519`.
 *
 * La misma función estaba copiada en cinco archivos —la lista de pacientes, su
 * diálogo de edición, el de ajustadores, el paso de pre-llamada y el primitivo
 * `FormField`—, cada una con su nombre (`fmtPhone`, `formatPhone`). Se sacó acá
 * al mover el editor de seguros a su propio componente, que habría sido la
 * sexta copia.
 *
 * Hoy la usan el editor de seguros y la lista de pacientes. Las otras tres
 * copias siguen en pie a propósito: viven en archivos de otras sesiones y
 * cambiarlas ahora sería tocar trabajo ajeno para no arreglar nada. Cuando
 * alguien pase por ellas, que apunten acá.
 *
 * ⚠️ Esto es SOLO presentación. Para BUSCAR por teléfono hay que comparar por
 * dígitos: los números conviven en la base con y sin puntuación, y un
 * `contains` contra este formato no encuentra a los que se cargaron sin
 * paréntesis — ver `lib/telefono-buscado.ts`.
 */
export function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length > 6) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length > 0) return `(${digits}`;
  return '';
}
