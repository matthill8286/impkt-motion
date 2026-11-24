# @atomic-ui/motion

Motion compiled to the platform — states, transitions, timelines and choreography, with a zero-script fallback.

## How it works

You author motion as data attached to nodes. A compile step (`compileMotion`) runs at build time or server-side and produces:

1. **A scoped CSS stylesheet** — initial states, state rules, transition base rules, keyframe animations, scroll-driven scene timelines, and shared-element `view-transition-name` declarations.
2. **A `MotionPlan` JSON object** — a lightweight instruction set the runtime reads in the browser.

The runtime (`startMotion`) attaches to the DOM, listens for inputs (load, scroll into view, hover, press, focus, route change, data signals), and sets `data-motion-state` attributes. All timing is sourced from CSS custom properties, so `prefers-reduced-motion` and the `.impkt-motion-reduced` class gate everything without script changes.

## Install

```bash
npm install @atomic-ui/motion
```

React integration and tokens utility are opt-in:

```ts
import { startMotion } from '@atomic-ui/motion/runtime';
import { useMotion }    from '@atomic-ui/motion/react';
import { injectMotionTokens } from '@atomic-ui/motion/tokens';
```

## Quick start

```ts
import { compileMotion, createMotionNode, preset } from '@atomic-ui/motion';
import { startMotion } from '@atomic-ui/motion/runtime';
import { injectMotionTokens } from '@atomic-ui/motion/tokens';

// 1. Inject CSS custom properties for motion tokens (once, in the browser).
injectMotionTokens({ personality: 'lively' });

// 2. Build nodes with presets (server or build).
const nodes = [
  createMotionNode('hero',   preset('hero-rise')),
  createMotionNode('card-1', preset('rise', { node: 'hero' })),
  createMotionNode('card-2', preset('rise', { node: 'card-1' })),
];

// 3. Compile once — runs anywhere (Node, edge, browser).
const { css, plan } = compileMotion(nodes);

// 4. Inject the stylesheet server-side, e.g. in a <style> tag.
//    Elements carry data-motion="<id>".

// 5. Browser: start the runtime.
const handle = startMotion(document, plan);

// Trigger a data input later.
handle.data('price.updated');
```

## Nodes

A node is any element in your tree that can carry motion. Only the `id` is required; all other fields are optional.

```ts
import { createMotionNode } from '@atomic-ui/motion';

const node = createMotionNode(
  'card',           // unique id — matches data-motion="card" on the DOM element
  {
    states: [
      { id: 'hover', style: { y: '-space.1', shadow: 'raised' } },
    ],
    transitions: [
      { id: 'lift', from: 'rest', to: 'hover', on: 'hover', reverse: true,
        with: { spring: 'snappy' }, reduced: 'cut' },
    ],
  },
  { component: 'ui/card', parentId: 'section' }
);
```

## Motion data model

### States

A state is a sparse visual override of the implicit `rest` state (the element as it appears without script). Every property is optional; unset properties stay at their authored value.

```ts
type MotionStyle = {
  opacity?: number;
  x?: number | string;        // 'distance.near', '-space.2', etc.
  y?: number | string;
  scale?: number;
  rotate?: number;
  blur?: number;
  clip?: 'left' | 'right' | 'top' | 'bottom' | 'center';
  shadow?: 'none' | 'raised' | 'float' | 'glow';
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
};
```

Numeric values are written as literal `px`/`deg`. String values are resolved to CSS custom properties: `'distance.near'` → `var(--impkt-motion-distance-near)`.

### Transitions

A transition moves a node from one state to another when an input fires.

```ts
type MotionTransition = {
  id: string;
  from: string;             // source state id, or 'rest'
  to: string;               // target state id
  on: MotionInput;          // 'load' | 'view' | 'hover' | 'press' | 'focus' | 'route' | 'data' | 'leave'
  with?: MotionTiming;      // { spring?, duration?, easing?, delay? }
  after?: MotionAfter;      // choreography: { node, offset? } | { group, offset? }
  reverse?: boolean;        // return to 'from' state when input ends
  reduced?: 'cut' | 'fade'; // behaviour under reduced-motion
};
```

The `leave` input fires when `handle.leave()` is called (before a navigation or unmount). Use it for exit animations that play as the page or element disappears.

### Timelines

A timeline drives a node's visual state from a scene's scroll progress. The scene element carries a `view-timeline-name`; children animate along it.

