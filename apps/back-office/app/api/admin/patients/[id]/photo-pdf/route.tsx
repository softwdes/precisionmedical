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
 * Las fotos de identidad NO son filas de `patient_documents`: son URLs dentro
 * del JSON `consentsData` del caso (ver `lib/intake-photos.ts`). Por eso acá se
 * busca el caso y no un documento.
 *
 * ⚠️ Se mira el caso MÁS RECIENTE, que es exactamente lo que hace la pantalla
 * (`fotosDelCaso(patient.latestCase?.consentsData)`). Si un paciente subió sus
 * fotos en un caso viejo, ni la pantalla ni esto las ven. Medido el 2026-09-22:
 * le pasa a 2 pacientes. Cuando se arregle, hay que arreglar los dos lados
 * juntos o van a decir cosas distintas.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { checkPatientAccess } from '@/lib/patient-access';
import { fotosDe, esPhotoType } from '@/lib/intake-photos';
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

  const url = fotosDe(paciente.cases[0]?.consentsData)[tipo];
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
   * El bucket `intake-photos` es público, así que alcanza un fetch sin
   * credenciales. Si algún día se cierra —y debería, adentro hay licencias de
   * conducir— acá hay que firmar la URL antes de pedirla.
   */
  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    return NextResponse.json({ error: 'NO_SE_PUDO_LEER_LA_FOTO' }, { status: 502 });
  }

  const bytes = Buffer.from(await respuesta.arrayBuffer());
  const mime  = respuesta.headers.get('content-type') ?? 'image/jpeg';
  if (!mime.startsWith('image/')) {
    return NextResponse.json({ error: 'NO_ES_IMAGEN' }, { status: 415 });
  }

  /*
   * `<Image src>` toma un data URI. Se arma con el mime que contestó Storage y
   * no con la extensión de la URL: hay fotos guardadas sin extensión, y ahí
   * adivinar `jpeg` sobre un `png` da una página en blanco sin ningún error.
   */
  const dataUri = `data:${mime};base64,${bytes.toString('base64')}`;

  const pdf = await renderToBuffer(
    <Document>
      <Page size="LETTER" style={estilos.pagina}>
        <Image src={dataUri} style={estilos.imagen} />
      </Page>
    </Document>,
  );

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
