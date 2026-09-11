/**
 * La CARGA del código de la hoja de laboratorio — formato `MEDUSAP2.1`.
 *
 * Esto es lo que viaja adentro del PDF417 de la hoja que hoy emite MedUSA. No
 * es un enlace: es la orden entera en texto plano, y es lo que el laboratorio
 * escanea para no tipear los datos a mano.
 *
 * ── De dónde salió el formato ──────────────────────────────────────────────
 * NO de una especificación: de **dos órdenes reales** que Erick escaneó el
 * 2026-09-10 —una THIRD PARTY (Kimberly Goatz) y una CLIENT (Rodolfo
 * Montecinos)— y de comparar campo por campo contra sus PDF impresos. Por eso
 * el archivo dice, en cada campo, de dónde se sabe lo que se sabe.
 *
 * ⚠️ **Deducir un formato de dos ejemplos no es tener la especificación.** Los
 * campos marcados `// ?` son iguales o constantes en las dos muestras y se
 * copian tal cual: probablemente estén bien, y "probablemente" sobre una orden
 * de laboratorio es un riesgo que hay que decir, no esconder. Lo correcto es
 * pedirle el formato del EREQ al representante de LabCorp; hasta entonces esto
 * llega al 90% y el 10% restante son constantes copiadas.
 *
 * Registros (uno por línea, `|` separa campos, `^` separa subcampos):
 *   H cabecera · P paciente+médico+seguro (92) · C control (28) · A (34) ·
 *   M B K I vacíos · T estudios · S · D diagnósticos · L largo · E fin
 */

/** `X` = THIRD PARTY (al seguro) · `C` = CLIENT (a la clínica). */
export type LetraFacturacion = 'X' | 'C';

export interface DatosEreq {
  /** `YYYYMMDD` */
  fecha: string;
  /** `HHMMSS` — la hora de colección. */
  hora: string;
  /**
   * La letra del tipo de facturación. Va en DOS lugares (`P[78]` y `A[5]`) y en
   * las dos muestras coincide: por eso sabemos que es el tipo y no otra cosa.
   */
  facturacion: LetraFacturacion;

  cuenta: string;            // P[7]  — Account# de LabCorp
  requisicion: string;       // P[8]  — sin el sufijo `-PM`
  sufijo: string;            // el `-PM` de P[57]/P[58]

  paciente: {
    id: string;              // P[1]
    altId: string;           // P[2]  — sin sufijo
    apellido: string;        // P[9]
    nombre: string;          // P[9]
    nacimiento: string;      // P[10] — `YYYYMMDD`
    genero: string;          // P[11]
    ssn?: string;            // P[12] — vacío si no se tiene
    direccion: string;       // P[13]
    ciudad: string;          // P[14]
    estado: string;          // P[15]
    zip: string;             // P[16]
    telefono: string;        // P[17]
    /** Años, meses y días — P[63], P[64], P[65]. La hoja lo imprime `42/11/17`. */
    edadAnios: number;
    edadMeses: number;
    edadDias: number;
  };

  /**
   * La SEGUNDA persona del registro P (campos 20 y 22-25).
   *
   * En la orden de Rodolfo es él mismo con OTRA dirección (Lehi, no Provo); en
   * la de Kimberly es un nombre distinto (STASINOS). No coincide con el bloque
   * "Responsible Party" que imprime la hoja, así que **no sabemos qué es**:
   * podría ser el garante interno de MedUSA, el titular de la póliza o un
   * domicilio alternativo. Se manda lo que se tenga y si no, vacío.
   */
  segundaPersona?: {
    apellido: string; nombre: string;
    direccion: string; ciudad: string; estado: string; zip: string;
  };

  /**
   * El seguro. OJO: va SIEMPRE, también en las órdenes CLIENT — en la de
   * Rodolfo aparece su seguro del auto (AAA), porque es un caso de accidente.
   * **La hoja lleva el seguro siempre; la letra de facturación es la que decide
   * quién paga.** No son dos formularios distintos.
   */
  seguro?: {
    nombre: string; direccion: string; ciudad: string; estado: string; zip: string;
    poliza?: string;         // P[40]
  };

  provider: { apellido: string; nombre: string; npi: string };
  /** P[56] — un teléfono; en Rodolfo es el del paciente, en Kimberly es otro. */
  telefonoContacto: string;

  /**
   * DOS campos que CAMBIAN entre las dos órdenes y no sabemos qué significan.
   *
   * `P[18]`: 'Z' en Rodolfo, vacío en Kimberly.
   * `P[27]`: '1' en Rodolfo, '2' en Kimberly.
   *
   * Se exponen como entrada en vez de dejarlos en duro porque son DATO, no
   * constante: ponerlos fijos copiaría el valor de una orden ajena en todas las
   * demás. Mientras no sepamos qué son, quien llame decide — y vacío es la
   * opción honesta hasta que LabCorp diga qué van.
   */
  campo18?: string;
  campo27?: string;

