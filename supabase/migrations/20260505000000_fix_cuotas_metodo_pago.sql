-- Recreate metodo_pago constraint with explicit NULL support and full value list
ALTER TABLE cuotas DROP CONSTRAINT IF EXISTS cuotas_metodo_pago_check;

ALTER TABLE cuotas ADD CONSTRAINT cuotas_metodo_pago_check
  CHECK (metodo_pago IS NULL OR metodo_pago IN (
    'efectivo',
    'yape_plin',
    'transferencia',
    'tarjeta_debito',
    'tarjeta_credito',
    'mercado_pago'
  ));
