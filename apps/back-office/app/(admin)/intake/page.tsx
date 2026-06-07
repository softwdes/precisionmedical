/**
 * B.12 — Bandeja de Edson (Intake Specialist)
 *
 * Server component: no pre-fetches los casos (se cargan client-side para
 * poder filtrar/refrescar sin full page reload).
 */

import { IntakeClient } from './intake-client';

export const metadata = { title: 'Bandeja Edson · LienMaster' };

export default function IntakePage() {
  return <IntakeClient />;
}