```ts
type MotionTimeline = {
  on: 'scene';
  keys: TimelineKey[];  // { id, at: 0–1, state, with? }[]
};
```

### Choreography (`after`)

Nodes can stagger after each other. The compiler resolves the `after` graph into concrete millisecond delays and reports cycles or missing nodes as issues.

### Node-based stagger

Each node explicitly names the one it follows:

```ts
createMotionNode('card-1', preset('rise', { node: 'hero' }));
createMotionNode('card-2', preset('rise', { node: 'card-1' }));
createMotionNode('card-3', preset('rise', { node: 'card-2', offset: 'loose' }));
```

### Stagger groups

Give every node in a row the same `group` name and they chain in document order automatically. No manual linking required:

```ts
createMotionNode('a', preset('rise', { group: 'cards' }));
createMotionNode('b', preset('rise', { group: 'cards' }));
createMotionNode('c', preset('rise', { group: 'cards', offset: 'loose' }));
```

The first group member starts immediately; each subsequent member starts after the previous one by its `offset`.

`offset` defaults to `'base'` and can be `'tight'`, `'base'`, `'loose'` or `'none'` — resolved from the `--impkt-motion-stagger-*` tokens.

### Shared elements (page transitions)

Give a node a `share` to participate in View Transitions. The compiler writes `view-transition-name` and transition timing rules.

```ts
createMotionNode('card', { share: { name: 'case-kleidi' } });
```

## Presets

`preset(name, follow?)` returns a `NodeMotion` object ready to pass to `createMotionNode`.

| Preset | Effect |
|---|---|
| `rise` | Scroll-triggered fade + rise from below |
| `fade` | Scroll-triggered opacity fade |
| `wipe-up` | Clip-path wipe from bottom |
| `iris-open` | Circular clip-path iris reveal |
| `pop-in` | Springy scale in |
| `focus-in` | Blur-to-sharp reveal |
| `words-rise` | Per-word staggered rise |
| `chars-rise` | Per-character staggered rise |
| `lift` | Hover: lift + shadow |
| `press` | Press: scale down |
| `glow` | Hover: grow + glow shadow |
| `shake` | Press: lateral shake |
| `slide-left` | Fade + slide in from right |
| `slide-right` | Fade + slide in from left |
| `zoom-in` | Fade + scale in from 1.08 |
| `zoom-out` | Fade + scale in from 0.9 |
| `blur-out` | Heavy blur reveal |
| `hero-rise` | Load-triggered rise (above-fold elements) |
| `hero-words` | Load-triggered per-word rise |
| `fade-out` | Exit: fade to transparent |
| `rise-out` | Exit: fade and rise away |
| `sink-out` | Exit: fade and sink |
| `scale-out` | Exit: fade and scale down |

```ts
import { preset } from '@atomic-ui/motion';

// Simple entrance
createMotionNode('card', preset('rise'));

// Stagger after a specific node
createMotionNode('card', preset('rise', { node: 'hero', offset: 'tight' }));

// Stagger group: auto-chain in document order
createMotionNode('a', preset('rise', { group: 'cards' }));
createMotionNode('b', preset('rise', { group: 'cards' }));

// Exit animation
createMotionNode('page', preset('fade-out'));
// Then: await handle.leave() before navigating
```

## Design tokens

Motion personality and speed are sourced from CSS custom properties. Set them once at page load.

```ts
import { injectMotionTokens } from '@atomic-ui/motion/tokens';

injectMotionTokens({
  personality: 'lively',   // 'calm' | 'lively' | 'expressive'
  speed: 1.0,              // 0.75–1.25
});
```

Or inline the stylesheet into your SSR template:

```ts
import { motionTokensStylesheet } from '@atomic-ui/motion/tokens';

const style = motionTokensStylesheet({ personality: 'expressive', speed: 1.1 });
// <style>${style}</style>
```

## React

```tsx
import { useMotion, MotionLayer, motionAttr } from '@atomic-ui/motion/react';
import { startMotion } from '@atomic-ui/motion/runtime';

function Page() {
  const nodes = useMemo(() => [
    createMotionNode('hero',   preset('hero-rise')),
    createMotionNode('card-1', preset('rise', { node: 'hero' })),
  ], []);

  const { css, rootRef, compiled } = useMotion(nodes, { motion: { personality: 'lively' } });

  return (
    <>
      {css && <style>{css}</style>}
      <div ref={rootRef}>
        <h1 {...motionAttr('hero')}>Hello</h1>
        <div {...motionAttr('card-1')}>Card</div>
      </div>
    </>
  );
}
```

