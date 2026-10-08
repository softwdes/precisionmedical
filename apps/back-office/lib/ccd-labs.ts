/**
 * Lector de la sección de LABORATORIOS de un CCD (C-CDA R2.1).
 *
 * ## Por qué solo laboratorios
 *
 * Med USA apaga MEDUSA el 31-dic-2026 y entrega los expedientes como CCDA. Se
 * midió un archivo real el 2026-10-08 (603 KB, 19 secciones) y **la sección de
 * resultados es la única que viene completa**: 152 observaciones, 151 con valor
 * y 147 con unidad. La medicación no trae dosis ni cantidad ni refills, y las
 * alergias no traen un solo código. Ver la ficha `ccd-de-muestra-medido`.
 *
 * ## Función pura, a propósito
 *
 * Entra el XML como texto y salen objetos. No toca la base, no sabe de Prisma y
 * no decide nada sobre pacientes: así se puede correr contra el archivo real sin
 * escribir una fila, que es exactamente como se verificó.
 *
 * ## ⚠️ Los códigos NO son LOINC, aunque el archivo lo diga
 *
 * Cada observación se declara con `codeSystem="2.16.840.1.113883.6.1"`, que es
 * el OID de LOINC, pero el código que trae es de **seis dígitos**
 * (`005025`, `005033`): son códigos de pedido de LabCorp. Un LOINC de verdad
 * tiene la forma `718-7`. De las 152 observaciones del archivo medido, **cero**
 * tenían forma de LOINC y 151 eran de seis dígitos.
 *
 * La narrativa repite el error y lo imprime como `WBC, [LOINC: 005025]`.
 *
 * Por eso esto devuelve `sourceCode` + `sourceCodeSystem`, y **nunca** llena un
 * campo llamado `loincCode`: guardar un código de LabCorp en una columna que
 * dice LOINC es una afirmación falsa que no falla hasta que alguien la cruza
 * contra un catálogo y no encuentra nada.
 *
 * ## El nombre del test vive en la narrativa
 *
 * Las entradas estructuradas **no traen `displayName`** — ni una de las 152. El
 * nombre legible está solo en la tabla narrativa de la sección. Se cruzan por el
 * CÓDIGO, que aparece en los dos lados, y no por posición: el orden de la tabla
 * no está garantizado por el estándar y una tabla corrida renombraría todos los
 * resultados sin dar error.
 */

/** Un resultado suelto, ya cruzado con su nombre. */
export interface CcdLabResult {
  /** Nombre legible del análisis ("WBC"). `null` si no estaba en la narrativa. */
  name: string | null;
  /** El código tal como vino. NO es LOINC — ver el comentario de arriba. */
  sourceCode: string | null;
  /** `LABCORP` (6 dígitos), `LOINC` (forma `nnn-n`) o `DESCONOCIDO`. */
  sourceCodeSystem: 'LABCORP' | 'LOINC' | 'DESCONOCIDO';
  /** El valor como texto, siempre: hay resultados que no son números. */
  value: string | null;
  /** El mismo valor como número cuando se puede; si no, `null`. */
  valueNumeric: number | null;
  unit: string | null;
  /** Fecha de la observación (ISO, solo día: el CCD no trae hora). */
  observedAt: string | null;
  /** Panel que lo agrupa ("CBC With Differential/Platelet"). */
  panelName: string | null;
  panelCode: string | null;
  /** Laboratorio que lo hizo, de la narrativa ("LabCorp Phoenix"). */
  performedBy: string | null;
  /** `completed`, `Final`… tal como lo manda el archivo. */
  status: string | null;
}

export interface CcdLabsResultado {
  results: CcdLabResult[];
  /** Cuántos paneles (`<organizer>`) se encontraron. */
  panels: number;
  /**
   * Observaciones que se descartaron y por qué. Nunca se inventa un valor: si
   * una fila no se pudo leer, se cuenta acá y se ve en el resumen de la
   * importación en vez de desaparecer en silencio.
   */
  descartadas: Array<{ motivo: string; codigo: string | null }>;
}

/** Saca los atributos de una etiqueta sin depender del orden en que estén. */
function atributos(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)="([^"]*)"/g)) out[m[1]!] = m[2]!;
  return out;
}

