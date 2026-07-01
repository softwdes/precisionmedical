'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Trash2, Users, Phone, Mail, Calendar, Car, Shield, UserCheck, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@precision/ui';
import { PersonAvatar, TagPill } from '@/components/ui-phoenix';
import { PatientEditDialog, type EditablePatient } from './patient-edit-dialog';
import { PatientCreateDialog } from './patient-create-dialog';

function fmtLocalDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const iso = typeof d === 'string' ? d : (d as Date).toISOString();
  const [y, mo, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, day).toLocaleDateString('es-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_COLORS: Record<string, string> = {
  NEW:        'bg-brand/15 text-brand border-brand/30',
  ACTIVE:     'bg-emerald/15 text-emerald border-emerald/30',
  COMPLETED:  'bg-cyan/15 text-cyan border-cyan/30',
  DISCHARGED: 'bg-amber/15 text-amber border-amber/30',
  INACTIVE:   'bg-text-muted/15 text-text-muted border-text-muted/30',
};

const STATUS_LABEL: Record<string, string> = {
  NEW:        'Nuevo',
  ACTIVE:     'Activo',
  COMPLETED:  'Completado',
  DISCHARGED: 'Dado de alta',
  INACTIVE:   'Inactivo',
};

export interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  phone2?: string | null;
  patientCode: string | null;
  status: string;
  preferredLanguage: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  accidentDate: Date | null;
  accidentType: string | null;
  insuranceCarrier: string | null;
  policyNumber: string | null;
  dateOfBirth: Date | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianRelation: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  sex?: string | null;
  referralSource?: string | null;
  createdAt: Date;
  updatedAt?: Date;
  caseCount: number;
}

interface Props {
  patients: PatientRow[];
  q?: string;
  page: number;
  totalPages: number;
  total: number;
}

// ─── CreateButton: exported as static sub-component for server page ────────────
function CreateButton() {
  return <PatientCreateDialog />;
}

