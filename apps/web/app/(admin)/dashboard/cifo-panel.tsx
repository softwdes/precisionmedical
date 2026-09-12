import { puedePreguntarACifo } from '@/lib/cifo/acceso';
import { visitasDelDia, claveDia } from '@/lib/cifo/phoenix';
import { cajasBajoMinimo } from '@/lib/audit/cajas-bajo-minimo';
import { createAdminClient } from '@precision-medical/auth';
import { CifoBox } from './cifo-box';
import { CifoAviso } from './cifo-aviso';
import { CifoSaludoAdmin } from './cifo-saludo-admin';

/**
 * El bloque de CIFO en el panel del Admin: el aviso del día y la caja.
 *
 * Server component a propósito — así los dos números salen del servidor, con las
 * mismas funciones que usan las herramientas del agente, y no hay forma de que
 * el panel y CIFO digan cosas distintas de lo mismo.
 *
 * ── Qué reemplaza ──────────────────────────────────────────────────────────
 *
 * Al triangulito ámbar que marcaba las cajas bajas al costado de una fila. Ese
 * ícono no decía cuánto faltaba, ni desde cuándo, ni qué hacer: era un dato sin
 * acción, que es lo que ya habíamos sacado del dashboard de la clínica.
 *
 * Arriba van las VISITAS, que es lo que Erick puso primero (2026-09-12): el
 * volumen de trabajo manda sobre las excepciones.
 */
export async function CifoPanel(): Promise<React.ReactElement | null> {
  if (!(await puedePreguntarACifo())) return null;

  /**
   * En paralelo, y tolerante a fallos: si la clínica no responde, el panel
   * muestra lo que sí tiene en vez de caerse entero. Un dashboard que se rompe
   * porque un número no llegó es peor que uno al que le falta un número.
   */
  const [visitas, cajas] = await Promise.all([
    visitasDelDia().catch(() => null),
    cajasBajoMinimo(createAdminClient()).catch(() => []),
  ]);

  const cajasVista = cajas.map((c) => ({
    nombre: c.name, moneda: c.currency, saldo: c.balance, falta: c.falta,
  }));

  return (
    <div className="space-y-3">
      {/* El muñeco que saluda al cargar. Se decide solo si le toca aparecer hoy
          (una vez por día por persona) y si no, no devuelve nada. */}
      <CifoSaludoAdmin
        datos={{
          hoy: claveDia(new Date()),
          visitas: visitas && {
            dia: visitas.dia, esHoy: visitas.esHoy,
            total: visitas.total, porClinica: visitas.porClinica,
          },
          cajas: cajasVista,
        }}
      />

      <CifoAviso
        visitas={visitas && {
          dia: visitas.dia,
          esHoy: visitas.esHoy,
          total: visitas.total,
          porClinica: visitas.porClinica,
        }}
        cajas={cajas.map((c) => ({
          nombre: c.name, moneda: c.currency, saldo: c.balance, falta: c.falta,
        }))}
      />
      {/* `configurado` se decide en el SERVIDOR: la variable nunca cruza al
          cliente, solo el booleano. */}
      <CifoBox configurado={!!process.env.OPENAI_API_KEY} />
    </div>
  );
}
