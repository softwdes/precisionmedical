/**
 * Pantallas de token no usable — link inválido, vencido, o cita ya inactiva.
 *
 * Van en ES **y** EN a la vez, no en el idioma elegido: acá no hay sesión ni
 * preferencia que leer, el paciente está parado en el mostrador y lo único que
 * importa es que entienda que tiene que pedir otro QR. Un selector de idioma en
 * una pantalla de error es un paso más para alguien que ya está trabado.
 */

const COLORES = {
  fondo:  '#0a1224',
  texto:  'rgba(255,255,255,0.92)',
  suave:  'rgba(255,255,255,0.55)',
  tenue:  'rgba(255,255,255,0.38)',
  ambar:  '#fbbf24',
  borde:  'rgba(255,255,255,0.10)',
};

type Motivo = 'INVALIDO' | 'VENCIDO' | 'CITA_INACTIVA' | 'DEMASIADOS_INTENTOS';

const MENSAJES: Record<Motivo, { es: [string, string]; en: [string, string]; icono: string }> = {
  INVALIDO: {
    icono: '🔒',
    es: ['Este enlace no es válido', 'Pídale a recepción que le muestre el código QR de nuevo.'],
    en: ['This link is not valid', 'Please ask the front desk to show you the QR code again.'],
  },
  VENCIDO: {
    icono: '⏱',
    es: ['Este enlace ya venció', 'Los enlaces duran unas horas por seguridad. Pídale a recepción uno nuevo.'],
    en: ['This link has expired', 'Links last a few hours for security. Please ask the front desk for a new one.'],
  },
  CITA_INACTIVA: {
    icono: '📅',
    es: ['Esta cita ya no está activa', 'Consulte en recepción sobre su cita.'],
    en: ['This appointment is no longer active', 'Please check with the front desk about your appointment.'],
  },
  // No dice "demasiados intentos": el paciente casi nunca es el culpable —
  // comparte la IP con toda la sala de espera. Se le pide esperar, no se lo acusa.
  DEMASIADOS_INTENTOS: {
    icono: '🕐',
    es: ['Espere un momento e intente de nuevo', 'Hubo muchas consultas desde esta red. Si sigue igual, avísele a recepción.'],
    en: ['Please wait a moment and try again', 'There were too many requests from this network. If it persists, let the front desk know.'],
  },
};

export function PantallaTokenInvalido({ motivo }: { motivo: Motivo }) {
  const m = MENSAJES[motivo];

  return (
    <div
      style={{
        minHeight: '100vh', background: COLORES.fondo, color: COLORES.texto,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 18 }}>{m.icono}</div>

        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{m.es[0]}</div>
        <div style={{ fontSize: 14, color: COLORES.suave, lineHeight: 1.6 }}>{m.es[1]}</div>

        <div
          style={{
            marginTop: 22, paddingTop: 18, borderTop: `1px solid ${COLORES.borde}`,
            fontSize: 13, color: COLORES.tenue, lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 700, color: COLORES.suave, marginBottom: 4 }}>{m.en[0]}</div>
          <div>{m.en[1]}</div>
        </div>

        <div style={{ marginTop: 26, fontSize: 11, color: COLORES.tenue, letterSpacing: '0.06em' }}>
          PRECISION MEDICAL CARE
        </div>
      </div>
    </div>
  );
}
