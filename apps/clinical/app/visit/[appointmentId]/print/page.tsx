/**
 * B.18 · B.21 — Nota de visita: vista de impresión / PDF
 *
 * Ruta:   /visit/[appointmentId]/print
 * Acceso: Doctor (server-rendered, sin JS requerido para imprimir)
 * Uso:    Ctrl+P o botón "Guardar como PDF" del browser
 */

import type { Metadata } from 'next';
import { db } from '@precision-medical/database';
import { notFound } from 'next/navigation';

type Props = { params: Promise<{ appointmentId: string }> };

// ─── Raw-query types ──────────────────────────────────────────────────────────
interface RawCpt {
  id: string;
  cpt_code: string;
  description: string;
  fee_catalog: string;
  fee_override: string | null;
  modifier: string | null;
  units: number;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { appointmentId } = await params;
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { patient: { select: { firstName: true, lastName: true } }, scheduledFor: true },
  });
  if (!appt) return { title: 'Nota Clínica' };
  return {
    title: `Nota — ${appt.patient.lastName}, ${appt.patient.firstName} — ${appt.scheduledFor.toLocaleDateString('es-US', { timeZone: 'America/Denver' })}`,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

function calcAge(dob: Date | null): string {
  if (!dob) return '';
  return `${Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))} años`;
}

const SOAP_LABELS: Record<string, string> = {
  chiefComplaint: 'Queja Principal',
  hpi:            'HPI — Historia de la Enfermedad Actual',
  ros:            'ROS — Revisión de Sistemas',
  physicalExam:   'Examen Físico',
  assessment:     'Evaluaciones / Assessment',
  plan:           'Plan de Tratamiento',
};

const SOAP_ORDER = ['chiefComplaint', 'hpi', 'ros', 'physicalExam', 'assessment', 'plan'] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function PrintPage({ params }: Props) {
  const { appointmentId } = await params;

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient:  { select: { firstName: true, lastName: true, dateOfBirth: true, phone: true } },
      provider: { select: { firstName: true, lastName: true, specialty: true } },
      clinic:   { select: { name: true, phone: true, address: true } },
      case: {
        select: {
          caseCode: true, accidentDate: true, accidentType: true,
          primaryInsurance: { select: { name: true } },
          primaryPolicyNumber: true,
          attorney: { select: { firstName: true, lastName: true } },
          lawFirm:  { select: { firmName: true } },
        },
      },
      visitNote: {
        include: {
          diagnoses: { orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });

  if (!appt || !appt.visitNote) notFound();

  const note = appt.visitNote;

  const cpts = await db.$queryRaw<RawCpt[]>`
    SELECT id, cpt_code, description, fee_catalog::text, fee_override::text, modifier, units
    FROM   visit_service_codes
    WHERE  visit_note_id = ${note.id}
    ORDER BY created_at ASC
  `;

  const vitals: [string, string][] = [
    ['Altura',       note.heightFt != null ? `${note.heightFt}'${note.heightIn ?? 0}" · ${note.heightCm ?? '—'} cm` : ''],
    ['Peso',         note.weightLbs != null ? `${note.weightLbs} lbs · ${note.weightKg ?? '—'} kg` : ''],
    ['P.A.',         note.systolicMmhg != null ? `${note.systolicMmhg}/${note.diastolicMmhg} mmHg` : ''],
    ['Pulso',        note.pulseBpm != null ? `${note.pulseBpm} bpm` : ''],
    ['Resp.',        note.respRate != null ? `${note.respRate} rpm` : ''],
    ['Temp.',        note.tempFahrenheit != null ? `${note.tempFahrenheit}°F · ${note.tempCelsius ?? '—'}°C` : ''],
    ['Dolor (0-10)', note.painScale != null ? `${note.painScale}/10` : ''],
    ['O₂ Sat.',      note.o2Saturation != null ? `${note.o2Saturation}%` : ''],
  ].filter(([, v]) => v !== '') as [string, string][];

  const totalFee = cpts.reduce((s, c) => {
    const fee = c.fee_override !== null ? Number(c.fee_override) : Number(c.fee_catalog);
    return s + fee * c.units;
  }, 0);

  const SOAP_FIELDS: Partial<Record<typeof SOAP_ORDER[number], string | null>> = {
    chiefComplaint: note.chiefComplaint,
    hpi:            note.hpi,
    ros:            note.ros,
    physicalExam:   note.physicalExam,
    assessment:     note.assessment,
    plan:           note.plan,
  };

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Georgia',serif;font-size:11pt;color:#111;background:#fff}
    .wrap{max-width:860px;margin:0 auto;padding:24px 24px 48px}
    .doc{max-width:760px;margin:0 auto}

    /* Print bar */
    .pbar{background:#f5f5f5;border-bottom:1px solid #ddd;padding:10px 24px;display:flex;gap:10px;align-items:center;position:sticky;top:0;z-index:10;margin-bottom:24px}
    .pbar button{padding:8px 20px;background:#5b21b6;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
    .pbar a{padding:8px 14px;background:transparent;color:#444;border:1px solid #ccc;border-radius:6px;font-size:12px;text-decoration:none}
    .pbar span{font-size:11px;color:#666}

    /* Letterhead */
    .lh{border-bottom:2px solid #5b21b6;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start}
    .cn{font-size:18pt;font-weight:bold;color:#5b21b6}
    .cs{font-size:9pt;color:#555;margin-top:2px}
    .dt{font-size:13pt;font-weight:bold;text-align:right;color:#333}
    .ds{font-size:9pt;color:#555;text-align:right}
    .badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:9pt;font-weight:bold}
    .signed{background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd}
    .draft{background:#fef3c7;color:#b45309;border:1px solid #fcd34d}

    /* Info grid */
    .igrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
    .ibox{border:1px solid #ddd;border-radius:4px;padding:8px 10px}
    .ibt{font-size:8pt;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#5b21b6;margin-bottom:5px;border-bottom:1px solid #eee;padding-bottom:3px}
    .irow{display:flex;justify-content:space-between;font-size:9.5pt;margin-top:3px}
    .il{color:#666}
    .iv{font-weight:600;color:#111;max-width:60%;text-align:right}

    /* Section title */
    .stitle{font-size:10pt;font-weight:bold;text-transform:uppercase;letter-spacing:.09em;color:#5b21b6;margin:16px 0 6px;padding-bottom:3px;border-bottom:1px solid #e5d9fb}

    /* Tables */
    table{width:100%;border-collapse:collapse;font-size:9.5pt}
    th{background:#f3f0ff;color:#5b21b6;text-align:left;padding:5px 8px;font-size:8.5pt;font-weight:700;letter-spacing:.05em;border:1px solid #e0d7f8}
    td{padding:5px 8px;border:1px solid #eee;vertical-align:top}
    tr:nth-child(even) td{background:#faf9ff}
    .mono{font-family:'Courier New',monospace;font-size:9pt;font-weight:bold}
    .fee{text-align:right}
    .tot td{font-weight:bold;background:#ede9fe!important}

    /* SOAP */
    .ss{margin-bottom:12px}
    .sl{font-size:9pt;font-weight:bold;color:#5b21b6;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}
    .sc{font-size:10pt;line-height:1.55;color:#222;white-space:pre-wrap;word-break:break-word;padding:6px 8px;border-left:3px solid #e5d9fb;background:#faf9ff}

    /* Diagnoses */
    .dx{padding:5px 0;border-bottom:1px solid #eee;display:flex;gap:10px;font-size:9.5pt}
    .dx:last-child{border-bottom:none}
    .dxc{font-family:monospace;font-weight:bold;color:#5b21b6;min-width:90px}
    .dxd{flex:1;color:#222}
    .dxs{color:#059669;font-size:8.5pt;font-family:monospace}

    /* Signature */
    .sigb{margin-top:24px;border-top:1px solid #ddd;padding-top:16px;display:flex;justify-content:space-between;gap:30px}
    .sigl{flex:1;border-top:1px solid #333;padding-top:4px;font-size:9pt;color:#555}
    .sigs{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px 14px;font-size:9.5pt;color:#166534}

    /* HIPAA */
    .hipaa{margin-top:20px;padding:8px 10px;background:#f9f9f9;border:1px solid #e5e5e5;border-radius:4px;font-size:7.5pt;color:#888;line-height:1.4}

    /* Print overrides */
    @media print{
      .pbar{display:none!important}
      .wrap{padding:10px}
      .doc{max-width:100%}
      .sc{background:#fff;border-left-color:#bbb}
      tr:nth-child(even) td{background:#f8f8f8!important}
      .tot td{background:#f0e8ff!important}
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* Print bar */}
      <div className="pbar">
        <button id="btn-print">🖨 Imprimir / Guardar PDF</button>
        <a href={`/visit/${appointmentId}`}>← Volver a la nota</a>
        <span>
          Nota {note.status === 'SIGNED' ? '✅ firmada' : '⚠ borrador'} · Ctrl+P → Guardar como PDF
        </span>
      </div>

      <div className="wrap">
        <div className="doc">

          {/* Letterhead */}
          <div className="lh">
            <div>
              <div className="cn">{appt.clinic.name}</div>
              <div className="cs">
                {appt.clinic.address ?? 'Precision Medical Care'}
                {appt.clinic.phone ? ` · ${appt.clinic.phone}` : ''}
              </div>
            </div>
            <div>
              <div className="dt">NOTA CLÍNICA</div>
              <div className="ds">{fmtDateTime(appt.scheduledFor)}</div>
              <div style={{ marginTop: 4, textAlign: 'right' }}>
                <span className={`badge ${note.status === 'SIGNED' ? 'signed' : 'draft'}`}>
                  {note.status === 'SIGNED' ? '✓ FIRMADA' : 'BORRADOR'}
                </span>
              </div>
            </div>
          </div>

          {/* Info grid */}
          <div className="igrid">
            <div className="ibox">
              <div className="ibt">Paciente</div>
              <div className="irow"><span className="il">Nombre:</span><span className="iv">{appt.patient.lastName.toUpperCase()}, {appt.patient.firstName}</span></div>
              {appt.patient.dateOfBirth && (
                <div className="irow"><span className="il">F. Nacimiento:</span><span className="iv">{fmtDate(appt.patient.dateOfBirth)} ({calcAge(appt.patient.dateOfBirth)})</span></div>
              )}
              {appt.patient.phone && (
                <div className="irow"><span className="il">Teléfono:</span><span className="iv">{appt.patient.phone}</span></div>
              )}
            </div>

            <div className="ibox">
              <div className="ibt">Caso</div>
              {appt.case ? (
                <>
                  <div className="irow"><span className="il">Código:</span><span className="iv mono">{appt.case.caseCode}</span></div>
                  {appt.case.accidentDate && <div className="irow"><span className="il">Accidente:</span><span className="iv">{fmtDate(appt.case.accidentDate)}</span></div>}
                  {appt.case.primaryInsurance && <div className="irow"><span className="il">Seguro:</span><span className="iv">{appt.case.primaryInsurance.name}</span></div>}
                  {appt.case.attorney && (
                    <div className="irow"><span className="il">Abogado:</span><span className="iv">{appt.case.attorney.lastName}, {appt.case.attorney.firstName}</span></div>
                  )}
                </>
              ) : <div className="irow"><span className="il">Sin caso asignado</span></div>}
            </div>

            <div className="ibox">
              <div className="ibt">Proveedor</div>
              {appt.provider ? (
                <>
                  <div className="irow"><span className="il">Doctor:</span><span className="iv">Dr. {appt.provider.lastName}, {appt.provider.firstName}</span></div>
                  <div className="irow"><span className="il">Especialidad:</span><span className="iv">{appt.provider.specialty.replace(/_/g, ' ')}</span></div>
                </>
              ) : <div className="irow"><span className="il">Sin proveedor</span></div>}
            </div>

            <div className="ibox">
              <div className="ibt">Visita</div>
              <div className="irow"><span className="il">Fecha:</span><span className="iv">{fmtDate(appt.scheduledFor)}</span></div>
              <div className="irow"><span className="il">Tipo:</span><span className="iv">{appt.type.replace(/_/g, ' ')}</span></div>
              {note.signedAt && <div className="irow"><span className="il">Firmada:</span><span className="iv">{fmtDateTime(note.signedAt)}</span></div>}
            </div>
          </div>

          {/* Vitals */}
          {vitals.length > 0 && (
            <>
              <div className="stitle">Signos Vitales</div>
              <table>
                <tbody>
                  <tr>{vitals.map(([l]) => <th key={l}>{l}</th>)}</tr>
                  <tr>{vitals.map(([l, v]) => <td key={l}>{v}</td>)}</tr>
                </tbody>
              </table>
            </>
          )}

          {/* SOAP */}
          {SOAP_ORDER.some(k => SOAP_FIELDS[k]) && (
            <>
              <div className="stitle">Nota SOAP</div>
              {SOAP_ORDER.map(key => {
                const content = SOAP_FIELDS[key];
                if (!content?.trim()) return null;
                return (
                  <div key={key} className="ss">
                    <div className="sl">{SOAP_LABELS[key]}</div>
                    <div className="sc">{content}</div>
                  </div>
                );
              })}
            </>
          )}

          {/* Diagnoses */}
          {note.diagnoses.length > 0 && (
            <>
              <div className="stitle">Diagnósticos (ICD-10 + SNOMED CT)</div>
              {note.diagnoses.map(dx => (
                <div key={dx.id} className="dx">
                  <span className="dxc">{dx.icd10Code ?? '—'}</span>
                  <div className="dxd">
                    <div>{dx.icd10Label ?? '—'}</div>
                    {dx.snomedCode && (
                      <div className="dxs">SNOMED {dx.snomedCode} — {dx.snomedLabel}</div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* CPT */}
          {cpts.length > 0 && (
            <>
              <div className="stitle">Servicios Facturables (CPT)</div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>CPT</th>
                    <th>Descripción</th>
                    <th style={{ width: 50 }}>Mod.</th>
                    <th style={{ width: 40, textAlign: 'center' }}>Unid.</th>
                    <th style={{ width: 90, textAlign: 'right' }}>Tarifa</th>
                  </tr>
                </thead>
                <tbody>
                  {cpts.map(c => {
                    const fee = c.fee_override !== null ? Number(c.fee_override) : Number(c.fee_catalog);
                    return (
                      <tr key={c.id}>
                        <td><span className="mono">{c.cpt_code}</span></td>
                        <td>{c.description}</td>
                        <td className="mono">{c.modifier ?? '—'}</td>
                        <td style={{ textAlign: 'center' }}>{c.units}</td>
                        <td className="fee">
                          ${(fee * c.units).toFixed(2)}
                          {c.fee_override !== null && <span style={{ fontSize: '8pt', color: '#b45309', marginLeft: 4 }}>*</span>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="tot">
                    <td colSpan={4} style={{ textAlign: 'right' }}>Total:</td>
                    <td className="fee">${totalFee.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
              {cpts.some(c => c.fee_override !== null) && (
                <div style={{ fontSize: '8pt', color: '#888', marginTop: 4 }}>* Tarifa con ajuste manual</div>
              )}
            </>
          )}

          {/* Signature */}
          {note.status === 'SIGNED' ? (
            <div className="sigb">
              <div className="sigs">
                ✓ Nota clínica firmada digitalmente el {fmtDateTime(note.signedAt)}
                {note.signedByName ? ` por ${note.signedByName}` : ''}.
                <br />Esta nota es parte del expediente clínico del paciente.
              </div>
            </div>
          ) : (
            <div className="sigb">
              <div className="sigl">Firma del médico</div>
              <div className="sigl">Fecha</div>
              <div className="sigl">Número de licencia</div>
            </div>
          )}

          {/* HIPAA */}
          <div className="hipaa">
            🔒 HIPAA — Este documento contiene información de salud protegida (PHI).
            Destinado exclusivamente al proveedor de salud y al paciente indicado.
            Precision Medical Care · Generado: {fmtDateTime(new Date())} (America/Denver).
          </div>

        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `document.getElementById('btn-print')?.addEventListener('click',function(){window.print()})` }} />
    </>
  );
}
