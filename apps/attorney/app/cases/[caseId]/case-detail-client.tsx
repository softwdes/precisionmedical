'use client';

/**
 * B.22 — Tabs interactivos del detalle del caso (cliente)
 * Tabs: Notas Doctor · Labs & Imaging · HCFA · Citas
 */
import { useState } from 'react';
import { FileText, FlaskConical, Scale, Calendar } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types                                                                  */
/* ------------------------------------------------------------------ */
interface Diagnosis { icd10Code: string | null; icd10Label: string | null }
interface VisitNote {
  id: string; status: string;
  signedAt: string | null; signedByName: string | null;
  chiefComplaint: string | null; assessment: string | null; plan: string | null;
  diagnoses: Diagnosis[];
}
interface LabOrder {
  id: string; studyName: string; orderType: string; status: string;
  urgency: string; orderedAt: string;
}
interface Appointment {
  id: string; scheduledFor: string; status: string; type: string;
  provider: { firstName: string; lastName: string } | null;
  clinic: { name: string } | null;
  visitNote: VisitNote | null;
  labOrders: LabOrder[];
}

interface Props {
  caseId:       string;
  caseCode:     string;
  appointments: Appointment[];
  allLabs:      LabOrder[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                               */
/* ------------------------------------------------------------------ */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Denver',
  });
}

const LAB_STATUS_COLOR: Record<string, string> = {
  ORDERED: '#fbbf24', IN_PROGRESS: '#67e8f9', COMPLETED: '#34d399',
  REPORTED: '#a78bfa', CANCELLED: 'rgba(255,255,255,0.25)',
};
const URGENCY_COLOR: Record<string, string> = {
  ROUTINE: 'rgba(255,255,255,0.30)', URGENT: '#fbbf24', STAT: '#fb7185',
};

