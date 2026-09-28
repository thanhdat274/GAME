export type EaseFn = (t: number) => number;

const linear: EaseFn = (t) => t;
const quadIn: EaseFn = (t) => t * t;
const quadOut: EaseFn = (t) => t * (2 - t);
const quadInOut: EaseFn = (t) => ((t *= 2) < 1 ? 0.5 * t * t : -0.5 * (--t * (t - 2) - 1));
const cubicIn: EaseFn = (t) => t * t * t;
const cubicOut: EaseFn = (t) => --t * t * t + 1;
const cubicInOut: EaseFn = (t) => ((t *= 2) < 1 ? 0.5 * t * t * t : 0.5 * ((t -= 2) * t * t + 2));
const quartOut: EaseFn = (t) => 1 - --t * t * t * t;
const sineIn: EaseFn = (t) => (t === 0 ? 0 : t === 1 ? 1 : 1 - Math.cos((t * Math.PI) / 2));
const sineOut: EaseFn = (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.sin((t * Math.PI) / 2));
const sineInOut: EaseFn = (t) => (t === 0 ? 0 : t === 1 ? 1 : 0.5 * (1 - Math.cos(Math.PI * t)));
const backIn: EaseFn = (t) => t * t * ((1.70158 + 1) * t - 1.70158);
const backOut: EaseFn = (t) => --t * t * ((1.70158 + 1) * t + 1.70158) + 1;
const expoOut: EaseFn = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const bounceOut: EaseFn = (t) => {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
};

const EASES: Record<string, EaseFn> = {
  linear, 'power0': linear,
  'quad.easein': quadIn, 'quad.easeout': quadOut, 'quad.easeinout': quadInOut, 'power1': quadOut,
  'cubic.easein': cubicIn, 'cubic.easeout': cubicOut, 'cubic.easeinout': cubicInOut, 'power2': cubicOut,
  'quart.easeout': quartOut, 'power3': quartOut,
  'sine.easein': sineIn, 'sine.easeout': sineOut, 'sine.easeinout': sineInOut,
  'back.easein': backIn, 'back.easeout': backOut,
  'expo.easeout': expoOut,
  'bounce.easeout': bounceOut, 'bounce': bounceOut,
};

export function getEase(name: string | EaseFn | undefined): EaseFn {
  if (typeof name === 'function') return name;
  if (!name) return linear;
  return EASES[name.toLowerCase()] ?? linear;
}
