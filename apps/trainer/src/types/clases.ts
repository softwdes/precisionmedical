export type TipoClase = 'personal' | 'grupal' | 'evaluacion' | 'bloque';
export type ColorClase = 'green' | 'blue' | 'purple' | 'amber' | 'coral';
export type TipoRecurrencia = 'ninguna' | 'rango' | 'frecuencia';
export type FrecuenciaTipo = 'diario' | 'interdiario';

export interface ClaseAlumno {
  alumno_id: string;
  students?: { full_name: string } | null;
}

export interface Clase {
  id: string;
  trainer_id: string;
  titulo: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  tipo: TipoClase;
  color: ColorClase;
  recurrencia: TipoRecurrencia;
  fecha_hasta: string | null;
  frecuencia_tipo: FrecuenciaTipo | null;
  notas: string | null;
  created_at: string;
  clase_alumnos?: ClaseAlumno[];
}

export interface NuevaClaseForm {
  titulo: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  tipo: TipoClase;
  color: ColorClase;
  recurrencia: TipoRecurrencia;
  fecha_hasta?: string;
  frecuencia_tipo?: FrecuenciaTipo;
  notas?: string;
  alumno_ids: string[];
}
