/**
 * The motion runtime — the part the browser cannot do alone.
 *
 * Reads the compiled plan and does four things: notices inputs (the
 * viewport, hover, press, focus, data arriving), sets each node's state
 * attribute with the right timing, splits text that animates by part, and
 * drives scene timelines where the engine has no scroll-driven animations.
 *
 * Everything visual is in the compiled CSS. No animation loop except the
 * scroll fallback, which runs only for scenes. Plain DOM, so it works under
 * Lit, React, Vue, Angular or a static page.
 */
import { ACTIVE_CLASS, MOTION_ATTR, REDUCED_CLASS, SCENE_ATTR, STATE_ATTR, nodeSelector, type MotionPlan, type PlannedNode, type PlannedTransition } from './compile';

export interface RuntimeOptions {
  /** Defaults to the visitor's `prefers-reduced-motion`. */
  reduced?: boolean;
  /** The element whose class marks motion as running. Defaults to `document.documentElement`. */
  rootElement?: HTMLElement;
  /** Divides every delay, for a preview's speed control. */
  rate?: number;
}

export interface MotionHandle {
  /** Fire a `data` input, as the app does when a value arrives. */
  data(path: string): void;
  /**
   * Play the page's route-exit transitions and resolve when the longest has
   * finished. Resolves at once when nothing exits, and never waits longer
   * than MAX_EXIT_MS.
   */
  leave(): Promise<void>;
  /** Detach every listener and observer. States stay where they are. */
  stop(): void;
}

const prefersReduced = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const supportsScrollTimeline = () => {
  try {
    return typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()');
  } catch {
    return false;
  }
};

/** Wrap a text node's words or characters in spans the compiled rules can move. */
export function splitText(el: HTMLElement, mode: NonNullable<PlannedNode['split']>): void {
  if (el.dataset.motionSplit) return;
  el.dataset.motionSplit = mode;
  const text = el.textContent ?? '';
  el.setAttribute('aria-label', text);
  const parts = mode === 'chars' ? [...text] : text.split(/(\s+)/);
  el.textContent = '';
  let index = 0;
  for (const p of parts) {
    if (/^\s+$/.test(p)) {
      el.appendChild(document.createTextNode(p));
      continue;
    }
    const span = document.createElement('span');
    span.dataset.motionPart = '';
    span.setAttribute('aria-hidden', 'true');
    span.style.setProperty('--m-index', String(index++));
    span.textContent = p;
    el.appendChild(span);
  }
}

const live = new Set<MotionHandle>();

/** The longest an exit is allowed to hold up a navigation, in ms. */
export const MAX_EXIT_MS = 1000;

/** A CSS time — `360ms`, `0.36s` — in ms. Anything unreadable counts as zero. */
export function timeMs(value: string): number {
  const v = value.trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : 0;
}

const exiting = new WeakMap<MotionHandle, boolean>();

/**
 * Whether a navigation now would animate at all. When it would not, a router
 * should navigate synchronously, as it did before motion.
 */
export function needsTransition(): boolean {
  if ([...live].some((h) => exiting.get(h))) return true;
  const doc = (typeof document === 'undefined' ? undefined : document) as ViewTransitionDocument | undefined;
  return Boolean(doc?.startViewTransition) && !doc!.documentElement.classList.contains(REDUCED_CLASS) && !prefersReduced();
}

export function leaveAll(): Promise<void> {
  return Promise.all([...live].map((h) => h.leave())).then(() => undefined);
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> } };

/**
 * Move to another page with motion: play the current page's exits, then run
 * `update` inside a view transition, so shared elements morph and the page
 * cross-fades on the brand's timing.
 */
export async function routeTransition(update: () => void | Promise<void>): Promise<void> {
  await leaveAll();
  const doc = (typeof document === 'undefined' ? undefined : document) as ViewTransitionDocument | undefined;
  const reduced = Boolean(doc?.documentElement.classList.contains(REDUCED_CLASS)) || prefersReduced();
  if (!doc?.startViewTransition || reduced) {
    await update();
    return;
  }
  const transition = doc.startViewTransition(update);
  await transition.finished.catch(() => undefined);
}

