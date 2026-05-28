'use client';

import * as React from 'react';
import { createContext, useContext } from 'react';
import type { Role } from '@/lib/permissions';

interface RoleContextValue {
  role: Role;
}

const RoleContext = createContext<RoleContextValue>({ role: 'employee' });

export function RoleProvider({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <RoleContext.Provider value={{ role }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): Role {
  return useContext(RoleContext).role;
}
