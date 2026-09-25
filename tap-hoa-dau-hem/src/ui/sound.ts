/**
 * Âm thanh tổng hợp bằng WebAudio (không cần file): tiếng bấm, "ting" két tiền, lên cấp và nhạc nền nhẹ.
 * AudioContext chỉ được tạo sau thao tác đầu tiên của người chơi (yêu cầu của trình duyệt).
 */
export type Sfx = 'tap' | 'pick' | 'wrong' | 'cash' | 'coin' | 'levelup' | 'door' | 'error' | 'step' | 'bill';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let musicTimer: number | null = null;
let musicStep = 0;

function audio(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.12): void {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function play(s: Sfx): void {
  if (!enabled) return;
  switch (s) {
    case 'tap':
      tone(660, 0, 0.05, 'square', 0.06);
      break;
    case 'pick':
      tone(880, 0, 0.06, 'triangle', 0.15);
      tone(1175, 0.05, 0.08, 'triangle', 0.12);
      break;
    case 'bill':
      tone(520, 0, 0.04, 'triangle', 0.1);
      break;
    case 'wrong':
      tone(220, 0, 0.12, 'sawtooth', 0.08);
      tone(180, 0.1, 0.16, 'sawtooth', 0.08);
      break;
    case 'error':
      tone(300, 0, 0.1, 'square', 0.08);
      tone(200, 0.1, 0.2, 'square', 0.08);
      break;
    case 'cash':
      tone(1568, 0, 0.12, 'triangle', 0.16);
      tone(2093, 0.08, 0.3, 'triangle', 0.14);
      break;
    case 'coin':
      tone(1319, 0, 0.06, 'square', 0.08);
      tone(1760, 0.06, 0.15, 'square', 0.08);
      break;
    case 'levelup':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.2, 'triangle', 0.14));
      break;
    case 'door':
      tone(988, 0, 0.15, 'sine', 0.12);
      tone(784, 0.15, 0.25, 'sine', 0.12);
      break;
    case 'step':
      tone(120, 0, 0.03, 'triangle', 0.05);
      break;
  }
}

/** Giai điệu ngũ cung lặp đi lặp lại, rất nhỏ. */
const MELODY = [523, 0, 587, 659, 0, 784, 659, 587, 523, 0, 440, 523, 587, 0, 523, 0];
const BASS = [131, 131, 147, 147, 165, 165, 147, 147];

export function startMusic(): void {
  if (musicTimer !== null || !enabled) return;
  musicTimer = window.setInterval(() => {
    const n = MELODY[musicStep % MELODY.length];
    if (n) tone(n, 0, 0.22, 'triangle', 0.035);
    if (musicStep % 2 === 0) tone(BASS[(musicStep / 2) % BASS.length], 0, 0.3, 'sine', 0.05);
    musicStep++;
  }, 280);
}

export function stopMusic(): void {
  if (musicTimer !== null) window.clearInterval(musicTimer);
  musicTimer = null;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (!on) stopMusic();
}

export function vibrate(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* không hỗ trợ */
  }
}