export function startMotion(root: ParentNode, plan: MotionPlan, options: RuntimeOptions = {}): MotionHandle {
  const reduced = options.reduced ?? prefersReduced();
  const rate = options.rate ?? 1;
  const top = options.rootElement ?? document.documentElement;
  top.classList.add(ACTIVE_CLASS);
  top.classList.toggle(REDUCED_CLASS, reduced);

  const cleanups: Array<() => void> = [];
  const dataListeners = new Map<string, Array<() => void>>();
  const listen = (el: EventTarget, type: string, fn: EventListener) => {
    el.addEventListener(type, fn);
    cleanups.push(() => el.removeEventListener(type, fn));
  };

  const stateOf = (el: HTMLElement, node: PlannedNode) => el.getAttribute(STATE_ATTR) ?? node.initial;

  function go(el: HTMLElement, t: PlannedTransition, to: string, withDelay: boolean): void {
    if (reduced) {
      el.style.setProperty('--m-duration', t.reduced === 'fade' ? '120ms' : '0ms');
      el.style.setProperty('--m-easing', 'linear');
      el.style.setProperty('--m-delay', '0ms');
    } else {
      el.style.setProperty('--m-duration', t.duration);
      el.style.setProperty('--m-easing', t.easing);
      el.style.setProperty('--m-delay', `${withDelay ? Math.round(t.delay / rate) : 0}ms`);
    }
    el.setAttribute(STATE_ATTR, to === 'rest' ? 'rest' : to);
  }

  const fire = (el: HTMLElement, node: PlannedNode, t: PlannedTransition) => {
    const now = stateOf(el, node);
    if (t.from !== '*' && t.from !== now) return false;
    el.dataset.motionFrom = now;
    go(el, t, t.to, true);
    return true;
  };
  const unfire = (el: HTMLElement, t: PlannedTransition) => {
    if (!t.reverse || el.getAttribute(STATE_ATTR) !== t.to) return;
    go(el, t, el.dataset.motionFrom ?? t.from, false);
  };

  for (const node of plan.nodes) {
    const el = root.querySelector<HTMLElement>(nodeSelector(node.id));
    if (!el) continue;
    if (node.split && !reduced) splitText(el, node.split);
    el.setAttribute(STATE_ATTR, reduced ? 'rest' : node.initial);

    for (const t of node.transitions) {
      switch (t.on.input) {
        case 'load':
        case 'route':
          if (t.on.input === 'route' && t.on.direction === 'exit') break;
          requestAnimationFrame(() => fire(el, node, t));
          break;
        case 'view': {
          const on = t.on;
          const io = new IntersectionObserver(
            (entries) => {
              for (const e of entries) {
                if (e.isIntersecting) {
                  if (fire(el, node, t) && on.once) io.disconnect();
                } else if (!on.once) unfire(el, t);
              }
            },
            { threshold: on.amount },
          );
          io.observe(el);
          cleanups.push(() => io.disconnect());
          break;
        }
        case 'hover':
          listen(el, 'pointerenter', () => fire(el, node, t));
          listen(el, 'pointerleave', () => unfire(el, t));
          break;
        case 'press':
          listen(el, 'pointerdown', () => fire(el, node, t));
          for (const end of ['pointerup', 'pointercancel', 'pointerleave']) listen(el, end, () => unfire(el, t));
          break;
        case 'focus':
          listen(el, 'focusin', () => fire(el, node, t));
          listen(el, 'focusout', () => unfire(el, t));
          break;
        case 'data': {
          const list = dataListeners.get(t.on.path) ?? [];
          list.push(() => fire(el, node, t));
          dataListeners.set(t.on.path, list);
          break;
        }
      }
    }
  }

  if (!reduced && plan.scenes.length) {
    const native = supportsScrollTimeline();
    for (const scene of plan.scenes) {
      if (native && (scene.drive === 'view' || scene.drive === 'page')) continue;
      const el = root.querySelector<HTMLElement>(nodeSelector(scene.id));
      if (!el) continue;
      el.setAttribute(SCENE_ATTR, scene.drive);
      const children = Array.from(el.querySelectorAll<HTMLElement>(`[${MOTION_ATTR}]`));
      const apply = (progress: number) => {
        for (const child of children) child.style.setProperty('--m-progress', progress.toFixed(4));
      };
      const onProgress = (e: Event) => apply((e as CustomEvent<{ progress: number }>).detail.progress);
      el.addEventListener('impkt-scene-progress', onProgress);
      cleanups.push(() => el.removeEventListener('impkt-scene-progress', onProgress));
      const current = (el as HTMLElement & { progress?: unknown }).progress;
      apply(typeof current === 'number' ? current : 0);
    }
  }

  const exits: Array<{ el: HTMLElement; node: PlannedNode; t: PlannedTransition }> = [];
  for (const node of plan.nodes) {
    const el = root.querySelector<HTMLElement>(nodeSelector(node.id));
    if (!el) continue;
    for (const t of node.transitions) if (t.on.input === 'route' && t.on.direction === 'exit') exits.push({ el, node, t });
  }

  const handle: MotionHandle = {
    data(path) {
      for (const fn of dataListeners.get(path) ?? []) fn();
    },
    leave() {
      let longest = 0;
      for (const { el, node, t } of exits) {
        if (!fire(el, node, t)) continue;
        if (reduced) continue;
        const style = getComputedStyle(el);
        const ms = timeMs(style.getPropertyValue('--m-duration')) + timeMs(style.getPropertyValue('--m-delay'));
        longest = Math.max(longest, ms);
      }
      const wait = Math.min(MAX_EXIT_MS, longest);
      return wait > 0 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve();
    },
    stop() {
      for (const c of cleanups.splice(0)) c();
      live.delete(handle);
      top.classList.remove(ACTIVE_CLASS, REDUCED_CLASS);
    },
  };
  live.add(handle);
  exiting.set(handle, exits.length > 0);
  return handle;
}
