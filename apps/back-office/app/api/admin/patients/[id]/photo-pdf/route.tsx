/**
 * GET /api/admin/patients/[id]/photo-pdf?tipo=dlFront
 *
 * La misma foto de identidad que el paciente subió, envuelta en un PDF de una
 * página. Nada más: sin encabezado, sin nombre impreso, sin combinar el frente
 * con el dorso. Lo pidió Erick el 2026-09-22 y fue explícito — "las mismas
 * imágenes que se le piden al paciente, lo mismo solo que en un PDF, cada
 * imagen que suben es un pdf".
 *
 * ── Por qué en el servidor y no en el navegador ────────────────────────────
 *
 * `@react-pdf/renderer` corre en los dos lados, pero acá pesa cero: ya es
 * dependencia de esta app —arma el PDF del formulario de admisión— y meterlo en
 * el bundle del cliente le cargaría cientos de KB a una pantalla que la clínica
 * abre todo el día. Además el mostrador usa iPad, donde el navegador es el
 * recurso escaso.
 *
 * ── Por qué NO recibe la URL por query ─────────────────────────────────────
 *
 * Sería lo cómodo —el cliente ya la tiene— y sería un agujero: una ruta que
 * baja cualquier URL que le pasen es un SSRF, y esta corre con la sesión de un
 * admin. Acá entra el TIPO de foto y el servidor resuelve la URL él mismo,
 * contra el caso del paciente. Lo único que el cliente elige es cuál de las
 * cuatro.
 *
 * ── De dónde sale la foto ──────────────────────────────────────────────────
 *
 * De `fotosConRespaldo()`, que es **la misma función que la pantalla**. Hay dos
 * orígenes —el `consentsData` del caso y la fila de `patient_documents` colgada
 * de la persona, que es donde están las migradas del v2— y el detalle vive
 * entero en `lib/fotos-identidad.ts`.
 *
 * Esta ruta nació leyendo SOLO el primero, y el resultado fue que toda foto
 * migrada se podía bajar como imagen y contestaba `FOTO_NO_ENCONTRADA` como
 * PDF: la grilla de `archivos-dialog` muestra el botón para las dos
 * (`delCaso ?? fotosPaciente[key]`) porque para ella son la misma foto. Lo
 * reportó Erick con la licencia de Sandra Ramos el 27-sep-2026.
 *
 * El bug no fue el 404 — fue haber escrito acá un segundo resolvedor más
 * angosto que el que ya existía. **Si algún día hace falta otra fuente, va en
 * `fotosConRespaldo` y no acá**, o las dos pantallas vuelven a decir cosas
 * distintas sobre el mismo archivo.
 *
 * ⚠️ Queda en pie un caso, y es el mismo de la pantalla: del caso se mira el
 * MÁS RECIENTE. Una foto que solo esté en el `consentsData` de un caso viejo
 * —y que no haya quedado archivada como documento— no la ve ninguno de los
 * dos. Medido el 2026-09-22: le pasa a 2 pacientes.
 *
 * ── El archivo no es siempre lo que dice ser ───────────────────────────────
 *
 * Encontrar la foto no alcanzaba. La de Sandra Ramos es un **WebP guardado con
 * nombre `.jpg`**, y Storage la sirve como `image/jpeg` porque mira la
 * extensión. El navegador olfatea el contenido y la muestra igual; el renderer
 * le cree a la etiqueta y devuelve la hoja en blanco. Así que acá el formato se
 * decide por los BYTES (`formatoReal`) y lo que no sea JPEG ni PNG se convierte
 * (`paraElRenderer`). Si la conversión falla, la ruta devuelve un error — nunca
 * una hoja vacía con `200 OK`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { checkPatientAccess } from '@/lib/patient-access';
import { fotosDe, esPhotoType } from '@/lib/intake-photos';
import { fotosConRespaldo } from '@/lib/fotos-identidad';
import { formatoReal, paraElRenderer } from '@/lib/foto-a-pdf';
import { renderToBuffer, Document, Page, Image, StyleSheet } from '@react-pdf/renderer';

/** Cómo se llama cada tipo dentro del nombre del archivo. */
const SUFIJO: Record<string, string> = {
  selfie:             'foto',
  insuranceCardFront: 'seguro-frente',
  insuranceCardBack:  'seguro-dorso',
  dlFront:            'licencia',
};

/**
 * Deja un texto usable como nombre de archivo en Windows, Mac y Linux.
 *
 * Mismo criterio que `lib/descarga-archivo.ts`: sin acentos, porque
 * `Content-Disposition` viaja en latin-1 y una `ó` puede llegar rota; y sin los
 * caracteres que Windows no acepta.
 */
function limpio(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim().replace(/\s+/g, '-');
}

