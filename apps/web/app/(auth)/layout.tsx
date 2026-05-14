import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