`MotionLayer` renders a `<style>` tag and sets up the runtime as a side effect:

```tsx
<MotionLayer compiled={compiled} />
```

## Runtime API

```ts
import { startMotion } from '@atomic-ui/motion/runtime';

const handle = startMotion(
  document,  // root — any element or Document
  plan,      // MotionPlan from compileMotion
  {
    onState?: (nodeId, state) => void;
  }
);

handle.data('some.signal');  // fire a data-input transition
handle.route();              // fire all route transitions
handle.leaveAll();           // fire all leave/exit transitions
handle.destroy();            // remove all listeners
```

`routeTransition()` and `leaveAll()` are also exported as standalone helpers.

### Exit animations

Transitions with `on: { input: 'leave' }` fire when `handle.leave()` is called. Use them for explicit page/component exits:

```ts
const nodes = [
  createMotionNode('hero', preset('hero-rise')),
  createMotionNode('hero-exit', preset('fade-out')),
];
const handle = startMotion(document, plan);

// Before navigating away:
await handle.leave();
router.push('/next-page');
```

The exit presets (`fade-out`, `rise-out`, `sink-out`, `scale-out`) target `on: { input: 'leave' }` automatically.

### Split text

`startMotion` will call `splitText` automatically on nodes whose plan has `split: 'words'` or `split: 'chars'`. You can call it yourself too:

```ts
import { splitText } from '@atomic-ui/motion/runtime';

splitText(element, 'words');
```

## React hooks

### `useScrollProgress`

Returns a 0–1 scroll progress value for an element as it passes through the viewport. Useful for parallax and scroll-linked effects that need a JS value rather than scroll-driven CSS.

```tsx
import { useRef } from 'react';
import { useScrollProgress } from '@atomic-ui/motion/react';

function Section() {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(ref);

  return (
    <div ref={ref} style={{ opacity: progress }}>
      Content
    </div>
  );
}
```

`0` when the element's bottom is at the viewport bottom; `1` when its top is at the viewport top.

## Vite plugin

Compile motion nodes at build time and import the CSS as a virtual module:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { motionPlugin } from '@atomic-ui/motion/vite';
import { myNodes } from './src/motion';

export default defineConfig({
  plugins: [motionPlugin({ nodes: myNodes })],
});
```

```ts
// main.ts
import css from 'virtual:@atomic-ui/motion-styles';
document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
```

Pass any `CompileOptions` alongside `nodes` to control the personality or CSS-only mode.

## Compile options

```ts
compileMotion(nodes, {
  motion: {
    personality: 'calm',   // token set to compile into CSS vars
    speed: 1.0,
  },
});
```

The returned `issues` array lists choreography problems (cycles, missing nodes, duplicate state ids) independently of the CSS and plan — the CSS and plan are always returned even when issues are present.

### CSS-only mode

Pass `cssOnly: true` to emit pure CSS without a runtime plan. `hover`, `press` and `focus` become pseudo-class transitions; `view` becomes a scroll-driven keyframe animation; `load` becomes a regular keyframe animation. `data`, `route` and `leave` inputs are skipped.

```ts
const { css } = compileMotion(nodes, { cssOnly: true });
```

This mode suits static sites and simple pages that don't need choreography, data-driven state changes, or exit animations. The returned `plan` is empty.

## Reduced motion

Under `prefers-reduced-motion: reduce` or when the `.impkt-motion-reduced` class is present on an ancestor:

- Initial states are not applied (the element shows immediately as authored).
- Transitions with `reduced: 'skip'` are suppressed entirely.
- Transitions with `reduced: 'cut'` cut to the target state at 0 ms.
- Transitions with `reduced: 'fade'` use a short cross-fade instead.
- Scroll-driven timelines fall back to a simplified JS path.

## Browser support

- **States and transitions**: all modern browsers.
- **Scroll-driven timelines**: native in Chrome 115+, Firefox 110+; JS fallback otherwise.
- **View Transitions**: Chrome 111+; no-op in other browsers.
- **Spring easings** (`linear()`): Chrome 113+, Firefox 112+; fallback to `ease-in-out` otherwise.

## License

MIT
