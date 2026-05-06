'use client';

import { useState } from 'react';
import AlumnoHeader from './AlumnoHeader';
import AlumnoPerfil from './AlumnoPerfil';
import AlumnoRutina from './AlumnoRutina';
import AlumnoNutricion from './AlumnoNutricion';
import AlumnoMetricas from './AlumnoMetricas';
import AlumnoHistorial from './AlumnoHistorial';

type Tab = 'datos' | 'rutina' | 'nutricion' | 'metricas' | 'historial';

const TABS: { key: Tab; label: string }[] = [
  { key: 'datos', label: 'DATOS' },
  { key: 'rutina', label: 'RUTINA ACTIVA' },
  { key: 'nutricion', label: 'NUTRICIÓN' },
  { key: 'metricas', label: 'MÉTRICAS' },
  { key: 'historial', label: 'HISTORIAL' },
];

interface Student {
  id: string; full_name: string; email: string | null; phone: string | null;
  experience_level: string | null; goals: string[] | null;
  available_equipment: string | null; birth_date: string | null; created_at: string;
}
interface RutinaEjercicio {
  id: string; orden: number; sets: number; reps: string; descanso_seg: number;
  notas: string | null; ejercicio_id: string | null;
  exercises: { name: string } | null;
}
interface RutinaDia {
  id: string; orden: number; nombre: string;
  rutina_ejercicios: RutinaEjercicio[];
}
interface RutinaActiva {
  id: string; nombre: string; fecha_inicio: string; activo: boolean;
  rutina_dias: RutinaDia[];
}
interface RutinaHistorial {
  id: string; nombre: string; fecha_inicio: string; activo: boolean; created_at: string;
}
interface Cuota {
  id: string; monto: number; fecha_pago: string | null; fecha_vencimiento: string;
  periodo: string; metodo_pago: string | null; estado: string; notas: string | null;
}
interface WaMensaje {
  id: string; tipo_mensaje: string; contenido: string; fecha_envio: string; estado: string;
}
interface Exercise {
  id: string; name: string; muscle_group: string | null;
}

interface Props {
  student: Student;
  goalsMap: Record<string, string>;
  rutinaActiva: RutinaActiva | null;
  rutinasHistorial: RutinaHistorial[];
  cuotas: Cuota[];
  waMensajes: WaMensaje[];
  exercises: Exercise[];
}

export default function AlumnoPerfilClient({
  student, goalsMap, rutinaActiva, rutinasHistorial, cuotas, waMensajes, exercises,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('datos');

  const ultimaCuotaEstado = cuotas[0]?.estado;
  const primCuota = cuotas[0]
    ? { monto: cuotas[0].monto, fecha_vencimiento: cuotas[0].fecha_vencimiento }
    : null;

  return (
    <div>
      <AlumnoHeader
        student={student}
        {...(ultimaCuotaEstado !== undefined ? { ultimaCuotaEstado } : {})}
        cuota={primCuota}
      />

      <div className="chart-tabs" style={{ marginBottom: '24px' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`chart-tab${activeTab === t.key ? ' active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'datos' && (
        <AlumnoPerfil student={student} goalsMap={goalsMap} cuotas={cuotas} />
      )}
      {activeTab === 'rutina' && (
        <AlumnoRutina alumnoId={student.id} rutinaActiva={rutinaActiva} rutinasHistorial={rutinasHistorial} />
      )}
      {activeTab === 'nutricion' && (
        <AlumnoNutricion alumnoId={student.id} alumnoNombre={student.full_name} />
      )}
      {activeTab === 'metricas' && (
        <AlumnoMetricas
          alumnoId={student.id}
          alumnoNombre={student.full_name}
          experienceLevel={student.experience_level}
          exercises={exercises}
        />
      )}
      {activeTab === 'historial' && (
        <AlumnoHistorial
          alumnoId={student.id}
          alumnoNombre={student.full_name}
          alumnoPhone={student.phone}
          rutinasHistorial={rutinasHistorial}
          rutinaActiva={rutinaActiva}
        />
      )}
    </div>
  );
}
