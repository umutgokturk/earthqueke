'use client';

/** Tiny synth blip for new events — no audio asset required. Default OFF. */
let ctx: AudioContext | null = null;

export function playBlip(magnitude = 2): void {
  try {
    if (typeof window === 'undefined') return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = ctx ?? new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const base = magnitude >= 4 ? 660 : 880;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base / 2, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  } catch {
    /* audio is best-effort */
  }
}
