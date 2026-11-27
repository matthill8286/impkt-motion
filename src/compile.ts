/**
 * Motion → scoped CSS and a small plan for the runtime.
 *
 * Compiles stored motion to the cheapest native form:
 * - States and transitions become CSS rules with token custom properties.
 * - Scene timelines become keyframes on a scroll timeline (or a fallback).
 * - Shared-element names become `view-transition-name` declarations.
 * - What only script can do (viewport intersections, hover, choreography
 *   delays) becomes the plan, which the runtime reads.
 *
 * Nothing hides content without script. A node's initial state applies only
 * under `.impakt-motion`, which the runtime adds once it is running.
 */
import { REST_STATE, type MotionNode, type MotionStyle, type MotionTiming, type NodeMotion } from './schemas';
import { cssVarName, resolveMotion, type MotionInputs } from './tokens';
import { keyOf, resolveChoreography, type ChoreographyIssue } from './choreography';

export const MOTION_ATTR = 'data-motion';
export const STATE_ATTR = 'data-motion-state';
export const SCENE_ATTR = 'data-motion-scene';
export const SCENE_TIMELINE = '--impakt-scene';
export const SHARE_PREFIX = 'impakt-share-';
export const shareName = (name: string) => `${SHARE_PREFIX}${name}`;
export const ACTIVE_CLASS = 'impakt-motion';
export const REDUCED_CLASS = 'impakt-motion-reduced';
/**
 * On the root while an editor scrubs a scene. Every timeline is then held
 * still, whatever drives it on the live page. The editor sets each
 * animation's currentTime from its playhead (keyframes run over one second).
 */
export const SCRUB_ATTR = 'data-motion-scrub';

const v = (path: string) => `var(${cssVarName(path)})`;

export const nodeSelector = (id: string) => `[${MOTION_ATTR}="${id.replace(/["\\]/g, '\\$&')}"]`;

function length(value: number | string): string {
  if (typeof value === 'number') return `${value}px`;
  const negative = value.startsWith('-');
  const name = negative ? value.slice(1) : value;
  const token = v(name.startsWith('distance.') ? `motion.${name}` : name);
  return negative ? `calc(-1 * ${token})` : token;
}

const CLIP: Record<NonNullable<MotionStyle['clip']>, string> = {
  none: 'inset(0 0 0 0)',
  top: 'inset(0 0 100% 0)',
  bottom: 'inset(100% 0 0 0)',
  left: 'inset(0 100% 0 0)',
  right: 'inset(0 0 0 100%)',
  center: 'inset(50% 50% 50% 50%)',
  circle: 'circle(0% at 50% 50%)',
};
const CLIP_REST = { inset: 'inset(0 0 0 0)', circle: 'circle(150% at 50% 50%)' };

const SHADOW: Record<NonNullable<MotionStyle['shadow']>, string> = {
  none: 'none',
  raised: v('shadow.md'),
  float: v('shadow.xl'),
  glow: `0 0 32px color-mix(in srgb, ${v('color.brand')} 45%, transparent)`,
};

export function styleDeclarations(style: MotionStyle): string[] {
  const out: string[] = [];
  const t: string[] = [];
  if (style.x !== undefined || style.y !== undefined) t.push(`translate(${length(style.x ?? 0)}, ${length(style.y ?? 0)})`);
  if (style.scale !== undefined) t.push(`scale(${style.scale})`);
  if (style.rotate !== undefined) t.push(`rotate(${style.rotate}deg)`);
  if (t.length) out.push(`transform: ${t.join(' ')}`);
  if (style.opacity !== undefined) out.push(`opacity: ${style.opacity}`);
  if (style.clip !== undefined) out.push(`clip-path: ${CLIP[style.clip]}`);
  else if (style.clipStart !== undefined) out.push(`clip-path: inset(0 0 0 ${style.clipStart}%)`);
  if (style.blur !== undefined) out.push(`filter: blur(${style.blur}px)`);
  if (style.shadow !== undefined) out.push(`box-shadow: ${SHADOW[style.shadow]}`);
  if (style.radius !== undefined) out.push(`border-radius: ${style.radius === 'none' ? '0' : v(`radius.${style.radius}`)}`);
  return out;
}

function restDeclarations(m: NodeMotion): string[] {
  const states = m.states.map((s) => s.style);
  const out: string[] = [];
  const clips = states.map((s) => s.clip ?? (s.clipStart !== undefined ? 'right' : undefined)).filter(Boolean);
  if (clips.length) out.push(`clip-path: ${clips.includes('circle') ? CLIP_REST.circle : CLIP_REST.inset}`);
  if (states.some((s) => s.blur !== undefined)) out.push('filter: blur(0px)');
  return out;
}

