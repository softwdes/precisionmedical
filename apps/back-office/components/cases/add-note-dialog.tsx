'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquarePlus, AlertCircle, Lock, Users } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Label,
} from '@precision/ui';

// Front Office · Agregar nota interna al caso.
// Phase 1A: authorName placeholder "Front Office". Phase 2 toma del user logueado.

interface AddNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  caseCode: string;
}

export function AddNoteDialog({ open, onOpenChange, caseId, caseCode }: AddNoteDialogProps) {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setContent('');
      setIsPrivate(true);
      setError(null);
    }
  }, [open]);

  const handleSave = async () => {
    setError(null);
    if (!content.trim()) return setError('La nota no puede estar vacía');
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cases/${caseId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), isPrivate }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar la nota');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-brand" />
            Agregar nota interna
          </DialogTitle>
          <DialogDescription>
            Nota interna del caso <code className="text-text-1 font-mono">{caseCode}</code>.
            Visible para el equipo · queda en el historial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div>
            <Label htmlFor="content">Nota</Label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-bg-2 border border-border rounded-md px-3 py-2 text-sm text-text-1 placeholder:text-text-muted focus:outline-none focus:border-brand min-h-[120px]"
              placeholder="Ej: paciente llamó pidiendo reagendar · prefiere viernes en la tarde..."
              autoFocus
              maxLength={5000}
            />
            <div className="text-text-muted text-[10px] mt-1 text-right">
              {content.length} / 5000
            </div>
          </div>

          <div>
            <Label>Visibilidad</Label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border transition-all text-sm ${
                  isPrivate
                    ? 'bg-brand/15 border-brand/40 text-brand font-semibold'
                    : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                Privada
              </button>
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border transition-all text-sm ${
                  !isPrivate
                    ? 'bg-brand/15 border-brand/40 text-brand font-semibold'
                    : 'bg-bg-2 border-border text-text-2 hover:border-border-strong'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Compartida
              </button>
            </div>
            <div className="text-text-muted text-[11px] mt-1.5">
              {isPrivate
                ? 'Solo visible para Front Office y Edson (administración interna).'
                : 'Visible para Doctor y todo el equipo clínico también.'}
            </div>
          </div>

          {error && (
            <div className="text-rose text-sm bg-rose/10 border border-rose/30 rounded-md px-3 py-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !content.trim()}>
            {saving ? 'Guardando...' : 'Guardar nota'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
