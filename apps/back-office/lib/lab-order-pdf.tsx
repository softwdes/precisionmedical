/**
 * La hoja de requisición de laboratorio — versión CLIENT (sin seguro).
 *
 * Réplica del formato COMPLETO de la hoja que hoy emite MedUSA para LabCorp
 * (decisión de Erick, 2026-09-10): mismos bloques, mismo orden, mismos rótulos,
 * tipografía serif, rótulo y valor en la misma línea, y las etiquetas de
 * muestra al pie. Lo único que cambia es la marca del encabezado: va el logo de
 * **Precision Medical**, no "LabCorp · EREQ · MedUSA". Esta hoja la emite la
 * clínica; poner el software de otra empresa sería decir que la generó ella. El
 * número de cuenta de LabCorp sí va, porque es el dato con el que el
 * laboratorio sabe a quién factura.
 *
 * **UN SOLO código de barras, arriba.** Las etiquetas de muestra del pie van en
 * texto, sin código — así es el original, y así lo pidió Erick. Cinco símbolos
 * en una hoja no le dan cinco veces la información al escáner: le dan cuatro
 * oportunidades de leer el equivocado.
 *
 * Por qué CLIENT primero: la hoja con seguro pide campos que no tenemos ni
 * columna para guardarlos (grupo, titular de la póliza, relación con el
 * paciente, dirección del asegurado) y hoy solo el 4,6% de los casos tiene
 * número de póliza. La de CLIENT no lleva bloque de seguro.
 *
 * El código es **PDF417**, el mismo tipo que el de ellos, y lleva la orden
 * entera adentro (ver `lib/ereq-payload.ts`). Llega acá ya renderizado.
 *
 * ⚠️ **NO está probado contra un escáner real.** El símbolo es correcto según la
 * librería de referencia y la carga reconstruye las dos órdenes reales carácter
 * por carácter, pero el ancho de barra, el contraste y los márgenes dependen de
 * la impresora. Hay que imprimir UNA hoja y pasarla por el lector antes de que
 * la clínica dependa de esto.
 *
 * ⚠️ Y varios campos de la carga van VACÍOS porque no los tenemos: SSN (4,8% de
 * los pacientes), número de póliza (4,6% de los casos), dirección de la
 * aseguradora (22%), Alt Patient ID (no existe). El código se genera igual —
 * decisión de Erick, 2026-09-11 — pero eso es lo primero a mirar si el
 * laboratorio lo escanea y le falta algo.
 */

import {
  renderToBuffer, Document, Page, Text, View, StyleSheet, Image,
} from '@react-pdf/renderer';
import { readFileSync } from 'fs';
import { join } from 'path';

const NEGRO = '#000000';
/** Los valores del original van en azul oscuro, no en negro. */
const AZUL = '#1F3A6E';
const GRIS = '#666666';

/**
 * El logo, leído UNA vez al cargar el módulo — mismo criterio que
 * `intake-pdf.tsx`. Si el archivo no está, la hoja sale con el nombre en texto:
 * una requisición sin logo se procesa, una que revienta al generarse no.
 */
const LOGO_B64 = (() => {
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'logo-pm.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
})();

