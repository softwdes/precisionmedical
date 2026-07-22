'use client';

import { Sparkles } from 'lucide-react';

// Floating AI assistant button — esquina inferior derecha.
// Phase 1A: solo botón visual. Phase 2+ abre panel de AI assist.
export function FloatingAI(): React.ReactElement {
  return (
    <button
      type="button"
      className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gradient-cifo shadow-glow flex items-center justify-center text-white hover:scale-110 transition-transform group"
      aria-label="AI Assistant"
    >
      <Sparkles className="w-5 h-5" />
      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber animate-pulse" />
      <span className="absolute right-full mr-3 px-3 py-1.5 rounded-md bg-bg-3 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-border">
        AI Assistant
      </span>
    </button>
  );
}
