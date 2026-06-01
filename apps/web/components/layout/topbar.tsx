'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@precision/ui';
import { Button, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@precision/ui';
import { useTheme } from '@/components/providers/theme-provider';
import { Bell, Search, Moon, Sun, User, KeyRound, LogOut, Eye, EyeOff, Zap, Copy } from 'lucide-react';
import { api as trpc } from '@/lib/trpc/client';
import { createClient as createSupabaseClient } from '@precision-medical/auth/client';
import { NotificationsDrawer } from './notifications-drawer';
import { CommandPalette } from './command-palette';
import { toast } from 'sonner';
import { clearSessionGuard } from '@/lib/useSessionGuard';

interface TopbarProps {
  onMenuClick: () => void;
  userName?: string;
  userRole?: string;
  userEmail?: string;
  avatarUrl?: string;
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
  // `onMenuClick` queda en la API por compatibilidad, pero en movil el
  // bottom nav maneja la apertura del drawer y en desktop el sidebar
  // siempre esta visible. No se usa internamente.
  onMenuClick: _onMenuClick,
  userName  = 'Erick Salinas',
  userRole  = 'Super Admin',
  userEmail = '',
  avatarUrl,
}: TopbarProps): React.ReactElement {
  const t      = useTranslations();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const [time,        setTime]        = useState('');
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [cmdOpen,     setCmdOpen]     = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwOpen,      setPwOpen]      = useState(false);
  const [newPw,       setNewPw]       = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [showNew,     setShowNew]     = useState(false);
  const [showConf,    setShowConf]    = useState(false);
  const [pwLoading,   setPwLoading]   = useState(false);
  const [pwError,     setPwError]     = useState('');

  const menuRef = useRef<HTMLDivElement>(null);

  const { data: unreadCount = 0 } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const { data: me } = trpc.users.me.useQuery();

  useEffect(() => {
    if (!me?.preferredLocale) return;
    const dbLocale = me.preferredLocale as 'es' | 'en';
    const cookieLocale = document.cookie
      .split('; ')
      .find((row) => row.startsWith('locale='))
      ?.split('=')[1] as 'es' | 'en' | undefined;
    if (dbLocale !== cookieLocale) {
      document.cookie = `locale=${dbLocale};path=/;max-age=31536000`;
      window.location.reload();
    }
  }, [me?.preferredLocale]);

  useEffect(() => {
    const update = (): void => {
      const now = new Date();
      setTime(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(true); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [menuOpen]);

  const handleLogout = async (): Promise<void> => {
    clearSessionGuard();
    await fetch('/api/auth/signout');
    router.push('/login');
    router.refresh();
  };

  const openPwModal = () => {
    setNewPw(''); setConfirmPw(''); setShowNew(false); setShowConf(false); setPwError('');
    setMenuOpen(false); setPwOpen(true);
  };

  const suggestPassword = () => {
    const pw = generateSecurePassword();
    setNewPw(pw); setConfirmPw(pw); setShowNew(true); setShowConf(true);
  };

  const copyPassword = () => {
    void navigator.clipboard.writeText(newPw);
    toast.success('Contraseña copiada');
  };

  const handlePasswordChange = async (): Promise<void> => {
    if (!newPw)               return setPwError('Ingresa una nueva contraseña');
    if (newPw.length < 8)     return setPwError('Mínimo 8 caracteres');
    if (newPw !== confirmPw)  return setPwError('Las contraseñas no coinciden');
    setPwLoading(true); setPwError('');
    const supabase = createSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwLoading(false);
    if (error) return setPwError(error.message);
    toast.success('Contraseña actualizada correctamente');
    setPwOpen(false);
  };

  const initials = userName
    .split(' ').filter(Boolean).slice(0, 2)
    .map((n) => n.charAt(0)).join('').toUpperCase();

  const menuItemCls = 'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left';

  return (
    <>
      <header className="sticky top-0 z-sticky flex h-14 items-center gap-3 border-b border-border bg-bg-0/80 px-4 backdrop-blur-md">
        {/* Hamburger removido en movil — el bottom nav tiene el slot
            "Mas" que abre el drawer. En desktop el sidebar es fijo y no
            necesita toggle, asi que el boton no se renderiza nunca.
            Mantenemos onMenuClick como prop por compatibilidad. */}

        <button
          onClick={() => setCmdOpen(true)}
          className="flex h-8 flex-1 max-w-xs items-center gap-2 rounded border border-border bg-surface px-3 text-small text-text-muted hover:border-border-strong transition-colors"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span>{t('common.search')}...</span>
          <span className="ml-auto font-mono text-tiny text-text-muted border border-border rounded px-1">⌘K</span>
        </button>

        <div className="sm:flex-1" />

        {/* Clock */}
        <div
          className="hidden items-center gap-2 h-8 rounded-xl border px-3 sm:flex"
          style={{ background: 'rgba(6,182,212,0.08)', borderColor: 'rgba(6,182,212,0.20)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-cyan animate-pulse" style={{ boxShadow: '0 0 8px #06B6D4' }} />
          <span className="font-mono text-[12px] font-semibold text-cyan tracking-wide">{time}</span>
        </div>

        {/* Notifications */}
        <button
          onClick={() => setNotifOpen(true)}
          className="relative flex h-8 w-8 items-center justify-center rounded border border-border bg-surface text-text-2 hover:border-border-strong hover:text-text-1 transition-all"
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose text-[9px] font-bold text-white px-0.5"
              style={{ boxShadow: '0 0 8px rgba(244,63,94,0.6)' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Theme toggle */}
        <div className="hidden items-center gap-0.5 p-1 rounded-xl border border-border bg-surface h-8 sm:flex">
          <button
            onClick={() => theme !== 'dark' && toggleTheme()}
            className={cn('flex h-6 w-7 items-center justify-center rounded-[8px] transition-all', theme === 'dark' ? 'bg-gradient-brand text-white shadow-sm' : 'text-text-3 hover:text-text-1')}
            aria-label="Modo oscuro"
          ><Moon className="h-3 w-3" /></button>
          <button
            onClick={() => theme !== 'light' && toggleTheme()}
            className={cn('flex h-6 w-7 items-center justify-center rounded-[8px] transition-all', theme === 'light' ? 'bg-gradient-brand text-white shadow-sm' : 'text-text-3 hover:text-text-1')}
            aria-label="Modo claro"
          ><Sun className="h-3 w-3" /></button>
        </div>

        {/* Avatar + dropdown */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border bg-surface px-2 py-1 transition-all cursor-pointer',
              menuOpen ? 'border-brand/50 bg-brand/[0.06]' : 'border-border hover:border-border-strong',
            )}
          >
            <div className="relative shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gradient-brand text-xs font-bold text-white overflow-hidden">
                {avatarUrl ? <img src={avatarUrl} alt={userName} className="h-8 w-8 object-cover" /> : initials}
              </div>
              <span className="absolute -bottom-px -right-px h-[9px] w-[9px] rounded-full bg-emerald border-2 border-bg-0" style={{ boxShadow: '0 0 6px #10B981' }} />
            </div>
            <div className="hidden flex-col sm:flex">
              <span className="text-small font-semibold text-text-1 leading-none">{userName}</span>
              <span className="text-tiny text-text-3 leading-none mt-0.5">{userRole}</span>
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-56 rounded-xl border border-border bg-bg-1 shadow-xl overflow-hidden animate-fade-in">
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-sm font-semibold text-text-1 truncate">{userName}</p>
                <p className="text-xs text-text-3 truncate">{userEmail}</p>
              </div>
              <div className="py-1">
                <button
                  className={cn(menuItemCls, 'text-text-2 hover:bg-surface hover:text-text-1')}
                  onClick={() => { setMenuOpen(false); setProfileOpen(true); }}
                >
                  <User className="h-3.5 w-3.5 text-brand shrink-0" />
                  Ver perfil
                </button>
                <button
                  className={cn(menuItemCls, 'text-text-2 hover:bg-surface hover:text-text-1')}
                  onClick={openPwModal}
                >
                  <KeyRound className="h-3.5 w-3.5 text-amber shrink-0" />
                  Cambiar contraseña
                </button>
              </div>
              <div className="border-t border-border py-1">
                <button
                  className={cn(menuItemCls, 'text-rose hover:bg-rose/[0.08]')}
                  onClick={() => { setMenuOpen(false); void handleLogout(); }}
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Perfil modal ── */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mi perfil</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-3">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-brand text-2xl font-bold text-white shadow-glow overflow-hidden">
              {avatarUrl ? <img src={avatarUrl} alt={userName} className="h-20 w-20 object-cover" /> : initials}
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-text-1">{userName}</p>
              <span className="mt-1 inline-block rounded-full bg-brand/10 px-3 py-0.5 text-xs font-semibold text-brand border border-brand/20">
                {userRole}
              </span>
            </div>
            <div className="w-full rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-text-3 mb-0.5">Correo electrónico</p>
              <p className="text-sm text-text-1 font-medium">{userEmail || '—'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProfileOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cambiar contraseña modal ── */}
      <Dialog
        open={pwOpen}
        onOpenChange={open => {
          if (!open) { setPwError(''); setNewPw(''); setConfirmPw(''); }
          setPwOpen(open);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <button
              type="button"
              onClick={suggestPassword}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand/[0.07] py-2.5 text-sm font-semibold text-brand hover:bg-brand/[0.12] transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Sugerir contraseña segura
            </button>

            <div className="space-y-1.5">
              <Label>Nueva contraseña</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showNew ? 'text' : 'password'}
                    value={newPw}
                    onChange={e => { setNewPw(e.target.value); setPwError(''); }}
                    placeholder="••••••••••••••••"
                    className="pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2"
                  >
                    {showNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {newPw && (
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-3 hover:text-text-1 transition-colors"
                    title="Copiar"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Confirmar contraseña</Label>
              <div className="relative">
                <Input
                  type={showConf ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={e => { setConfirmPw(e.target.value); setPwError(''); }}
                  placeholder="••••••••••••••••"
                  className="pr-9 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowConf(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2"
                >
                  {showConf ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {pwError && <p className="text-xs text-rose-500">{pwError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handlePasswordChange()} disabled={pwLoading}>
              {pwLoading ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