const s = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 26,
    paddingTop: 20,
    paddingBottom: 24,
    fontFamily: 'Times-Roman',
    fontSize: 8.5,
    color: NEGRO,
  },

  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { width: 230, height: 58, objectFit: 'contain' },
  marca: { fontSize: 15, fontFamily: 'Times-Bold' },
  marcaSub: { fontSize: 8, fontFamily: 'Times-Bold', letterSpacing: 0.4, marginTop: 2 },
  pagina: { fontSize: 9, textAlign: 'right', marginTop: 3 },

  caja: { borderWidth: 0.7, borderColor: NEGRO, padding: 4, marginTop: 4 },
  cajaTitulo: { fontSize: 8.5, fontFamily: 'Times-Bold', marginBottom: 2 },
  /** La banda gris de "Clinical Information", igual que el original. */
  banda: { backgroundColor: '#BFBFBF', borderWidth: 0.7, borderColor: NEGRO, paddingVertical: 2, paddingHorizontal: 4, marginTop: 4 },

  fila: { flexDirection: 'row' },
  mitad: { flexDirection: 'column', flexGrow: 1, flexBasis: 0, paddingRight: 8 },

  par: { flexDirection: 'row', marginBottom: 1.5 },
  rotulo: { fontSize: 8.5, fontFamily: 'Times-Bold' },
  valor: { fontSize: 8.5, color: AZUL },

  estudio: { flexDirection: 'row', flexGrow: 1, flexBasis: 0, paddingRight: 8 },
  estudioCodigo: { fontSize: 8.5, color: AZUL, width: 44 },
  estudioNombre: { fontSize: 8.5, color: AZUL, flexGrow: 1, flexBasis: 0 },

  codigo: { width: 273, height: 45, objectFit: 'contain', marginBottom: 1 },
  barrasTexto: { fontSize: 6.5, fontFamily: 'Courier', marginTop: 1, letterSpacing: 0.3, textAlign: 'center' },

  legalTitulo: { fontSize: 8.5, fontFamily: 'Times-Bold', marginTop: 8 },
  legal: { fontSize: 8, color: AZUL, lineHeight: 1.4, marginTop: 4 },
  firmas: { flexDirection: 'row', marginTop: 18 },
  firmaCelda: { flexGrow: 1, flexBasis: 0, paddingRight: 10 },
  firmaLinea: { borderTopWidth: 0.7, borderTopColor: NEGRO, width: '80%' },
  firmaRotulo: { fontSize: 8, fontFamily: 'Times-Bold', marginTop: 2 },

  /** Las etiquetas de muestra: 4 columnas × 2 filas, al pie, SIN código. */
  etiquetas: { marginTop: 'auto', borderWidth: 0.7, borderColor: NEGRO, flexDirection: 'row', flexWrap: 'wrap' },
  etiqueta: { width: '25%', paddingVertical: 3, paddingHorizontal: 4, alignItems: 'center' },
  etiquetaTexto: { fontSize: 7.5, fontFamily: 'Times-Bold' },
});

/** Rótulo y valor en la MISMA línea, como el original. */
function Par({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <View style={s.par}>
      <Text style={s.rotulo}>{rotulo} </Text>
      <Text style={s.valor}>{valor?.trim() ? valor : ''}</Text>
    </View>
  );
}

/**
 * El código, con su texto legible debajo.
 *
 * El PNG viene hecho (`lib/pdf417.ts`). El `padding` blanco alrededor es la
 * **quiet zone**: sin ese margen el escáner no encuentra dónde empieza el
 * símbolo, y es el error más común al poner un código en un documento — se ve
 * perfecto en pantalla y no lee.
 *
 * Si el código no se pudo generar, sale solo el texto: el laboratorio lo carga
 * a mano, que es lo que hace hoy con cualquier hoja que no venga de MedUSA.
 */
function Codigo({ png, leyenda }: { png: string | null; leyenda: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      {png && <Image src={png} style={s.codigo} />}
      <Text style={s.barrasTexto}>{leyenda}</Text>
    </View>
  );
}

export interface DatosRequisicion {
  numero: string;
  cuentaLabCorp: string;
  /**
   * El PDF417 ya renderizado como PNG base64 — lo arma el llamador con
   * `lib/pdf417.ts` a partir de la carga de `lib/ereq-payload.ts`.
   *
   * Se recibe HECHO y no se genera acá por lo mismo de siempre: este archivo
   * dibuja, no decide. Y armar la carga necesita datos del paciente y del seguro
   * que el PDF no tiene por qué conocer.
   *
   * `null` = no se pudo generar. La hoja sale igual **sin código**: una
   * requisición sin código se carga a mano en el laboratorio; una hoja que no
   * sale deja al paciente sin nada.
   */
  codigoPdf417: string | null;
  /** El texto legible bajo el código — cuenta y número de requisición. */
  codigoLeyenda: string;
  fechaColeccion: string;       // "09/10/2026 1058"
  billTypeImpreso: string;      // "CLIENT"
  practica: { nombre: string; direccion: string; ciudadEstadoZip: string; telefono: string };
  /**
   * `upin` y `physicianId` van en la hoja del original y salen EN BLANCO ahí
   * también — no se inventan: el renglón vacío es información (dice que ese
   * identificador no aplica o no está cargado).
   */
  provider: { nombre: string; npi: string; upin?: string; physicianId?: string };
  paciente: {
    nombre: string; nacimiento: string; genero: string; edad: string;
    id: string; altId?: string; ssn?: string;
    direccion: string; ciudadEstadoZip: string; telefono: string;
  };
  altControl?: string;
  estudios: Array<{ codigo: string; nombre: string }>;
  indicacion: string;
  icd10: string[];
  /** Responsable de pago y tutor. En la hoja de CLIENT salen casi vacíos. */
  garante?: { nombre?: string; direccion?: string; ciudadEstadoZip?: string; telefono?: string; relacion?: string };
  tutor?: { nombre?: string; direccion?: string; ciudadEstadoZip?: string; telefono?: string };
}

