# @impkt/motion

Motion compiled to the platform — states, transitions, timelines and choreography, with a zero-script fallback.

## How it works

You author motion as data attached to nodes. A compile step (`compileMotion`) runs at build time or server-side and produces:

1. **A scoped CSS stylesheet** — initial states, state rules, transition base rules, keyframe animations, scroll-driven scene timelines, and shared-element `view-transition-name` declarations.
2. **A `MotionPlan` JSON object** — a lightweight instruction set the runtime reads in the browser.

The runtime (`startMotion`) attaches to the DOM, listens for inputs (load, scroll into view, hover, press, focus, route change, data signals), and sets `data-motion-state` attributes. All timing is sourced from CSS custom properties, so `prefers-reduced-motion` and the `.impkt-motion-reduced` class gate everything without script changes.

## Install

```bash
npm install @impkt/motion
```

React integration and tokens utility are opt-in:

```ts
import { startMotion } from '@impkt/motion/runtime';
import { useMotion }    from '@impkt/motion/react';
import { injectMotionTokens } from '@impkt/motion/tokens';
```

## Quick start

```ts
import { compileMotion, createMotionNode, preset } from '@impkt/motion';
import { startMotion } from '@impkt/motion/runtime';
import { injectMotionTokens } from '@impkt/motion/tokens';

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
import { createMotionNode } from '@impkt/motion';

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
  on: MotionInput;          // 'load' | 'view' | 'hover' | 'press' | 'focus' | 'route' | 'data'
  with?: MotionTiming;      // { spring?, duration?, easing?, delay? }
  after?: MotionAfter;      // choreography: { node, offset? }
  reverse?: boolean;        // return to 'from' state when input ends
  reduced?: 'skip' | 'cut' | 'fade'; // behaviour under reduced-motion
};
```

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

```ts
createMotionNode('card-1', preset('rise', { node: 'hero' }));
createMotionNode('card-2', preset('rise', { node: 'card-1' }));
createMotionNode('card-3', preset('rise', { node: 'card-2', offset: 'loose' }));
```

`offset` defaults to `'base'` and can be `'tight'`, `'base'` or `'loose'` — resolved from the `--impkt-motion-stagger-*` tokens.

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

```ts
import { preset } from '@impkt/motion';

// Simple
createMotionNode('card', preset('rise'));

// With choreography: fires 'tight' stagger after 'hero'
createMotionNode('card', preset('rise', { node: 'hero', offset: 'tight' }));
```

## Design tokens

Motion personality and speed are sourced from CSS custom properties. Set them once at page load.

```ts
import { injectMotionTokens } from '@impkt/motion/tokens';

injectMotionTokens({
  personality: 'lively',   // 'calm' | 'lively' | 'expressive'
  speed: 1.0,              // 0.75–1.25
});
```

Or inline the stylesheet into your SSR template:

```ts
import { motionTokensStylesheet } from '@impkt/motion/tokens';

const style = motionTokensStylesheet({ personality: 'expressive', speed: 1.1 });
// <style>${style}</style>
```

## React

```tsx
import { useMotion, MotionLayer, motionAttr } from '@impkt/motion/react';
import { startMotion } from '@impkt/motion/runtime';

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
import { startMotion } from '@impkt/motion/runtime';

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

### Split text

`startMotion` will call `splitText` automatically on nodes whose plan has `split: 'words'` or `split: 'chars'`. You can call it yourself too:

```ts
import { splitText } from '@impkt/motion/runtime';

splitText(element, 'words');
```

## Compile options

```ts
compileMotion(nodes, {
  motion: {
    personality: 'calm',   // token set to compile into CSS vars
    speed: 1.0,
  },
  issues: 'warn',          // 'warn' | 'throw' | 'ignore' (default: 'warn')
});
```

The returned `issues` array lists choreography problems (cycles, missing nodes, duplicate state ids) independently of the CSS and plan — the CSS and plan are always returned even when issues are present.

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
