/**
 * Mandar el formulario del portal desde una pantalla de ALTA.
 *
 * El diálogo de envío (`send-portal-dialog`) tiene su propio flujo: elegís
 * canal, ves la vista previa, y la pantalla de éxito te dice qué pasó. Las dos
 * pantallas que dan de alta —el wizard de caso y el registro rápido— no tienen
 * ese diálogo: mandan el formulario como parte de guardar, sin pantalla propia
 * donde mostrar el resultado.
 *
 * Por eso existe esto. Las dos hacían el envío por su cuenta y ninguna miraba
 * cómo salió:
 *
 *   · el wizard llamaba a `send-portal-link` y leía `sent.portalUrl` para armar
 *     el QR, descartando `sent.error` — un correo rechazado por el allowlist
 *     terminaba en la pantalla verde de "caso creado", igual que uno entregado;
 *   · el registro rápido ni siquiera llamaba: mandaba `formDelivery` a
 *     `POST /api/admin/cases`, que marcaba el caso como enviado y no mandaba
 *     nada.
 *
 * Los dos llaman ahora al mismo lugar y reciben lo mismo: qué salió, qué no, y
 * por qué. Qué hace cada pantalla con eso es decisión suya — el wizard sigue
 * mostrando el QR, el registro rápido se queda abierto —, pero ninguna de las
 * dos puede ya decir "enviado" sin haber mirado.
 */

export type CanalPortal = 'EMAIL' | 'SMS';

export interface ResultadoCanal {
  via: CanalPortal;
  /** El operador lo aceptó. NO es "el paciente lo recibió". */
  ok: boolean;
  /** Código del server: `NOT_IN_TEST_ALLOWLIST`, `OPTED_OUT`, `TWILIO_ERROR`… */
  error: string | null;
  errorDetail: string | null;
}

export interface ResultadoEnvioPortal {
  resultados: ResultadoCanal[];
  /** Los canales que NO salieron. Vacío = salió todo. */
  fallidos: ResultadoCanal[];
  /** El link del portal, para el QR. Llega aunque el envío falle. */
  portalUrl: string | null;
}

/**
 * Manda el formulario por los canales pedidos. NO lanza: un canal caído no
 * puede tumbar un alta que ya se guardó.
 */