  /** Códigos de estudio, en el orden en que se imprimen. */
  estudios: string[];
  /** ICD-10, unidos con `^` en el registro D. */
  diagnosticos: string[];
}

/** Arma una línea de N campos (sin contar el tipo) con los valores dados. */
function registro(tipo: string, total: number, valores: Record<number, string>): string {
  const campos: string[] = [tipo];
  for (let i = 1; i <= total; i++) campos.push(valores[i] ?? '');
  return campos.join('|');
}

const nombreCompuesto = (apellido: string, nombre: string) => `${apellido}^${nombre}^`;

export function construirCargaEreq(d: DatosEreq): string {
  const p = d.paciente;
  const sp = d.segundaPersona;
  const sg = d.seguro;

  // ── H: cabecera. `E` y `^^` son constantes en las dos muestras.        // ?
  const H = registro('H', 6, { 1: 'MEDUSAP2.1', 2: d.fecha, 3: 'E', 4: '^^' });

  // ── P: 91 campos después del tipo.
  const P = registro('P', 91, {
    1:  p.id,
    2:  p.altId,
    7:  d.cuenta,
    8:  d.requisicion,
    9:  nombreCompuesto(p.apellido, p.nombre),
    10: p.nacimiento,
    11: p.genero,
    12: p.ssn ?? '',
    13: p.direccion,
    14: p.ciudad,
    15: p.estado,
    16: p.zip,
    17: p.telefono,
    18: d.campo18 ?? '',
    20: sp ? nombreCompuesto(sp.apellido, sp.nombre) : '',
    22: sp?.direccion ?? '',
    23: sp?.ciudad ?? '',
    24: sp?.estado ?? '',
    25: sp?.zip ?? '',
    27: d.campo27 ?? '',
    29: nombreCompuesto(d.provider.apellido, d.provider.nombre),
    35: sg?.nombre ?? '',
    // El `^` final de la dirección del seguro está en las dos muestras.     // ?
    36: sg ? `${sg.direccion}^` : '',
    37: sg?.ciudad ?? '',
    38: sg?.estado ?? '',
    39: sg?.zip ?? '',
    40: sg?.poliza ?? '',
    45: '^',                                                              // ?
    52: 'N',   // Worker's Comp — la hoja impresa dice "Worker's Comp: N"
    54: '^'.repeat(14),                                                   // ?
    55: '^'.repeat(7),                                                    // ?
    56: d.telefonoContacto,
    57: `${d.requisicion}-${d.sufijo}`,
    58: `${p.altId}-${d.sufijo}`,
    63: String(p.edadAnios),
    64: String(p.edadMeses),
    65: String(p.edadDias),
    71: d.provider.npi,
    72: '^^', 73: '^^', 74: '^^', 75: '^^',                               // ?
    78: d.facturacion,
    79: '^',                                                              // ?
    85: '^^', 86: '^^^^',                                                 // ?
    89: '^',                                                              // ?
  });

  // ── C: control. `EREQ`/`EEDI` son el tipo de documento y el canal.
  const C = registro('C', 27, {
    17: d.fecha, 19: '^', 22: 'EREQ', 23: 'EEDI', 25: d.hora,             // ?
  });

  // ── A: lleva la MISMA letra de facturación que P[78].
  const A = registro('A', 33, {
    5: d.facturacion,
    21: '^^', 22: '^', 23: '^', 29: '^^', 30: '^^^^^',                    // ?
  });

  const M = registro('M', 6, {});                                         // ?
  const B = registro('B', 21, {});                                        // ?
  const K = registro('K', 22, { 1: '^', 16: '^^^^' });                    // ?
  const I = registro('I', 9, { 1: '^^', 2: '^^', 3: '^^', 4: '^^', 5: '^^', 6: '^^', 7: '^^', 8: '^^' });

  const T = registro('T', 41, Object.fromEntries(d.estudios.map((c, i) => [i + 1, c])));
  const S = registro('S', 2, { 1: '^^^^^^' });                            // ?
  const D = registro('D', 3, { 1: d.diagnosticos.join('^') });

  const cuerpo = [H, P, C, A, M, B, K, I, T, S, D].join('\n');

  /**
   * `L` es el LARGO de la carga, y se calcula — no se copia.
   *
   * Medido en las dos muestras: la carga entera mide 699 y 697 caracteres, y
   * `L` dice 700 y 698. Uno más en las dos, o sea que cuenta también el salto
   * final. Si dejáramos el número fijo, una orden de otro largo saldría con un
   * `L` que no corresponde y el sistema que la recibe la rechaza.
   */
  const conL = `${cuerpo}\nL|`;
  const sinNumero = `${conL}|\nE|0|`;
  // El propio número cambia el largo, así que se resuelve el punto fijo.
  let largo = sinNumero.length + 1;
  for (let i = 0; i < 5; i++) {
    const candidato = `${cuerpo}\nL|${largo}|\nE|0|`;
    const nuevo = candidato.length + 1;
    if (nuevo === largo) break;
    largo = nuevo;
  }
  return `${cuerpo}\nL|${largo}|\nE|0|`;
}
