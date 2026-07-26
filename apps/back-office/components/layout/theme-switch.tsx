'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

interface Props {
  className?: string;
}

export function ThemeSwitch({ className }: Props) {
  const [theme,   setTheme]   = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('pm_theme');
    const initial = saved === 'light' ? 'light' : 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('pm_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`p-2 rounded-lg hover:bg-white/[0.06] text-text-muted hover:text-text-1 transition-colors ${className ?? ''}`}
    >
      {mounted
        ? (theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />)
        : <Moon className="w-4 h-4" />}
    </button>
  );
}
