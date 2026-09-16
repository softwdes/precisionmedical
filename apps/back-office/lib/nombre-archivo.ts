/**
 * Partir un nombre de archivo en la parte que el usuario edita y la que no.
 *
 * Existe porque la extensión NO se puede dejar en manos del que escribe. Si
 * alguien renombra `Chris Davis-mri.pdf` a `MRI de Chris`, pasan dos cosas y
 * ninguna avisa: el visor decide qué mostrar mirando la extensión, así que el
 * modal queda en "no se puede previsualizar"; y el archivo que se descarga no
 * lo abre Windows, porque tampoco sabe qué es.
 *
 * La pantalla muestra la extensión al lado del campo, fija. Acá vive la regla
 * de cuál es.
 */

export interface NombrePartido {
  /** Lo editable. */
  base: string;
  /** Con el punto (`.pdf`), o vacío si el nombre no tiene extensión. */
  ext: string;
}

/**
 * ¿El texto después del último punto es una extensión de verdad?
 *
 * ⚠️ El caso que obliga a preguntarlo sale de los datos: la clínica nombra
 * documentos como `H. Caceres - Notes 05.21.2026`. Partir por el último punto
 * a secas daría `ext = '.2026'` y la pantalla le clavaría eso como extensión
 * intocable a un archivo que en realidad no tiene ninguna.
 *
 * La regla: entre 1 y 8 caracteres, solo letras y números, y **no puede ser
 * todo números** — no existe la extensión `.2026`, pero sí `.mp4` y `.7z`.
 */
function esExtension(texto: string): boolean {
  return /^[a-zA-Z0-9]{1,8}$/.test(texto) && /[a-zA-Z]/.test(texto);
}

export function partirNombre(nombre: string): NombrePartido {
  const punto = nombre.lastIndexOf('.');
  // `punto <= 0` cubre dos casos: no hay punto, y el punto está al principio
  // (`.gitignore` es el nombre entero, no una extensión sin nombre).
  if (punto <= 0) return { base: nombre, ext: '' };

  const posible = nombre.slice(punto + 1);
  if (!esExtension(posible)) return { base: nombre, ext: '' };

  return { base: nombre.slice(0, punto), ext: nombre.slice(punto) };
}

/** Vuelve a armar el nombre completo. Recorta los espacios que quedan al editar. */
export function unirNombre(base: string, ext: string): string {
  return `${base.trim()}${ext}`;
}

/**
 * Caracteres que ningún sistema operativo acepta en un nombre de archivo.
 *
 * No se limpian a escondidas: la pantalla los marca y no deja guardar. Que el
 * sistema cambie el nombre por su cuenta después de que alguien lo escribió es
 * exactamente lo que hace que nadie confíe en lo que ve.
 */
const PROHIBIDOS = /[\\/:*?"<>|]/;

export function tieneCaracteresProhibidos(base: string): boolean {
  return PROHIBIDOS.test(base);
}

/** `255` es el techo del campo en la base y el de la mayoría de los sistemas de archivos. */
export const LARGO_MAXIMO = 255;

/**
 * ¿Ya hay otro con este nombre en la misma carpeta?
 *
 * Para AVISAR, nunca para bloquear. En el archivo real ya conviven documentos
 * con el mismo nombre dentro de un caso y casi siempre está bien —dos "Notes"
 * de fechas distintas, por ejemplo—; lo que no está bien es que el sistema lo
 * deje pasar sin decir nada y después nadie sepa cuál es cuál.
 *
 * Compara sin distinguir mayúsculas y sin espacios de sobra, que es como lo lee
 * una persona: `notes.pdf` y `Notes.pdf ` son el mismo nombre para quien mira.
 */
export function nombreRepetido(nombre: string, existentes: readonly string[]): boolean {
  const clave = nombre.trim().toLowerCase();
  return existentes.some((n) => n.trim().toLowerCase() === clave);
}
