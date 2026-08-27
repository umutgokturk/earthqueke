'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Card } from '@ils/ui';
import { api, adminMutation, ApiError } from '@/lib/api';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/sources', label: 'Data Sources' },
  { href: '/admin/ingestion', label: 'Ingestion' },
  { href: '/admin/faults', label: 'Faults' },
  { href: '/admin/system', label: 'System Logs' },
];

export function useAdminMe() {
  return useQuery({
    queryKey: ['adminMe'],
    queryFn: () => api<{ ok: boolean; user: { username: string } }>('/api/admin/me'),
    retry: false,
    staleTime: 60_000,
  });
}

function LoginForm() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => adminMutation('/api/admin/login', 'POST', { username, password }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['adminMe'] }),
  });

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <Card className="p-6">
        <h1 className="text-sm font-extrabold tracking-[0.18em] text-txt">ADMIN GİRİŞİ</h1>
        <p className="mt-1 text-xs text-txt-mute">Yönetim paneli oturum gerektirir.</p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <label className="block text-[10px] font-bold uppercase tracking-widest text-txt-mute">
            Kullanıcı adı
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="mt-1 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-txt focus:border-accent/60 focus:outline-none"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-txt-mute">
            Şifre
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-txt focus:border-accent/60 focus:outline-none"
            />
          </label>
          {login.isError && (
            <p className="text-xs text-status-bad">
              {login.error instanceof ApiError ? login.error.message : 'Giriş başarısız.'}
            </p>
          )}
          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-md border border-accent/60 bg-accent-soft px-4 py-2 text-sm font-bold text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {login.isPending ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>
      </Card>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useAdminMe();
  const logout = useMutation({
    mutationFn: () => adminMutation('/api/admin/logout', 'POST'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['adminMe'] }),
  });

  if (isLoading) return <p className="mt-16 text-center text-xs text-txt-mute">Oturum kontrol ediliyor…</p>;
  if (isError || !data?.ok) return <LoginForm />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-sm font-extrabold tracking-[0.18em] text-txt">ADMIN PANEL</h1>
        <div className="flex items-center gap-3 text-xs text-txt-mute">
          <span>{data.user.username}</span>
          <button onClick={() => logout.mutate()} className="rounded-md border border-line px-3 py-1 font-semibold text-txt-soft hover:bg-ink-700">
            Çıkış
          </button>
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Admin menü">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'rounded-t-md px-4 py-2 text-[11px] font-bold tracking-widest',
              pathname === item.href
                ? 'border border-b-0 border-line bg-ink-800 text-accent'
                : 'text-txt-mute hover:text-txt-soft',
            )}
          >
            {item.label.toUpperCase()}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
