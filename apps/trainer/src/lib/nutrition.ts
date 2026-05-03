export const ACTIVITY_FACTORS = {
  sedentario:  1.2,
  ligero:      1.375,
  moderado:    1.55,
  activo:      1.725,
  muy_activo:  1.9,
} as const;

export const ACTIVITY_LABELS: Record<keyof typeof ACTIVITY_FACTORS, string> = {
  sedentario:  'Sedentario (sin ejercicio)',
  ligero:      'Ligero (1–3 días/sem)',
  moderado:    'Moderado (3–5 días/sem)',
  activo:      'Activo (6–7 días/sem)',
  muy_activo:  'Muy activo (2× por día)',
};

export const OBJETIVO_ADJUSTMENTS = {
  deficit_agresivo:   -500,
  deficit_moderado:   -250,
  mantenimiento:         0,
  superavit_moderado:  250,
  superavit_agresivo:  500,
} as const;

export const OBJETIVO_LABELS: Record<keyof typeof OBJETIVO_ADJUSTMENTS, string> = {
  deficit_agresivo:   'Déficit agresivo (−500 kcal)',
  deficit_moderado:   'Déficit moderado (−250 kcal)',
  mantenimiento:      'Mantenimiento (0 kcal)',
  superavit_moderado: 'Superávit moderado (+250 kcal)',
  superavit_agresivo: 'Superávit agresivo (+500 kcal)',
};

export const MACRO_DISTRIBUTIONS = {
  estandar:      { proteinas: 0.30, carbos: 0.45, grasas: 0.25 },
  alta_proteina: { proteinas: 0.40, carbos: 0.35, grasas: 0.25 },
  baja_carbo:    { proteinas: 0.35, carbos: 0.25, grasas: 0.40 },
  cetogenica:    { proteinas: 0.30, carbos: 0.05, grasas: 0.65 },
} as const;

export const MACRO_LABELS: Record<keyof typeof MACRO_DISTRIBUTIONS, string> = {
  estandar:      'Estándar (30/45/25)',
  alta_proteina: 'Alta proteína (40/35/25)',
  baja_carbo:    'Baja en carbos (35/25/40)',
  cetogenica:    'Cetogénica (30/5/65)',
};

export function calcIMC(pesoKg: number, alturaCm: number): number {
  const alturaM = alturaCm / 100;
  return pesoKg / (alturaM * alturaM);
}

export function calcPesoIdeal(alturaCm: number, sexo: 'm' | 'f'): number {
  const alturaIn = alturaCm / 2.54;
  return sexo === 'm' ? 50 + 2.3 * (alturaIn - 60) : 45.5 + 2.3 * (alturaIn - 60);
}

export function calcGrasaEstimada(imc: number, edad: number, sexo: 'm' | 'f'): number {
  const sexFactor = sexo === 'm' ? 1 : 0;
  return 1.2 * imc + 0.23 * edad - 10.8 * sexFactor - 5.4;
}

export function calcMasaMagra(pesoKg: number, grasaPct: number): number {
  return pesoKg * (1 - grasaPct / 100);
}

export function calcTMB(pesoKg: number, alturaCm: number, edad: number, sexo: 'm' | 'f'): number {
  if (sexo === 'm') return 10 * pesoKg + 6.25 * alturaCm - 5 * edad + 5;
  return 10 * pesoKg + 6.25 * alturaCm - 5 * edad - 161;
}

export function calcTDEE(tmb: number, nivelActividad: keyof typeof ACTIVITY_FACTORS): number {
  return tmb * ACTIVITY_FACTORS[nivelActividad];
}

export function calcMeta(tdee: number, objetivo: keyof typeof OBJETIVO_ADJUSTMENTS): number {
  return Math.max(1200, tdee + OBJETIVO_ADJUSTMENTS[objetivo]);
}

export function calcMacros(calorias: number, distribucion: keyof typeof MACRO_DISTRIBUTIONS) {
  const d = MACRO_DISTRIBUTIONS[distribucion];
  return {
    proteinas_g: (calorias * d.proteinas) / 4,
    carbos_g:    (calorias * d.carbos)    / 4,
    grasas_g:    (calorias * d.grasas)    / 9,
  };
}

export function getIMCCategory(imc: number): { label: string; color: string } {
  if (imc < 18.5) return { label: 'Bajo peso',    color: '#60a5fa' };
  if (imc < 25)   return { label: 'Normal',        color: '#3FF8C8' };
  if (imc < 30)   return { label: 'Sobrepeso',     color: '#fbbf24' };
  if (imc < 35)   return { label: 'Obesidad I',    color: '#f97316' };
  return              { label: 'Obesidad II+',  color: '#ef4444' };
}
