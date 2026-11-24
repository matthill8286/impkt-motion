/**
 * Vite plugin for @atomic-ui/motion.
 *
 * Compiles motion nodes at build time and exposes the resulting CSS through a
 * virtual module so you can import it like any other stylesheet.
 *
 * @example
 * // vite.config.ts
 * import { motionPlugin } from '@atomic-ui/motion/vite';
 * export default { plugins: [motionPlugin({ nodes })] };
 *
 * // main.ts
 * import css from 'virtual:@atomic-ui/motion-styles';
 * document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
 */
import type { Plugin } from 'vite';
import { compileMotion, type CompileOptions } from './compile.js';
import type { MotionNode } from './schemas.js';

const VIRTUAL_ID = 'virtual:@atomic-ui/motion-styles';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

export interface MotionPluginOptions extends CompileOptions {
  nodes: readonly MotionNode[];
}

export function motionPlugin(options: MotionPluginOptions): Plugin {
  const { nodes, ...compileOpts } = options;
  let css = '';
  return {
    name: '@atomic-ui/motion',
    buildStart() {
      css = compileMotion(nodes, compileOpts).css;
    },
    resolveId(id: string) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id: string) {
      if (id === RESOLVED_ID) return `export const css = ${JSON.stringify(css)};\nexport default css;`;
    },
  };
}
