/**
 * P1-12 — Attorney portal: paquete completo de documentos del caso
 *
 * Ruta:  /cases/[caseId]/documents  (attorney portal)
 * Uso:   Botón "Descargar paquete" en case detail → abre esta página → Ctrl+P / Save as PDF
 *
 * Incluye: portada, lien firmado, notas clínicas firmadas (CC/HPI/A/P + diagnósticos + CPTs)
 */

import { notFound } from 'next/navigation';
import { db } from '@precision-medical/database';
import type { Metadata } from 'next';
import { PrintButton } from './print-button';

type Props = { params: Promise<{ caseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { caseId } = await params;
  const c = await db.case.findUnique({ where: { id: caseId }, select: { caseCode: true } });
  return { title: `Paquete Documentos · ${c?.caseCode ?? caseId}` };
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver',
  });
}

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', serif; color: #111; background: #fff; }
  .page { max-width: 820px; margin: 0 auto; padding: 40px 48px; }
  .no-print { background: #1e293b; color: #fff; padding: 12px 48px; display: flex; align-items: center; gap: 16px; }
  .print-btn { background: #3b82f6; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
  .print-hint { color: rgba(255,255,255,0.55); font-size: 12px; }

  /* --- Cover page --- */
  .cover { min-height: 600px; display: flex; flex-direction: column; justify-content: center; text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 48px; margin-bottom: 48px; }
  .cover-logo { font-size: 26px; font-weight: bold; color: #0f172a; letter-spacing: -0.5px; }
  .cover-tagline { font-size: 12px; color: #888; margin-top: 4px; }
  .cover-title { font-size: 20px; font-weight: bold; margin-top: 40px; color: #0f172a; }
  .cover-case-code { font-size: 32px; font-family: 'Courier New', monospace; color: #0f172a; margin-top: 12px; }
  .cover-meta { margin-top: 32px; display: inline-flex; flex-direction: column; gap: 8px; text-align: left; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px 28px; background: #f8fafc; }
  .cover-row { font-size: 13px; color: #444; }
  .cover-row strong { color: #0f172a; }
  .cover-generated { font-size: 11px; color: #aaa; margin-top: 24px; }
  .toc { margin-top: 32px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px 24px; text-align: left; display: inline-block; }
  .toc-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; font-weight: bold; margin-bottom: 12px; }
  .toc-item { font-size: 13px; color: #334155; padding: 3px 0; border-bottom: 1px dotted #e2e8f0; display: flex; align-items: center; gap: 8px; }
  .toc-item:last-child { border-bottom: none; }
  .badge-ok { background: #dcfce7; color: #166534; font-size: 10px; padding: 1px 6px; border-radius: 10px; font-weight: 600; }
  .badge-pending { background: #fef3c7; color: #92400e; font-size: 10px; padding: 1px 6px; border-radius: 10px; font-weight: 600; }

  /* --- Sections --- */
  .section-break { page-break-before: always; padding-top: 40px; }
  .doc-header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 24px; }
  .doc-title { font-size: 16px; font-weight: bold; color: #0f172a; }
  .doc-subtitle { font-size: 12px; color: #888; margin-top: 4px; }
  .section { margin-bottom: 22px; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: bold; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
  table.info-table { width: 100%; border-collapse: collapse; }
  table.info-table td { padding: 5px 8px; font-size: 13px; vertical-align: top; }
  table.info-table td.label { color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; width: 36%; }
  table.info-table td.value { color: #111; font-weight: 500; }

  /* --- Lien / signatures --- */
  .agreement-text { font-size: 12px; color: #333; line-height: 1.8; text-align: justify; }
  .agreement-text p { margin-bottom: 10px; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 16px; }
  .sig-card { border: 1px solid #ccc; border-radius: 4px; padding: 12px; }
  .sig-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; font-weight: bold; margin-bottom: 8px; }
  .sig-img { border-bottom: 1px solid #999; padding-bottom: 4px; min-height: 60px; display: flex; align-items: flex-end; justify-content: center; }
  .sig-img img { max-width: 100%; max-height: 80px; }
  .sig-name { font-size: 12px; font-weight: bold; margin-top: 6px; }
  .sig-meta { font-size: 10px; color: #777; margin-top: 2px; }
  .pending-box { text-align: center; color: #aaa; font-size: 12px; padding: 16px; background: #f8fafc; border-radius: 4px; border: 1px dashed #ddd; }

  /* --- Visit notes --- */
  .visit-note { border: 1px solid #e2e8f0; border-radius: 6px; padding: 18px 20px; margin-bottom: 24px; }
  .visit-note:not(:first-of-type) { page-break-before: always; }
  .note-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
  .note-date { font-size: 15px; font-weight: bold; color: #0f172a; }
  .note-type { font-size: 11px; color: #888; margin-top: 2px; }
  .note-signed { font-size: 11px; color: #166534; background: #dcfce7; padding: 2px 8px; border-radius: 10px; }
  .note-field { margin-bottom: 12px; }
  .note-field-label { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; color: #555; margin-bottom: 4px; }
  .note-field-value { font-size: 13px; color: #222; line-height: 1.6; }
  .dx-chip { display: inline-block; background: #eff6ff; color: #1e40af; font-size: 11px; padding: 2px 8px; border-radius: 10px; margin: 2px 3px 2px 0; border: 1px solid #bfdbfe; font-family: monospace; }
  .cpt-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  .cpt-code { font-family: monospace; font-weight: 600; color: #0f172a; }
  .cpt-desc { color: #555; font-size: 12px; flex: 1; margin: 0 12px; }
  .cpt-units { color: #888; font-size: 12px; }
  .unsigned-note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; font-size: 12px; color: #92400e; text-align: center; }

  /* --- Footer --- */
  .doc-footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 14px; font-size: 10px; color: #999; text-align: center; line-height: 1.8; }
  .esign-notice { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 12px 16px; margin: 16px 0; }
  .esign-notice p { font-size: 11px; color: #555; line-height: 1.7; }

  @media print {
    .no-print { display: none !important; }
    .page { padding: 20px 32px; }
    .cover { min-height: unset; }
    .visit-note { break-inside: avoid; }
  }
`;

export default async function DocumentPackagePage({ params }: Props) {
  const { caseId } = await params;

  const caseData = await db.case.findUnique({
    where: { id: caseId },
    select: {
      id: true, caseCode: true, accidentDate: true, accidentType: true, status: true,
      patient: {
        select: {
          firstName: true, lastName: true, dateOfBirth: true,
          phone: true, patientCode: true, preferredLanguage: true,
        },
      },
      lawFirm:  { select: { firmName: true, address: true, city: true, state: true, zip: true } },
      attorney: { select: { firstName: true, lastName: true, email: true, barNumber: true, recoveryRate: true } },
      primaryInsurance: { select: { name: true } },
      lienSignatures: {
        orderBy: { signedAt: 'asc' },
        select: { signerType: true, signerName: true, signerEmail: true, signedAt: true, signatureSvg: true },
      },
      appointments: {
        orderBy: { scheduledFor: 'asc' },
        select: {
          id: true, scheduledFor: true, type: true,
          visitNote: {
            select: {
              id: true,
              chiefComplaint: true,
              hpi: true,
              ros: true,
              physicalExam: true,
              assessment: true,
              plan: true,
              signedAt: true,
              signedByName: true,
              diagnoses: {
                orderBy: { sortOrder: 'asc' },
                select: { icdCode: true, description: true, isPrimary: true },
              },
              serviceCodes: {
                select: { cptCode: true, description: true, units: true },
              },
            },
          },
        },
      },
    },
  });

  if (!caseData) notFound();

  const patientName  = `${caseData.patient.firstName} ${caseData.patient.lastName}`;
  const attorneyName = caseData.attorney
    ? `${caseData.attorney.firstName ?? ''} ${caseData.attorney.lastName ?? ''}`.trim()
    : '—';
  const patientSig  = caseData.lienSignatures.find(s => s.signerType === 'PATIENT');
  const attorneySig = caseData.lienSignatures.find(s => s.signerType === 'ATTORNEY');
  const lienStatus  = patientSig && attorneySig ? 'Firmado' : patientSig ? 'Pendiente abogado' : 'Pendiente firma';

  const signedNotes  = caseData.appointments.filter(a => a.visitNote?.signedAt);
  const pendingNotes = caseData.appointments.filter(a => a.visitNote && !a.visitNote.signedAt);

  return (
    <>
      <style>{styles}</style>

      <div className="no-print">
        <PrintButton />
        <span className="print-hint">Ctrl+P → Destino: Guardar como PDF → Márgenes: Mínimos</span>
      </div>

      <div className="page">
        {/* ── PORTADA ── */}
        <div className="cover">
          <div className="cover-logo">Precision Medical Care</div>
          <div className="cover-tagline">Medical Records & Legal Document Package</div>
          <div className="cover-title">PAQUETE DE DOCUMENTOS DEL CASO</div>
          <div className="cover-case-code">{caseData.caseCode}</div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
            <div className="cover-meta">
              <div className="cover-row">
                <strong>Paciente:</strong> {patientName}
                {' '}<span style={{ fontFamily: 'monospace', color: '#888', fontSize: 12 }}>({caseData.patient.patientCode})</span>
              </div>
              <div className="cover-row"><strong>Bufete:</strong> {caseData.lawFirm?.firmName ?? '—'}</div>
              <div className="cover-row"><strong>Abogado:</strong> {attorneyName}{caseData.attorney?.barNumber ? ` · Bar #${caseData.attorney.barNumber}` : ''}</div>
              {caseData.accidentDate && (
                <div className="cover-row"><strong>Fecha de accidente:</strong> {fmtDate(caseData.accidentDate)}</div>
              )}
              {caseData.primaryInsurance && (
                <div className="cover-row"><strong>Seguro:</strong> {caseData.primaryInsurance.name}</div>
              )}
              <div className="cover-row"><strong>Estado del caso:</strong> {caseData.status}</div>
            </div>
          </div>

          {/* Table of contents */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
            <div className="toc">
              <div className="toc-title">Contenido del paquete</div>
              <div className="toc-item">
                <span>1. Acuerdo de Gravamen Médico (Lien)</span>
                <span className={patientSig && attorneySig ? 'badge-ok' : 'badge-pending'}>
                  {lienStatus}
                </span>
              </div>
              {signedNotes.map((a, i) => (
                <div key={a.id} className="toc-item">
                  <span>{i + 2}. Nota clínica · {fmtDate(a.scheduledFor)} · {a.type ?? 'Visita'}</span>
                  <span className="badge-ok">Firmada</span>
                </div>
              ))}
              {pendingNotes.map((a, i) => (
                <div key={a.id} className="toc-item">
                  <span>{signedNotes.length + i + 2}. Nota clínica · {fmtDate(a.scheduledFor)}</span>
                  <span className="badge-pending">Sin firma</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cover-generated">
            Generado: {fmtDateTime(new Date())} · Sistema: Precision Medical Care · HIPAA Compliant
          </div>
        </div>

        {/* ── SECCIÓN 1: LIEN ── */}
        <div className="section-break">
          <div className="doc-header">
            <div className="doc-title">SECCIÓN 1 — Acuerdo de Gravamen Médico</div>
            <div className="doc-subtitle">Medical Lien Agreement · {caseData.caseCode}</div>
          </div>

          <div className="section">
            <div className="section-title">Partes del acuerdo</div>
            <table className="info-table">
              <tbody>
                <tr>
                  <td className="label">Paciente</td>
                  <td className="value">{patientName}</td>
                </tr>
                <tr>
                  <td className="label">Código paciente</td>
                  <td className="value" style={{ fontFamily: 'monospace' }}>{caseData.patient.patientCode}</td>
                </tr>
                <tr>
                  <td className="label">Bufete legal</td>
                  <td className="value">{caseData.lawFirm?.firmName ?? '—'}</td>
                </tr>
                <tr>
                  <td className="label">Abogado</td>
                  <td className="value">
                    {attorneyName}
                    {caseData.attorney?.barNumber && (
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#555', marginLeft: 8 }}>
                        · Bar #{caseData.attorney.barNumber}
                      </span>
                    )}
                  </td>
                </tr>
                {caseData.accidentDate && (
                  <tr>
                    <td className="label">Fecha de accidente</td>
                    <td className="value">{fmtDate(caseData.accidentDate)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="section">
            <div className="section-title">Términos del acuerdo</div>
            <div className="agreement-text">
              <p>
                Yo, <strong>{patientName}</strong>, el paciente abajo firmante, autorizo a <strong>Precision Medical Care</strong>
                a proporcionar los servicios médicos necesarios para el tratamiento de las lesiones sufridas en el
                accidente del {fmtDate(caseData.accidentDate)}, y acepto los términos de este gravamen médico (Medical Lien).
              </p>
              <p>
                Asigno irrevocablemente a Precision Medical Care el derecho a cobrar directamente del producto de
                cualquier acuerdo, sentencia o recuperación obtenida como resultado del accidente, el monto total de los
                servicios médicos prestados, hasta el monto total facturado.
              </p>
              <p>
                Autorizo al bufete <strong>{caseData.lawFirm?.firmName ?? '[Bufete]'}</strong> a retener del producto
                de cualquier recuperación el monto adeudado a Precision Medical Care y a pagar dicho monto directamente
                a la clínica.
              </p>
              <p>
                Esta asignación es vinculante sobre mí, mis herederos, cesionarios y representantes personales.
                Al firmar este documento reconozco haber leído, comprendido y aceptado todos los términos aquí descritos.
              </p>
            </div>
          </div>

          <div className="section">
            <div className="section-title">Firmas digitales</div>
            <div className="sig-grid">
              <div className="sig-card">
                <div className="sig-label">Paciente</div>
                {patientSig ? (
                  <>
                    <div className="sig-img">
                      {patientSig.signatureSvg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={patientSig.signatureSvg} alt="Firma del paciente" />
                      ) : (
                        <span style={{ color: '#aaa', fontSize: 12 }}>Firma registrada digitalmente</span>
                      )}
                    </div>
                    <div className="sig-name">{patientSig.signerName}</div>
                    {patientSig.signerEmail && <div className="sig-meta">{patientSig.signerEmail}</div>}
                    <div className="sig-meta">{fmtDateTime(patientSig.signedAt)}</div>
                  </>
                ) : (
                  <div className="pending-box">Pendiente de firma</div>
                )}
              </div>
              <div className="sig-card">
                <div className="sig-label">Abogado</div>
                {attorneySig ? (
                  <>
                    <div className="sig-img">
                      {attorneySig.signatureSvg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={attorneySig.signatureSvg} alt="Firma del abogado" />
                      ) : (
                        <span style={{ color: '#aaa', fontSize: 12 }}>Firma registrada digitalmente</span>
                      )}
                    </div>
                    <div className="sig-name">{attorneySig.signerName}</div>
                    {attorneySig.signerEmail && <div className="sig-meta">{attorneySig.signerEmail}</div>}
                    <div className="sig-meta">{fmtDateTime(attorneySig.signedAt)}</div>
                  </>
                ) : (
                  <div className="pending-box">Pendiente de firma</div>
                )}
              </div>
            </div>
          </div>

          <div className="esign-notice">
            <p>
              Las firmas digitales son legalmente válidas conforme a la Ley ESIGN (15 U.S.C. § 7001) y UETA.
              Las firmas fueron capturadas mediante panel táctil con hash SHA-256 para garantizar su integridad.
            </p>
          </div>
        </div>

        {/* ── SECCIÓN 2+: NOTAS CLÍNICAS ── */}
        {caseData.appointments.length > 0 && (
          <div className="section-break">
            <div className="doc-header">
              <div className="doc-title">SECCIÓN 2 — Notas Clínicas</div>
              <div className="doc-subtitle">
                {signedNotes.length} nota{signedNotes.length !== 1 ? 's' : ''} firmada{signedNotes.length !== 1 ? 's' : ''}
                {pendingNotes.length > 0 ? ` · ${pendingNotes.length} pendiente${pendingNotes.length !== 1 ? 's' : ''}` : ''}
              </div>
            </div>

            {pendingNotes.length > 0 && (
              <div className="unsigned-note">
                ⚠ {pendingNotes.length} nota{pendingNotes.length !== 1 ? 's' : ''} sin firma médica — no incluida{pendingNotes.length !== 1 ? 's' : ''} como documentación oficial
              </div>
            )}

            {caseData.appointments.map((appt, idx) => {
              const note = appt.visitNote;
              if (!note) return null;

              return (
                <div key={appt.id} className="visit-note">
                  <div className="note-header">
                    <div>
                      <div className="note-date">
                        Visita #{idx + 1} · {fmtDate(appt.appointmentDate)}
                      </div>
                      <div className="note-type">{appt.appointmentType ?? 'Consulta médica'}</div>
                    </div>
                    {note.signedAt ? (
                      <div className="note-signed">
                        ✓ Firmada · {note.signedByName ?? 'Médico'} · {fmtDate(note.signedAt)}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: 10 }}>
                        Sin firma — borrador
                      </div>
                    )}
                  </div>

                  {/* Chief Complaint */}
                  {note.chiefComplaint && (
                    <div className="note-field">
                      <div className="note-field-label">Motivo de consulta (CC)</div>
                      <div className="note-field-value">{note.chiefComplaint}</div>
                    </div>
                  )}

                  {/* HPI */}
                  {note.hpi && (
                    <div className="note-field">
                      <div className="note-field-label">Historia de enfermedad actual (HPI)</div>
                      <div className="note-field-value">{note.hpi}</div>
                    </div>
                  )}

                  {/* Physical Exam */}
                  {note.physicalExam && (
                    <div className="note-field">
                      <div className="note-field-label">Examen físico</div>
                      <div className="note-field-value">{note.physicalExam}</div>
                    </div>
                  )}

                  {/* Assessment */}
                  {note.assessment && (
                    <div className="note-field">
                      <div className="note-field-label">Evaluación (Assessment)</div>
                      <div className="note-field-value">{note.assessment}</div>
                    </div>
                  )}

                  {/* Plan */}
                  {note.plan && (
                    <div className="note-field">
                      <div className="note-field-label">Plan de tratamiento</div>
                      <div className="note-field-value">{note.plan}</div>
                    </div>
                  )}

                  {/* Diagnoses */}
                  {note.diagnoses.length > 0 && (
                    <div className="note-field">
                      <div className="note-field-label">Diagnósticos (ICD-10)</div>
                      <div style={{ marginTop: 6 }}>
                        {note.diagnoses.map((dx) => (
                          <span key={dx.icdCode} className="dx-chip">
                            {dx.icdCode}{dx.isPrimary ? ' ★' : ''} — {dx.description}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CPT codes */}
                  {note.serviceCodes && note.serviceCodes.length > 0 && (
                    <div className="note-field">
                      <div className="note-field-label">Procedimientos (CPT)</div>
                      <div style={{ marginTop: 6 }}>
                        {note.serviceCodes.map((cpt, ci) => (
                          <div key={ci} className="cpt-row">
                            <span className="cpt-code">{cpt.cptCode}</span>
                            <span className="cpt-desc">{cpt.description}</span>
                            {cpt.units && cpt.units > 1 && (
                              <span className="cpt-units">× {cpt.units}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="doc-footer">
          <strong>Precision Medical Care</strong> · Paquete de Documentos · Caso {caseData.caseCode}<br />
          Generado: {fmtDateTime(new Date())} · Confidencial — Solo para uso legal autorizado<br />
          Este documento puede contener información protegida de salud (PHI) según la ley HIPAA.
          Su divulgación no autorizada está prohibida por ley federal.
        </div>
      </div>
    </>
  );
}
