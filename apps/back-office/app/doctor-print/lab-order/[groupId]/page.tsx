/**
 * Portal Médico · Orden de laboratorio imprimible (B.20 · L4)
 *
 * Ruta:   /doctor-print/lab-order/[groupId]
 * Acceso: el doctor dueño de la cita (o ADMIN/SUPER_ADMIN en soporte).
 * Uso:    el paciente se la lleva al laboratorio o al centro de imagen.
 *
 * Un `groupId` = una orden = N estudios en una sola hoja.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { fechaCalendario, edad } from '@/lib/fechas';
import { db } from '@precision-medical/database';
import { decryptFieldOrOriginal as dec } from '@/lib/decrypt';
import { getOwnSessionProvider, canViewAsDoctor } from '@/lib/get-session-provider';
import { getSessionUser } from '@/lib/session';

type Props = { params: Promise<{ groupId: string }> };

const TZ = 'America/Denver';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { groupId } = await params;
  const first = await db.labOrder.findFirst({
    where: { groupId },
    select: { appointment: { select: { patient: { select: { firstName: true, lastName: true } } } } },
  });
  const t = await getTranslations('phoenix.pageTitles');
  // `absolute` en las dos salidas: el título es el nombre del PDF (ver el
  // template en app/layout.tsx), no una pestaña del navegador.
  if (!first) return { title: { absolute: t('labOrder') } };
  const p = first.appointment.patient;
  return { title: { absolute: `${t('labOrder')} — ${dec(p.lastName) ?? ''}, ${dec(p.firstName) ?? ''}` } };
}

function fmtDate(d: Date | null | undefined, locale: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ,
  });
}

function fmtDateTime(d: Date | null | undefined, locale: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleString(locale === 'en' ? 'en-US' : 'es-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: TZ,
  });
}

/**
 * Nacimiento y fecha del accidente son fechas de CALENDARIO: van sin zona, a
 * diferencia de `fmtDate`, que fija America/Denver porque formatea instantes
 * (la hora de la cita). Con la zona puesta, un nacimiento guardado a medianoche
 * UTC se imprimía con el día anterior — y esto sale impreso de la clínica.
 * Ver lib/fechas.ts.
 */
function fmtCalendar(d: Date | string | null | undefined, locale: string): string {
  return fechaCalendario(d, locale === 'en' ? 'en-US' : 'es-US');
}

