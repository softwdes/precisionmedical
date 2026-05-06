export interface PlanSaas {
  id: string;
  nombre: 'basico' | 'vip' | 'premium';
  precio_mensual: number;
  limite_alumnos: number | null;
  limite_ia_diario: number | null;
  incluye_metricas: boolean;
  incluye_whatsapp: boolean;
  incluye_soporte_prioritario: boolean;
  activo: boolean;
  created_at: string;
  trainers_count?: number;
  ingreso_mensual?: number;
}

export interface TrainerSuscripcion {
  id: string;
  trainer_id: string;
  plan_id: string;
  estado: 'activo' | 'trial' | 'suspendido' | 'cancelado';
  fecha_inicio: string;
  fecha_fin_trial: string | null;
  fecha_proximo_pago: string;
  metodo_pago: string | null;
  notas: string | null;
  created_at: string;
  planes_saas?: PlanSaas;
}

export interface MasterPago {
  id: string;
  trainer_id: string;
  plan_id: string;
  monto: number;
  fecha_pago: string;
  periodo: string;
  estado: 'pagado' | 'pendiente' | 'vencido';
  metodo_pago: string | null;
  notas: string | null;
  created_at: string;
  trainers?: { business_name: string };
  planes_saas?: { nombre: string };
}

export interface MasterAIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface MasterMetrics {
  trainers_activos: number;
  trainers_activos_prev: number;
  trainers_trial: number;
  trials_conv_rate: number;
  mrr_actual: number;
  mrr_prev: number;
  churn_mes: number;
  churn_rate: number;
  total_alumnos: number;
}

export interface TrainerRow {
  id: string;
  user_id: string;
  business_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  students_count: number;
  ia_hoy: number;
  suscripcion: (TrainerSuscripcion & { planes_saas: PlanSaas }) | null;
}

export interface MrrMensual {
  mes: string;
  monto: number;
}

export interface DistribucionPlan {
  plan: string;
  count: number;
  ingreso: number;
  porcentaje: number;
  color: string;
}

export interface TopTrainer {
  id: string;
  business_name: string;
  students_count: number;
  plan_nombre: string;
  max_alumnos: number | null;
}

export interface ActividadReciente {
  id: string;
  tipo: 'registro' | 'cambio_plan' | 'cancelacion' | 'pago' | 'trial_vencido' | 'suspension';
  descripcion: string;
  trainer_name: string;
  created_at: string;
}

export interface AlertBanners {
  trials_vencen: number;
  pagos_vencidos: number;
  sin_actividad: number;
  show: boolean;
}

export interface BillingMetrics {
  cobrado_mes: number;
  pendiente_total: number;
  pendiente_count: number;
  arr: number;
}

export interface ReporteMetrics {
  conversion_trial: string;
  churn_rate: string;
  ltv_promedio: number;
  ticket_promedio: number;
  arr_proyectado: number;
  nps_estimado: number;
  ia_consultas_hoy: number;
  total_alumnos: number;
  rutinas_mes: number;
  whatsapp_enviados: number;
  clases_hoy: number;
  uptime: number;
}
