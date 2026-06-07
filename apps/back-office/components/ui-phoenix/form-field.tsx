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

export const FormField = {
  Input: InputField,
  Select: SelectField,
  Textarea: TextareaField,
  Label: FieldLabel,
};
