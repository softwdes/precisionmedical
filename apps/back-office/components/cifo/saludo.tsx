'use client';

/**
 * El saludo de CIFO — vive en `packages/agente`.
 *
 * Envoltorio, igual que el motor: se mudó al paquete cuando el Admin pasó a ser
 * el TERCER portal que lo usa (2026-09-12). Los dos que ya estaban en
 * producción —el panel de la clínica y el día del provider— no cambiaron un
 * solo import.
 */
export { SaludoCifo, EVENTO_ABRIR, MARCA_ABRIR } from '@precision-medical/agente/saludo';
export type { LineaSaludo } from '@precision-medical/agente/saludo';