export function timingVars(timing: MotionTiming): { duration: string; easing: string } {
  if ('spring' in timing) return { duration: v(`motion.spring.${timing.spring}.duration`), easing: v(`motion.spring.${timing.spring}.easing`) };
  return { duration: v(`motion.duration.${timing.duration}`), easing: v(`motion.easing.${timing.easing}`) };
}

export interface PlannedTransition {
  id: string;
  from: string;
  to: string;
  on: NodeMotion['transitions'][number]['on'];
  reverse: boolean;
  reduced: 'cut' | 'fade';
  duration: string;
  easing: string;
  delay: number;
}

export interface PlannedNode {
  id: string;
  initial: string;
  split?: 'lines' | 'words' | 'chars';
  transitions: PlannedTransition[];
  timeline: boolean;
}

export type SceneDrive = 'view' | 'page' | 'loop' | 'scrubber';
export const SCENE_DRIVES: readonly SceneDrive[] = ['view', 'page', 'loop', 'scrubber'];

export interface PlannedScene {
  id: string;
  drive: SceneDrive;
}

export interface MotionPlan {
  nodes: PlannedNode[];
  scenes: PlannedScene[];
}

export interface CompiledMotion {
  css: string;
  plan: MotionPlan;
  issues: ChoreographyIssue[];
}

export interface CompileOptions {
  motion?: Partial<MotionInputs>;
  spaceBase?: number;
  /** The component ids that act as scenes (default: `['ui/scene']`). */
  sceneComponents?: readonly string[];
  /**
   * Emit pure CSS rules only — no plan, no runtime required.
   *
   * hover/press/focus → pseudo-class transitions; view → scroll-driven animation;
   * load → regular keyframe animation. data, route and leave inputs are skipped.
   * Choreography delays are not emitted in this mode.
   */
  cssOnly?: boolean;
}

const TRANSITION_PROPS = 'transform, opacity, clip-path, filter, box-shadow, border-radius';

