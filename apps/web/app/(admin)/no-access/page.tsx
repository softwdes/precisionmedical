'use client';

import * as React from 'react';
import { useRole } from '@/contexts/role-context';
import { Lock, ArrowLeft, Clock } from 'lucide-react';

const TIMECLOCK_URL = process.env.NEXT_PUBLIC_TIMECLOCK_URL ?? 'https://clock.precisionmedical.com';

export default function NoAccessPage(): React.ReactElement {
  const role = useRole();
  const isEmployee = role === 'employee';

  const handleBack = (): void => {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface border border-border mb-6">
        <Lock className="h-7 w-7 text-text-muted" />
      </div>

      {isEmployee ? (
        <>
          <h1 className="text-xl font-bold text-text-1 mb-2">Tu cuenta es de empleado</h1>
          <p className="text-sm text-text-3 max-w-sm mb-1">
            Accede al sistema de fichaje aquí:
          </p>
          <p className="text-xs text-text-muted max-w-sm mb-8">
            Si crees que esto es un error, contacta al administrador.
          </p>
          <a
            href={TIMECLOCK_URL}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            <Clock className="h-4 w-4" />
            Ir a PM Time Clock
          </a>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold text-text-1 mb-2">Sin acceso</h1>
          <p className="text-sm text-text-3 max-w-sm mb-1">
            No tienes permisos para ver esta sección.
          </p>
          <p className="text-xs text-text-muted max-w-sm mb-8">
            Si crees que esto es un error, contacta al administrador.
          </p>
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium text-text-2 hover:bg-surface/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
        </>
      )}
    </div>
  );
}
