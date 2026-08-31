/**
 * FormField — wrappers consistentes para inputs/selects/textareas en modales.
 *
 * Usa el estilo del sistema (border-border, bg-bg-2, text-text-1, focus brand).
 * Reemplaza inputs custom ad-hoc en cada pantalla.
 *
 * Uso:
 *   <FormField.Input label="Nombre" required value={x} onChange={setX} placeholder="..." />
 *   <FormField.Select label="Idioma" value={x} onChange={setX} options={[...]} />
 *   <FormField.Textarea label="Notas" value={x} onChange={setX} rows={3} />
 */

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Input, Label } from '@precision/ui';

type Required = { required?: boolean };

function FieldLabel({ children, required }: { children: React.ReactNode } & Required) {
  return (
    <Label>
      {children}
      {required && <span className="text-rose ml-0.5">*</span>}
    </Label>
  );
}

function DateInputField({
  label, required, value, onChange, hint, error, disabled,
}: Required & {
  label: React.ReactNode;
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void; // emits YYYY-MM-DD
  hint?: React.ReactNode;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={[
          'w-full bg-bg-2 border rounded-md px-3 py-2 text-sm text-text-1',
          'focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand',
          '[color-scheme:dark]',
          // Solo lectura: borde punteado para que se lea como "dato traído de
          // otra ficha", no como campo deshabilitado por error
          disabled ? 'border-dashed border-border text-text-2 bg-white/[0.02] cursor-not-allowed' : '',
          error ? 'border-rose focus:ring-rose/30 focus:border-rose' : 'border-border',
        ].join(' ')}
      />
      {error && <p className="text-[10px] text-rose mt-1">{error}</p>}
      {!error && hint && <div className="text-text-muted text-[10px] mt-1">{hint}</div>}
    </div>
  );
}

function InputField({
  label, required, value, onChange, onBlur, placeholder, type = 'text', autoFocus, hint, maxLength, error, disabled, inputMode,
}: Required & {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  hint?: React.ReactNode;
  maxLength?: number;
  error?: string;
  /** Solo lectura — para datos que vienen de otra ficha y no deben editarse acá */
  disabled?: boolean;
  /** Teclado del móvil. `decimal` da el pad numérico con punto — la clínica
   *  carga precios desde el iPad (Regla #4). */
  inputMode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'email' | 'search' | 'url';
}) {
  if (type === 'date') {
    return <DateInputField label={label} required={required} value={value} onChange={onChange} hint={hint} error={error} disabled={disabled} />;
  }
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        autoFocus={autoFocus}
        maxLength={maxLength}
        disabled={disabled}
        className={[
          error ? 'border-rose focus-visible:ring-rose/30' : '',
          disabled ? 'border-dashed text-text-2 bg-white/[0.02]' : '',
        ].filter(Boolean).join(' ') || undefined}
      />
      {error && <p className="text-[10px] text-rose mt-1">{error}</p>}
      {!error && hint && <div className="text-text-muted text-[10px] mt-1">{hint}</div>}
    </div>
  );
}

function SelectField({
  label, required, value, onChange, options, hint,
}: Required & {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-brand"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
      {hint && <div className="text-text-muted text-[10px] mt-1">{hint}</div>}
    </div>
  );
}

function TextareaField({
  label, required, value, onChange, placeholder, rows = 3, maxLength, hint,
}: Required & {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  hint?: React.ReactNode;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand"
        placeholder={placeholder}
      />
      {hint && <div className="text-text-muted text-[10px] mt-1">{hint}</div>}
    </div>
  );
}

// ─── Phone input ─────────────────────────────────────────────────────────────
// Formats as (XXX) XXX-XXXX while typing. Only allows digits.
// Valida la regla NANP, que cubre TODO Estados Unidos y Canadá: 10 dígitos, y
// el código de área y la central empiezan entre 2 y 9. No hay lista de estados
// ni de códigos permitidos — (212), (310), (713) y (801) pasan por igual.

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 10) return false;
  // NANP: area code and exchange must start with 2-9
  return digits[0] >= '2' && digits[3] >= '2';
}

function PhoneField({
  label, required, value, onChange, placeholder, hint, autoFocus,
}: Required & {
  label: React.ReactNode;
  value: string;
  onChange: (v: string, isValid: boolean) => void;
  placeholder?: string;
  hint?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const t = useTranslations('phoenix.common');
  const [touched, setTouched] = React.useState(false);
  const digits = value.replace(/\D/g, '');
  const showError = touched && digits.length > 0 && !isValidPhone(value);
  const showIncomplete = touched && required && digits.length === 0;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatPhone(e.target.value);
    onChange(formatted, isValidPhone(formatted));
  }

  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <Input
        type="tel"
        value={value}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        // `(___) ___-____` y no un número de ejemplo: el default era
        // `(801) 555-0100` y el 801 es Utah, así que el campo PARECÍA pedir un
        // número de ese estado. La validación siempre aceptó todo EE.UU. y
        // Canadá; era el placeholder el que confundía.
        placeholder={placeholder ?? t('phonePlaceholder')}
        autoFocus={autoFocus}
        className={showError || showIncomplete ? 'border-rose focus:border-rose' : ''}
        maxLength={14}
        inputMode="numeric"
      />
      {/* Los dos mensajes estaban escritos a mano EN ESPAÑOL dentro de un
          primitivo compartido: en el portal legal, que arranca en inglés, se
          mezclaban los idiomas (Regla #2). Y el viejo decía "debe ser 10
          dígitos US (ej: (801) 555-0100)", reforzando la idea de que pedía
          Utah. Ahora explica la regla real: EE.UU. o Canadá. */}
      {showError && (
        <div className="text-rose text-[10px] mt-1">{t('phoneInvalid')}</div>
      )}
      {showIncomplete && !showError && (
        <div className="text-rose text-[10px] mt-1">{t('phoneRequired')}</div>
      )}
      {!showError && !showIncomplete && hint && (
        <div className="text-text-muted text-[10px] mt-1">{hint}</div>
      )}
    </div>
  );
}

export const FormField = {
  Input: InputField,
  Date: DateInputField,
  Select: SelectField,
  Textarea: TextareaField,
  Label: FieldLabel,
  Phone: PhoneField,
};