export async function enviarPortal(args: {
  caseId: string;
  canales: CanalPortal[];
  language: 'es' | 'en';
}): Promise<ResultadoEnvioPortal> {
  const { caseId, canales, language } = args;

  const resultados = await Promise.all(
    canales.map(async (via): Promise<ResultadoCanal> => {
      try {
        const res = await fetch(`/api/admin/cases/${caseId}/send-portal-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ via, language }),
        });
        const json = await res.json().catch(() => ({})) as {
          sent?: { delivered?: boolean; error?: string | null; errorDetail?: string | null; portalUrl?: string | null };
          message?: string;
          error?: string;
        };

        // Un 400 (menor sin apoderado, caso sin correo) no trae `sent`: el
        // motivo viene en el cuerpo del error y hay que contarlo igual.
        if (!res.ok) {
          return { via, ok: false, error: json.error ?? `HTTP_${res.status}`, errorDetail: json.message ?? null };
        }
        return {
          via,
          ok: json.sent?.delivered === true,
          error: json.sent?.error ?? null,
          errorDetail: json.sent?.errorDetail ?? null,
        };
      } catch (e) {
        return { via, ok: false, error: 'NETWORK', errorDetail: e instanceof Error ? e.message : null };
      }
    }),
  );

  // El link se pide aparte y no al primer canal: si el único canal elegido
  // falló, su respuesta puede no traerlo, y el QR sigue siendo la salida de
  // emergencia para que el paciente complete el formulario ahí mismo. Es
  // JUSTO cuando el envío falla que más se lo necesita.
  let portalUrl: string | null = null;
  try {
    const tokenRes = await fetch(`/api/admin/cases/${caseId}/generate-portal-token`, { method: 'POST' });
    if (tokenRes.ok) {
      const tokenJson = await tokenRes.json().catch(() => ({})) as { portalUrl?: string };
      portalUrl = tokenJson.portalUrl ?? null;
    }
  } catch { /* el QR es un extra; su falla no cambia lo que se informa del envío */ }

  return { resultados, fallidos: resultados.filter((r) => !r.ok), portalUrl };
}

/**
 * El motivo, en una frase que sirva para decidir qué hacer.
 *
 * `t` es el `useTranslations('phoenix.portalEnvio')` de la pantalla. Se pasa en
 * vez de importarse porque esto lo llaman componentes de cliente que ya tienen
 * el suyo, y un segundo hook acá obligaría a que este archivo sea un hook.
 */
export function describirFallo(
  r: ResultadoCanal,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  const canal = r.via === 'EMAIL' ? t('canalEmail') : t('canalSms');

  switch (r.error) {
    // El correo en modo prueba: el destino no está en EMAIL_TEST_ALLOWLIST.
    // Es lo que va a ver recepción todo el tiempo hasta que haya BAA, así que
    // tiene que decir por qué no salió y no parecer una falla del sistema.
    case 'NOT_IN_TEST_ALLOWLIST': return t('enPrueba', { canal });
    case 'OPTED_OUT':             return t('dadoDeBaja', { canal });
    case 'DISABLED':              return t('canalApagado', { canal });
    case 'INVALID_TO':            return t('destinoInvalido', { canal });
    case 'NETWORK':               return t('sinRed', { canal });
    default:                      return t('falloGenerico', { canal });
  }
}

// ─── Los avisos de CITA ──────────────────────────────────────────────────────
//
// Mismo problema que arriba, otra familia de avisos. Las rutas que crean,
// mueven o cancelan una cita devuelven el resultado del aviso al paciente —
// `appointments/route.ts` lo hace con un `await` deliberado y un comentario que
// dice que recepción tiene que poder verlo en el acto— y ninguna pantalla lo
// leía. El dato viajaba y se tiraba.

/** Lo que devuelven `enviarRecordatorioDeCita`, `avisarReprogramacion` y `avisarCancelacion`. */
export interface ResultadoAvisoCita {
  enviado: boolean;
  motivo?: string;
  detalle?: string;
}

/** Cuál de los tres avisos falló: cambia la frase, no el motivo. */
export type TipoAvisoCita = 'recordatorio' | 'reprogramacion' | 'cancelacion';

/**
 * Una frase para recepción sobre un aviso de cita que no salió.
 *
 * Devuelve `null` cuando salió bien o cuando no había nada que mandar — la
 * pantalla no tiene que decir nada en ese caso. El que llama hace
 * `const aviso = describirAvisoCita(...); if (aviso) toast.info(aviso)`.
 *
 * `t` es el `useTranslations('phoenix.avisoCita')` de la pantalla, por la misma
 * razón que en `describirFallo`: lo llaman componentes que ya tienen el suyo.
 */
export function describirAvisoCita(
  r: ResultadoAvisoCita | null | undefined,
  tipo: TipoAvisoCita,
  t: (key: string) => string,
): string | null {
  if (!r || r.enviado) return null;

  const que =
    tipo === 'reprogramacion' ? t('reprogramacionNoSalio')
    : tipo === 'cancelacion'  ? t('cancelacionNoSalio')
    : t('recordatorioNoSalio');

  const porque =
    r.motivo === 'SIN_TELEFONO' ? t('sinTelefono')
    : r.motivo === 'SIN_EMAIL'  ? t('sinEmail')
    : r.motivo === 'OPTED_OUT'  ? t('dadoDeBaja')
    : r.motivo === 'DESHABILITADO' ? t('canalApagado')
    : t('falloGenerico');

  return `${que} ${porque} ${t('avisarAMano')}`;
}
