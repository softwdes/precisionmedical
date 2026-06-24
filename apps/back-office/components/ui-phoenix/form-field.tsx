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

function InputField({
  label, required, value, onChange, placeholder, type = 'text', autoFocus, hint, maxLength,
}: Required & {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  hint?: React.ReactNode;
  maxLength?: number;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        autoFocus={autoFocus}
        maxLength={maxLength}
      />
      {hint && <div className="text-text-muted text-[10px] mt-1">{hint}</div>}
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
// Validates: 10 digits, area code 2-9, exchange 2-9 (US NANP rules).

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
  label, required, value, onChange, placeholder = '(801) 555-0100', hint, autoFocus,
}: Required & {
  label: React.ReactNode;
  value: string;
  onChange: (v: string, isValid: boolean) => void;
  placeholder?: string;
  hint?: React.ReactNode;
  autoFocus?: boolean;
}) {
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
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={showError || showIncomplete ? 'border-rose focus:border-rose' : ''}
        maxLength={14}
        inputMode="numeric"
      />
      {showError && (
        <div className="text-rose text-[10px] mt-1">Número inválido · debe ser 10 dígitos US (ej: (801) 555-0100)</div>
      )}
      {showIncomplete && !showError && (
        <div className="text-rose text-[10px] mt-1">Teléfono requerido</div>
      )}
      {!showError && !showIncomplete && hint && (
        <div className="text-text-muted text-[10px] mt-1">{hint}</div>
      )}
    </div>
  );
}

export const FormField = {
  Input: InputField,
  Select: SelectField,
  Textarea: TextareaField,
  Label: FieldLabel,
  Phone: PhoneField,
};
