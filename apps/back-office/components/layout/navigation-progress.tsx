'use client';

import * as React from 'react';
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

/**
 * NavigationProgress — barra global de 2px arriba con gradient brand.
 *
 * Se anima como NProgress: arranca rápido hasta 80% para dar sensación de
 * inmediatez, luego se mantiene "trickling" hasta que done() la dispara
 * al 100% y se desvanece.
 *
 * Uso:
 *   const { start, done } = useNavigationProgress();
 *   start();
 *   await doSomething();
 *   done();
 *
 * O envolviendo un useTransition (preferred):
 *   const [isPending, startTransition] = useTransition();
 *   useEffect(() => { if (isPending) start(); else done(); }, [isPending]);
 */

interface NavigationProgressContext {
  start: () => void;
  done: () => void;
  isActive: boolean;
}

const Ctx = createContext<NavigationProgressContext | null>(null);

export function useNavigationProgress(): NavigationProgressContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNavigationProgress must be used inside <NavigationProgressProvider>');
  return ctx;
}

export function NavigationProgressProvider({ children }: { children: React.ReactNode }) {
  const [activeCount, setActiveCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTrickle = useCallback(() => {
    if (trickleRef.current) {
      clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    setActiveCount((c) => c + 1);
  }, []);

  const done = useCallback(() => {
    setActiveCount((c) => Math.max(0, c - 1));
  }, []);

  // Cuando activeCount sube de 0 → 1: arrancar barra
  // Cuando vuelve a 0: completar al 100% y desvanecer
  useEffect(() => {
    if (activeCount > 0) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setVisible(true);
      setProgress(15); // arranque inmediato visible
      stopTrickle();
      // Trickle: avanza hacia 80% con incremento decreciente (Zeno)
      trickleRef.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 80) return p;
          // delta más chico cuanto más cerca de 80
          const delta = (80 - p) * 0.15;
          return Math.min(80, p + delta);
        });
      }, 150);
    } else {
      // Done: completar al 100% y luego desvanecer
      stopTrickle();
      setProgress(100);
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
        // Reset después del fade-out (200ms)
        setTimeout(() => setProgress(0), 250);
      }, 200);
    }

    return () => {
      stopTrickle();
    };
  }, [activeCount, stopTrickle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTrickle();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [stopTrickle]);

  return (
    <Ctx.Provider value={{ start, done, isActive: activeCount > 0 }}>
      <NavigationProgressBar progress={progress} visible={visible} />
      {children}
    </Ctx.Provider>
  );
}

function NavigationProgressBar({ progress, visible }: { progress: number; visible: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[60] h-[2px] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 250ms ease-out' }}
    >
      <div
        className="h-full bg-gradient-brand"
        style={{
          width: `${progress}%`,
          transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 0 12px rgba(99, 102, 241, 0.6), 0 0 6px rgba(99, 102, 241, 0.4)',
        }}
      />
    </div>
  );
}

/**
 * Hook helper: conecta un useTransition.isPending al NavigationProgress.
 *
 * const [isPending, startTransition] = useTransition();
 * useTransitionProgress(isPending);
 *
 * startTransition(() => router.refresh());
 */
export function useTransitionProgress(isPending: boolean): void {
  const { start, done } = useNavigationProgress();
  const wasActive = useRef(false);

  useEffect(() => {
    if (isPending && !wasActive.current) {
      wasActive.current = true;
      start();
    } else if (!isPending && wasActive.current) {
      wasActive.current = false;
      done();
    }
  }, [isPending, start, done]);
}
