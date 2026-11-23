/**
 * Motion tokens — the timing every transition names.
 *
 * A brand chooses a personality and a speed; durations, curves, springs,
 * stagger gaps and travel distances are derived here.
 *
 * Springs are described physically and also baked into a CSS `linear()`
 * easing with their own duration, so a compiled page can run a spring with
 * no script. Interruptible transitions read the physical values instead.
 */
import { z } from 'zod';

export const MOTION_PERSONALITIES = ['calm', 'lively', 'expressive'] as const;
export type MotionPersonality = (typeof MOTION_PERSONALITIES)[number];

export const MotionInputsSchema = z.strictObject({
  personality: z.enum(MOTION_PERSONALITIES).default('calm'),
  speed: z.number().min(0.75).max(1.25).default(1),
});
export type MotionInputs = z.infer<typeof MotionInputsSchema>;

export const DURATION_NAMES = ['instant', 'fast', 'base', 'slow', 'scene'] as const;
export const EASING_NAMES = ['standard', 'enter', 'exit', 'emphasis'] as const;
export const SPRING_NAMES = ['snappy', 'gentle', 'bouncy'] as const;
export const STAGGER_NAMES = ['tight', 'base', 'loose'] as const;
export const DISTANCE_NAMES = ['near', 'far'] as const;
export type DurationName = (typeof DURATION_NAMES)[number];
export type EasingName = (typeof EASING_NAMES)[number];
export type SpringName = (typeof SPRING_NAMES)[number];
export type StaggerName = (typeof STAGGER_NAMES)[number];
export type DistanceName = (typeof DISTANCE_NAMES)[number];

export type Bezier = readonly [number, number, number, number];

/** A spring by its physics. dampingRatio of 1 settles with no overshoot; below 1 it bounces. */
export interface Spring {
  stiffness: number;
  dampingRatio: number;
  mass: number;
}

interface Personality {
  duration: Record<Exclude<DurationName, 'instant'>, number>;
  easing: Record<EasingName, Bezier>;
  spring: Record<SpringName, Spring>;
  stagger: Record<StaggerName, number>;
  distance: Record<DistanceName, number>;
}

const PERSONALITIES: Record<MotionPersonality, Personality> = {
  calm: {
    duration: { fast: 140, base: 220, slow: 360, scene: 700 },
    easing: { standard: [0.2, 0, 0, 1], enter: [0, 0, 0.2, 1], exit: [0.4, 0, 1, 1], emphasis: [0.65, 0, 0.35, 1] },
    spring: {
      snappy: { stiffness: 400, dampingRatio: 1, mass: 1 },
      gentle: { stiffness: 170, dampingRatio: 1, mass: 1 },
      bouncy: { stiffness: 260, dampingRatio: 0.82, mass: 1 },
    },
    stagger: { tight: 30, base: 60, loose: 100 },
    distance: { near: 4, far: 12 },
  },
  lively: {
    duration: { fast: 160, base: 260, slow: 440, scene: 900 },
    easing: { standard: [0.2, 0, 0, 1], enter: [0.22, 1, 0.36, 1], exit: [0.55, 0, 1, 0.45], emphasis: [0.83, 0, 0.17, 1] },
    spring: {
      snappy: { stiffness: 500, dampingRatio: 0.86, mass: 1 },
      gentle: { stiffness: 200, dampingRatio: 0.9, mass: 1 },
      bouncy: { stiffness: 300, dampingRatio: 0.65, mass: 1 },
    },
    stagger: { tight: 40, base: 80, loose: 140 },
    distance: { near: 6, far: 16 },
  },
  expressive: {
    duration: { fast: 180, base: 320, slow: 560, scene: 1200 },
    easing: { standard: [0.2, 0, 0, 1], enter: [0.16, 1, 0.3, 1], exit: [0.7, 0, 0.84, 0], emphasis: [0.7, 0, 0.2, 1] },
    spring: {
      snappy: { stiffness: 520, dampingRatio: 0.75, mass: 1 },
      gentle: { stiffness: 180, dampingRatio: 0.8, mass: 1 },
      bouncy: { stiffness: 320, dampingRatio: 0.5, mass: 1 },
    },
    stagger: { tight: 50, base: 100, loose: 180 },
    distance: { near: 8, far: 24 },
  },
};

/** The CSS custom-property prefix all tokens use. */
export const CSS_VAR_PREFIX = '--impkt';

/** Turn a dot-separated token path into a CSS custom-property name. */
export const cssVarName = (path: string): string => `${CSS_VAR_PREFIX}-${path.replace(/\./g, '-')}`;

