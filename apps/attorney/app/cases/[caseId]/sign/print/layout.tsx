import type { ReactNode } from 'react';

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        body {
          background: #fff !important;
          color: #111 !important;
          font-family: 'Georgia', serif !important;
        }
      `}</style>
      {children}
    </>
  );
}
