'use client';

import * as React from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@precision/ui';
import { createClient as createBrowserClient } from '@precision-medical/auth/client';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';

export function LoginForm(): React.ReactElement {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(t('invalidCredentials'));
        return;
      }

      void fetch('/api/auth/record-login', { method: 'POST' });
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError(t('invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email */}
      <div className="space-y-1.5">
        <label className="block text-small font-semibold text-text-2">
          {t('email')}
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@precisionmedicalcare.com"
            className="pl-9"
            required
            autoComplete="email"
            error={!!error}
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label className="block text-small font-semibold text-text-2">
          {t('password')}
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <Input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="px-9"
            required
            autoComplete="current-password"
            error={!!error}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-2 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-small text-rose animate-fade-in">{error}</p>
      )}

      {/* Submit */}
      <Button type="submit" className="w-full" loading={loading} size="lg">
        {loading ? t('signingIn') : t('signIn')}
      </Button>

      {/* Forgot password */}
      <div className="text-center">
        <button
          type="button"
          className="text-small text-text-3 hover:text-brand transition-colors"
        >
          {t('forgotPassword')}
        </button>
      </div>
    </form>
  );
}
