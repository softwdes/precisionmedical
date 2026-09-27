/**
 * Convertir una URL de Storage que se VE en una que se BAJA.
 *
 * ── Por qué hace falta ──────────────────────────────────────────────────────
 * El atributo `download` de un `<a>` se IGNORA cuando la URL es de otro origen,
 * y las de Storage son de `supabase.co`, no del dominio de la app. Sin esto el
 * click no baja nada: navega la pestaña al archivo. Lo que sí funciona es el
 * parámetro `download`, que hace que Storage conteste con
 * `Content-Disposition: attachment`.
 *
 * ── Por qué se arma acá y no en una ruta ────────────────────────────────────
 * Los documentos del expediente lo resuelven con un endpoint
 * (`documents/[docId]/download`) que firma DOS veces. Está bien ahí: el
 * componente tiene un id, no una URL, así que alguien tiene que ir a buscarla.
 *
 * Las fotos de identificación son el caso contrario: la pantalla YA tiene la
 * URL en la mano (viene en `consentsData.photos` o ya firmada por
 * `fotosDelPaciente`). Pedirle al servidor que la vuelva a firmar es un viaje
 * de ida y vuelta para agregar un parámetro.
 *
 * Y es seguro hacerlo acá: en `@supabase/storage-js`, `download` NO entra en la
 * firma. Se agrega como query DESPUÉS de que el servidor devolvió la URL
 * firmada — verificado en el código de `createSignedUrl` y `getPublicUrl` de la
 * versión instalada (2.105.1). Por eso agregarlo a mano da exactamente la misma
 * URL que habría devuelto la librería.
 *
 * ⚠️ Si algún día `download` pasara a estar firmado, esto deja de funcionar en
 * silencio (baja un 400 en vez del archivo). La salida sería mover estas fotos
 * al patrón del endpoint.
 */

/**
 * Las dos formas de URL que conviven en los recuadros de identidad, y por eso
 * el separador no se puede clavar:
 *  · las del CASO viven en `intake-photos`, que es un bucket PÚBLICO → la URL
 *    no trae query y el parámetro va con `?`
 *  · las del v2 viven en `case-documents`, que es privado → la URL ya trae
 *    `?token=…` y el parámetro va con `&`
 *
 * `URL` resuelve las dos sin preguntar cuál es cuál.
 */
export function urlParaDescargar(url: string, nombreArchivo: string): string {
  const u = absoluta(url);
  if (u) {
    u.searchParams.set('download', nombreArchivo);
    return u.toString();
  }
  // Relativa (`/api/…`): se arma a mano para que SIGA siendo relativa. Pasarla
  // por `new URL(url, origin)` la volvería absoluta contra el origen de la app
  // —y en el servidor, contra `localhost`—, que es peor que no hacer nada.
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}download=${encodeURIComponent(nombreArchivo)}`;
}

/**
 * La URL como objeto, o `null` si no es absoluta.
 *
 * Sin base a propósito: con base, `new URL('cualquier-cosa', base)` NO falla
 * —resuelve contra la base— así que el `catch` nunca se ejecutaría y una URL
 * relativa saldría convertida en `http://localhost/…`. Lo encontré probando el
 * helper con una cadena que no era una URL.
 */