/** A spring's position (0→1) at time t (seconds). */
export function springAt(spring: Spring, t: number): number {
  const { stiffness: k, dampingRatio: z, mass: m } = spring;
  const w0 = Math.sqrt(k / m);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/** How long a spring takes to settle, in ms. */
export function springDuration(spring: Spring, tolerance = 0.001): number {
  const step = 1 / 240;
  let last = 0;
  for (let t = 0; t < 10; t += step) if (Math.abs(1 - springAt(spring, t)) > tolerance) last = t;
  return Math.ceil((last + step) * 1000);
}

/** A spring baked into a CSS `linear()` easing and the duration it runs over. */
export function springToLinear(spring: Spring, points = 40): { easing: string; durationMs: number } {
  const durationMs = springDuration(spring);
  const values: string[] = [];
  for (let i = 0; i <= points; i += 1) {
    const v = i === points ? 1 : springAt(spring, (durationMs / 1000) * (i / points));
    values.push(String(Math.round(v * 10000) / 10000));
  }
  return { easing: `linear(${values.join(', ')})`, durationMs };
}

/** Scale a spring's speed: stiffness scales by speed². */
export function scaleSpring(spring: Spring, speed: number): Spring {
  return { ...spring, stiffness: spring.stiffness * speed * speed };
}

export interface ResolvedMotion {
  personality: MotionPersonality;
  speed: number;
  duration: Record<DurationName, number>;
  easing: Record<EasingName, Bezier>;
  spring: Record<SpringName, Spring>;
  stagger: Record<StaggerName, number>;
  /** In px, after the spacing unit is applied. */
  distance: Record<DistanceName, number>;
}

export function resolveMotion(input: Partial<MotionInputs> | undefined, spaceBase = 4): ResolvedMotion {
  const { personality, speed } = MotionInputsSchema.parse(input ?? {});
  const p = PERSONALITIES[personality];
  const scaled = <K extends string>(r: Record<K, number>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v as number) / speed])) as Record<K, number>;
  return {
    personality,
    speed,
    duration: { instant: 0, ...scaled(p.duration) },
    easing: p.easing,
    spring: Object.fromEntries(Object.entries(p.spring).map(([k, s]) => [k, scaleSpring(s as Spring, speed)])) as Record<SpringName, Spring>,
    stagger: scaled(p.stagger),
    distance: Object.fromEntries(Object.entries(p.distance).map(([k, steps]) => [k, (steps as number) * spaceBase])) as Record<DistanceName, number>,
  };
}

/** Motion as flat CSS custom-property values. Pass to your stylesheet to activate token-based timing. */
export function motionTokensToCss(input: Partial<MotionInputs> | undefined, spaceBase = 4): Record<string, string> {
  const m = resolveMotion(input, spaceBase);
  const tokens: Record<string, string> = {};
  const ms = (n: number) => `${Math.round(n)}ms`;
  const bezier = (b: Bezier) => `cubic-bezier(${b.join(', ')})`;

  for (const name of DURATION_NAMES) tokens[cssVarName(`motion.duration.${name}`)] = ms(m.duration[name]);
  for (const name of EASING_NAMES) tokens[cssVarName(`motion.easing.${name}`)] = bezier(m.easing[name]);
  for (const name of SPRING_NAMES) {
    const { easing, durationMs } = springToLinear(m.spring[name]);
    tokens[cssVarName(`motion.spring.${name}.easing`)] = easing;
    tokens[cssVarName(`motion.spring.${name}.duration`)] = ms(durationMs);
  }
  for (const name of STAGGER_NAMES) tokens[cssVarName(`motion.stagger.${name}`)] = ms(m.stagger[name]);
  for (const name of DISTANCE_NAMES) tokens[cssVarName(`motion.distance.${name}`)] = `${m.distance[name]}px`;
  return tokens;
}

/**
 * A `<style>` tag content that declares all motion tokens at `:root`.
 *
 * Drop this into your document head next to your brand's other tokens, or
 * call `injectMotionTokens()` to do it programmatically.
 */
export function motionTokensStylesheet(input?: Partial<MotionInputs>, spaceBase = 4): string {
  const tokens = motionTokensToCss(input, spaceBase);
  const decls = Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `:root {\n${decls}\n}`;
}

/** Inject motion tokens into the document as a `<style>` element. Call once per page load. */
export function injectMotionTokens(input?: Partial<MotionInputs>, spaceBase = 4): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('impkt-motion-tokens');
  const el = existing ?? document.createElement('style');
  el.id = 'impkt-motion-tokens';
  el.textContent = motionTokensStylesheet(input, spaceBase);
  if (!existing) document.head.appendChild(el);
}
