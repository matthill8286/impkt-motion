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
  if (!t.after || !('node' in t.after)) return {};
  const after = t.after;
  const node = byNode.get(after.node);
  if (!node) return {};
  const list = node.motion?.transitions ?? [];
  const transition = after.transition
    ? list.find((x) => x.id === after.transition)
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
 * Group-based `after` chains members in document order: each member starts
 * after the previous one's transition, by the stagger offset.
 */
export function resolveChoreography(
  nodes: readonly MotionNode[],
  motion: ResolvedMotion,
): { delays: Map<TransitionKey, number>; issues: ChoreographyIssue[] } {
  const byNode = new Map(nodes.map((n) => [n.id, n]));
  const delays = new Map<TransitionKey, number>();
  const issues: ChoreographyIssue[] = [];
  const visiting = new Set<TransitionKey>();

  // Pre-process groups: collect members in document order, then chain them.
  type GroupEntry = { nodeId: string; transitionId: string; offset: string };
  const groups = new Map<string, GroupEntry[]>();
  for (const n of nodes) {
    for (const t of n.motion?.transitions ?? []) {
      if (!t.after || !('group' in t.after)) continue;
      const { group, offset } = t.after;
      const list = groups.get(group) ?? [];
      list.push({ nodeId: n.id, transitionId: t.id, offset: offset as string });
      groups.set(group, list);
    }
  }
  const groupPredecessor = new Map<TransitionKey, GroupEntry>();
  for (const members of groups.values()) {
    for (let i = 1; i < members.length; i++) {
      const curr = members[i]!;
      const prev = members[i - 1]!;
      groupPredecessor.set(keyOf(curr.nodeId, curr.transitionId), { nodeId: prev.nodeId, transitionId: prev.transitionId, offset: curr.offset });
    }
  }

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

    if ('group' in t.after) {
      const pred = groupPredecessor.get(key);
      if (!pred) {
        // First member of this group: no delay.
        delays.set(key, 0);
        return 0;
      }
      const other = byNode.get(pred.nodeId);
      if (!other) {
        issues.push({ nodeId: node.id, transitionId: t.id, kind: 'missing-node', message: `The transition "${t.id}" is in group "${t.after.group}" but its predecessor node "${pred.nodeId}" is not on the page.` });
        delays.set(key, 0);
        return 0;
      }
      const prevTransition = other.motion?.transitions.find((x) => x.id === pred.transitionId);
      if (!prevTransition) {
        issues.push({ nodeId: node.id, transitionId: t.id, kind: 'missing-transition', message: `The transition "${t.id}" is in group "${t.after.group}" but the predecessor transition "${pred.transitionId}" was not found.` });
        delays.set(key, 0);
        return 0;
      }
      visiting.add(key);
      const offset = pred.offset === 'none' ? 0 : motion.stagger[pred.offset as keyof ResolvedMotion['stagger']];
      const value = resolve(other, prevTransition) + offset;
      visiting.delete(key);
      delays.set(key, value);
      return value;
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
