/**
 * `/intake/[token]` — redirección al wizard vigente.
 *
 * Acá vivía el intake viejo de 4 pasos (B.5). Lo reemplazó `/c/[token]`, el
 * wizard de 10 pasos, y desde entonces nadie genera esta URL: los dos
 * generadores del back-office (`generate-portal-token` y `send-portal-link`)
 * arman `/c/<token>`, y ese último ya lo anotaba en un comentario.
 *
 * Pero la ruta seguía viva, con su propio cliente y su propia API
 * (`/api/portal/intake/*`): ~1.260 líneas sirviendo la misma ficha del paciente
 * con el mismo `portalToken`, en paralelo al wizard bueno. Una segunda puerta
 * a la misma PHI que nadie mira ni actualiza es una puerta que se olvida.
 *
 * Se borró el cliente y su API. Queda esta redirección, y no un 404, porque el
 * link viejo puede seguir vivo donde importa: en el SMS que un paciente recibió
 * hace meses y todavía tiene en el teléfono. El token es el mismo, así que
 * `/c/[token]` lo atiende sin que el paciente se entere de nada.
 *
 * Cuando ya no queden links viejos circulando, esta carpeta se puede borrar
 * entera.
 */

import { permanentRedirect } from 'next/navigation';

export default async function IntakeLegacyRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // 308: el link viejo quedó obsoleto para siempre, no por esta vez.
  permanentRedirect(`/c/${token}`);
}
