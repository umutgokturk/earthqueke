'use client';

import { create } from 'zustand';
import type { Earthquake } from '@ils/types';

export interface Toast {
  id: string;
  title: string;
  event?: Earthquake;
  body?: string;
  tone?: 'info' | 'warn';
}

interface ToastState {
  toasts: Toast[];
  push(toast: Omit<Toast, 'id'>): void;
  dismiss(id: string): void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) =>
    set((s) => ({
      toasts: [...s.toasts.slice(-3), { ...toast, id: `t-${Date.now()}-${counter++}` }],
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
