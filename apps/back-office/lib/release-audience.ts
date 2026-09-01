import type { Audience } from '@precision/release/audience';
import { getSessionUser } from './session';
import { getSessionRole, canViewAsDoctor, PORTAL_ONLY_ROLES } from './get-session-provider';
import { canViewAsLawyer } from './get-session-lawyer';

/**
 * Que notas de release puede LEER esta sesion.
 *
 * `/api/changelog` acepta la audiencia del cliente y su propio comentario lo
 * admite: es un filtro de presentacion, no una frontera. Para el modal efimero
 * daba igual —aparece una vez, despues del reload, y muestra lo del deploy que
 * el usuario acaba de recibir—, pero el buzon de la campana se abre cuando el
 * usuario quiere y con el parametro que quiera. Ahi el filtro tiene que ser una
 * frontera de verdad: un abogado pidiendo `audience=admin` no puede leerse las
 * notas internas de la clinica.
 *
 * El orden importa: la PRIMERA es la audiencia principal, la que se usa cuando
 * el cliente no pide nada o pide algo que no le corresponde.
 *
 * Esto NO reemplaza al middleware ni al filtrado por sesion de cada pagina.
 * Decide una sola cosa: que changelog se le muestra a quien.
 */
export async function audienciasPermitidas(): Promise<Audience[]> {
  const user = await getSessionUser();
  if (!user?.email) return [];

  const role = await getSessionRole();

  // LAWYER: su unica casa es el portal legal y solo ve las notas del portal
  // legal. Sin `admin` ni por asomo — es el caso que motiva este archivo.
  if (role === 'LAWYER') return ['attorney'];

  // DOCTOR / PROVIDER: idem, su unica casa es el portal medico.
  if (role !== null && PORTAL_ONLY_ROLES.has(role)) return ['doctor'];

  // Staff interno. `admin` siempre; los portales solo si de verdad puede
  // entrar en ellos, con la MISMA pregunta que usan los layouts para dejarlo
  // pasar — no una regla paralela que se despegue de aquella.
  const [verDoctor, verAbogado] = await Promise.all([
    canViewAsDoctor(user.email),
    canViewAsLawyer(user.email),
  ]);

  const permitidas: Audience[] = ['admin'];
  if (verDoctor) permitidas.push('doctor');
  if (verAbogado) permitidas.push('attorney');
  return permitidas;
}

/**
 * La audiencia efectiva para este request.
 *
 * `pedida` sale del portal en el que esta parado el cliente (lo sabe por su
 * pathname; el layout no puede pasarselo porque no recibe la URL). Si no le
 * corresponde, NO es un error: cae a la principal. Un admin que abre la campana
 * desde /doctor ve las notas del portal medico; un abogado que pida `admin`
 * —a mano o por un bug— ve las suyas y no se entera de nada mas.
 *
 * `null` = sin sesion.
 */
export async function resolverAudiencia(pedida: string | null): Promise<Audience | null> {
  const permitidas = await audienciasPermitidas();
  if (permitidas.length === 0) return null;

  const elegida = permitidas.find((a) => a === pedida);
  return elegida ?? permitidas[0]!;
}
