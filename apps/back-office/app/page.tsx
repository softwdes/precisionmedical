import { redirect } from 'next/navigation';

// Root del back-office → Dashboard de Recepción (B.29).
export default function HomePage(): never {
  redirect('/dashboard');
}
