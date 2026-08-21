import type { Metadata } from 'next';

/**
 * Las pantallas de acceso van SIEMPRE en inglés, no traducidas: quien todavía no
 * entró no tiene cookie de idioma, así que "traducirlas" es elegir un idioma al
 * azar. Estaba en español, que es justo lo que la regla evita.
 */
export const metadata: Metadata = {
  title: 'Sign in',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
