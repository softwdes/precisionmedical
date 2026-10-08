/**
 * Lista de medicación del paciente · hoja imprimible
 *
 * Ruta:   /doctor-print/medication-list/[patientId]?case=<id>
 * Acceso: `checkPatientAccess` — el MISMO resolvedor que usan las APIs de la
 *         ficha. Imprimir no es un permiso aparte: quien puede leer la lista
 *         puede imprimirla (ver el comentario equivalente en la nota clínica,
 *         donde tener un guard propio dejaba a 17 cuentas con el botón a la
 *         vista y "documento no disponible" al apretarlo).
 *
 * ## Por qué existe
 *
 * Devin, 2026-10-08, sobre MEDUSA: *"ALSO ADD A PRINT OPTION TO PRINT/SAVE A
 * PATIENT'S CURRENT MEDICATION LIST"*. MEDUSA lo resuelve con cuatro salidas
 * distintas (`Cur Meds`, `Today Meds`, `Pat Sum`, `Rx Listing`); acá va UNA, la
 * que pidió: la lista vigente.
 *
 * ## Es del PACIENTE, no de una visita
 *
 * La lista vive en `medicalHistory` de la ficha, no en la consulta — por eso la
 * ruta se acota por `patientId` y no por cita. También es lo único que funciona
 * desde el caso cuando todavía no hay ninguna consulta, que es justo donde Devin
 * entra con las renovaciones que manda la farmacia.
 *
 * El `?case=` es opcional y **solo decide el logo del membrete**: la marca la
 * manda el tipo de caso (MVA → Pain Management), igual que en la nota clínica.
 * Sin caso sale la marca general de la clínica.
 *
 * ## El origen va marcado línea por línea
 *
 * Es la diferencia que importa y la que no se puede deducir mirando: lo que
 * salió recetado de acá pasó por el control de interacciones de ScriptSure, y lo
 * que se cargó a mano —venta libre, suplementos, muestras— no. En MEDUSA lo
 * mismo se lee por la ausencia de la línea `e-Sent`. Acá se dice con todas las
 * letras, porque una hoja impresa se lee sin nadie al lado que lo aclare.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { fechaCalendario } from '@/lib/fechas';
import { checkPatientAccess, auditarFichaAjenaDesdeLaPagina } from '@/lib/patient-access';
import { conDetalleDeReceta, type MedicationConDetalle } from '@/lib/medication-details';

type Props = {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ case?: string }>;
};

const TZ = 'America/Denver';

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { patientId } = await params;
  const p = await db.patient.findUnique({
    where: { id: patientId },
    select: { firstName: true, lastName: true },
  });
  const t = await getTranslations('phoenix.pageTitles');
  if (!p) return { title: { absolute: t('medicationList') } };
  const name = `${dec(p.lastName) ?? ''}, ${dec(p.firstName) ?? ''}`;
  return { title: { absolute: `${t('medicationList')} — ${name}` } };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(d: Date | string | null | undefined, locale: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleString(locale === 'en' ? 'en-US' : 'es-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

/** Solo la fecha, sin hora: en la lista el minuto del envío no agrega nada. */
function fmtDia(d: Date | string | null | undefined, locale: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ,
  });
}

/** El nacimiento es fecha de CALENDARIO — sin zona. Ver lib/fechas.ts. */
const fmtNacimiento = (d: Date | null | undefined, locale: string): string =>
  fechaCalendario(d, locale === 'en' ? 'en-US' : 'es-US');

const esActivo = (m: MedicationConDetalle): boolean => m.status === 'IN_USE';

/**
 * Orden dentro de cada bloque: lo más reciente primero y, sin fecha, alfabético.
 * Una lista de medicación se repasa de arriba hacia abajo con el paciente, así
 * que lo último que se le indicó tiene que estar donde se empieza a leer.
 */
