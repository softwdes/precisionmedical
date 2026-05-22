'use client';

import Image from 'next/image';

export default function OfflinePage(): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-0 px-6 text-center">

      {/* Logo */}
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl shadow-glow overflow-hidden">
        <Image
          src="/icons/icon-192.png"
          alt="Precision Medical"
          width={80}
          height={80}
          className="rounded-2xl"
        />
      </div>

      {/* Icon */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface border border-border">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7 text-text-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3l18 18M8.111 8.111A5.5 5.5 0 0115.89 15.89M6.343 6.343A8 8 0 0117.657 17.657M2 12h.01M21 12c0-4.97-4.03-9-9-9"
          />
        </svg>
      </div>

      {/* Text */}
      <h1 className="mb-2 text-xl font-bold text-text-1">
        Sin conexión
      </h1>
      <p className="mb-1 text-sm text-text-3 max-w-xs">
        No se puede alcanzar el servidor. Verifica tu conexión a internet e inténtalo de nuevo.
      </p>
      <p className="mb-8 text-xs text-text-muted max-w-xs">
        Cuando recuperes la conexión podrás continuar trabajando normalmente.
      </p>

      {/* Retry button */}
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-xl bg-brand/10 border border-brand/30 px-6 py-2.5 text-sm font-semibold text-brand hover:bg-brand/20 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Reintentar
      </button>

      {/* Branding */}
      <p className="absolute bottom-8 text-xs text-text-muted">
        LM Super Admin · Precision Medical
      </p>
    </div>
  );
}