export default async function LabOrderPrintPage({ params }: Props): Promise<React.ReactElement> {
  const { groupId } = await params;
  const t = await getTranslations('phoenix.doctor');
  const tSpec = await getTranslations('providers.specialties');
  const locale = await getLocale();

  // Quién puede imprimir la nota de OTRO doctor: el staff sí (soporte, admin, el
  // detalle del caso), el doctor común no. `canViewAsDoctor` es la misma señal
  // que usa el middleware, así que ruteo y página dejan de contradecirse — antes
  // el middleware te dejaba entrar y la página te devolvía 404.
  //
  // El perfil se lee con `getOwnSessionProvider`: el propio, sin la cookie de
  // "ver como otro". Esa cookie vale solo dentro de /doctor — si acá se colara,
  // un admin que revisó el portal del Dr. X no podría imprimir nada de nadie más.
  const user = await getSessionUser();
  const esStaff = user?.email ? await canViewAsDoctor(user.email) : false;
  const propio = esStaff ? null : await getOwnSessionProvider();
  // Ni staff ni ficha de doctor: no hay nada que pueda imprimir. Sin esto el
  // `propio` en null abriría la consulta a cualquier cita — el caso vacío no
  // puede caer del lado permisivo.
  if (!esStaff && !propio) notFound();

  const rows = await db.labOrder.findMany({
    where: {
      groupId,
      status: { not: 'VOIDED' },
      ...(propio ? { appointment: { providerId: propio.id } } : {}),
    },
    orderBy: [{ orderType: 'asc' }, { studyName: 'asc' }],
    select: {
      id: true, orderType: true, studyName: true, studyCode: true, loincCode: true,
      clinicalIndication: true, urgency: true, billingType: true, collectionSite: true,
      sampleDate: true, preferredCenter: true, icd10Codes: true, orderedAt: true,
      orderedByName: true,
      appointment: {
        select: {
          id: true, scheduledFor: true,
          patient: {
            select: { firstName: true, lastName: true, dateOfBirth: true, sex: true, phone: true, patientCode: true },
          },
          provider: { select: { firstName: true, lastName: true, specialty: true, licenseNumber: true } },
          clinic: { select: { name: true, address: true, city: true, state: true, zipCode: true, phone: true } },
          case: {
            select: {
              caseCode: true, accidentDate: true,
              primaryPolicyNumber: true,
              primaryInsurance: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (rows.length === 0) notFound();

  const head = rows[0];
  const a = head.appointment;
  const patient = a.patient;
  const clinic = a.clinic;
  const pa = edad(patient.dateOfBirth);

  const addr = clinic.address?.trim() ?? '';
  const zip = clinic.zipCode ?? '';
  const clinicLine = (addr && zip && addr.includes(zip)
    ? [addr]
    : [addr, [clinic.city, clinic.state].filter(Boolean).join(', '), zip]
  ).filter(Boolean).join(' · ');

  const specialty = a.provider?.specialty ? tSpec(a.provider.specialty) : '—';
  const isStat = head.urgency === 'STAT';
  const isUrgent = head.urgency === 'URGENT';

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-size:11pt;line-height:1.45}
    .wrap{max-width:900px;margin:0 auto;padding:0 24px 48px}
    .doc{max-width:780px;margin:0 auto}

    .pbar{background:#f6f5fa;border-bottom:1px solid #e3e0ec;padding:10px 24px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;position:sticky;top:0;z-index:10;margin-bottom:24px}
    .pbar button{padding:9px 18px;background:#6d28d9;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}

    .lh{border-bottom:2px solid #6d28d9;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
    .cn{font-size:17pt;font-weight:bold;color:#5b21b6;line-height:1.2}
    .cs{font-size:8.5pt;color:#555;margin-top:3px}
    .dt{font-size:12.5pt;font-weight:bold;text-align:right;color:#333;letter-spacing:.04em}
    .ds{font-size:8.5pt;color:#555;text-align:right;margin-top:2px}

    .stat{margin-bottom:14px;padding:8px 12px;border-radius:5px;font-size:10.5pt;font-weight:bold;letter-spacing:.05em;text-align:center}
    .stat-stat{background:#fef2f2;border:2px solid #dc2626;color:#b91c1c}
    .stat-urgent{background:#fffbeb;border:2px solid #d97706;color:#b45309}

    .igrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px}
    .ibox{border:1px solid #e5e7eb;border-radius:5px;padding:8px 10px}
    .ibt{font-size:7.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.09em;color:#6d28d9;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #f0eefa}
    .irow{display:flex;justify-content:space-between;gap:10px;font-size:9pt;margin-top:3px}
    .il{color:#6b7280;white-space:nowrap}
    .iv{font-weight:600;color:#111;text-align:right}
    .mono{font-family:'Courier New',monospace;font-weight:bold}

    .stitle{font-size:9.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.09em;color:#6d28d9;margin:18px 0 6px;padding-bottom:3px;border-bottom:1px solid #ece7fa}

    table{width:100%;border-collapse:collapse;font-size:9.5pt}
    th{background:#f7f5ff;color:#5b21b6;text-align:left;padding:6px 8px;font-size:8pt;font-weight:700;letter-spacing:.04em;border:1px solid #e8e2f8}
    td{padding:6px 8px;border:1px solid #eee;vertical-align:top}
    .chk{width:26px;text-align:center;font-size:12pt;color:#9ca3af}

    .ind{font-size:10pt;line-height:1.5;color:#1f2937;padding:8px 10px;border-left:3px solid #ddd6fe;background:#fbfaff;margin-top:4px}
    .dxline{font-size:9.5pt;color:#1f2937;padding:3px 0;border-bottom:1px solid #f1f1f1}
    .dxline:last-child{border-bottom:none}

    .sigb{margin-top:30px;padding-top:14px;border-top:1px solid #e5e7eb;break-inside:avoid}
    .siglines{display:flex;gap:28px}
    .sigl{flex:1;border-top:1px solid #333;padding-top:4px;font-size:8.5pt;color:#6b7280}
    .signame{font-size:10pt;font-weight:bold;color:#111;margin-bottom:26px}

    .hipaa{margin-top:18px;padding:8px 10px;background:#fafafa;border:1px solid #eee;border-radius:4px;font-size:7.5pt;color:#8a8a8a;line-height:1.45}

    @media print{
      .pbar{display:none!important}
      .wrap{padding:0 6px}
      .doc{max-width:100%}
      .ind{background:#fff;border-left-color:#c4c4c4}
      @page{margin:14mm}
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/*
        * Solo el botón. Tenía dos cosas más que salían mal, porque esta página se
        * abre TAMBIÉN embebida en un iframe (el modal "Print order" del tab de
        * labs) y ninguna de las dos sabía en cuál de los dos contextos estaba:
        *
        *  · "← Volver a la consulta" era un `<a>` sin `target`, así que dentro
        *    del iframe navegaba EL IFRAME a la consulta: la app entera metida en
        *    un marco chico. Y en una pestaña suelta tampoco hacía falta — para
        *    eso está cerrar la pestaña.
        *  · "Ctrl+P → Guardar como PDF" no era solo redundante: era una
        *    instrucción EQUIVOCADA. Ctrl+P imprime el documento de nivel
        *    superior, o sea la app con el modal encima, no el iframe. El botón
        *    llama a `window.print()` desde adentro, y por eso sí imprime el
        *    documento solo.
        */}
      <div className="pbar">
        <button id="btn-print" type="button">🖨 {t('prPrintBtn')}</button>
      </div>

      <div className="wrap">
        <div className="doc">

          <div className="lh">
            <div>
              <div className="cn">{clinic.name}</div>
              {clinicLine && <div className="cs">{clinicLine}</div>}
              {clinic.phone && <div className="cs">{clinic.phone}</div>}
            </div>
            <div>
              <div className="dt">{t('labPrintTitle')}</div>
              <div className="ds">{fmtDateTime(head.orderedAt, locale)}</div>
              <div className="ds">
                {t(`labCollection_${head.collectionSite}`)}
              </div>
            </div>
          </div>

          {(isStat || isUrgent) && (
            <div className={`stat ${isStat ? 'stat-stat' : 'stat-urgent'}`}>
              {isStat ? `⚠ ${t('labUrgency_STAT')}` : `⚠ ${t('labUrgency_URGENT')}`}
            </div>
          )}

          <div className="igrid">
            <div className="ibox">
              <div className="ibt">{t('prPatient')}</div>
              <div className="irow">
                <span className="il">{t('prName')}</span>
                <span className="iv">
                  {(dec(patient.lastName) ?? '').toUpperCase()}, {dec(patient.firstName) ?? ''}
                </span>
              </div>
              {patient.dateOfBirth && (
                <div className="irow">
                  <span className="il">{t('prDob')}</span>
                  <span className="iv">
                    {fmtCalendar(patient.dateOfBirth, locale)}{pa != null ? ` (${pa} ${t('yearsShort')})` : ''}
                  </span>
                </div>
              )}
              {patient.sex && (
                <div className="irow"><span className="il">{t('prSex')}</span><span className="iv">{patient.sex}</span></div>
              )}
              {dec(patient.phone) && (
                <div className="irow"><span className="il">{t('prPhone')}</span><span className="iv">{dec(patient.phone)}</span></div>
              )}
              {patient.patientCode && (
                <div className="irow"><span className="il">{t('labPatientCode')}</span><span className="iv mono">{patient.patientCode}</span></div>
              )}
            </div>

            <div className="ibox">
              <div className="ibt">{t('labBillingAndCase')}</div>
              {head.billingType && (
                <div className="irow">
                  <span className="il">{t('labBillingType')}</span>
                  <span className="iv">{t(`labBilling_${head.billingType}`)}</span>
                </div>
              )}
              {a.case?.caseCode && (
                <div className="irow"><span className="il">{t('prCaseCode')}</span><span className="iv mono">{a.case.caseCode}</span></div>
              )}
              {a.case?.accidentDate && (
                <div className="irow"><span className="il">{t('prAccident')}</span><span className="iv">{fmtCalendar(a.case.accidentDate, locale)}</span></div>
              )}
              {a.case?.primaryInsurance && (
                <div className="irow"><span className="il">{t('prInsurance')}</span><span className="iv">{a.case.primaryInsurance.name}</span></div>
              )}
              {a.case?.primaryPolicyNumber && (
                <div className="irow"><span className="il">{t('prPolicy')}</span><span className="iv mono">{a.case.primaryPolicyNumber}</span></div>
              )}
              {head.sampleDate && (
                <div className="irow">
                  <span className="il">{head.orderType === 'LABORATORY' ? t('labSampleDate') : t('labStudyDate')}</span>
                  <span className="iv">{fmtDate(head.sampleDate, locale)}</span>
                </div>
              )}
              {head.preferredCenter && (
                <div className="irow"><span className="il">{t('labCenter')}</span><span className="iv">{head.preferredCenter}</span></div>
              )}
            </div>
          </div>

          {/* Estudios solicitados */}
          <div className="stitle">{t('labRequestedStudies')}</div>
          <table>
            <thead>
              <tr>
                <th className="chk"></th>
                <th style={{ width: 90 }}>{t('prSvcCode')}</th>
                <th>{t('labStudy')}</th>
                <th style={{ width: 110 }}>{t('labType')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="chk">☐</td>
                  <td><span className="mono">{r.studyCode ?? '—'}</span></td>
                  <td>
                    {r.studyName}
                    {r.loincCode && <div style={{ fontSize: '8pt', color: '#6b7280' }}>LOINC {r.loincCode}</div>}
                  </td>
                  <td>{t(`labCat_${r.orderType}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Diagnósticos que justifican la orden */}
          {head.icd10Codes.length > 0 && (
            <>
              <div className="stitle">{t('labDiagnosesTitle')}</div>
              {head.icd10Codes.map((c) => <div key={c} className="dxline">{c}</div>)}
            </>
          )}

          {/* Indicación clínica */}
          {head.clinicalIndication.trim() && (
            <>
              <div className="stitle">{t('labIndication')}</div>
              <div className="ind">{head.clinicalIndication}</div>
            </>
          )}

          {/* Firma del médico */}
          <div className="sigb">
            <div className="signame">
              {head.orderedByName ?? `Dr. ${a.provider?.firstName ?? ''} ${a.provider?.lastName ?? ''}`}
              {' · '}{specialty}
              {a.provider?.licenseNumber ? ` · ${t('prLicense')} ${a.provider.licenseNumber}` : ''}
            </div>
            <div className="siglines">
              <div className="sigl">{t('prSignatureLine')}</div>
              <div className="sigl">{t('prDateLine')}</div>
            </div>
          </div>

          <div className="hipaa">
            🔒 {t('prHipaa')}
            <br />{clinic.name} · {t('prGenerated', { date: fmtDateTime(new Date(), locale) })}
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
