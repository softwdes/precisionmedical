'use client';

/**
 * MedicalHistoryButton — abre el Historial Médico completo del paciente sin
 * salir de donde se lo está atendiendo.
 *
 * Nació de una confusión que costó una tarde (Erick, 2026-08-13). Historial
 * Médico y nota clínica **no son lo mismo**:
 *
 *  · El **Historial Médico** es la ficha del paciente —alergias, lista de
 *    problemas, medicamentos, cirugías, antecedentes familiares, sociales—.
 *    Es permanente, es del paciente (no de la cita) y se EDITA.
 *  · La **nota** es el documento de UNA cita. Se firma y queda inmutable.
 *
 * La consulta ya mostraba la ficha en el panel izquierdo, pero **recortada y en
 * solo lectura**: 9 secciones colapsadas contra las 17 del historial completo, y
 * ni una forma de corregir nada. El doctor que veía una alergia mal cargada
 * tenía que salir de la nota, ir a Pacientes y volver — con la nota a medias.
 *
 * Este botón monta el MISMO `MedicalHistoryDialog` de Pacientes, editable
 * completo (decisión de Erick: "todo, igual que en Pacientes"). Una sola
 * implementación para las dos entradas; nada que se pueda desincronizar.
 */

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ClipboardList } from 'lucide-react';
import { Button } from '@precision/ui';
import { useToast } from '@/components/ui-phoenix';
import type { PatientRow } from '@/app/(admin)/patients/patients-client';

/**
 * El diálogo son ~2800 líneas con 15 sub-diálogos de edición. Se carga cuando se
 * lo pide, no en el bundle de la consulta: esa pantalla se abre en un iPad con
 * el paciente esperando y es la más sensible a la latencia de toda la app.
 */
const MedicalHistoryDialog = dynamic(
  () => import('@/app/(admin)/patients/medical-history-dialog').then((m) => m.MedicalHistoryDialog),
  { ssr: false },
);

export interface MedicalHistoryButtonProps {
  patientId: string;
  /** Clases extra del botón (alineación en la barra que lo contiene). */
  className?: string;
}

export function MedicalHistoryButton({
  patientId, className = '',
}: MedicalHistoryButtonProps): React.ReactElement {
  const t = useTranslations('phoenix.doctor');
  const toast = useToast();
  const router = useRouter();

  const [patient, setPatient] = React.useState<PatientRow | null>(null);
  const [loading, setLoading] = React.useState(false);
  /** Si se guardó algo, al cerrar hay que refrescar lo que quedó atrás. */
  const changed = React.useRef(false);

  /**
   * Se trae la ficha al hacer clic, y de nuevo en cada apertura.
   *
   * Cachear la primera copia sería un bug fino: el diálogo inicializa su estado
   * con `patient.medicalHistory` al montar, así que reabrirlo con la copia vieja
   * mostraría la ficha SIN la alergia que se acaba de agregar — y peor, guardar
   * otra sección desde esa vista escribiría el estado viejo.
   */
  const abrir = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/medical-history`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { patient: PatientRow };
      setPatient(data.patient);
    } catch {
      toast.error(t('mhLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const cerrar = (): void => {
    setPatient(null);
    if (!changed.current) return;
    changed.current = false;
    // El panel izquierdo de la consulta y el resto de la pantalla se renderizan
    // en el server. `updateMedicalHistory` revalida `/patients`, que no es esta
    // ruta, así que sin esto el doctor cierra el diálogo y sigue viendo lo viejo.
    router.refresh();
  };

  return (
    <>
      {/* Mismo primitivo que sus vecinos de la barra de la nota: un botón con
          forma propia ahí se lee como otra cosa (Erick, 2026-08-04). `ghost`
          porque es una acción secundaria y el borde no le agrega significado;
          `loading` ya trae su spinner y se deshabilita solo. */}
      <Button
        variant="ghost"
        onClick={() => void abrir()}
        loading={loading}
        className={`h-9 gap-1.5 ${className}`}
      >
        <ClipboardList className="w-3.5 h-3.5" />
        {t('mhOpen')}
      </Button>

      {patient && (
        <MedicalHistoryDialog
          patient={patient}
          open
          onClose={cerrar}
          onChanged={() => { changed.current = true; }}
        />
      )}
    </>
  );
}
