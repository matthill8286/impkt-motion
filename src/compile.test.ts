import { describe, expect, it } from 'vitest';
import { resolveMotion } from './tokens';
import { resolveChoreography } from './choreography';
import { compileMotion, styleDeclarations } from './compile';
import { createMotionNode } from './schemas';
import { preset } from './presets';

const node = (id: string, motion?: unknown, component = 'ui/card') => createMotionNode(id, motion as never, { component });

describe('styleDeclarations', () => {
  it('composes transforms in a fixed order and names tokens by custom property', () => {
    expect(styleDeclarations({ x: 0, y: 'distance.near', scale: 0.9, rotate: -4 })).toEqual([
      'transform: translate(0px, var(--impakt-motion-distance-near)) scale(0.9) rotate(-4deg)',
    ]);
    expect(styleDeclarations({ y: '-space.1' })[0]).toContain('calc(-1 * var(--impakt-space-1))');
    expect(styleDeclarations({ clip: 'bottom', radius: 'full', shadow: 'raised' })).toEqual([
      'clip-path: inset(100% 0 0 0)',
      'box-shadow: var(--impakt-shadow-md)',
      'border-radius: var(--impakt-radius-full)',
    ]);
  });
});

describe('compileMotion', () => {
  it('writes nothing for a page with no motion', () => {
    const out = compileMotion([node('a'), node('b')]);
    expect(out.css).toBe('');
    expect(out.plan.nodes).toEqual([]);
  });

  it('applies the initial state only while motion runs and is allowed', () => {
    const { css } = compileMotion([node('hero', preset('rise'))]);
    expect(css).toContain('.impakt-motion:not(.impakt-motion-reduced) [data-motion="hero"]:not([data-motion-state])');
    expect(css).toContain('[data-motion="hero"][data-motion-state="hidden"] { transform: translate(0px, var(--impakt-motion-distance-near)); opacity: 0; }');
    expect(css).not.toMatch(/^\[data-motion="hero"\] \{[^}]*opacity: 0/m);
  });

  it('gives a clip reveal an interpolable rest value', () => {
    const { css } = compileMotion([node('img', preset('iris-open'))]);
    expect(css).toContain('clip-path: circle(150% at 50% 50%)');
  });

  it('plans transitions with token timing for the runtime', () => {
    const { plan } = compileMotion([node('card', preset('lift'))]);
    expect(plan.nodes[0].transitions[0]).toMatchObject({
      id: 'lift',
      from: 'rest',
      to: 'hover',
      reverse: true,
      reduced: 'cut',
      duration: 'var(--impakt-motion-spring-snappy-duration)',
      easing: 'var(--impakt-motion-spring-snappy-easing)',
      delay: 0,
    });
  });

  it('moves the parts of split text and staggers them by index', () => {
    const { css, plan } = compileMotion([node('h1', preset('words-rise'), 'ui/heading')]);
    expect(plan.nodes[0].split).toBe('words');
    expect(css).toContain('[data-motion="h1"][data-motion-state="hidden"] > [data-motion-part]');
    expect(css).toContain('var(--m-index, 0) * var(--impakt-motion-stagger-tight)');
  });

  it('compiles a scene timeline to keyframes with a native and a fallback path', () => {
    const scene = createMotionNode('stage', undefined, { component: 'ui/scene' });
    const button = createMotionNode(
      'cta',
      {
        states: [
          { id: 'note', style: { rotate: -4, radius: 'sm' } },
          { id: 'live', style: { radius: 'full', shadow: 'glow' } },
        ],
        timeline: {
          on: 'scene',
          keys: [
            { id: 'a', at: 0, state: 'note' },
            { id: 'b', at: 0.5, state: 'rest', with: { spring: 'bouncy' } },
            { id: 'c', at: 1, state: 'live' },
          ],
        },
      } as never,
      { parentId: 'stage' },
    );
    const { css, plan } = compileMotion([scene, button]);
    expect(plan.scenes).toEqual([{ id: 'stage', drive: 'view' }]);
    expect(css).toContain('[data-motion="stage"] { view-timeline-name: --impakt-scene; }');
    expect(css).toContain('@supports (animation-timeline: view())');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

describe('choreography', () => {
  const m = resolveMotion({ personality: 'lively' });

  it('staggers from the start of the transition it follows', () => {
    const nodes = [
      node('heading', preset('rise')),
      node('card-1', preset('rise', { node: 'heading' })),
      node('card-2', preset('rise', { node: 'card-1' })),
      node('card-3', preset('rise', { node: 'card-2', offset: 'loose' })),
    ];
    const { delays, issues } = resolveChoreography(nodes, m);
    expect(issues).toEqual([]);
    expect(delays.get('heading/enter')).toBe(0);
    expect(delays.get('card-1/enter')).toBe(m.stagger.base);
    expect(delays.get('card-2/enter')).toBe(m.stagger.base * 2);
    expect(delays.get('card-3/enter')).toBe(m.stagger.base * 2 + m.stagger.loose);
  });

  it('reports a cycle and a missing node instead of hanging', () => {
    const nodes = [node('a', preset('rise', { node: 'b' })), node('b', preset('rise', { node: 'a' })), node('c', preset('rise', { node: 'nowhere' }))];
    const { issues } = resolveChoreography(nodes, m);
    expect(issues.map((i) => i.kind).sort()).toEqual(['cycle', 'missing-node']);
  });

  it('follows the brand speed', () => {
    const nodes = [node('a', preset('rise')), node('b', preset('rise', { node: 'a' }))];
    const slow = compileMotion(nodes, { motion: { personality: 'calm', speed: 0.75 } }).plan.nodes[1].transitions[0].delay;
    const fast = compileMotion(nodes, { motion: { personality: 'calm', speed: 1.25 } }).plan.nodes[1].transitions[0].delay;
    expect(slow).toBeGreaterThan(fast);
  });
});

describe('page transitions', () => {
  it('names a shared element and times its morph from tokens', () => {
    const { css } = compileMotion([node('card', { share: { name: 'case-kleidi' } })]);
    expect(css).toContain('[data-motion="card"] { view-transition-name: impakt-share-case-kleidi; }');
    expect(css).toContain('::view-transition-group(impakt-share-case-kleidi) {');
  });
});

describe('new presets', () => {
  it('slide-left enters from the right edge', () => {
    const { css } = compileMotion([node('el', preset('slide-left'))]);
    expect(css).toContain('opacity: 0');
    expect(css).toContain('var(--impakt-motion-distance-far)');
  });

  it('zoom-in enters from slightly larger', () => {
    const { css } = compileMotion([node('modal', preset('zoom-in'))]);
    expect(css).toContain('scale(1.08)');
  });

  it('glow preset adds shadow on hover', () => {
    const { plan } = compileMotion([node('btn', preset('glow'))]);
    expect(plan.nodes[0].transitions[0]).toMatchObject({ id: 'glow', from: 'rest', to: 'hover', reverse: true });
  });

  it('chars-rise splits by characters', () => {
    const { plan } = compileMotion([node('h1', preset('chars-rise'))]);
    expect(plan.nodes[0].split).toBe('chars');
  });
});
