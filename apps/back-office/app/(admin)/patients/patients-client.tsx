'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Trash2, Users } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@precision/ui';
import { PersonAvatar, TagPill } from '@/components/ui-phoenix';
import { PatientEditDialog, type EditablePatient } from './patient-edit-dialog';

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
  caseCount: number;
}

interface Props {
  patients: PatientRow[];
  q?: string;
}

export function PatientsClient({ patients, q }: Props) {
  const router  = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<PatientRow | null>(null);
  const [deleteError,  setDeleteError]  = useState('');
  const [deleting,     setDeleting]     = useState(false);

  // Edit: which patient is open in the edit dialog (drives PatientEditDialog's open state externally)
  const [editTarget, setEditTarget] = useState<PatientRow | null>(null);

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
              <th className="w-24 px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {patients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted text-sm">
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
                      <div className="text-text-1 font-medium">{p.firstName} {p.lastName}</div>
                      {p.patientCode && (
                        <div className="text-text-muted text-[10px] font-mono">{p.patientCode}</div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Contacto */}
                <td className="px-4 py-3 hidden sm:table-cell">
                  <div className="text-text-2 text-xs space-y-0.5">
                    {p.phone && <div className="font-mono">{p.phone}</div>}
                    {p.email && <div className="text-text-muted truncate max-w-[180px]">{p.email}</div>}
                  </div>
                </td>

                {/* Casos */}
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-text-2">{p.caseCount} caso{p.caseCount !== 1 ? 's' : ''}</span>
                </td>

                {/* Status */}
                <td className="px-4 py-3 hidden sm:table-cell">
                  <TagPill
                    label={STATUS_LABEL[p.status] ?? p.status}
                    colorClass={STATUS_COLORS[p.status] ?? 'bg-bg-2 text-text-2 border-border'}
                  />
                </td>

                {/* Acciones */}
                <td className="w-24 px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/patients/${p.id}`}
                      className="p-1.5 rounded-md text-text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                      title="Ver ficha"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Link>
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
              {deleteTarget?.caseCount > 0 && (
                <span className="block mt-2 text-amber text-xs">
                  ⚠ Este paciente tiene {deleteTarget.caseCount} caso{deleteTarget.caseCount !== 1 ? 's' : ''} asociado{deleteTarget.caseCount !== 1 ? 's' : ''} — no se podrá eliminar.
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
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
