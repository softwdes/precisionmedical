/**
 * 404 de todo el back-office.
 *
 * Lo alcanzan los 17 `notFound()` repartidos por la app (detalle de paciente,
 * caso, admisión, billing, front-office, intake y las páginas del portal
 * médico), además de cualquier URL que no matchee. Antes caían todos en la
 * página blanca de Next: sin marca, sin idioma y —lo que más molesta— sin forma
 * de volver.
 *
 * Vive dentro del layout raíz, así que acá sí hay next-intl (a diferencia de
 * `global-error.tsx`, que lo reemplaza y queda fuera del provider).
 *
 * El texto no afirma que el registro no exista: varios de esos `notFound()`
 * cubren también un caso sin permiso, y decir "no existe" filtraría que sí
 * existe. Ver el de `doctor-print/`.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export default async function NotFound(): Promise<React.ReactElement> {
  const t = await getTranslations('phoenix.notFound');

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg-0">
      <div className="max-w-sm text-center">
        <FileQuestion className="w-10 h-10 text-text-muted mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-text-1 mb-2">{t('title')}</h1>
        <p className="text-sm text-text-2 mb-6">{t('body')}</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('back')}
        </Link>
      </div>
    </div>
  );
}