/** `20211005` → `2021-10-05`. Devuelve `null` si no tiene la forma esperada. */
function fechaCcd(v: string | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function clasificarCodigo(code: string | null): CcdLabResult['sourceCodeSystem'] {
  if (!code) return 'DESCONOCIDO';
  if (/^\d+-\d$/.test(code)) return 'LOINC';
  if (/^\d{4,7}$/.test(code)) return 'LABCORP';
  return 'DESCONOCIDO';
}

const sinEtiquetas = (s: string): string => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Nombre y laboratorio por código, leídos de la tabla narrativa.
 *
 * Las filas se ven así:
 *   <td>WBC, [LOINC: 005025] </td>
 *   <td>12.1 (x10E3/uL) , Status: Completed </td>
 *   <td>October 5, 2021 </td>
 *   <td>LabCorp Phoenix<br/>5005 S 40th...</td>
 *
 * Se toma solo la PRIMERA línea de la última celda: el resto es la dirección
 * postal del laboratorio, que no aporta al resultado y ensucia la lista.
 */
function leerNarrativa(seccion: string): Map<string, { name: string; performedBy: string | null }> {
  const mapa = new Map<string, { name: string; performedBy: string | null }>();
  const i = seccion.indexOf('<text>');
  const f = seccion.indexOf('</text>');
  if (i < 0 || f < 0) return mapa;
  const texto = seccion.slice(i, f);

  for (const fila of texto.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const celdas = [...fila[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]!);
    if (celdas.length < 2) continue;

    // "WBC, [LOINC: 005025]" — el rótulo LOINC es de ellos y está mal, pero es
    // el texto literal que hay que buscar.
    const m = /^(.*?),?\s*\[LOINC:\s*([^\]]+)\]/.exec(sinEtiquetas(celdas[0]!));
    if (!m) continue;
    const codigo = m[2]!.trim();
    if (!codigo || mapa.has(codigo)) continue;

    const ultima = celdas[celdas.length - 1]!;
    const lab = sinEtiquetas(ultima.split(/<br\s*\/?>/i)[0] ?? '');

    mapa.set(codigo, {
      name: m[1]!.trim(),
      performedBy: lab || null,
    });
  }
  return mapa;
}

/**
 * Lee la sección de resultados de un CCD.
 *
 * No lanza: un archivo que no es un CCD, o uno sin sección de laboratorios,
 * devuelve la lista vacía. Quien importa decide qué hacer con eso — un `throw`
 * acá obligaría a cada llamador a envolverlo.
 */