/* ------------------------------------------------------------------ */
/* Component                                                             */
/* ------------------------------------------------------------------ */
export default function CaseDetailClient({ caseId, caseCode, appointments, allLabs }: Props) {
  const [activeTab, setActiveTab] = useState<'notas' | 'labs' | 'hcfa' | 'citas'>('notas');

  const signedAppts = appointments.filter(a => a.visitNote?.status === 'SIGNED');

  const tabs = [
    { key: 'notas', label: '📝 Notas Doctor', count: signedAppts.length },
    { key: 'labs',  label: '🧪 Labs & Imaging', count: allLabs.length },
    { key: 'hcfa',  label: '📄 HCFA',           count: signedAppts.length > 0 ? 1 : 0 },
    { key: 'citas', label: '📅 Citas',           count: appointments.length },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.01)',
        borderRadius: '10px 10px 0 0',
        overflow: 'hidden',
      }}>
        {tabs.map(t => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: '1 1 0', padding: '12px 8px',
                background: active ? 'rgba(244,63,94,0.08)' : 'transparent',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderBottom: active ? '2px solid #f43f5e' : '2px solid transparent',
                color: active ? '#fb7185' : 'rgba(255,255,255,0.40)',
                fontWeight: active ? 700 : 400,
                fontSize: 12, cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  background: active ? 'rgba(244,63,94,0.20)' : 'rgba(255,255,255,0.08)',
                  color: active ? '#fb7185' : 'rgba(255,255,255,0.40)',
                  padding: '1px 5px', borderRadius: 10,
                }}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderTop: 'none',
        borderRadius: '0 0 10px 10px',
        padding: '20px',
        minHeight: 320,
      }}>

        {/* ── NOTAS DOCTOR ── */}
        {activeTab === 'notas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {signedAppts.length === 0 ? (
              <EmptyState icon={<FileText size={24} />} message="Sin notas firmadas disponibles para este caso" />
            ) : (
              signedAppts.map(a => {
                const note = a.visitNote!;
                return (
                  <div key={a.id} style={{
                    borderRadius: 10,
                    border: '1px solid rgba(139,92,246,0.20)',
                    background: 'rgba(139,92,246,0.04)',
                    overflow: 'hidden',
                  }}>
                    {/* Note header */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 16px',
                      background: 'rgba(139,92,246,0.08)',
                      borderBottom: '1px solid rgba(139,92,246,0.12)',
                    }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#c4b5fd' }}>
                          {fmtDate(a.scheduledFor)}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
                          {a.type.replace(/_/g, ' ')}
                        </span>
                        {a.provider && (
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
                            · Dr. {a.provider.lastName} {a.provider.firstName}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, color: '#34d399', fontWeight: 700 }}>✓ FIRMADA</span>
                        {note.signedByName && (
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                            {note.signedByName}
                          </span>
                        )}
                        {note.signedAt && (
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>
                            {fmtDate(note.signedAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Note body */}
                    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {note.chiefComplaint && (
                        <Section label="CC" color="#67e8f9" content={note.chiefComplaint} />
                      )}
                      {note.assessment && (
                        <Section label="A" color="#fbbf24" content={note.assessment} />
                      )}
                      {note.plan && (
                        <Section label="P" color="#a78bfa" content={note.plan} />
                      )}

                      {/* ICD-10 chips */}
                      {note.diagnoses.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                          {note.diagnoses.map((d, i) => (
                            <span key={i} style={{
                              fontSize: 10, fontWeight: 600,
                              padding: '3px 8px', borderRadius: 6,
                              background: 'rgba(139,92,246,0.15)',
                              border: '1px solid rgba(139,92,246,0.30)',
                              color: '#c4b5fd',
                            }}>
                              {d.icd10Code}{d.icd10Label ? ` · ${d.icd10Label}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── LABS & IMAGING ── */}
        {activeTab === 'labs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {allLabs.length === 0 ? (
              <EmptyState icon={<FlaskConical size={24} />} message="Sin estudios de laboratorio o imágenes en este caso" />
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 10,
              }}>
                {allLabs.map(lab => (
                  <div key={lab.id} style={{
                    borderRadius: 10, padding: '12px 14px',
                    background: 'rgba(6,182,212,0.04)',
                    border: '1px solid rgba(6,182,212,0.15)',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>
                      {lab.studyName}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
                        color: LAB_STATUS_COLOR[lab.status] ?? '#fff',
                        background: `${LAB_STATUS_COLOR[lab.status] ?? '#fff'}18`,
                        border: `1px solid ${LAB_STATUS_COLOR[lab.status] ?? '#fff'}30`,
                      }}>
                        {lab.status}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 5,
                        color: URGENCY_COLOR[lab.urgency] ?? '#fff',
                      }}>
                        {lab.urgency}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                      {lab.orderType.replace(/_/g, ' ')} · {fmtDate(lab.orderedAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── HCFA ── */}
        {activeTab === 'hcfa' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {signedAppts.length === 0 ? (
              <EmptyState icon={<Scale size={24} />} message="HCFA disponible una vez que el médico firme las notas" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Phase notice */}
                <div style={{
                  padding: '12px 16px', borderRadius: 10,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.20)',
                  display: 'flex', gap: 10, alignItems: 'center',
                }}>
                  <span style={{ fontSize: 16 }}>📋</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>Generación de HCFA — Phase 2</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 2 }}>
                      El formulario CMS-1500 / HCFA se generará automáticamente en Phase 2 a partir de los CPT codes y diagnósticos firmados.
                    </div>
                  </div>
                </div>

                {/* Preview of what will be on the HCFA */}
                <div style={{
                  padding: '16px', borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(255,255,255,0.40)', fontWeight: 700, marginBottom: 10 }}>
                    Vista previa de diagnósticos confirmados
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {signedAppts.flatMap(a => a.visitNote!.diagnoses)
                      .filter(d => !!d.icd10Code)
                      .filter((d, i, arr) =>
                        arr.findIndex(x => x.icd10Code === d.icd10Code) === i
                      ).map((d, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        padding: '6px 10px', borderRadius: 6,
                        background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#c4b5fd', flexShrink: 0, minWidth: 70 }}>
                          {d.icd10Code}
                        </span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.60)' }}>
                          {d.icd10Label ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{
                  padding: '12px 16px', borderRadius: 10, textAlign: 'center',
                  border: '1px dashed rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.30)', fontSize: 12,
                }}>
                  📄 Descarga del HCFA habilitada en Phase 2 · {caseCode}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CITAS ── */}
        {activeTab === 'citas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {appointments.length === 0 ? (
              <EmptyState icon={<Calendar size={24} />} message="Sin citas registradas en este caso" />
            ) : (
              appointments.map(a => {
                const isPast   = new Date(a.scheduledFor) < new Date();
                const hasSoap  = !!a.visitNote;
                const isSigned = a.visitNote?.status === 'SIGNED';

                const statusColor: Record<string, string> = {
                  COMPLETED: '#34d399', SCHEDULED: '#67e8f9', CHECKED_IN: '#fbbf24',
                  IN_PROGRESS: '#a78bfa', CANCELLED: 'rgba(255,255,255,0.25)', NO_SHOW: '#fb7185',
                };

                return (
                  <div key={a.id} style={{
                    borderRadius: 9, padding: '10px 14px',
                    background: isPast ? 'rgba(255,255,255,0.02)' : 'rgba(6,182,212,0.04)',
                    border: `1px solid ${isPast ? 'rgba(255,255,255,0.06)' : 'rgba(6,182,212,0.15)'}`,
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: isPast ? 'rgba(255,255,255,0.50)' : '#67e8f9',
                      minWidth: 100, flexShrink: 0,
                    }}>
                      {fmtDate(a.scheduledFor)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>
                        {a.type.replace(/_/g, ' ')}
                        {a.provider && (
                          <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.45)', fontSize: 11, marginLeft: 6 }}>
                            Dr. {a.provider.lastName}
                            {a.clinic ? ` · ${a.clinic.name}` : ''}
                          </span>
                        )}
                      </div>
                      {hasSoap && (
                        <div style={{ fontSize: 10, color: isSigned ? '#34d399' : 'rgba(255,255,255,0.40)', marginTop: 2 }}>
                          {isSigned ? '✓ Nota firmada' : '○ Nota pendiente'}
                          {a.visitNote?.signedByName ? ` · ${a.visitNote.signedByName}` : ''}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em',
                      color: statusColor[a.status] ?? '#a78bfa',
                      background: `${statusColor[a.status] ?? '#a78bfa'}18`,
                      padding: '3px 8px', borderRadius: 6, flexShrink: 0,
                    }}>
                      {a.status.replace(/_/g, ' ')}
                    </span>
                    {a.labOrders.length > 0 && (
                      <span style={{ fontSize: 9, color: '#67e8f9', flexShrink: 0 }}>
                        🧪 {a.labOrders.length}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                         */
/* ------------------------------------------------------------------ */
function Section({ label, color, content }: { label: string; color: string; content: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{
        fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
        color, minWidth: 16, marginTop: 2,
      }}>
        {label}
      </span>
      <p style={{
        fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6,
        margin: 0, whiteSpace: 'pre-wrap', flex: 1,
      }}>
        {content}
      </p>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: '40px 20px', opacity: 0.35, textAlign: 'center',
    }}>
      {icon}
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.60)' }}>{message}</span>
    </div>
  );
}
