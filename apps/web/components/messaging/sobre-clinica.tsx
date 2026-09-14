'use client';

/**
 * El sobre de mensajes en la barra del Admin.
 *
 * Es el gemelo del que ya existe en la clínica, y cuenta lo mismo: los hilos
 * RECIBIDOS sin leer. No cuenta los que uno mismo abrió — un contador que sube
 * al escribir no es un pendiente, es ruido.
 *
 * ── Por qué solo aparece para algunos ──────────────────────────────────────
 *
 * Porque la bandeja del Admin solo existe para quien vive acá. Mostrarle el
 * sobre a un rol que al tocarlo se choca con "sin acceso" es peor que no
 * mostrárselo: promete algo que no va a pasar. La regla es la misma del menú —
 * ver `mensajes` en `lib/permissions.ts`.
 *
 * ── Por qué no muestra de quién es ─────────────────────────────────────────
 *
 * El contador dice CUÁNTOS, nunca de quién ni de qué. Esta barra se ve con
 * gente al lado de la pantalla, igual que el aviso del celular se dibuja en la
 * pantalla de bloqueo. El detalle está a un toque, adentro.
 */

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Mail } from 'lucide-react';
import { useRole } from '@/contexts/role-context';
import { can } from '@/lib/permissions';

interface Contador {
  unread: number;
  urgentUnread: number;
}

export function SobreClinica(): React.ReactElement | null {
  const t = useTranslations('mensajes');
  const role = useRole();
  const puede = can(role, 'mensajes');

  const { data } = useQuery({
    queryKey: ['clinica-sobre'],
    queryFn: async (): Promise<Contador> => {
      const res = await fetch('/api/clinica/mensajes/badge');
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as Contador;
    },
    // Solo se pregunta si la persona puede entrar: sin esto el Admin le pediría
    // la bandeja a la clínica una vez por minuto para todo el mundo.
    enabled: puede,
    refetchInterval: 60_000,
    // Un contador que falla no tiene por qué gritar: se queda como estaba.
    retry: 1,
  });

  if (!puede) return null;

  const sinLeer = data?.unread ?? 0;
  const urgentes = data?.urgentUnread ?? 0;

  return (
    <Link
      href="/dashboard/mensajes"
      aria-label={sinLeer > 0 ? t('unread', { n: sinLeer }) : t('title')}
      title={sinLeer > 0 ? t('unread', { n: sinLeer }) : t('title')}
      className="relative inline-flex items-center justify-center gap-2 h-9 px-2.5 sm:px-3 rounded-md border border-border bg-bg-2 text-text-2 hover:text-text-1 hover:bg-white/5 transition-colors"
    >
      <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
      {/* La palabra va SIEMPRE, también en el teléfono.
          La primera versión la escondía por debajo de 640px para no apretar la
          barra —que ya lleva reloj, teléfono, CIFO, campana, idioma, tema y
          avatar—, y Erick la pidió igual dos veces (2026-09-14). Tiene razón:
          un sobre solo no dice si es correo interno, alertas o el buzón del
          sistema, y esa barra tiene tres iconos que podrían ser cualquiera de
          las tres. Si en algún teléfono aprieta, se resuelve achicando otra
          cosa, no borrando la única que nombra lo que hay adentro.
          `whitespace-nowrap`: la palabra no se parte en dos renglones. */}
      <span className="text-[13px] whitespace-nowrap">{t('title')}</span>
      {sinLeer > 0 && (
        /* El número va ARRIBA del icono y no al lado: al lado empuja el resto
           de la barra cada vez que cambia, y en móvil eso mueve todo. */
        <span
          className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold leading-4 text-center ${
            urgentes > 0 ? 'bg-rose text-white' : 'bg-brand text-white'
          }`}
        >
          {sinLeer > 9 ? '9+' : sinLeer}
        </span>
      )}
    </Link>
  );
}
