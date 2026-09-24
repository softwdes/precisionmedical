'use client';

/**
 * El botón de imprimir de los dos impresos legales.
 *
 * Vive acá y no dentro de una ruta porque lo usan dos: el paquete de
 * documentos y el lien firmado. Y tiene que ser un componente propio con
 * `'use client'`: las dos páginas son server components y un `onClick` suelto
 * ahí adentro revienta en render ("Event handlers cannot be passed to Client
 * Component props"). `sign/print` lo tenía suelto y por eso no abría.
 */
export function PrintButton({
  label,
  className = 'print-btn',
}: {
  label: string;
  className?: string;
}) {
  return (
    <button className={className} onClick={() => window.print()}>
      {label}
    </button>
  );
}
