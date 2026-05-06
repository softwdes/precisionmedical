'use client';

import MetricasModule from '@/components/MetricasModule';

interface Exercise { id: string; name: string; muscle_group: string | null; }

interface Props {
  alumnoId: string;
  alumnoNombre: string;
  experienceLevel: string | null;
  exercises: Exercise[];
}

export default function AlumnoMetricas({ alumnoId, alumnoNombre, experienceLevel, exercises }: Props) {
  return (
    <MetricasModule
      students={[{ id: alumnoId, full_name: alumnoNombre, experience_level: experienceLevel }]}
      exercises={exercises}
      initialStudentId={alumnoId}
    />
  );
}
