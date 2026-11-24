/**
 * Presets — saved motion blocks, copied into a node and then owned by it.
 *
 * Inserting a preset writes ordinary states and transitions onto the node.
 * An author can then retime it, add a state, or delete half of it, and
 * nothing links back. A preset can never be a ceiling.
 */
import { NodeMotionSchema, type NodeMotion } from './schemas';

type Input = Parameters<typeof NodeMotionSchema.parse>[0];

const enter = (hidden: Record<string, unknown>, timing: Record<string, unknown> = { spring: 'gentle' }): Input => ({
  initial: 'hidden',
  states: [{ id: 'hidden', name: 'Hidden', style: hidden }],
  transitions: [{ id: 'enter', from: 'hidden', to: 'rest', on: { input: 'view' }, with: timing }],
});

const enterOnLoad = (hidden: Record<string, unknown>, timing: Record<string, unknown> = { spring: 'gentle' }): Input => ({
  initial: 'hidden',
  states: [{ id: 'hidden', name: 'Hidden', style: hidden }],
  transitions: [{ id: 'enter', from: 'hidden', to: 'rest', on: { input: 'load' }, with: timing }],
});

export const PRESETS = {
  // ─── Scroll-triggered entrances ──────────────────────────────────────────

  /** Fades up a short distance as it scrolls into view. The workhorse. */
  rise: enter({ opacity: 0, y: 'distance.near' }),

  /** A plain fade, for things that should not travel. */
  fade: enter({ opacity: 0 }, { easing: 'standard', duration: 'base' }),

  /** Revealed from the bottom edge upwards, like a sheet being lifted. */
  'wipe-up': enter({ clip: 'bottom' }, { easing: 'emphasis', duration: 'slow' }),

  /** Revealed from the centre as a growing circle. */
  'iris-open': enter({ clip: 'circle' }, { easing: 'emphasis', duration: 'slow' }),

  /** Scales in from slightly small with a little bounce. For badges and counters. */
  'pop-in': enter({ opacity: 0, scale: 0.85 }, { spring: 'bouncy' }),

  /** Brought into focus from a blur. */
  'focus-in': enter({ opacity: 0, blur: 12 }, { easing: 'enter', duration: 'slow' }),

  /** A heading whose words rise in one after another. */
  'words-rise': enter({ opacity: 0, y: 'distance.near', text: 'words' }),

  /** Slides in from the left. */
  'slide-left': enter({ opacity: 0, x: 'distance.far' }, { spring: 'gentle' }),

  /** Slides in from the right. */
  'slide-right': enter({ opacity: 0, x: '-distance.far' }, { spring: 'gentle' }),

  /** Zooms in from slightly larger. Good for modals and overlays. */
  'zoom-in': enter({ opacity: 0, scale: 1.08 }, { easing: 'enter', duration: 'base' }),

  /** Zooms out from slightly smaller. For cards that feel farther away. */
  'zoom-out': enter({ opacity: 0, scale: 0.9 }, { easing: 'enter', duration: 'base' }),

  /** Fades in from a heavy blur — a dramatic reveal. */
  'blur-out': enter({ opacity: 0, blur: 24 }, { easing: 'enter', duration: 'slow' }),

  /** Characters rise in one after another. For impactful headlines. */
  'chars-rise': enter({ opacity: 0, y: 'distance.near', text: 'chars' }),

  // ─── Load-triggered ──────────────────────────────────────────────────────

  /** Rises on page load rather than scroll. For above-the-fold heroes. */
  'hero-rise': enterOnLoad({ opacity: 0, y: 'distance.far' }, { spring: 'gentle' }),

  /** Hero words rise on page load. */
  'hero-words': enterOnLoad({ opacity: 0, y: 'distance.near', text: 'words' }),

  // ─── Interactive states ───────────────────────────────────────────────────

  /** Lifts on hover with a shadow, and settles when the pointer leaves. */
  lift: {
    states: [{ id: 'hover', name: 'Hover', style: { y: '-space.1', shadow: 'raised' } }],
    transitions: [{ id: 'lift', from: 'rest', to: 'hover', on: { input: 'hover' }, with: { spring: 'snappy' }, reverse: true }],
  } satisfies Input,

  /** Squashes slightly while pressed. */
  press: {
    states: [{ id: 'pressed', name: 'Pressed', style: { scale: 0.96 } }],
    transitions: [{ id: 'press', from: '*', to: 'pressed', on: { input: 'press' }, with: { easing: 'standard', duration: 'instant' }, reverse: true }],
  } satisfies Input,

  /** Grows and glows on hover — for primary CTA buttons. */
  glow: {
    states: [{ id: 'hover', name: 'Hover', style: { scale: 1.03, shadow: 'glow' } }],
    transitions: [{ id: 'glow', from: 'rest', to: 'hover', on: { input: 'hover' }, with: { spring: 'snappy' }, reverse: true }],
  } satisfies Input,

  /** Shakes on press — for form errors or denied actions. */
  shake: {
    states: [{ id: 'shaking', name: 'Shaking', style: { x: 6, rotate: -1 } }],
    transitions: [{ id: 'shake', from: 'rest', to: 'shaking', on: { input: 'press' }, with: { easing: 'standard', duration: 'fast' }, reverse: true }],
  } satisfies Input,

  // ─── Exit animations ─────────────────────────────────────────────────────

  /** Fades out when `leave()` is called. Pair with `fade` or `hero-rise`. */
  'fade-out': {
    states: [{ id: 'exit', name: 'Exit', style: { opacity: 0 } }],
    transitions: [{ id: 'exit', from: 'rest', to: 'exit', on: { input: 'leave' }, with: { easing: 'exit', duration: 'base' } }],
  } satisfies Input,

  /** Fades out and rises away. */
  'rise-out': {
    states: [{ id: 'exit', name: 'Exit', style: { opacity: 0, y: '-distance.near' } }],
    transitions: [{ id: 'exit', from: 'rest', to: 'exit', on: { input: 'leave' }, with: { spring: 'gentle' } }],
  } satisfies Input,

  /** Fades out and sinks. */
  'sink-out': {
    states: [{ id: 'exit', name: 'Exit', style: { opacity: 0, y: 'distance.near' } }],
    transitions: [{ id: 'exit', from: 'rest', to: 'exit', on: { input: 'leave' }, with: { spring: 'gentle' } }],
  } satisfies Input,

  /** Fades out and scales down slightly. */
  'scale-out': {
    states: [{ id: 'exit', name: 'Exit', style: { opacity: 0, scale: 0.9 } }],
    transitions: [{ id: 'exit', from: 'rest', to: 'exit', on: { input: 'leave' }, with: { easing: 'exit', duration: 'base' } }],
  } satisfies Input,
} as const satisfies Record<string, Input>;

