/**
 * React integration for @impkt/motion.
 *
 * `useMotion` compiles a set of nodes' motion and starts the runtime once
 * the elements are mounted, cleaning up when the component unmounts.
 *
 * `MotionLayer` renders the compiled stylesheet and starts the runtime
 * as a side-effect — drop it once inside your page component.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { compileMotion, type CompiledMotion, type CompileOptions } from './compile';
import { startMotion, type RuntimeOptions } from './runtime';
import type { MotionNode } from './schemas';
import type { MotionInputs } from './tokens';

export interface UseMotionOptions {
  /** The brand's motion inputs: personality and speed. */
  brand?: Partial<MotionInputs>;
  /** Override the visitor's prefers-reduced-motion. */
  reduced?: boolean;
  /** Divides every delay (useful for a preview speed control). */
  rate?: number;
  /** The component ids that act as scenes. Defaults to `['ui/scene']`. */
  sceneComponents?: readonly string[];
  /** Pass `false` to disable motion entirely. */
  enabled?: boolean;
}

/**
 * Compile motion for a set of nodes and start the runtime against a DOM root.
 *
 * Returns the compiled CSS string and a ref you attach to the containing element.
 * The runtime starts on mount and stops on unmount.
 *
 * @example
 * function Page({ nodes }: { nodes: MotionNode[] }) {
 *   const { css, rootRef } = useMotion(nodes);
 *   return (
 *     <div ref={rootRef}>
 *       {css && <style data-impkt-motion="">{css}</style>}
 *       {nodes.map(n => <div key={n.id} data-motion={n.id}>{n.id}</div>)}
 *     </div>
 *   );
 * }
 */
export function useMotion(nodes: MotionNode[], options: UseMotionOptions = {}): {
  css: string | null;
  rootRef: RefObject<HTMLElement | null>;
  compiled: CompiledMotion | null;
} {
  const { brand, reduced, rate, sceneComponents, enabled = true } = options;
  const brandKey = JSON.stringify(brand ?? {});

  const compiled = useMemo<CompiledMotion | null>(() => {
    if (!enabled) return null;
    if (!nodes.some((n) => n.motion)) return null;
    return compileMotion(nodes, { motion: brand, sceneComponents } satisfies CompileOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, brandKey, sceneComponents, enabled]);

  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!compiled || !rootRef.current) return;
    const handle = startMotion(rootRef.current, compiled.plan, { reduced, rate } satisfies RuntimeOptions);
    return () => handle.stop();
  }, [compiled, reduced, rate]);

  return { css: compiled?.css ?? null, rootRef, compiled };
}

export interface MotionLayerProps {
  compiled: CompiledMotion;
  options?: Pick<UseMotionOptions, 'reduced' | 'rate'>;
}

/**
 * Renders the compiled stylesheet and starts the runtime against `document`.
 *
 * Drop this once inside the page component that owns the motion. It stops
 * the runtime when it unmounts.
 *
 * @example
 * const compiled = compileMotion(nodes, { motion: brand });
 * return (
 *   <>
 *     <MotionLayer compiled={compiled} />
 *     <main>…</main>
 *   </>
 * );
 */
export function MotionLayer({ compiled, options }: MotionLayerProps) {
  const { reduced, rate } = options ?? {};
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handle = startMotion(document, compiled.plan, { reduced, rate });
    return () => handle.stop();
  }, [compiled, reduced, rate]);
  return <style data-impkt-motion="">{compiled.css}</style>;
}

/**
 * Assign `data-motion` attributes to a list of elements by id.
 *
 * A shortcut when you are rendering a flat list of nodes and want each
 * element tagged before the runtime starts.
 *
 * @example
 * <ul>
 *   {nodes.map(n => (
 *     <li key={n.id} {...motionAttr(n.id)}>…</li>
 *   ))}
 * </ul>
 */
export function motionAttr(id: string): { 'data-motion': string } {
  return { 'data-motion': id };
}
