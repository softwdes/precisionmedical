/**
 * En qué estado está una orden de laboratorio, para el reporte previo a LabCorp.
 *
 * ── Por qué vive acá y no adentro de la ruta ───────────────────────────────
 * Porque es la única parte del reporte que DECIDE algo, y una ruta de Next no se
 * puede importar desde un script. La consulta se prueba corriéndola contra la
 * base; esto se prueba con casos, y los casos que importan son los que tienen
 * DOS problemas a la vez.
 */

/** Lo que traba una orden, de peor a mejor. El orden ES la prioridad. */
export type EstadoOrden =
  | 'ANULADA_SIN_REEMITIR'
  | 'SIN_NPI'
  | 'MEZCLADO'
  | 'SIN_POLIZA'
  | 'LISTA'
  | 'EMITIDA';

export interface DatosOrden {
  /** Hay una requisición VIGENTE para el grupo. */
  emitida: boolean;
  /** Hay una anulada que nunca se reemplazó. */
  anuladaHuerfana: boolean;
  /** NPI del provider de la cita, como está guardado. */
  npi: string | null;
  /** Cuántos tipos de facturación distintos tiene el grupo. */
  tipos: number;
  /** El tipo del grupo: `CLIENT` es "la paga la clínica". */
  tipo: string;
  /** Número de póliza del caso. */
  poliza: string | null;
}

/**
 * Una orden puede estar mal por más de un motivo a la vez —sin NPI Y sin
 * póliza— y mostrar los dos obligaría a leer dos renglones para una sola
 * acción. Se devuelve el que hay que resolver PRIMERO.
 *
 * El orden no es estético:
 *
 *  1. `ANULADA_SIN_REEMITIR` — es el único donde se perdió trabajo ya hecho.
 *     Alguien anuló para corregir, se distrajo, y el grupo quedó sin hoja. El
 *     botón vuelve a decir "Generar orden" como si nada, así que sin el reporte
 *     no se entera nadie hasta que el paciente vuelve sin resultados.
 *  2. `EMITIDA` — ya salió; lo que venga después no la traba.
 *  3. `SIN_NPI` — no lo arregla la clínica sino Configuración, así que es el que
 *     hay que escalar antes. Y hoy frena el 100%: 0 de 20 providers tienen NPI.
 *  4. `MEZCLADO` — antes que la póliza porque al separar los estudios puede
 *     desaparecer el problema del seguro, y al revés no.
 *  5. `SIN_POLIZA` — lo resuelve el que tiene al paciente delante.
 */
export function clasificarOrden(d: DatosOrden): EstadoOrden {
  if (d.anuladaHuerfana && !d.emitida) return 'ANULADA_SIN_REEMITIR';
  if (d.emitida) return 'EMITIDA';
  if (!(d.npi ?? '').trim()) return 'SIN_NPI';
  if (d.tipos > 1) return 'MEZCLADO';
  // Solo las que paga un tercero necesitan póliza: en una CLIENT paga la clínica.
  if (d.tipo !== 'CLIENT' && !(d.poliza ?? '').trim()) return 'SIN_POLIZA';
  return 'LISTA';
}

/**
 * ¿La hoja se facturó a algo distinto del seguro del caso?
 *
 * Solo cuenta cuando YA se emitió: comparar contra una hoja que no salió sería
 * marcar como desvío algo que todavía nadie decidió. Y se compara sin
 * mayúsculas ni espacios — "AAA " y "aaa" son la misma aseguradora escrita por
 * dos personas distintas.
 */
export function esOtroSeguro(
  emitida: boolean,
  seguroHoja: string | null,
  seguroCaso: string | null,
): boolean {
  if (!emitida) return false;
  const a = (seguroHoja ?? '').trim().toLowerCase();
  const b = (seguroCaso ?? '').trim().toLowerCase();
  // Sin uno de los dos no hay comparación posible: no es un desvío, es un dato
  // que falta — y eso ya lo dice la columna del seguro, vacía.
  if (!a || !b) return false;
  return a !== b;
}
