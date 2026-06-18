// Notificações client-side: som (Web Audio), toast in-app e notificação do
// navegador (quando a aba não está em foco). Sem dependências/assets externos.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** "Aquece" o áudio durante um gesto do usuário (autoplay policy dos browsers). */
export function primeAudio() {
  getCtx();
}

function tone(ctx: AudioContext, freq: number, startAt: number, dur: number, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startAt;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export function playSound(kind: NotifyKind) {
  const ctx = getCtx();
  if (!ctx) return;
  if (kind === 'order') {
    // Mais chamativo: campainha tripla ascendente
    tone(ctx, 660, 0, 0.18, 0.25);
    tone(ctx, 880, 0.2, 0.18, 0.25);
    tone(ctx, 1175, 0.4, 0.35, 0.28);
  } else {
    // Mensagem: dois toques curtos
    tone(ctx, 880, 0, 0.12, 0.18);
    tone(ctx, 1175, 0.14, 0.16, 0.18);
  }
}

export function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  try {
    if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  } catch {
    /* noop */
  }
}

export type NotifyKind = 'message' | 'order';

export interface NotifyInput {
  kind: NotifyKind;
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/** Dispara som + toast in-app + notificação do SO (se a aba não estiver em foco). */
export function notify(input: NotifyInput) {
  if (typeof window === 'undefined') return;

  playSound(input.kind);

  // Toast visual in-app (sempre)
  window.dispatchEvent(new CustomEvent('drop:toast', { detail: input }));

  // Notificação do sistema quando a aba está minimizada / em segundo plano
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const n = new Notification(input.title, {
        body: input.body,
        tag: input.tag || input.kind,
        icon: '/images/logog_png.png',
        badge: '/images/logog_png.png',
      });
      n.onclick = () => {
        try { window.focus(); } catch { /* noop */ }
        if (input.url) window.location.href = input.url;
        n.close();
      };
    }
  } catch {
    /* noop */
  }
}