export function leerLabsDelCcd(xml: string): CcdLabsResultado {
  const descartadas: CcdLabsResultado['descartadas'] = [];

  // La sección de resultados es la que lleva el LOINC 30954-2 (ese SÍ es LOINC:
  // es el código del TÍTULO de la sección, que lo pone la plantilla, no el
  // laboratorio).
  let seccion: string | null = null;
  for (const m of xml.matchAll(/<section>([\s\S]*?)<\/section>/g)) {
    if (/<code[^>]*\bcode="30954-2"/.test(m[1]!)) { seccion = m[1]!; break; }
  }
  if (!seccion) return { results: [], panels: 0, descartadas };

  const narrativa = leerNarrativa(seccion);
  const results: CcdLabResult[] = [];
  const organizers = [...seccion.matchAll(/<organizer[^>]*>([\s\S]*?)<\/organizer>/g)];

  for (const org of organizers) {
    const cuerpo = org[1]!;

    // La cabecera del panel es todo lo anterior al primer <component>: ahí
    // viven su código y su nombre, y acotarlo evita confundirlos con los de la
    // primera observación.
    const corte = cuerpo.indexOf('<component>');
    const cabecera = corte > 0 ? cuerpo.slice(0, corte) : cuerpo;
    const codePanel = cabecera.match(/<code[^>]*\/>/);
    const aPanel = codePanel ? atributos(codePanel[0]) : {};
    const panelName = aPanel.displayName ?? null;
    const panelCode = aPanel.code ?? null;

    for (const obs of cuerpo.matchAll(/<observation[^>]*>([\s\S]*?)<\/observation>/g)) {
      const o = obs[1]!;

      // El <author> de cada observación trae su propio <code>/<time>: se corta
      // antes para no leer los datos del firmante como si fueran del resultado.
      const hastaAutor = o.indexOf('<author>');
      const propio = hastaAutor > 0 ? o.slice(0, hastaAutor) : o;

      const tagCode = propio.match(/<code[^>]*\/?>/);
      const aCode = tagCode ? atributos(tagCode[0]) : {};
      const sourceCode = aCode.code ?? null;

      const tagValue = propio.match(/<value[^>]*\/?>/);
      const aValue = tagValue ? atributos(tagValue[0]) : {};

      /**
       * El valor viene de DOS maneras y hay que leer las dos.
       *
       *  · `xsi:type="PQ"` — cantidad física, en el atributo: `value="12.1"`.
       *  · `xsi:type="ST"` — texto, DENTRO de la etiqueta: `<value>&lt;0.2</value>`.
       *
       * La segunda forma se me había pasado y descartaba 4 resultados reales del
       * archivo medido: `<0.2` (por debajo del límite de detección), `TNP` y un
       * `Comment`. Un "menor a 0,2" es un resultado clínico, no un hueco.
       */
      let crudo: string | null = aValue.nullFlavor ? null : (aValue.value ?? null);
      if (crudo === null && !aValue.nullFlavor) {
        const dentro = propio.match(/<value[^>]*>([\s\S]*?)<\/value>/);
        const texto = dentro ? sinEtiquetas(dentro[1]!).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
        if (texto) crudo = texto;
      }

      if (crudo === null) {
        /**
         * `nullFlavor` es el archivo diciendo "este dato no existe". Se respeta:
         * inventar un 0 sería peor que no traerlo.
         *
         * Pero hay un caso que NO es un hueco sino una contradicción: el archivo
         * medido trae cuatro `<value xsi:type="PQ" value="16" nullFlavor="OTH"/>`
         * — o sea "el valor es 16" y "no hay valor", en la misma etiqueta. Eso es
         * inválido según el estándar.
         *
         * Tampoco se toma el número: el archivo afirma explícitamente que no hay
         * valor, y pasarle por encima es escribir en la ficha de un paciente algo
         * que la fuente desmiente. Se descarta CON ESE MOTIVO, distinto del hueco
         * normal, para que salga en el resumen de la importación y alguien pueda
         * mirar el PDF original.
         */
        descartadas.push({
          motivo: aValue.value !== undefined && aValue.nullFlavor
            ? `contradictorio: value="${aValue.value}" y nullFlavor="${aValue.nullFlavor}"`
            : aValue.nullFlavor
              ? `sin valor (${aValue.nullFlavor})`
              : 'sin valor',
          codigo: sourceCode,
        });
        continue;
      }

      const num = Number(crudo);
      const desdeNarrativa = sourceCode ? narrativa.get(sourceCode) : undefined;

      results.push({
        name: desdeNarrativa?.name ?? null,
        sourceCode,
        sourceCodeSystem: clasificarCodigo(sourceCode),
        value: crudo,
        valueNumeric: crudo.trim() !== '' && Number.isFinite(num) ? num : null,
        unit: aValue.unit ?? null,
        observedAt: fechaCcd(propio.match(/<effectiveTime[^>]*value="([^"]*)"/)?.[1]),
        panelName,
        panelCode,
        performedBy: desdeNarrativa?.performedBy ?? null,
        status: propio.match(/<statusCode[^>]*code="([^"]*)"/)?.[1] ?? null,
      });
    }
  }

  return { results, panels: organizers.length, descartadas };
}

/**
 * Llave estable de un resultado, para no duplicar si se reimporta el mismo
 * archivo o uno que se solapa.
 *
 * Lleva paciente + código + fecha + valor: dos glóbulos blancos del mismo día
 * con el mismo valor SON el mismo resultado, y dos del mismo día con valores
 * distintos son dos tomas y tienen que entrar las dos.
 */
export function claveDeResultado(patientId: string, r: CcdLabResult): string {
  return [patientId, r.sourceCode ?? r.name ?? '?', r.observedAt ?? '?', r.value ?? '?'].join('|');
}
