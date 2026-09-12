'use client';

/**
 * El lector de NDJSON del cliente — vive en `packages/agente`.
 *
 * Envoltorio. Se re-exporta desde la subruta y no desde la raíz del paquete
 * porque este módulo es de CLIENTE (trae React): metido en el índice, lo
 * arrastraría cualquier ruta de servidor que importe el motor.
 */
export * from '@precision-medical/agente/use-preguntar';
