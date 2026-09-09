'use client';

/**
 * Los DATOS clínicos del caso: el payload, sus tipos y el hook que lo carga.
 *
 * ── Por qué está separado de los tabs ────────────────────────────────────────
 *
 * Esto vivía dentro de `case-clinical-tabs.tsx`, junto a los cuatro tabs — 1.255
 * líneas de componentes con diálogos de laboratorio, de férulas, de cargos y el
 * widget de ScriptSure adentro.
 *
 * El problema es que `useCaseClinical` es un **hook**, y un hook no se puede
 * diferir con `next/dynamic`: `case-detail-client.tsx` lo llama en el nivel
 * superior de su render. Mientras el hook y los tabs compartieran archivo, el
 * import del hook arrastraba los 1.255 líneas al bundle **aunque los cuatro tabs
 * ya se rindan condicionados por `activeTab`**, y el modal del caso se monta en
 * trece rutas.
 *
 * O sea: el gate ya estaba bien puesto y no servía de nada, porque había otra
 * puerta al mismo módulo. Es la misma lección que dejó el intento fallido en
 * `case-url-modal.tsx` — cortar una puerta de varias no baja ni un byte.
 *
 * Con el hook acá, `case-detail-client` importa los datos de este archivo
 * (chico) y los tabs por `dynamic` (grande, y solo cuando se abre ese tab).
 *
 * Los dos tipos que vienen de afuera —`MedicationEntry` y `CoverageDTO`— entran
 * como `import type`, así que no crean ninguna arista de valor: TypeScript los
 * borra al compilar y no arrastran sus módulos.
 */

import * as React from 'react';
import type { MedicationEntry } from '@/components/visit/medication-history';
import type { CoverageDTO } from '@/lib/coverage';

/**
 * Lo que reciben los tabs clínicos: el payload ya cargado por el caso y la
 * visita elegida en el selector (`null` = todas).
 */
export interface ClinicalTabProps {
  caseId: string;
  clinical: CaseClinical;
  visitId: string | null;
}

// ─── Payload de /api/admin/cases/[id]/clinical ────────────────────────────────

export interface RxRow {
  id: string;
  drugName: string;
  deaSchedule: string | null;
  dose: string;
  frequency: string;
  quantityTotal: number;
  refills: number;
  pharmacyName: string | null;
  status: string;
  dawSentAt: string | null;
  createdAt: string;
  canRefill: boolean;
}

export interface LabRow {
  id: string;
  groupId: string | null;
  orderType: string;
  studyName: string;
  studyCode: string | null;
  clinicalIndication: string;
  urgency: string;
  collectionSite: string;
  preferredCenter: string | null;
  icd10Codes: string[];
  status: string;
  orderedAt: string;
  resultFileName: string | null;
}

export interface Visit {
  appointmentId: string;
  scheduledFor: string;
  status: string;
  providerName: string | null;
  providerId: string | null;
  note: {
    status: string;
    signedAt: string | null;
    signedByName: string | null;
    diagnoses: Array<{ icd10Code: string | null; icd10Label: string | null; snomedLabel: string | null }>;
  } | null;
  prescriptions: RxRow[];
  labOrders: LabRow[];
  // `category` viaja aunque no se muestre: el PATCH de la cita lo exige, y sin
  // él la lista entera se rechaza con 400.
  services: Array<{ id: string; code: string; description: string; fee?: number; category: string }>;
  braces: Array<{ id: string; code: string; name: string; sizeLabel: string | null; unitPrice: number; side: string; quantity: number }>;
  cashServices: Array<{ id: string; code: string; name: string; unitPrice: number; unitLabel: string | null; quantity: number; catalogItemId: number | null; chargedAt: string }>;
}

export interface ClinicalPayload {
  visits: Visit[];
  medications: MedicationEntry[];
  latestAppointmentId: string | null;
  /** Cobertura resuelta del caso — ordena los catálogos en el picker de cargos */
  coverage: CoverageDTO | null;
}

export type CaseClinical = ClinicalPayload & {
  loading: boolean; error: boolean; reload: () => Promise<void>;
};

/**
 * Lo clínico del caso. Lo llama UNA vez el detalle del caso y lo reparte a los
 * cinco tabs: antes cada tab montaba su propia instancia y pedía el mismo
 * endpoint por separado — cuatro requests idénticos al recorrer los tabs, y
 * cuatro listas de visitas que podían quedar desfasadas entre sí.
 */
export function useCaseClinical(caseId: string): CaseClinical {
  const [data, setData] = React.useState<ClinicalPayload>({ visits: [], medications: [], latestAppointmentId: null, coverage: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const reload = React.useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/clinical`);
      if (!res.ok) throw new Error('load');
      const d = await res.json() as ClinicalPayload;
      setData({
        visits: d.visits ?? [],
        medications: d.medications ?? [],
        latestAppointmentId: d.latestAppointmentId ?? null,
        coverage: d.coverage ?? null,
      });
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  React.useEffect(() => { void reload(); }, [reload]);
  return { ...data, loading, error, reload };
}
