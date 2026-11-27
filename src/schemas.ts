/**
 * Motion schema types — the data model for states, transitions and timelines.
 *
 * A node's `motion` block declares states (sparse visual overrides), the
 * transitions between them, and the inputs that fire them.
 *
 * `rest` is implicit: it is the node exactly as authored and what the server
 * renders. Other states are sparse overrides. Everything that can be merged
 * has an `id`. Timing always names a token.
 */
import { z } from 'zod';
import { DURATION_NAMES, EASING_NAMES, SPRING_NAMES, STAGGER_NAMES } from './tokens';

/** The state every node has without declaring it. */
export const REST_STATE = 'rest';

const IdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, 'An id is lower-case letters, digits and dashes, e.g. "hidden".');

/** A length: pixels, or a motion distance or spacing token, optionally negated. */
const LengthSchema = z.union([
  z.number().min(-2000).max(2000),
  z.string().regex(/^-?(distance\.(near|far)|space\.[0-9][0-9-]*)$/, 'A length is a number of px, or a token such as "distance.near" or "-space.4".'),
]);

/**
 * Properties a state may set. Each one animates on the compositor or via FLIP,
 * never by animating layout properties.
 */
export const MotionStyleSchema = z.strictObject({
  opacity: z.number().min(0).max(1).optional(),
  x: LengthSchema.optional(),
  y: LengthSchema.optional(),
  scale: z.number().min(0).max(4).optional(),
  rotate: z.number().min(-360).max(360).optional(),
  clip: z.enum(['none', 'top', 'right', 'bottom', 'left', 'center', 'circle']).optional(),
  /**
   * How much of the node is hidden from its start edge, in percent.
   * 0 = fully visible, 100 = fully hidden. Ignored when `clip` is set.
   */
  clipStart: z.number().min(0).max(100).optional(),
  blur: z.number().min(0).max(40).optional(),
  shadow: z.enum(['none', 'raised', 'float', 'glow']).optional(),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'full']).optional(),
  text: z.enum(['whole', 'lines', 'words', 'chars']).optional(),
});
export type MotionStyle = z.infer<typeof MotionStyleSchema>;

export const MotionStateSchema = z.strictObject({
  id: IdSchema.refine((id) => id !== REST_STATE, '"rest" is the node as authored and is never declared.'),
  name: z.string().optional(),
  style: MotionStyleSchema,
});
export type MotionState = z.infer<typeof MotionStateSchema>;

/** What fires a transition. Each input names a source and computes nothing. */
export const MotionInputSchema = z.discriminatedUnion('input', [
  z.strictObject({ input: z.literal('load') }),
  z.strictObject({
    input: z.literal('view'),
    amount: z.number().min(0).max(1).default(0.3),
    once: z.boolean().default(true),
  }),
  z.strictObject({ input: z.literal('hover') }),
  z.strictObject({ input: z.literal('press') }),
  z.strictObject({ input: z.literal('focus') }),
  z.strictObject({ input: z.literal('route'), direction: z.enum(['enter', 'exit']).default('enter') }),
  z.strictObject({
    input: z.literal('data'),
    path: z.string().min(1),
  }),
  z.strictObject({ input: z.literal('leave') }),
]);
export type MotionInput = z.infer<typeof MotionInputSchema>;

/** Timing by token name: a spring, or an easing with a duration. */
export const MotionTimingSchema = z.union([
  z.strictObject({ spring: z.enum(SPRING_NAMES) }),
  z.strictObject({ easing: z.enum(EASING_NAMES), duration: z.enum(DURATION_NAMES).default('base') }),
]);
export type MotionTiming = z.infer<typeof MotionTimingSchema>;

/**
 * Choreography as a relationship: this transition starts after another node's
 * transition, or after every other member of a named stagger group.
 */
export const MotionAfterSchema = z.union([
  z.strictObject({
    node: z.string().min(1),
    transition: IdSchema.optional(),
    offset: z.enum([...STAGGER_NAMES, 'none'] as [string, ...string[]]).default('base'),
  }),
  z.strictObject({
    group: z.string().min(1),
    offset: z.enum([...STAGGER_NAMES, 'none'] as [string, ...string[]]).default('base'),
  }),
]);
export type MotionAfter = z.infer<typeof MotionAfterSchema>;

