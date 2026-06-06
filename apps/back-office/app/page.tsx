import { redirect } from 'next/navigation';

// Phase 1A — redirige a la pantalla de Catálogos.
// Phase 1B agregará dashboard del Super Admin con widgets.
export default function HomePage(): never {
  redirect('/admin/specialties');
}
