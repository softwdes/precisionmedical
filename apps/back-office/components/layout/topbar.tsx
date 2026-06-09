'use client';

import { useEffect, useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Bell, Search, Moon, Sun, Menu, User, KeyRound, LogOut, Eye, EyeOff, Copy, Zap } from 'lucide-react';
import { CommandPalette } from './command-palette';
import { useTransitionProgress } from './navigation-progress';
import { createClient } from '@precision-medical/auth/client';

interface TopbarProps {
  userName?:     string;
  userRole?:     string;
  userInitials?: string;
  userEmail?:    string;
  onMenuClick?:  () => void;
}

function generateSecurePassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const symbols = '!@#$%&*_+-=';
  const all     = upper + lower + digits + symbols;
  const base = [
    upper  [Math.floor(Math.random() * upper.length)],
    upper  [Math.floor(Math.random() * upper.length)],
    lower  [Math.floor(Math.random() * lower.length)],
    lower  [Math.floor(Math.random() * lower.length)],
    digits [Math.floor(Math.random() * digits.length)],
    digits [Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];
  while (base.length < 16) base.push(all[Math.floor(Math.random() * all.length)]);
  return base.sort(() => Math.random() - 0.5).join('');
}

export function Topbar({
  userName     = 'Erick Salinas',
  userRole     = 'Super Admin',
  userInitials = 'ES',
  userEmail    = '',
  onMenuClick,
}: TopbarProps): React.ReactElement {
  const router       = useRouter();
  const currentLocale = useLocale();
  const t            = useTranslations('phoenix.topbar');

  const [time,        setTime]        = useState('');
  const [theme,       setTheme]       = useState<'dark' | 'light'>('dark');
  const [mounted,     setMounted]     = useState(false);
  const [cmdOpen,     setCmdOpen]     = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwOpen,      setPwOpen]      = useState(false);
  const [pendingLocale, setPendingLocale] = useState<'en' | 'es' | null>(null);
  const [isPending,   startTransition] = useTransition();

  // Cambiar contraseña state
  const [newPw,     setNewPw]     = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew,   setShowNew]   = useState(false);
  const [showConf,  setShowConf]  = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError,   setPwError]   = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const switchingLocale = isPending && pendingLocale !== null;

  useTransitionProgress(isPending);

  // Sync pendingLocale cuando el RSC re-render trae el locale actualizado
  useEffect(() => {
    if (pendingLocale && currentLocale === pendingLocale) setPendingLocale(null);
  }, [currentLocale, pendingLocale]);

  // Reloj
  useEffect(() => {
    const update = (): void => {
      const now = new Date();
      setTime(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen(v => !v); }
      if (e.key === 'Escape') setCmdOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Theme init
  useEffect(() => {
    setMounted(true);
    const saved = typeof window !== 'undefined' ? localStorage.getItem('pm_theme') : null;
    setTheme(saved === 'light' ? 'light' : 'dark');
  }, []);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('pm_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const setLocale = (next: 'en' | 'es'): void => {
    if (next === currentLocale || switchingLocale) return;
    setPendingLocale(next);
    document.cookie = `locale=${next};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    startTransition(() => { router.refresh(); });
  };

  const handleLogout = async (): Promise<void> => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const openPwModal = (): void => {
    setNewPw(''); setConfirmPw(''); setShowNew(false); setShowConf(false);
    setPwError(''); setPwSuccess(false);
    setMenuOpen(false); setPwOpen(true);
  };

  const suggestPassword = (): void => {
    const pw = generateSecurePassword();
    setNewPw(pw); setConfirmPw(pw); setShowNew(true); setShowConf(true);
  };

  const copyPassword = (): void => {
    void navigator.clipboard.writeText(newPw);
  };

  const handlePasswordChange = async (): Promise<void> => {
    if (!newPw)              return setPwError('Ingresa una nueva contraseña');
    if (newPw.length < 8)    return setPwError('Mínimo 8 caracteres');
    if (newPw !== confirmPw) return setPwError('Las contraseñas no coinciden');
    setPwLoading(true); setPwError('');
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwLoading(false);
    if (error) return setPwError(error.message);
    setPwSuccess(true);
    setTimeout(() => setPwOpen(false), 1500);
  };

  const displayedLocale = pendingLocale ?? currentLocale;

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 sm:gap-4 border-b border-border bg-bg-0/80 backdrop-blur-md px-3 sm:px-6">
        {/* Mobile menu */}
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search — mobile: icono / desktop: barra */}
        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          className="sm:hidden w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2 hover:text-text-1 transition-colors"
          aria-label={t('search')}
        >
          <Search className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          className="hidden sm:flex items-center gap-2 flex-1 max-w-md bg-bg-2 border border-border rounded-lg px-3 py-2 text-text-muted text-sm hover:border-border-strong transition-colors group"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left truncate">{t('search')}</span>
          <kbd className="text-[10px] font-mono bg-bg-3 border border-border px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>

        <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />

        <div className="flex-1 sm:hidden" />
        <div className="hidden lg:block flex-1" />

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Reloj */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-2 border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
            <span className="font-mono text-xs text-text-2 tabular-nums">{time}</span>
          </div>

          {/* Language toggle */}
          <div
            className="inline-flex items-center h-9 p-0.5 rounded-md bg-bg-2 border border-border"
            role="group"
            aria-label={t('switchLanguage')}
            aria-busy={switchingLocale}
          >
            {(['en', 'es'] as const).map((code) => {
              const active = displayedLocale === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code)}
                  disabled={switchingLocale}
                  aria-pressed={active}
                  className={`px-2.5 h-full min-w-[2.25rem] rounded text-[11px] font-bold uppercase tracking-wider transition-all disabled:cursor-not-allowed ${
                    active
                      ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm'
                      : 'text-text-muted hover:text-text-1'
                  }`}
                >
                  {code}
                </button>
              );
            })}
          </div>

          {/* Notificaciones */}
          <button
            type="button"
            className="relative w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2 hover:text-text-1 transition-colors"
            aria-label={t('notifications')}
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose text-white text-[9px] font-bold flex items-center justify-center">
              2
            </span>
          </button>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 rounded-md hover:bg-white/5 flex items-center justify-center text-text-2 hover:text-text-1 transition-colors"
            aria-label={t('switchTheme')}
          >
            {mounted ? (theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />) : <Moon className="w-4 h-4" />}
          </button>

          {/* Avatar + dropdown */}
          <div ref={menuRef} className="relative pl-2 sm:pl-3 ml-1 border-l border-border">
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              className={`flex items-center gap-2 sm:gap-3 rounded-xl border px-2 py-1 transition-all cursor-pointer ${
                menuOpen
                  ? 'border-amber-500/50 bg-amber-500/[0.06]'
                  : 'border-border hover:border-border-strong'
              }`}
            >
              <div className="hidden md:flex flex-col items-end leading-tight">
                <span className="text-sm text-text-1 font-semibold">{userName}</span>
                <span className="text-[10px] text-text-muted uppercase tracking-wider">{userRole}</span>
              </div>
              <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white text-xs font-bold shadow-sm overflow-hidden">
                {userInitials}
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald border-2 border-bg-0" />
              </div>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-56 rounded-xl border border-border bg-bg-1 shadow-xl overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="px-3 py-2.5 border-b border-border">
                  <p className="text-sm font-semibold text-text-1 truncate">{userName}</p>
                  <p className="text-xs text-text-3 truncate">{userEmail}</p>
                </div>
                {/* Items */}
                <div className="py-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-text-2 hover:bg-surface hover:text-text-1 transition-colors text-left"
                    onClick={() => { setMenuOpen(false); setProfileOpen(true); }}
                  >
                    <User className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    Ver perfil
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-text-2 hover:bg-surface hover:text-text-1 transition-colors text-left"
                    onClick={openPwModal}
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    Cambiar contraseña
                  </button>
                </div>
                <div className="border-t border-border py-1">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-rose hover:bg-rose/[0.08] transition-colors text-left"
                    onClick={() => { setMenuOpen(false); void handleLogout(); }}
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    Cerrar sesión
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Ver perfil modal ── */}
      {profileOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setProfileOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-1 shadow-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-border">
              <h2 className="text-[15px] font-bold text-text-1">Mi perfil</h2>
            </div>
            <div className="flex flex-col items-center gap-4 px-6 py-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-2xl font-bold text-white shadow-lg">
                {userInitials}
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-text-1">{userName}</p>
                <span className="mt-1 inline-block rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-0.5 text-xs font-semibold text-amber-400">
                  {userRole}
                </span>
              </div>
              <div className="w-full rounded-xl border border-border bg-surface px-4 py-3">
                <p className="text-xs text-text-3 mb-0.5">Correo electrónico</p>
                <p className="text-sm text-text-1 font-medium">{userEmail || '—'}</p>
              </div>
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-border">
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-text-2 hover:bg-surface transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cambiar contraseña modal ── */}
      {pwOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) { setPwOpen(false); } }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-1 shadow-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-border">
              <h2 className="text-[15px] font-bold text-text-1">Cambiar contraseña</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Sugerir contraseña */}
              <button
                type="button"
                onClick={suggestPassword}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] py-2.5 text-sm font-semibold text-amber-400 hover:bg-amber-500/[0.12] transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                Sugerir contraseña segura
              </button>

              {/* Nueva contraseña */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-2">Nueva contraseña</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPw}
                      onChange={e => { setNewPw(e.target.value); setPwError(''); }}
                      placeholder="••••••••••••••••"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-9 text-sm text-text-1 placeholder:text-text-muted font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2"
                    >
                      {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {newPw && (
                    <button
                      type="button"
                      onClick={copyPassword}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-3 hover:text-text-1 transition-colors"
                      title="Copiar"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Confirmar */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-2">Confirmar contraseña</label>
                <div className="relative">
                  <input
                    type={showConf ? 'text' : 'password'}
                    value={confirmPw}
                    onChange={e => { setConfirmPw(e.target.value); setPwError(''); }}
                    placeholder="••••••••••••••••"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 pr-9 text-sm text-text-1 placeholder:text-text-muted font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConf(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2"
                  >
                    {showConf ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {pwError   && <p className="text-xs text-rose">{pwError}</p>}
              {pwSuccess  && <p className="text-xs text-emerald font-medium">✓ Contraseña actualizada correctamente</p>}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <button
                type="button"
                onClick={() => { setPwOpen(false); }}
                className="px-4 py-2 rounded-lg border border-border text-sm text-text-2 hover:bg-surface transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handlePasswordChange()}
                disabled={pwLoading}
                className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {pwLoading ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
