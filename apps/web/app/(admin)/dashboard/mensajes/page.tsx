import { getTranslations } from 'next-intl/server';
import { MensajesClient } from './mensajes-client';

/**
 * La bandeja de mensajes DENTRO del Admin.
 *
 * Erick, 2026-09-13: Amanda y los dueños de la compañía **solo usan el Admin**,
 * y hasta hoy la mensajería vivía únicamente en el back-office. Recibían el
 * aviso y para leerlo tenían que salir a otro dominio.
 *
 * ── Lo que esta pantalla NO hace, a propósito ──────────────────────────────
 *
 * No es una copia del módulo de la clínica. Allá son ~2.800 líneas: escritorios,
 * pedidos de bufete, adjuntos del expediente, selector de caso y de paciente,
 * plantillas. Nada de eso es trabajo de un dueño.
 *
 * Acá está lo que ellos hacen: **ver qué llegó, leerlo y responder**. Redactar
 * un hilo nuevo con paciente y caso sigue siendo de la clínica, que es donde
 * están esos datos y las reglas que los gobiernan.
 *
 * ── Y de dónde salen los datos ─────────────────────────────────────────────
 *
 * De la misma API de siempre, a través del puente `/api/clinica/mensajes/…`,
 * que reenvía con la sesión de cada persona. Los hilos, los permisos, el push y
 * el historial siguen teniendo un solo dueño. Esta pantalla es solo la vista.
 */
export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('mensajes.title') };
}

export default function MensajesPage(): React.ReactElement {
  return <MensajesClient />;
}
