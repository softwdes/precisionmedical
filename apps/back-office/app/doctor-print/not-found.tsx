/**
 * 404 de los documentos imprimibles (nota clínica, orden de laboratorio).
 *
 * Propio y no el de la app porque estas rutas se abren en una PESTAÑA NUEVA y
 * sin shell: no hay menú ni a dónde volver, así que un botón "ir al panel" sería
 * mandar al usuario a otra parte de la app en una pestaña que él abrió solo para
 * imprimir. Acá la salida correcta es cerrar la pestaña.
 *
 * El mensaje es DELIBERADAMENTE genérico. El `notFound()` de estas páginas cubre
 * dos cosas distintas —el documento no existe, o la cuenta no tiene acceso— y
 * distinguirlas revelaría que el documento existe. "No está disponible" las
 * cubre a las dos sin filtrar nada.
 *
 * El layout de `doctor-print` fuerza fondo blanco y serif porque el resultado se
 * imprime; esta página lo hereda, así que va con colores explícitos y no con los
 * tokens del tema oscuro.
 */

import { getTranslations } from 'next-intl/server';

export default async function DoctorPrintNotFound(): Promise<React.ReactElement> {
  const t = await getTranslations('phoenix.notFound');

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 380 }}>
        <h1 style={{ fontSize: '1.15rem', margin: '0 0 0.5rem', color: '#111' }}>
          {t('printTitle')}
        </h1>
        <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#555', margin: 0 }}>
          {t('printBody')}
        </p>
      </div>
    </div>
  );
}