export function PatientsClient({ patients, q, page, totalPages, total }: Props) {
  const router  = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<PatientRow | null>(null);
  const [deleteError,  setDeleteError]  = useState('');
  const [deleting,     setDeleting]     = useState(false);
  const [editTarget,   setEditTarget]   = useState<PatientRow | null>(null);
  const [viewTarget,   setViewTarget]   = useState<PatientRow | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/admin/patients/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(json.message ?? 'Error al eliminar.');
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    } catch {
      setDeleteError('Error de red. Intenta de nuevo.');
    } finally {
      setDeleting(false);
    }
  }

  function buildPageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 0) params.set('page', String(p));
    const qs = params.toString();
    return `/patients${qs ? `?${qs}` : ''}`;
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-2 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted">Paciente</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell">Contacto</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden lg:table-cell">Casos</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden sm:table-cell">Status</th>
              <th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted hidden xl:table-cell">Registrado</th>
              <th className="w-24 px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {patients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-muted text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {q ? `Sin resultados para "${q}"` : 'No hay pacientes registrados'}
                </td>
              </tr>
            )}
            {patients.map((p) => (
              <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                {/* Paciente */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <PersonAvatar firstName={p.firstName} lastName={p.lastName} size={8} />
                    <div>
                      <button
                        onClick={() => router.push(`/patients/${p.id}`)}
                        className="text-text-1 font-medium hover:text-brand transition-colors text-left"
                      >
                        {p.firstName} {p.lastName}
                      </button>
                      {p.patientCode && (
                        <div className="text-text-muted text-[10px] font-mono">{p.patientCode}</div>
                      )}
                      {(p.addressCity || p.addressState) && (
                        <div className="text-text-muted text-[10px]">
                          {[p.addressCity, p.addressState].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Contacto */}
                <td className="px-4 py-3 hidden sm:table-cell">
                  <div className="text-text-2 text-xs space-y-0.5">
                    {p.phone && <div className="font-mono">{p.phone}</div>}
                    {p.email && <div className="text-text-muted truncate max-w-[180px]">{p.email}</div>}
                    {p.preferredLanguage && (
                      <div className="text-[10px] text-text-muted">{p.preferredLanguage === 'es' ? '🇪🇸 Español' : '🇺🇸 English'}</div>
                    )}
                  </div>
                </td>

                {/* Casos */}
                <td className="px-4 py-3 hidden lg:table-cell">
                  <button
                    onClick={() => router.push(`/patients/${p.id}`)}
                    className="text-text-2 hover:text-brand transition-colors"
                  >
                    {p.caseCount} caso{p.caseCount !== 1 ? 's' : ''}
                  </button>
                </td>

                {/* Status */}
                <td className="px-4 py-3 hidden sm:table-cell">
                  <TagPill
                    label={STATUS_LABEL[p.status] ?? p.status}
                    colorClass={STATUS_COLORS[p.status] ?? 'bg-bg-2 text-text-2 border-border'}
                  />
                </td>

                {/* Registrado */}
                <td className="px-4 py-3 hidden xl:table-cell text-[11px] text-text-muted">
                  {fmtLocalDate(p.createdAt)}
                </td>

                {/* Acciones */}
                <td className="w-28 px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => router.push(`/patients/${p.id}`)}
                      className="p-1.5 rounded-md text-text-muted hover:text-emerald hover:bg-emerald/10 transition-colors"
                      title="Ver detalle y casos"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewTarget(p)}
                      className="p-1.5 rounded-md text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                      title="Ver ficha rápida"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditTarget(p)}
                      className="p-1.5 rounded-md text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setDeleteTarget(p); setDeleteError(''); }}
                      className="p-1.5 rounded-md text-text-muted hover:text-rose hover:bg-rose/10 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Paginación ─────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-text-muted">
            Página {page + 1} de {totalPages} · {total} paciente{total !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => router.push(buildPageUrl(page - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => router.push(buildPageUrl(page + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-md border border-border text-text-2 hover:border-brand hover:text-brand disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── View modal ─────────────────────────────────────────────────────── */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => { if (!o) setViewTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-text-1 flex items-center gap-2">
              {viewTarget && <PersonAvatar firstName={viewTarget.firstName} lastName={viewTarget.lastName} size={8} />}
              {viewTarget?.firstName} {viewTarget?.lastName}
            </DialogTitle>
            <DialogDescription className="text-text-muted text-xs font-mono">
              {viewTarget?.patientCode}
            </DialogDescription>
          </DialogHeader>

          {viewTarget && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Contacto</p>
                {viewTarget.phone && (
                  <div className="flex items-center gap-2 text-text-2">
                    <Phone className="w-3.5 h-3.5 text-text-muted" />
                    <span className="font-mono">{viewTarget.phone}</span>
                    {viewTarget.phone2 && <span className="font-mono text-text-muted">· {viewTarget.phone2}</span>}
                  </div>
                )}
                {viewTarget.email && (
                  <div className="flex items-center gap-2 text-text-2">
                    <Mail className="w-3.5 h-3.5 text-text-muted" />
                    <span>{viewTarget.email}</span>
                  </div>
                )}
                {viewTarget.dateOfBirth && (
                  <div className="flex items-center gap-2 text-text-2">
                    <Calendar className="w-3.5 h-3.5 text-text-muted" />
                    <span>{fmtLocalDate(viewTarget.dateOfBirth)}</span>
                  </div>
                )}
              </div>

              {(viewTarget.accidentDate || viewTarget.accidentType) && (
                <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Accidente</p>
                  <div className="flex items-center gap-2 text-text-2">
                    <Car className="w-3.5 h-3.5 text-text-muted" />
                    <span>{fmtLocalDate(viewTarget.accidentDate)}</span>
                    {viewTarget.accidentType && <span className="text-text-muted">· {viewTarget.accidentType}</span>}
                  </div>
                </div>
              )}

              {(viewTarget.insuranceCarrier || viewTarget.policyNumber) && (
                <div className="rounded-md bg-bg-2/40 border border-border/40 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Seguro</p>
                  <div className="flex items-center gap-2 text-text-2">
                    <Shield className="w-3.5 h-3.5 text-text-muted" />
                    <span>{viewTarget.insuranceCarrier ?? '—'}</span>
                    {viewTarget.policyNumber && <span className="text-text-muted font-mono text-xs">· {viewTarget.policyNumber}</span>}
                  </div>
                </div>
              )}

              {viewTarget.guardianName && (
                <div className="rounded-md bg-amber/10 border border-amber/30 p-3 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-amber">Responsable legal</p>
                  <div className="flex items-center gap-2 text-text-2">
                    <UserCheck className="w-3.5 h-3.5 text-amber" />
                    <span>{viewTarget.guardianName}</span>
                    {viewTarget.guardianRelation && <span className="text-text-muted text-xs">· {viewTarget.guardianRelation}</span>}
                  </div>
                  {viewTarget.guardianPhone && (
                    <div className="flex items-center gap-2 text-text-2 pl-5">
                      <span className="font-mono text-xs">{viewTarget.guardianPhone}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <TagPill
                  label={STATUS_LABEL[viewTarget.status] ?? viewTarget.status}
                  colorClass={STATUS_COLORS[viewTarget.status] ?? 'bg-bg-2 text-text-2 border-border'}
                />
                <span className="text-text-muted text-xs">{viewTarget.caseCount} caso{viewTarget.caseCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setViewTarget(null)}>Cerrar</Button>
            <Button className="w-full sm:w-auto" onClick={() => { setEditTarget(viewTarget); setViewTarget(null); }}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit modal ─────────────────────────────────────────────────────── */}
      {editTarget && (
        <PatientEditDialog
          patient={editTarget as EditablePatient}
          externalOpen
          onClose={() => { setEditTarget(null); router.refresh(); }}
        />
      )}

      {/* ─── Delete confirm ──────────────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-text-1">¿Eliminar paciente?</DialogTitle>
            <DialogDescription className="text-text-2 text-sm mt-1">
              Esta acción eliminará a{' '}
              <span className="font-semibold text-text-1">
                {deleteTarget?.firstName} {deleteTarget?.lastName}
              </span>{' '}
              del sistema. No se puede deshacer.
              {(deleteTarget?.caseCount ?? 0) > 0 && (
                <span className="block mt-2 text-amber text-xs">
                  ⚠ Este paciente tiene {deleteTarget!.caseCount} caso{deleteTarget!.caseCount !== 1 ? 's' : ''} asociado{deleteTarget!.caseCount !== 1 ? 's' : ''} — no se podrá eliminar.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="rounded-md border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose mt-2">
              {deleteError}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Sub-componente estático para usar en el server page
PatientsClient.CreateButton = CreateButton;