function absoluta(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * La extensión real del archivo, sacada del CAMINO de la URL (nunca del query).
 *
 * No es cosmética: el visor decide si pinta una imagen, un PDF o "no se puede
 * previsualizar" mirando la extensión del nombre que se le pasa. Un nombre sin
 * extensión deja el modal en blanco aunque la foto esté perfecta.
 *
 * Devuelve `jpg` cuando no puede determinarla. Las cuatro fotos de identidad
 * son imágenes por definición —el bucket rechaza cualquier otra cosa— así que
 * adivinar una imagen es correcto acá, y es lo que hace que el visor la muestre
 * en vez de rendirse.
 */
export function extensionDeUrl(url: string): string {
  const u = absoluta(url);
  // El query se corta a mano cuando la URL es relativa: `?token=…` puede traer
  // puntos y se leería como la extensión.
  const camino = u ? u.pathname : url.split(/[?#]/)[0];
  const ultimo = camino.split('/').pop() ?? '';
  const punto = ultimo.lastIndexOf('.');
  if (punto === -1) return 'jpg';
  const ext = ultimo.slice(punto + 1).toLowerCase();
  // Un "punto" que en realidad es parte del nombre (`foto.de.ayer`) o basura
  // larga no es una extensión.
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'jpg';
}

/**
 * Nombre con el que se guarda la foto en la computadora de quien la baja.
 *
 * Sale el apellido primero porque estos archivos terminan todos en la misma
 * carpeta de Descargas: ordenados por nombre, los de un mismo paciente quedan
 * juntos. Sin eso, cuatro archivos llamados "seguro-frente.jpg" se pisan entre
 * pacientes —el navegador los renombra `(1)`, `(2)`— y nadie sabe de quién es
 * cuál.
 *
 * La etiqueta la escribe la pantalla en el idioma del usuario, así que el
 * archivo se llama como el recuadro del que salió.
 */
export function nombreDeFoto(
  apellido: string,
  nombre: string,
  etiqueta: string,
  url: string,
): string {
  return `${baseDeFoto(apellido, nombre, etiqueta)}.${extensionDeUrl(url)}`;
}

/**
 * El mismo nombre, pero con la extensión que le toque a quien llama.
 *
 * Existe para el PDF: ahí la extensión NO sale de la URL —la URL apunta a una
 * imagen y lo que baja es un PDF— así que derivarla de `nombreDeFoto` con un
 * reemplazo sería adivinar dos veces.
 */
export function baseDeFoto(apellido: string, nombre: string, etiqueta: string): string {
  const partes = [apellido, nombre, etiqueta].map(limpiarParaNombre).filter(Boolean);
  return partes.join('-') || 'foto';
}

/**
 * Deja un texto usable como nombre de archivo en Windows, Mac y Linux.
 *
 * Saca los acentos (`López` → `Lopez`) porque el encabezado
 * `Content-Disposition` viaja en latin-1 y una `ó` puede llegar rota; y saca
 * `\ / : * ? " < > |`, que Windows directamente no acepta en un nombre.
 */
function limpiarParaNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Bajar un archivo que genera NUESTRO servidor, sin navegar a ningún lado.
 *
 * ── Por qué no alcanza un `<a href>` ────────────────────────────────────────
 *
 * Un `<a>` apuntado a `/api/…` es una NAVEGACIÓN: el navegador se va a esa URL
 * y recién cuando llegan las cabeceras descubre que era un adjunto. En una
 * pestaña normal eso queda disimulado, pero el back-office se usa instalado
 * como app (PWA) y en ese modo una navegación que sale de la pantalla **abre
 * una ventana aparte**, que se queda en blanco mientras baja el archivo. Es lo
 * que reportó Erick el 27-sep-2026 bajando la licencia como PDF: "primero lo
 * abre en una página nueva y de ahí se baja".
 *
 * Con `fetch` no hay navegación: la respuesta se recibe acá, se convierte en un
 * objeto local y se baja con un `<a download>` de un solo uso. El atributo
 * `download` sí manda porque la URL es del MISMO origen — que es justo lo
 * contrario del caso de Storage que resuelve `urlParaDescargar` arriba.
 *
 * ── Y el segundo motivo, que importa más ───────────────────────────────────
 *
 * Con el `<a>` un error no se veía: el servidor contesta un JSON con el motivo
 * y el navegador lo mostraba como una página de texto crudo, o no mostraba
 * nada. Acá el error VUELVE a quien llamó, que puede decirlo en el recuadro.
 * Generar este PDF puede tardar —hay fotos que se convierten de formato— así
 * que quien llame debería además mostrar que está trabajando.
 *
 * @param nombreDeRespaldo El que se usa si la respuesta no trae nombre propio.
 * @throws El código de error del servidor (`FOTO_NO_ENCONTRADA`, …) o `HTTP nnn`.
 */
export async function bajarDelServidor(url: string, nombreDeRespaldo: string): Promise<void> {
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    // El cuerpo trae el motivo; si no se puede leer, queda el código HTTP.
    let detalle = `HTTP ${res.status}`;
    try {
      const j = await res.json() as { error?: string };
      if (j?.error) detalle = j.error;
    } catch { /* no era JSON */ }
    throw new Error(detalle);
  }

  const blob = await res.blob();
  const objeto = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = objeto;
  a.download = nombreDeCabecera(res.headers.get('content-disposition')) ?? nombreDeRespaldo;
  // Tiene que estar en el documento para que el click cuente en Firefox.
  document.body.appendChild(a);
  a.click();
  a.remove();

  /* El objeto NO se libera en el acto: en varios navegadores revocarlo en el
     mismo turno cancela la descarga que se acaba de disparar. Un minuto es de
     sobra y el objeto muere con la pestaña de todas formas. */
  setTimeout(() => URL.revokeObjectURL(objeto), 60_000);
}

/**
 * El nombre que eligió el servidor, sacado de `Content-Disposition`.
 *
 * Se puede leer porque la respuesta es del mismo origen. Devuelve `null` si la
 * cabecera no vino o no trae nombre, y ahí manda el de respaldo.
 */
function nombreDeCabecera(cabecera: string | null): string | null {
  if (!cabecera) return null;
  // `filename*=UTF-8''…` gana sobre `filename="…"` cuando están los dos.
  const extendido = cabecera.match(/filename\*=UTF-8''([^;]+)/i);
  if (extendido?.[1]) {
    try { return decodeURIComponent(extendido[1]); } catch { /* sigue abajo */ }
  }
  const simple = cabecera.match(/filename="?([^";]+)"?/i);
  return simple?.[1]?.trim() || null;
}
