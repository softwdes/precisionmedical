import type { ReactNode } from 'react';

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="app-shell">
      {sidebar}
      <main className="app-main">{children}</main>
      <style>{`
        .app-shell {
          display: grid;
          grid-template-columns: var(--sidebar-width) 1fr;
          min-height: 100vh;
          background-color: var(--bg);
        }
        .app-main {
          background-color: var(--bg);
          min-width: 0;
        }
        @media (max-width: 900px) {
          .app-shell { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