function ordenar(a: MedicationConDetalle, b: MedicationConDetalle): number {
  const ta = a.rx?.sentAt ? new Date(a.rx.sentAt).getTime() : 0;
  const tb = b.rx?.sentAt ? new Date(b.rx.sentAt).getTime() : 0;
  if (ta !== tb) return tb - ta;
  return a.name.localeCompare(b.name);
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function MedicationListPrintPage({
  params, searchParams,
}: Props): Promise<React.ReactElement> {
  const { patientId } = await params;
  const { case: caseId } = await searchParams;
  const t = await getTranslations('phoenix.doctor');
  const locale = await getLocale();

  const { deny } = await checkPatientAccess(patientId);
  if (deny) notFound();

  // El registro de quién miró una ficha ajena va ANTES de servir nada: en
  // serverless la instancia se congela al responder y lo que quedó pendiente
  // puede no llegar a escribirse.
  await auditarFichaAjenaDesdeLaPagina(patientId);

  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: {
      firstName: true, lastName: true, dateOfBirth: true, sex: true,
      medicalHistory: true,
      // La sede del membrete sale de la última visita; sin ninguna, de la
      // oficina principal (abajo).
      appointments: {
        where: { deletedAt: null },
        orderBy: { scheduledFor: 'desc' },
        take: 1,
        select: { clinic: { select: { name: true, address: true, city: true, state: true, zipCode: true, phone: true } } },
      },
    },
  });
  if (!patient) notFound();

  const mh = (patient.medicalHistory ?? {}) as {
    medications?: unknown[];
    allergies?: string | null;
    noKnownAllergies?: { at: string } | null;
  };

  const meds = await conDetalleDeReceta(patientId, mh.medications);
  const activos = meds.filter(esActivo).sort(ordenar);
  const anteriores = meds.filter((m) => !esActivo(m)).sort(ordenar);

  const clinic = patient.appointments[0]?.clinic
    ?? (await db.clinic.findFirst({
      orderBy: { isMainOffice: 'desc' },
      select: { name: true, address: true, city: true, state: true, zipCode: true, phone: true },
    }));

  // Idéntico al membrete de la nota clínica, incluido el caso en que `address`
  // ya trae el código postal adentro — si no, sale repetido.
  const addr = clinic?.address?.trim() ?? '';
  const zip = clinic?.zipCode ?? '';
  const clinicLine = (addr && zip && addr.includes(zip)
    ? [addr]
    : [addr, [clinic?.city, clinic?.state].filter(Boolean).join(', '), zip]
  ).filter(Boolean).join(' · ');

  /**
   * Mismo criterio que la nota clínica: la marca la decide el TIPO DE CASO, no
   * la sede. Sin caso en la URL —la lista es del paciente, puede imprimirse
   * desde cualquier lado— cae en la marca general.
   */
  const caso = caseId
    ? await db.case.findFirst({ where: { id: caseId, patientId }, select: { caseType: true } })
    : null;
  const esMVA = caso?.caseType === 'MVA';
  const marca = esMVA
    ? { src: '/logo-pm-pain-management.png', alt: 'Precision Medical Pain Management and Orthopedics' }
    : { src: '/logo-pm.png', alt: 'Precision Medical Urgent Care and Family Practice' };

  // El azul del paquete de admisión, igual que la nota firmada.
  const ACENTO = '#1E4D8C';
  const ACENTO_OSC = '#163A63';
  const LINEA_SUAVE = '#DCE7F4';
  const LINEA_TENUE = '#E8EFF7';
  const FONDO_TH = '#F2F6FB';

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-size:11pt;line-height:1.45}
    .wrap{max-width:900px;margin:0 auto;padding:0 24px 48px}
    .doc{max-width:780px;margin:0 auto}

    .pbar{background:#f6f5fa;border-bottom:1px solid #e3e0ec;padding:10px 24px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;position:sticky;top:0;z-index:10;margin-bottom:24px}
    .pbar button{padding:9px 18px;background:${ACENTO};color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
    .pbar span{font-size:11px;color:#6b7280}

    .lh{border-bottom:2px solid ${ACENTO};padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
    .lhl{display:flex;align-items:flex-start;gap:14px;min-width:0}
    .lhl img{height:52px;width:auto;flex-shrink:0}
    .cn{font-size:17pt;font-weight:bold;color:${ACENTO_OSC};line-height:1.2}
    .cs{font-size:8.5pt;color:#555;margin-top:3px}
    .dt{font-size:12.5pt;font-weight:bold;text-align:right;color:#333;letter-spacing:.04em}
    .ds{font-size:8.5pt;color:#555;text-align:right;margin-top:2px}

    /* Identificación del paciente — una sola línea, como la cabecera de MEDUSA */
    .pid{background:#FAFCFE;border:1px solid ${LINEA_SUAVE};border-radius:5px;padding:8px 12px;margin-bottom:14px;font-size:9.5pt;display:flex;flex-wrap:wrap;gap:4px 22px}
    .pid b{color:${ACENTO_OSC}}
    .pid .l{color:#6b7280;font-size:8pt;text-transform:uppercase;letter-spacing:.06em;margin-right:5px}

    /* Alergias: va arriba, antes de la lista. En papel es lo primero que mira
       quien recibe la hoja. */
    .alg{border:1px solid #fde68a;background:#fffbeb;border-radius:5px;padding:8px 12px;margin-bottom:16px;font-size:9.5pt;color:#92400e}
    .alg .l{font-size:8pt;font-weight:bold;text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:2px}
    .alg.none{border-color:${LINEA_SUAVE};background:#FAFCFE;color:#555}

    .stitle{font-size:9.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.09em;color:${ACENTO};margin:18px 0 6px;padding-bottom:3px;border-bottom:1px solid ${LINEA_SUAVE}}
    .scount{font-weight:normal;color:#6b7280;letter-spacing:0;text-transform:none}

    table{width:100%;border-collapse:collapse;margin-bottom:4px}
    th{background:${FONDO_TH};color:${ACENTO_OSC};text-align:left;padding:5px 8px;font-size:8pt;font-weight:700;letter-spacing:.04em;border:1px solid ${LINEA_SUAVE}}
    td{padding:6px 8px;font-size:9.5pt;border:1px solid ${LINEA_TENUE};vertical-align:top}
    td.n{text-align:right;color:#6b7280;width:26px;font-size:8.5pt}
    .mname{font-weight:bold;color:#1a1a1a}
    .mdose{color:#444;font-size:9pt}
    .msig{color:#333;font-size:9pt;margin-top:2px}
    .mmeta{color:#6b7280;font-size:8.5pt;margin-top:3px}

    /* El origen de cada línea. Es el dato que la hoja existe para transmitir. */
    .org{display:inline-block;padding:2px 7px;border-radius:10px;font-size:7.5pt;font-weight:bold;letter-spacing:.03em;white-space:nowrap}
    .org.rx{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
    .org.ext{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}

    .empty{padding:14px;text-align:center;color:#6b7280;font-size:9.5pt;border:1px dashed ${LINEA_SUAVE};border-radius:5px}

    .leyenda{margin-top:14px;padding:9px 11px;background:#fafafa;border:1px solid #eee;border-radius:4px;font-size:8pt;color:#6b7280;line-height:1.5}
    .leyenda b{color:#444}

    .hipaa{margin-top:16px;padding:8px 10px;background:#fafafa;border:1px solid #eee;border-radius:4px;font-size:7.5pt;color:#8a8a8a;line-height:1.45}

    @media print{
      .pbar{display:none!important}
      .wrap{padding:0 6px}
      .doc{max-width:100%}
      tr{page-break-inside:avoid}
      @page{margin:14mm}
    }
  `;

  /** Una fila de la tabla. Misma forma para lo recetado y lo cargado a mano. */
  const Fila = ({ m, i }: { m: MedicationConDetalle; i: number }): React.ReactElement => {
    const rx = m.rx;
    const dose = rx?.dose ?? m.dose ?? null;
    const sig = rx?.sig ?? m.instructions ?? null;
    const cantidad = rx?.quantity ?? m.quantity ?? null;

    return (
      <tr>
        <td className="n">{i + 1}</td>
        <td>
          <div className="mname">{m.name}</div>
          {dose && <div className="mdose">{dose}</div>}
          {sig && <div className="msig">{sig}</div>}
          {/* Cantidad · refills · lista controlada. Si no hay ninguno de los
              tres no se dibuja el renglón: una línea vacía en papel se lee como
              un dato que faltó cargar. */}
          {(() => {
            const meta = [
              cantidad,
              rx && rx.refills !== null ? t('medHxRefills', { count: rx.refills }) : null,
              rx?.deaSchedule ? t('medHxSchedule', { schedule: rx.deaSchedule }) : null,
            ].filter(Boolean).join(' · ');
            return meta ? <div className="mmeta">{meta}</div> : null;
          })()}
        </td>
        <td>
          {rx ? (
            <>
              <span className="org rx">{t('mlOriginRx')}</span>
              <div className="mmeta">
                {rx.prescriberName ?? '—'}
                {rx.pharmacyName && <><br />{rx.pharmacyName}</>}
                {rx.sentAt && <><br />{fmtDia(rx.sentAt, locale)}</>}
              </div>
            </>
          ) : (
            <>
              <span className="org ext">{t('mlOriginExternal')}</span>
              {m.prescribedBy && <div className="mmeta">{m.prescribedBy}</div>}
            </>
          )}
        </td>
      </tr>
    );
  };

  const Tabla = ({ items }: { items: MedicationConDetalle[] }): React.ReactElement => (
    <table>
      <thead>
        <tr>
          <th className="n"></th>
          <th>{t('mlColMedication')}</th>
          <th style={{ width: '33%' }}>{t('mlColOrigin')}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((m, i) => <Fila key={m.id ?? `${m.name}-${i}`} m={m} i={i} />)}
      </tbody>
    </table>
  );

  const nombrePaciente = `${dec(patient.lastName) ?? ''}, ${dec(patient.firstName) ?? ''}`;
  const alergias = (mh.allergies ?? '').trim();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="pbar">
        <button id="btn-print" type="button">🖨 {t('prPrintBtn')}</button>
        <span>{t('mlBarHint')}</span>
      </div>

      <div className="wrap">
        <div className="doc">

          {/* Membrete. El `<img>` es a propósito y no `next/image`: esta hoja se
              imprime, y el componente de Next mete `srcset` y carga diferida,
              que en una impresión salen mal o no salen. */}
          <div className="lh">
            <div className="lhl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={marca.src} alt={marca.alt} />
              <div>
                <div className="cn">{clinic?.name ?? ''}</div>
                {clinicLine && <div className="cs">{clinicLine}</div>}
                {clinic?.phone && <div className="cs">{clinic.phone}</div>}
              </div>
            </div>
            <div>
              <div className="dt">{t('mlTitle')}</div>
              <div className="ds">{fmtDateTime(new Date(), locale)}</div>
            </div>
          </div>

          <div className="pid">
            <span><span className="l">{t('prName')}</span><b>{nombrePaciente}</b></span>
            <span><span className="l">{t('prDob')}</span><b>{fmtNacimiento(patient.dateOfBirth, locale)}</b></span>
            {patient.sex && <span><span className="l">{t('prSex')}</span><b>{patient.sex}</b></span>}
          </div>

          {/* Alergias. OJO: es el campo de la FICHA, que no es la lista contra
              la que ScriptSure cruza al recetar — son depósitos distintos. Se
              imprime porque en papel es lo primero que mira quien recibe la
              hoja, y se rotula como lo que es. */}
          {alergias ? (
            <div className="alg">
              <span className="l">{t('rxAllergies')}</span>
              {alergias}
            </div>
          ) : mh.noKnownAllergies ? (
            <div className="alg none">
              <span className="l">{t('rxAllergies')}</span>
              {t('mlNoKnownAllergies')}
            </div>
          ) : (
            <div className="alg">
              <span className="l">{t('rxAllergies')}</span>
              {t('mlAllergiesUnknown')}
            </div>
          )}

          <div className="stitle">
            {t('mlCurrent')} <span className="scount">· {activos.length}</span>
          </div>
          {activos.length > 0
            ? <Tabla items={activos} />
            : <div className="empty">{t('mlEmptyCurrent')}</div>}

          {anteriores.length > 0 && (
            <>
              <div className="stitle">
                {t('mlPrevious')} <span className="scount">· {anteriores.length}</span>
              </div>
              <Tabla items={anteriores} />
            </>
          )}

          {/* La leyenda no es decorativa: sin ella las dos etiquetas de origen
              se leen como adorno y la hoja pierde lo único que vino a decir. */}
          <div className="leyenda">
            <b>{t('mlOriginRx')}</b> — {t('mlLegendRx')}
            <br /><b>{t('mlOriginExternal')}</b> — {t('mlLegendExternal')}
          </div>

          <div className="hipaa">
            🔒 {t('prHipaa')}
            <br />{clinic?.name ?? ''} · {t('prGenerated', { date: fmtDateTime(new Date(), locale) })}
          </div>

        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('btn-print')?.addEventListener('click',function(){window.print()})`,
        }}
      />
    </>
  );
}
