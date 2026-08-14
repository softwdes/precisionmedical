import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@precision-medical/i18n/messages/en';

/**
 * Las pantallas de acceso van SIEMPRE en inglés (pedido de negocio), sin
 * importar el idioma en que esté la app.
 *
 * Hace falta un layout propio porque Clinical arranca en español —así lo quiere
 * el personal clínico— y el idioma sale de la cookie `locale`, que el layout
 * raíz aplica a TODO. Este provider anidado gana sobre el de arriba solo para
 * esta ruta: el login queda en inglés y, una vez adentro, la app sigue en el
 * idioma de la persona.
 *
 * Se hizo con un layout y no moviendo la carpeta a un grupo `(auth)` a
 * propósito: es aditivo y no toca rutas que otras sesiones estén editando.
 */
export default function LoginLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}