const AUTORIZACION =
  'I hereby authorize the release of medical information related to the services described here on and '
  + 'authorize payment directly to the performing laboratory. I agree to assume responsibility for payment of '
  + 'charges for laboratory services that are not covered by my healthcare insurer.';

export function construirHojaRequisicion(d: DatosRequisicion): Promise<Buffer> {
  const g = d.garante ?? {};
  const t = d.tutor ?? {};

  const doc = (
    <Document title={`Lab Requisition ${d.numero}`}>
      <Page size="LETTER" style={s.page}>
        {/* ── Encabezado: logo a la izquierda, UN código arriba a la derecha ── */}
        <View style={s.encabezado}>
          <View>
            {LOGO_B64
              ? <Image src={LOGO_B64} style={s.logo} />
              : <Text style={s.marca}>{d.practica.nombre}</Text>}
            <Text style={s.marcaSub}>LABORATORY REQUISITION</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Codigo png={d.codigoPdf417} leyenda={d.codigoLeyenda} />
            <Text style={s.pagina}>Page 1 of 1</Text>
          </View>
        </View>

        {/* ── Cuenta / requisición / facturación ── */}
        <View style={s.caja}>
          <View style={s.fila}>
            <View style={s.mitad}>
              <Par rotulo="Account#:" valor={d.cuentaLabCorp} />
              <Par rotulo="Req/Control#:" valor={d.numero} />
              <Par rotulo="Bill Type:" valor={d.billTypeImpreso} />
            </View>
            <View style={s.mitad}>
              <Par rotulo="Collection Date and Time:" valor={d.fechaColeccion} />
              <Par rotulo="Courtesy Copy:   Attn:" valor="" />
              <Par rotulo="Fax#:" valor="" />
            </View>
          </View>
        </View>

        {/* ── Sitio que ordena / médico ── */}
        <View style={s.caja}>
          <View style={s.fila}>
            <View style={s.mitad}>
              <Par rotulo="Client/OrderingSite:" valor={d.practica.nombre} />
              <Par rotulo="Address:" valor={d.practica.direccion} />
              <Par rotulo="City,State Zip:" valor={d.practica.ciudadEstadoZip} />
              <Par rotulo="Phone:" valor={d.practica.telefono} />
            </View>
            <View style={s.mitad}>
              <Par rotulo="Ordering Physician:" valor={d.provider.nombre} />
              <Par rotulo="NPI:" valor={d.provider.npi} />
              <Par rotulo="UPIN:" valor={d.provider.upin} />
              <Par rotulo="Physician ID:" valor={d.provider.physicianId} />
            </View>
          </View>
        </View>

        {/* ── Paciente ── */}
        <View style={s.caja}>
          <Text style={s.cajaTitulo}>Patient Information:</Text>
          <View style={s.fila}>
            <View style={s.mitad}>
              <Par rotulo="Patient Name:" valor={d.paciente.nombre} />
              <Par
                rotulo="Date of Birth:"
                valor={`${d.paciente.nacimiento}    Gender: ${d.paciente.genero}    Age: ${d.paciente.edad}`}
              />
              <Par rotulo="Patient Address:" valor={d.paciente.direccion} />
              <Par rotulo="City, State Zip:" valor={d.paciente.ciudadEstadoZip} />
            </View>
            <View style={s.mitad}>
              <Par rotulo="Patient SSN:" valor={d.paciente.ssn} />
              <Par
                rotulo="Patient ID:"
                valor={`${d.paciente.id}${d.paciente.altId ? `    Alt Patient ID: ${d.paciente.altId}` : ''}`}
              />
              <Par rotulo="Phone:" valor={d.paciente.telefono} />
              <Par rotulo="Alt Control #:" valor={d.altControl} />
            </View>
          </View>
        </View>

        {/* ── Estudios: DOS por fila, como el original ── */}
        <View style={s.caja}>
          <Text style={s.cajaTitulo}>Order Code:Tests Ordered(Total:{d.estudios.length}):</Text>
          {Array.from({ length: Math.ceil(d.estudios.length / 2) }, (_, f) => (
            <View key={f} style={s.fila}>
              {[d.estudios[f * 2], d.estudios[f * 2 + 1]].map((e, c) => (
                <View key={c} style={s.estudio}>
                  {e && (
                    <>
                      <Text style={s.estudioCodigo}>{e.codigo}</Text>
                      <Text style={s.estudioNombre}>{e.nombre}</Text>
                    </>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* ── Información clínica: la banda gris ── */}
        <View style={s.banda}>
          <Text style={s.cajaTitulo}>Clinical Information:</Text>
        </View>
        {d.indicacion.trim() !== '' && (
          <View style={s.caja}><Text style={s.valor}>{d.indicacion}</Text></View>
        )}

        {/* ── Diagnósticos ── */}
        <View style={s.caja}>
          <View style={s.fila}>
            <View style={{ width: 110 }}><Text style={s.rotulo}>Diagnosis Codes:</Text></View>
            <View style={{ flexGrow: 1 }}>
              <Text style={s.rotulo}>
                List all applicable Diagnosis codes Must be at Highest Level Specificity
              </Text>
            </View>
          </View>
          <Text style={{ ...s.valor, marginTop: 3 }}>
            {d.icd10.length ? `${d.icd10.join(', ')},` : ''}
          </Text>
        </View>

        {/* ── Responsable de pago y tutor ── */}
        <View style={s.caja}>
          <View style={s.fila}>
            <View style={s.mitad}>
              <Text style={s.cajaTitulo}>Responsible Party/Guarantor Information:</Text>
              <Par rotulo="Name:" valor={g.nombre} />
              <Par rotulo="Address:" valor={g.direccion} />
              <Par rotulo="City, State Zip:" valor={g.ciudadEstadoZip} />
              <Par rotulo="Phone:" valor={`${g.telefono ?? ''}    Relation to Pt: ${g.relacion ?? ''}`} />
            </View>
            <View style={s.mitad}>
              <Text style={s.cajaTitulo}>Parent/Guardian Information:</Text>
              <Par rotulo="Name:" valor={t.nombre} />
              <Par rotulo="Address:" valor={t.direccion} />
              <Par rotulo="City, State Zip:" valor={t.ciudadEstadoZip} />
              <Par rotulo="Phone:" valor={t.telefono} />
            </View>
          </View>
        </View>

        {/* ── Autorización y firmas ── */}
        <Text style={s.legalTitulo}>Authorization - Please sign and date</Text>
        <Text style={s.legal}>{AUTORIZACION}</Text>
        <View style={s.firmas}>
          {/* La clave es el ÍNDICE y no el rótulo: "Date" aparece dos veces y
              con el rótulo como clave React puede omitir o duplicar una celda. */}
          {['Patient Signature', 'Date', 'Physician Signature', 'Date'].map((r, i) => (
            <View key={i} style={s.firmaCelda}>
              <View style={s.firmaLinea} />
              <Text style={s.firmaRotulo}>{r}</Text>
            </View>
          ))}
        </View>

        {/*
          * Etiquetas de muestra al PIE, 4×2 y SIN código de barras — así es el
          * original. El laboratorio las despega y las pega en los tubos, y por
          * eso cada una repite paciente, nacimiento, fecha y el par
          * cuenta/requisición: un tubo suelto tiene que poder volver a su orden
          * sin la hoja. `marginTop: auto` las empuja abajo de todo.
          */}
        <View style={s.etiquetas}>
          {Array.from({ length: 8 }, (_, i) => (
            <View key={i} style={s.etiqueta}>
              <Text style={s.etiquetaTexto}>{d.paciente.nombre}</Text>
              <Text style={s.etiquetaTexto}>{d.paciente.nacimiento}  {d.fechaColeccion.split(' ')[0]}</Text>
              <Text style={s.etiquetaTexto}>{d.cuentaLabCorp}  {d.numero}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
