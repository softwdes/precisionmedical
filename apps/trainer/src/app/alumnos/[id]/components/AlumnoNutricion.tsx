'use client';

import NutricionModule from '@/components/NutricionModule';

interface Props {
  alumnoId: string;
  alumnoNombre: string;
}

export default function AlumnoNutricion({ alumnoId, alumnoNombre }: Props) {
  return (
    <NutricionModule
      students={[{ id: alumnoId, full_name: alumnoNombre }]}
      initialStudentId={alumnoId}
    />
  );
}
