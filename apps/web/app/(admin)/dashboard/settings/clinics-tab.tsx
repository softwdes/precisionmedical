'use client';

import * as React from 'react';
import { useState } from 'react';
import { api as trpc } from '@/lib/trpc/client';
import {
  Button, Badge,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@precision/ui';
import { MapPin, Pencil, AlertCircle } from 'lucide-react';
import { useRole } from '@/contexts/role-context';
import { ClinicEditDialog, type Clinic } from './clinic-edit-dialog';

const COUNTRY_LABELS: Record<string, { label: string; flag: string }> = {
  US: { label: 'Utah, USA',   flag: '🇺🇸' },
  BO: { label: 'Bolivia',     flag: '🇧🇴' },
  PE: { label: 'Perú',        flag: '🇵🇪' },
};

export function ClinicsTab(): React.ReactElement {
  const role = useRole();
  const canEdit = role === 'super_admin';
  const { data: clinics = [], refetch, isLoading } = trpc.clinics.list.useQuery();
  const [editing, setEditing] = useState<Clinic | null>(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-1">Clínicas</h2>
          <p className="text-small text-text-3">
            {clinics.length} clínicas registradas · ubicaciones GPS para verificación de asistencia
          </p>
        </div>
      </div>

      {/* Read-only notice for non-super-admin */}
      {!canEdit && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Solo Super Admin puede editar las coordenadas de las clínicas. Tu rol tiene acceso de lectura.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clínica</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Coordenadas GPS</TableHead>
                <TableHead>Radio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-text-3">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : clinics.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-text-3">
                    No hay clínicas registradas.
                  </TableCell>
                </TableRow>
              ) : (
                clinics.map((c) => {
                  const country = COUNTRY_LABELS[c.country] ?? { label: c.country, flag: '🌐' };
                  const hasGps = c.lat !== null && c.lng !== null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium text-text-1">{c.display_name}</div>
                        {c.display_name !== c.name && (
                          <div className="text-tiny text-text-muted">key: {c.name}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {country.flag} {country.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        {hasGps ? (
                          <div className="flex items-center gap-1.5 font-mono text-tiny text-text-2">
                            <MapPin className="h-3 w-3 text-emerald-500 shrink-0" />
                            {c.lat!.toFixed(5)}, {c.lng!.toFixed(5)}
                          </div>
                        ) : (
                          <span className="text-tiny text-text-muted italic">Sin GPS</span>
                        )}
                      </TableCell>
                      <TableCell className="text-small text-text-2">
                        {c.radius_m !== null ? `${c.radius_m} m` : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.is_active ? 'success' : 'secondary'}>
                          {c.is_active ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(c as Clinic)}
                            title="Editar clínica"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit dialog */}
      {editing && (
        <ClinicEditDialog
          clinic={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void refetch(); }}
        />
      )}
    </div>
  );
}
