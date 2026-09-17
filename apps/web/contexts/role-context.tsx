'use client';

import * as React from 'react';
import { createContext, useContext } from 'react';
import type { Role } from '@/lib/permissions';

interface RoleContextValue {
  role: Role;
  /**
   * Módulos del Admin concedidos A MANO a esta persona (llaves `admin:*` de
   * `users.clinicModules`).
   *
   * Van aparte del rol porque son la excepción: la matriz de
   * `lib/permissions.ts` es por ROL y no tiene forma de decir "esta persona
   * sí". Casi siempre está vacío.
   */
  grants: string[];
}

const RoleContext = createContext<RoleContextValue>({ role: 'employee', grants: [] });

export function RoleProvider({
  role,
  grants = [],
  children,
}: {
  role: Role;
  grants?: string[];
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <RoleContext.Provider value={{ role, grants }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): Role {
  return useContext(RoleContext).role;
}

/** Los módulos concedidos a mano. Vacío para casi todos. */
export function useGrants(): string[] {
  return useContext(RoleContext).grants;
}