export const ReducedSchema = z.enum(['cut', 'fade']);

export const MotionTransitionSchema = z.strictObject({
  id: IdSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  on: MotionInputSchema,
  with: MotionTimingSchema,
  after: MotionAfterSchema.optional(),
  reverse: z.boolean().default(false),
  reduced: ReducedSchema.optional(),
});
export type MotionTransition = z.infer<typeof MotionTransitionSchema>;

export const TimelineKeySchema = z.strictObject({
  id: IdSchema,
  at: z.number().min(0).max(1),
  state: z.string().min(1),
  with: MotionTimingSchema.optional(),
});
export type TimelineKey = z.infer<typeof TimelineKeySchema>;

export const MotionTimelineSchema = z.strictObject({
  on: z.literal('scene'),
  keys: z.array(TimelineKeySchema).min(2),
});
export type MotionTimeline = z.infer<typeof MotionTimelineSchema>;

/**
 * A shared element: the same node on two pages, morphed between them on
 * navigation (View Transitions API).
 */
export const MotionShareSchema = z.strictObject({
  name: IdSchema,
  with: MotionTimingSchema.optional(),
});
export type MotionShare = z.infer<typeof MotionShareSchema>;

const issue = (ctx: z.RefinementCtx, path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

export const NodeMotionSchema = z
  .strictObject({
    initial: z.string().default(REST_STATE),
    states: z.array(MotionStateSchema).default([]),
    transitions: z.array(MotionTransitionSchema).default([]),
    timeline: MotionTimelineSchema.optional(),
    share: MotionShareSchema.optional(),
    reduced: ReducedSchema.default('cut'),
  })
  .superRefine((m, ctx) => {
    const known = new Set([REST_STATE]);
    m.states.forEach((s, i) => {
      if (known.has(s.id)) issue(ctx, ['states', i, 'id'], `The state "${s.id}" is declared twice.`);
      known.add(s.id);
    });
    const ref = (value: string, path: (string | number)[], allowAny = false) => {
      if (allowAny && value === '*') return;
      if (!known.has(value)) issue(ctx, path, `There is no state called "${value}".`);
    };
    ref(m.initial, ['initial']);
    const ids = new Set<string>();
    m.transitions.forEach((t, i) => {
      if (ids.has(t.id)) issue(ctx, ['transitions', i, 'id'], `The transition "${t.id}" is declared twice.`);
      ids.add(t.id);
      ref(t.from, ['transitions', i, 'from'], true);
      ref(t.to, ['transitions', i, 'to']);
      if (t.from === t.to) issue(ctx, ['transitions', i], 'A transition has to go somewhere: "from" and "to" are the same state.');
    });
    if (m.timeline) {
      const keyIds = new Set<string>();
      let last = -1;
      m.timeline.keys.forEach((k, i) => {
        if (keyIds.has(k.id)) issue(ctx, ['timeline', 'keys', i, 'id'], `The key "${k.id}" is declared twice.`);
        keyIds.add(k.id);
        ref(k.state, ['timeline', 'keys', i, 'state']);
        if (k.at < last) issue(ctx, ['timeline', 'keys', i, 'at'], 'Keys run in order along the timeline.');
        last = k.at;
      });
    }
  });
export type NodeMotion = z.infer<typeof NodeMotionSchema>;

/**
 * A node in the composition tree. Only the fields the compiler needs are
 * required; pass your own component/props structure for scene detection.
 */
export interface MotionNode {
  id: string;
  parentId?: string;
  /** The component type, used to detect `ui/scene` containers. */
  component?: string;
  props?: Record<string, unknown>;
  motion?: NodeMotion;
}

/**
 * Build a typed motion node without constructing the full composition shape.
 *
 * @example
 * const hero = createMotionNode('hero', preset('rise'));
 * const card = createMotionNode('card-1', preset('rise', { node: 'hero' }));
 */
export function createMotionNode(
  id: string,
  motion?: NodeMotion,
  options?: { parentId?: string; component?: string; props?: Record<string, unknown> },
): MotionNode {
  return { id, ...(motion ? { motion: NodeMotionSchema.parse(motion) } : {}), ...options };
}
