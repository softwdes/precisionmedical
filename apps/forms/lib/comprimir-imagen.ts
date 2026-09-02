/**
 * Reduce una foto en el navegador ANTES de subirla.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * El límite de cuerpo de una request en Vercel es **4.5 MB**, y una foto de un
 * teléfono moderno pesa entre 5 y 12 MB. Cuando se pasa, la request muere en el
 * borde de Vercel: no llega a `/api/intake/[token]/upload-photo`, así que no hay
 * validación nuestra que la explique ni log que la registre. El paciente veía el
 * mensaje genérico —"se mostrará en esta sesión pero no se guardará al
 * reabrir"—, que se lee como "ya está, tranquilo".
 *
 * El back-office ya comprimía por esta razón exacta (su comentario dice textual
 * "so upload stays well under Vercel's 4.5MB body limit"); el portal del
 * paciente no. Y el portal es justamente el lado donde las fotos las saca gente
 * con el teléfono en la mano.
 *
 * Medido el 2026-09-02: de 133 intakes completados desde que existe el paso de
 * fotos, solo 12 (9%) tienen alguna, y la tarjeta de seguro solo 5 (4%). Este
 * archivo no es la única causa —también había un botón que ofrecía traer los
 * documentos a la cita— pero es la que hacía fallar a quien SÍ lo intentaba, y
 * en silencio.
 *
 * ── Por qué está duplicado del back-office ─────────────────────────────────
 *
 * Es la misma lógica que `components/patients/archivos-dialog.tsx` en
 * `apps/back-office`. No se comparte porque no hay un paquete de utilidades de
 * navegador en el workspace y crearlo es una decisión aparte. Lo que tiene que
 * quedar igual son los dos números: el lado máximo y el techo de peso.
 */

/** Lado máximo en px. Alcanza para leer un documento de identidad. */
const LADO_MAX = 1600;

/** Techo de peso, en KB. Bien debajo del 4.5 MB de Vercel, con margen para el multipart. */
const PESO_MAX_KB = 1400;

/**
 * Devuelve una versión más liviana del archivo, o el original si no se pudo.
 *
 * **Nunca lanza.** Si el navegador no puede decodificar la imagen (un HEIC que
 * no soporta, un archivo corrupto), devuelve el original y deja que el servidor
 * decida: perder la foto por no poder comprimirla sería peor que intentar
 * subirla tal cual.
 */
export async function comprimirImagen(file: File): Promise<File> {
  try {
    return await encoger(file);
  } catch {
    return file;
  }
}

function encoger(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img    = new Image();
    const objUrl = URL.createObjectURL(file);

    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('no se pudo decodificar')); };

    img.onload = () => {
      URL.revokeObjectURL(objUrl);

      let { width, height } = img;
      if (width > LADO_MAX || height > LADO_MAX) {
        if (width > height) { height = Math.round((height / width) * LADO_MAX); width = LADO_MAX; }
        else                { width = Math.round((width / height) * LADO_MAX); height = LADO_MAX; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('sin contexto 2d')); return; }
      ctx.drawImage(img, 0, 0, width, height);

      const nombre = file.name.replace(/\.\w+$/, '') + '.jpg';

      // Primero a 0.85; si sigue pasada, se reintenta a 0.70. Dos pasadas y no
      // un bucle: la tercera ya no mejora lo suficiente como para justificar el
      // tiempo en un teléfono.
      canvas.toBlob((b1) => {
        if (!b1) { reject(new Error('toBlob vacio')); return; }
        if (b1.size <= PESO_MAX_KB * 1024) {
          resolve(new File([b1], nombre, { type: 'image/jpeg' }));
          return;
        }
        canvas.toBlob((b2) => {
          resolve(new File([b2 ?? b1], nombre, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.70);
      }, 'image/jpeg', 0.85);
    };

    img.src = objUrl;
  });
}