export type PresetName = keyof typeof PRESETS;

type StaggerOffset = 'tight' | 'base' | 'loose' | 'none';

/**
 * A preset as a fresh motion block, optionally following another node or a
 * stagger group so a row of cards staggers. Parsed with all schema defaults applied.
 *
 * @example
 * const heroMotion = preset('rise');
 * const cardMotion = preset('rise', { node: 'hero' });
 * const thirdCard  = preset('rise', { node: 'card-2', offset: 'loose' });
 * // Group: each member staggers after the previous one in document order.
 * const a = preset('rise', { group: 'cards' });
 * const b = preset('rise', { group: 'cards' });
 * const c = preset('rise', { group: 'cards', offset: 'loose' });
 */
export function preset(
  name: PresetName,
  follow?: { node: string; offset?: StaggerOffset } | { group: string; offset?: StaggerOffset },
): NodeMotion {
  const block = structuredClone(PRESETS[name]) as { transitions: Array<Record<string, unknown>> };
  if (follow) {
    for (const t of block.transitions) {
      if ('node' in follow) {
        t.after = { node: follow.node, offset: follow.offset ?? 'base' };
      } else {
        t.after = { group: follow.group, offset: follow.offset ?? 'base' };
      }
    }
  }
  return NodeMotionSchema.parse(block);
}