const estilos = StyleSheet.create({
  pagina: {
    padding: 24,
    // La imagen se centra en la hoja en vez de pegarse arriba: una tarjeta de
    // seguro apaisada en una hoja carta deja mucho blanco, y centrada se lee
    // como un documento y no como un recorte.
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagen: {
    // `contain` y no `cover`: recortar la licencia para llenar la hoja es
    // exactamente lo que no se puede hacer con un documento de identidad.
    objectFit: 'contain',
    maxWidth: '100%',
    maxHeight: '100%',
  },
});

/** El PDF, con el nombre de archivo que espera el mostrador. */
function comoPdf(
  pdf: Buffer | Uint8Array,
  paciente: { firstName: string; lastName: string },
  tipo: string,
): NextResponse {
  const nombre = [limpio(paciente.lastName), limpio(paciente.firstName), SUFIJO[tipo] ?? tipo]
    .filter(Boolean).join('-') || 'foto';

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${nombre}.pdf"`,
      // Sin caché: la foto se puede reemplazar desde la misma pantalla, y un
      // PDF viejo en el disco del navegador es peor que volver a generarlo.
      'Cache-Control':       'no-store',
    },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: patientId } = await ctx.params;

  const acceso = await checkPatientAccess(patientId);
  if (acceso.deny) return acceso.deny;

  const tipo = req.nextUrl.searchParams.get('tipo') ?? '';
  if (!esPhotoType(tipo)) {
    return NextResponse.json({ error: 'TIPO_INVALIDO' }, { status: 400 });
  }

  const paciente = await db.patient.findUnique({
    where:  { id: patientId },
    select: {
      firstName: true,
      lastName:  true,
      cases: {
        where:   { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take:    1,
        select:  { consentsData: true },
      },
    },
  });
  if (!paciente) return NextResponse.json({ error: 'PATIENT_NOT_FOUND' }, { status: 404 });

  /*
   * Las del caso PRIMERO y las de la persona como respaldo — ver el encabezado.
   * Es la misma llamada que hace la pantalla, así que el botón de PDF nunca
   * puede quedar ofrecido sobre una foto que esta ruta no encuentra.
   */
  const fotos = await fotosConRespaldo(patientId, fotosDe(paciente.cases[0]?.consentsData));
  const url = fotos[tipo];
  if (!url) return NextResponse.json({ error: 'FOTO_NO_ENCONTRADA' }, { status: 404 });

  /*
   * Un archivo que YA es PDF no se vuelve a envolver: quedaría un PDF con una
   * página que no se puede dibujar. La pantalla tampoco ofrece el botón en ese
   * caso, así que esto es el cinturón por si alguien llama la ruta a mano.
   */
  if (/\.pdf(\?|$)/i.test(url)) {
    return NextResponse.json({ error: 'YA_ES_PDF' }, { status: 409 });
  }

  /*
   * Un fetch pelado sirve para las dos URLs y por razones distintas: la del
   * caso sale del bucket `intake-photos`, que es PÚBLICO (deuda anotada en
   * `lib/intake-photos.ts`), y la de la persona ya viene FIRMADA por
   * `fotosConRespaldo`, con el token en la query y 15 minutos de vida. Ninguna
   * de las dos necesita que le agreguemos credenciales acá — y el día que el
   * bucket público se cierre, que debería, esto sigue andando solo.
   */
  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    return NextResponse.json({ error: 'NO_SE_PUDO_LEER_LA_FOTO' }, { status: 502 });
  }

  const crudo = Buffer.from(await respuesta.arrayBuffer());
  const formato = formatoReal(crudo);

  /*
   * Los bytes dicen PDF aunque el nombre diga `.jpg` — hay archivos así, uno
   * cada cuarenta en la muestra. Se devuelve tal cual: ya es lo que el usuario
   * pidió, y envolverlo daría la hoja en blanco de siempre.
   */
  if (formato === 'pdf') return comoPdf(crudo, paciente, tipo);

  /*
   * `'otro'` NO es un error acá: es justamente el WebP disfrazado de `.jpg`, que
   * es el caso que hay que convertir. Lo que de verdad no sea una imagen muere
   * abajo, cuando `sharp` no pueda leerlo.
   */
  const listo = await paraElRenderer(crudo, formato);
  if (!listo) {
    /*
     * Fallar CERRADO. La alternativa —seguir y dejar que el renderer no
     * dibuje— devuelve un PDF de 1 KB con una hoja en blanco, con `200 OK` y
     * sin una línea en el log: el mostrador cree que bajó la licencia y se
     * entera cuando la abre, o peor, cuando la manda.
     *
     * 415 y no 502: el caso frecuente no es que el servidor se haya caído, es
     * que el archivo no era una imagen — el log tiene la cabecera para saberlo.
     */
    return NextResponse.json({ error: 'NO_SE_PUDO_CONVERTIR' }, { status: 415 });
  }

  /*
   * `<Image src>` toma un data URI. El mime sale de los BYTES —ver
   * `formatoReal`— y no de la cabecera ni de la extensión: las dos mienten en
   * este bucket, y una mentira acá no da error, da una hoja en blanco.
   */
  const dataUri = `data:image/${listo.formato};base64,${listo.bytes.toString('base64')}`;

  const pdf = await renderToBuffer(
    <Document>
      <Page size="LETTER" style={estilos.pagina}>
        <Image src={dataUri} style={estilos.imagen} />
      </Page>
    </Document>,
  );

  return comoPdf(pdf, paciente, tipo);
}
