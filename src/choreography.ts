/**
 * Choreography: `after` relationships resolved into delays.
 *
 * Stores choreography as "this follows that, offset by a stagger token"
 * rather than as typed delays, so retiming a heading reflows the cards
 * that follow it. This is where the graph becomes numbers.
 */
import type { MotionNode, MotionTransition } from './schemas';
import type { ResolvedMotion } from './tokens';

/** `nodeId/transitionId`. */
export type TransitionKey = `${string}/${string}`;
export const keyOf = (nodeId: string, transitionId: string): TransitionKey => `${nodeId}/${transitionId}`;

export interface ChoreographyIssue {
  nodeId: string;
  transitionId: string;
  kind: 'missing-node' | 'missing-transition' | 'cycle';
  message: string;
}

function target(t: MotionTransition, byNode: ReadonlyMap<string, MotionNode>): { node?: MotionNode; transition?: MotionTransition } {
  if (!t.after) return {};
  const node = byNode.get(t.after.node);
  if (!node) return {};
  const list = node.motion?.transitions ?? [];
  const transition = t.after.transition
    ? list.find((x) => x.id === t.after!.transition)
    : list.find((x) => x.on.input === t.on.input);
  return { node, transition };
}

export function runtimeOf(t: MotionTransition, motion: ResolvedMotion, springDuration: (s: ResolvedMotion['spring'][keyof ResolvedMotion['spring']]) => number): number {
  return 'spring' in t.with ? springDuration(motion.spring[t.with.spring]) : motion.duration[t.with.duration];
}

/**
 * Every transition's start delay in ms, and anything that stops it resolving.
 *
 * A transition with `after` starts when the transition it follows starts, plus
 * the stagger offset (following the start, not the end, is what creates a stagger).
 */
export function resolveChoreography(
  nodes: readonly MotionNode[],
  motion: ResolvedMotion,
): { delays: Map<TransitionKey, number>; issues: ChoreographyIssue[] } {
  const byNode = new Map(nodes.map((n) => [n.id, n]));
  const delays = new Map<TransitionKey, number>();
  const issues: ChoreographyIssue[] = [];
  const visiting = new Set<TransitionKey>();

  const resolve = (node: MotionNode, t: MotionTransition): number => {
    const key = keyOf(node.id, t.id);
    const known = delays.get(key);
    if (known !== undefined) return known;
    if (!t.after) {
      delays.set(key, 0);
      return 0;
    }
    if (visiting.has(key)) {
      issues.push({ nodeId: node.id, transitionId: t.id, kind: 'cycle', message: `The transition "${t.id}" waits for itself through its "after" chain.` });
      delays.set(key, 0);
      return 0;
    }
    const { node: other, transition } = target(t, byNode);
    if (!other) {
      issues.push({ nodeId: node.id, transitionId: t.id, kind: 'missing-node', message: `The transition "${t.id}" follows node "${t.after.node}", which is not on the page.` });
      delays.set(key, 0);
      return 0;
    }
    if (!transition) {
      issues.push({ nodeId: node.id, transitionId: t.id, kind: 'missing-transition', message: `The transition "${t.id}" follows node "${t.after.node}", which has no matching transition.` });
      delays.set(key, 0);
      return 0;
    }
    visiting.add(key);
    const offset = t.after.offset === 'none' ? 0 : motion.stagger[t.after.offset as keyof ResolvedMotion['stagger']];
    const value = resolve(other, transition) + offset;
    visiting.delete(key);
    delays.set(key, value);
    return value;
  };

  for (const n of nodes) for (const t of n.motion?.transitions ?? []) resolve(n, t);
  const seen = new Set<string>();
  return { delays, issues: issues.filter((i) => (seen.has(`${i.nodeId}/${i.transitionId}`) ? false : (seen.add(`${i.nodeId}/${i.transitionId}`), true))) };
}
