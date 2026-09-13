import { createReadStream } from 'fs'

/**
 * Lector de CSV del export del v2.
 *
 * ⚠️ POR QUÉ NO ES "UNA LÍNEA = UNA FILA" (medido 2026-09-12)
 *
 * La versión anterior leía con `readline` y trataba cada LÍNEA como una fila.
 * Funciona hasta que un campo entrecomillado trae un salto de línea adentro — y
 * el export del v2 los trae: `notes.complaint/history/physical/plan` y
 * `transcription` guardan HTML (`<p>…</p>`) con saltos, y lo mismo
 * `appointments.notes` y `medical_history`.
 *
 * Con el lector viejo, `notes` parecía tener 1.864 filas: eran LÍNEAS. Cada nota
 * larga se partía en varias "filas" falsas, y las partes de la mitad quedaban
 * con los campos corridos —el texto caía en la columna `appointmentId`— y sin
 * fecha ni caso. Así se explicaba el "76 % de las notas no tiene appointmentId":
 * no era el v2 exportando mal, era el parser cortando en el lugar equivocado.
 *
 * Este lector sigue el estado de las comillas a través de los saltos de línea,
 * que es la regla del RFC 4180. Va por chunks: nunca carga el archivo entero.
 */

/** Estado del parser, compartido entre chunks. */
function nuevoEstado() {
  return { campo: '', fila: [], enComillas: false, comillaPendiente: false }
}

/**
 * Empuja un chunk y devuelve las filas COMPLETAS que quedaron cerradas.
 * Lo que quede a medias se guarda en el estado para el chunk siguiente.
 */
function consumir(estado, texto, filas) {
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]

    if (estado.comillaPendiente) {
      // Veníamos de una comilla adentro de un campo entrecomillado: si viene
      // otra es un `""` escapado; si no, la comilla cerraba el campo.
      estado.comillaPendiente = false
      if (ch === '"') { estado.campo += '"'; continue }
      estado.enComillas = false
    }

    if (estado.enComillas) {
      if (ch === '"') estado.comillaPendiente = true
      else estado.campo += ch
      continue
    }

    if (ch === '"') { estado.enComillas = true; continue }
    if (ch === ',') { estado.fila.push(estado.campo === '' ? null : estado.campo); estado.campo = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') {
      estado.fila.push(estado.campo === '' ? null : estado.campo)
      filas.push(estado.fila)
      estado.campo = ''
      estado.fila = []
      continue
    }
    estado.campo += ch
  }
}

/** Cierra lo que haya quedado abierto al terminar el archivo. */
function cerrar(estado, filas) {
  if (estado.campo !== '' || estado.fila.length > 0) {
    estado.fila.push(estado.campo === '' ? null : estado.campo)
    filas.push(estado.fila)
  }
}

/**
 * Generador de FILAS (arrays de campos), por streaming.
 *
 * Para archivos grandes: recorre sin acumular. La primera fila es el encabezado.
 */
export async function* leerFilas(filePath) {
  const estado = nuevoEstado()
  let primera = true

  for await (const chunk of createReadStream(filePath, { encoding: 'utf8' })) {
    const filas = []
    consumir(estado, chunk, filas)
    for (const fila of filas) {
      if (primera) { primera = false; fila[0] = quitarBom(fila[0]) }
      yield fila
    }
  }

  const ultimas = []
  cerrar(estado, ultimas)
  for (const fila of ultimas) {
    if (primera) { primera = false; fila[0] = quitarBom(fila[0]) }
    yield fila
  }
}

/** Excel escribe un BOM al frente; sin sacarlo la primera columna no matchea. */
const quitarBom = v => (typeof v === 'string' ? v.replace(/^﻿/, '') : v)

/**
 * Generador de REGISTROS (objetos por encabezado), por streaming.
 *
 * Es lo que conviene usar en los scripts nuevos: misma comodidad que `parseCSV`
 * sin cargar el archivo entero.
 */
export async function* leerRegistros(filePath) {
  let headers = null
  for await (const fila of leerFilas(filePath)) {
    if (!headers) {
      headers = fila.map(h => (h ?? '').trim())
      continue
    }
    // Una fila más corta que el encabezado es normal: el v2 recorta las
    // columnas vacías del final.
    yield Object.fromEntries(headers.map((h, i) => [h, fila[i] ?? null]))
  }
}

/**
 * Todo el archivo como array de objetos. La firma de siempre, para no tocar los
 * 19 scripts que ya la usan.
 */
export async function parseCSV(filePath) {
  const rows = []
  for await (const row of leerRegistros(filePath)) rows.push(row)
  return rows
}

/**
 * Una línea suelta → array de campos.
 *
 * Sirve para el encabezado o para un texto que ya se sabe de una sola línea.
 * **No usar para recorrer un archivo**: no puede saber que un campo sigue
 * abierto en la línea siguiente, que es justo el bug que documenta el
 * encabezado de este archivo.
 */
export function parseCSVLine(line) {
  const estado = nuevoEstado()
  const filas = []
  consumir(estado, line, filas)
  cerrar(estado, filas)
  return filas[0] ?? []
}