function compileNode(node: MotionNode, m: NodeMotion, delays: Map<string, number>, drive: SceneDrive | undefined): { css: string[]; plan: PlannedNode } {
  const sel = nodeSelector(node.id);
  const split = m.states.map((s) => s.style.text).find((t) => t && t !== 'whole') as PlannedNode['split'];
  const target = (s: string) => (split ? `${s} > [data-motion-part]` : s);
  const css: string[] = [];

  const rest = restDeclarations(m);
  const base = [
    ...rest,
    `transition-property: ${TRANSITION_PROPS}`,
    'transition-duration: var(--m-duration, 0ms)',
    'transition-timing-function: var(--m-easing, linear)',
    split ? `transition-delay: calc(var(--m-delay, 0ms) + var(--m-index, 0) * ${v('motion.stagger.tight')})` : 'transition-delay: var(--m-delay, 0ms)',
  ];
  css.push(`${target(sel)} { ${base.join('; ')}; }`);
  if (split) css.push(`${target(sel)} { display: inline-block; }`);

  for (const s of m.states) {
    const decl = styleDeclarations(s.style);
    if (!decl.length) continue;
    css.push(`${target(`${sel}[${STATE_ATTR}="${s.id}"]`)} { ${decl.join('; ')}; }`);
    if (s.id === m.initial) {
      css.push(`.${ACTIVE_CLASS}:not(.${REDUCED_CLASS}) ${target(`${sel}:not([${STATE_ATTR}])`)} { ${decl.join('; ')}; }`);
    }
  }

  if (m.timeline) {
    const name = `impakt-m-${node.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const byId = new Map(m.states.map((s) => [s.id, s.style]));
    const keyed = m.timeline.keys.map((k) => (k.state === REST_STATE ? {} : (byId.get(k.state) ?? {})));
    const moves = (prop: keyof MotionStyle) => keyed.some((st) => st[prop] !== undefined);
    const TRANSFORM = ['x', 'y', 'scale', 'rotate'] as const;
    const restFill = (style: MotionStyle): string[] => {
      const out: string[] = [];
      if (TRANSFORM.some(moves) && !TRANSFORM.some((p) => style[p] !== undefined)) out.push('transform: none');
      if (moves('opacity') && style.opacity === undefined) out.push('opacity: 1');
      if ((moves('clip') || moves('clipStart')) && style.clip === undefined && style.clipStart === undefined)
        out.push(`clip-path: ${keyed.some((st) => st.clip === 'circle') ? CLIP_REST.circle : CLIP_REST.inset}`);
      if (moves('blur') && style.blur === undefined) out.push('filter: blur(0px)');
      return out;
    };
    const frames = m.timeline.keys.map((k, i) => {
      const style = keyed[i]!;
      const decl = [...styleDeclarations(style), ...restFill(style)];
      const next = m.timeline!.keys[i + 1];
      if (next?.with) decl.push(`animation-timing-function: ${timingVars(next.with).easing}`);
      if (!decl.length) decl.push('transform: none', 'opacity: 1');
      return `  ${Math.round(k.at * 10000) / 100}% { ${decl.join('; ')}; }`;
    });
    css.push(`@keyframes ${name} {\n${frames.join('\n')}\n}`);
    css.push(
      `.${ACTIVE_CLASS}:not(.${REDUCED_CLASS}) ${sel} { animation: ${name} 1s linear both; animation-play-state: paused; animation-delay: calc(var(--m-progress, 0) * -1s); }`,
    );
    const native =
      drive === 'view'
        ? `animation-timeline: ${SCENE_TIMELINE}; animation-range: contain 0% contain 100%`
        : drive === 'page'
          ? 'animation-timeline: scroll(root block)'
          : null;
    if (native) {
      css.push(
        `@supports (animation-timeline: view()) { .${ACTIVE_CLASS}:not(.${REDUCED_CLASS}) ${sel} { animation-play-state: running; animation-delay: 0s; ${native}; } }`,
      );
    }
    css.push(`.${ACTIVE_CLASS}[${SCRUB_ATTR}]:not(.${REDUCED_CLASS}) ${sel} { animation-timeline: auto; animation-play-state: paused; animation-delay: 0s; }`);
  }

  if (m.share) {
    const name = shareName(m.share.name);
    const timing = timingVars(m.share.with ?? { easing: 'emphasis', duration: 'slow' });
    css.push(`${sel} { view-transition-name: ${name}; }`);
    css.push(`::view-transition-group(${name}) { animation-duration: ${timing.duration}; animation-timing-function: ${timing.easing}; }`);
  }

  const plan: PlannedNode = {
    id: node.id,
    initial: m.initial,
    ...(split ? { split } : {}),
    timeline: Boolean(m.timeline),
    transitions: m.transitions.map((t) => {
      const { duration, easing } = timingVars(t.with);
      return {
        id: t.id,
        from: t.from,
        to: t.to,
        on: t.on,
        reverse: t.reverse,
        reduced: t.reduced ?? m.reduced,
        duration,
        easing,
        delay: delays.get(keyOf(node.id, t.id)) ?? 0,
      };
    }),
  };
  return { css, plan };
}

function cssOnlyTransitionProps(style: MotionStyle): string[] {
  const props: string[] = [];
  if (style.x !== undefined || style.y !== undefined || style.scale !== undefined || style.rotate !== undefined) props.push('transform');
  if (style.opacity !== undefined) props.push('opacity');
  if (style.clip !== undefined || style.clipStart !== undefined) props.push('clip-path');
  if (style.blur !== undefined) props.push('filter');
  if (style.shadow !== undefined) props.push('box-shadow');
  if (style.radius !== undefined) props.push('border-radius');
  return props;
}

function cssOnlyToDecls(style: MotionStyle): string[] {
  const out: string[] = [];
  if (style.x !== undefined || style.y !== undefined || style.scale !== undefined || style.rotate !== undefined) out.push('transform: none');
  if (style.opacity !== undefined) out.push('opacity: 1');
  if (style.clip !== undefined) out.push(`clip-path: ${style.clip === 'circle' ? CLIP_REST.circle : CLIP_REST.inset}`);
  else if (style.clipStart !== undefined) out.push('clip-path: inset(0 0 0 0)');
  if (style.blur !== undefined) out.push('filter: blur(0px)');
  if (style.shadow !== undefined && style.shadow !== 'none') out.push('box-shadow: none');
  if (style.radius !== undefined) out.push('border-radius: 0');
  return out;
}

function compileNodeCssOnly(node: MotionNode, m: NodeMotion): string[] {
  const sel = nodeSelector(node.id);
  const css: string[] = [];
  const byId = new Map(m.states.map((s) => [s.id, s]));
  const id = node.id.replace(/[^a-zA-Z0-9_-]/g, '_');

  for (const t of m.transitions) {
    const toState = byId.get(t.to);
    const fromState = byId.get(t.from);
    const { duration, easing } = timingVars(t.with);
    const input = t.on.input;

    if (input === 'hover' || input === 'press' || input === 'focus') {
      if (!toState) continue;
      const decl = styleDeclarations(toState.style);
      if (!decl.length) continue;
      const pseudo = input === 'hover' ? ':hover' : input === 'press' ? ':active' : ':focus-within';
      const props = cssOnlyTransitionProps(toState.style);
      if (props.length) css.push(`${sel} { transition: ${props.map((p) => `${p} ${duration} ${easing}`).join(', ')}; }`);
      css.push(`${sel}${pseudo} { ${decl.join('; ')}; }`);
    } else if (input === 'view') {
      if (!fromState) continue;
      const fromDecl = styleDeclarations(fromState.style);
      if (!fromDecl.length) continue;
      const toDecl = cssOnlyToDecls(fromState.style);
      const name = `impakt-m-${id}-enter`;
      const amount = t.on.amount;
      css.push(`@keyframes ${name} {\n  from { ${fromDecl.join('; ')}; }\n  to { ${toDecl.join('; ')}; }\n}`);
      css.push(
        `${sel} { animation: ${name} ${duration} ${easing} both; animation-timeline: view(); animation-range: entry 0% entry ${Math.round(amount * 100)}%; }`,
      );
      css.push(`@supports not (animation-timeline: view()) { ${sel} { ${toDecl.join('; ')}; } }`);
      css.push(`@media (prefers-reduced-motion: reduce) { ${sel} { animation: none; ${toDecl.join('; ')}; } }`);
    } else if (input === 'load') {
      if (!fromState) continue;
      const fromDecl = styleDeclarations(fromState.style);
      if (!fromDecl.length) continue;
      const toDecl = cssOnlyToDecls(fromState.style);
      const name = `impakt-m-${id}-load`;
      css.push(`@keyframes ${name} {\n  from { ${fromDecl.join('; ')}; }\n  to { ${toDecl.join('; ')}; }\n}`);
      css.push(`${sel} { animation: ${name} ${duration} ${easing} both; }`);
      css.push(`@media (prefers-reduced-motion: reduce) { ${sel} { animation: none; ${toDecl.join('; ')}; } }`);
    }
    // data, route, leave: not expressible in pure CSS
  }

  return css;
}

/**
 * Compile every node's motion.
 *
 * Returns one stylesheet, the plan the runtime reads, and any choreography
 * issues that could not be resolved.
 */
export function compileMotion(nodes: readonly MotionNode[], options: CompileOptions = {}): CompiledMotion {
  if (options.cssOnly) {
    const css: string[] = [];
    for (const n of nodes) {
      if (!n.motion) continue;
      css.push(...compileNodeCssOnly(n, n.motion));
    }
    if (css.length) css.push(`@media (prefers-reduced-motion: reduce) { [${MOTION_ATTR}] { animation: none !important; transition: none !important; } }`);
    return { css: css.join('\n'), plan: { nodes: [], scenes: [] }, issues: [] };
  }

  const motion = resolveMotion(options.motion, options.spaceBase);
  const { delays, issues } = resolveChoreography(nodes, motion);
  const scenes = new Set(options.sceneComponents ?? ['ui/scene']);
  const css: string[] = [];
  const plan: MotionPlan = { nodes: [], scenes: [] };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const driveOf = (n: MotionNode): SceneDrive => {
    const d = n.props?.drive;
    return typeof d === 'string' && (SCENE_DRIVES as readonly string[]).includes(d) ? (d as SceneDrive) : 'view';
  };
  const sceneAbove = (n: MotionNode): SceneDrive | undefined => {
    const seen = new Set<string>();
    let p = n.parentId ? byId.get(n.parentId) : undefined;
    while (p && !seen.has(p.id)) {
      if (scenes.has(p.component ?? '')) return driveOf(p);
      seen.add(p.id);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return undefined;
  };

  for (const n of nodes) {
    if (n.component && scenes.has(n.component)) {
      const drive = driveOf(n);
      plan.scenes.push({ id: n.id, drive });
      if (drive === 'view') css.push(`${nodeSelector(n.id)} { view-timeline-name: ${SCENE_TIMELINE}; }`);
    }
    if (!n.motion) continue;
    const out = compileNode(n, n.motion, delays, n.motion.timeline ? sceneAbove(n) : undefined);
    css.push(...out.css);
    plan.nodes.push(out.plan);
  }

  const routed = nodes.some((n) => n.motion?.share || n.motion?.transitions.some((t) => t.on.input === 'route'));
  if (routed) {
    css.push('@view-transition { navigation: auto; }');
    css.push(
      `::view-transition-old(root), ::view-transition-new(root) { animation-duration: ${v('motion.duration.base')}; animation-timing-function: ${v('motion.easing.standard')}; }`,
    );
    css.push(
      '@media (prefers-reduced-motion: reduce) { ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; } }',
    );
    css.push(
      `.${REDUCED_CLASS}::view-transition-group(*), .${REDUCED_CLASS}::view-transition-old(*), .${REDUCED_CLASS}::view-transition-new(*) { animation: none !important; }`,
    );
  }

  if (plan.nodes.length) {
    css.push(`@media (prefers-reduced-motion: reduce) { [${MOTION_ATTR}] { animation: none !important; } }`);
    css.push(`.${REDUCED_CLASS} [${MOTION_ATTR}] { animation: none !important; }`);
  }
  return { css: css.join('\n'), plan, issues };
}
