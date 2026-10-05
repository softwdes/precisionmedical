/**
 * El logo de Precision Medical: la cruz con el electro.
 *
 * Es EL MISMO que usan el back-office, el portal médico, el legal y el Admin
 * (ver sidebar.tsx de esas apps). Acá, en las pantallas públicas de `forms`
 * —lobby, consulta de cita, formulario de admisión—, había una insignia con las
 * letras "PM" escritas como texto, y el paciente veía una marca distinta en cada
 * sitio (Erick, 2026-10-05: "el logo es distinto en el Lobby y en Cita").
 *
 * Va en SVG, no como imagen: se ve nítido a cualquier tamaño y no hace falta un
 * archivo por variante. El gradiente es el azul del back-office.
 */
export function BrandMark({ size = 40, glow = true }: { size?: number; glow?: boolean }) {
  const icon = Math.round(size * 0.55);
  return (
    <div
      aria-label="Precision Medical"
      role="img"
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.27), flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg,#1E40AF 0%,#2563EB 50%,#38BDF8 100%)',
        boxShadow: glow ? '0 0 16px rgba(37,99,235,0.55)' : 'none',
      }}
    >
      <svg width={icon} height={icon} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect x="13" y="2" width="10" height="32" rx="2.5" fill="white" fillOpacity="0.95" />
        <rect x="2" y="13" width="32" height="10" rx="2.5" fill="white" fillOpacity="0.95" />
        <path
          d="M8 18 L11 18 L13 14 L15 22 L17 16 L19 20 L21 18 L28 18"
          stroke="#1E40AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
      </svg>
    </div>
  );
}
