/**
 * @atomic-ui/motion — motion compiled to the platform.
 *
 * `compileMotion` turns motion blocks on nodes into one scoped stylesheet
 * and a plan; `startMotion` reads the plan in the browser.
 *
 * Quick start:
 * ```ts
 * import { compileMotion, createMotionNode, preset } from '@atomic-ui/motion';
 * import { startMotion } from '@atomic-ui/motion/runtime';
 * import { injectMotionTokens } from '@atomic-ui/motion/tokens';
 *
 * // Inject CSS custom properties for the motion tokens.
 * injectMotionTokens({ personality: 'lively' });
 *
 * // Build nodes with presets.
 * const nodes = [
 *   createMotionNode('hero', preset('hero-rise')),
 *   createMotionNode('card-1', preset('rise', { node: 'hero' })),
 *   createMotionNode('card-2', preset('rise', { node: 'card-1' })),
 * ];
 *
 * // Server or build: compile once.
 * const { css, plan } = compileMotion(nodes);
 *
 * // Browser: elements carry data-motion="<id>".
 * const handle = startMotion(document, plan);
 * // Later, to trigger a data input:
 * handle.data('price.updated');
 * ```
 */
export {
  ACTIVE_CLASS,
  compileMotion,
  MOTION_ATTR,
  nodeSelector,
  REDUCED_CLASS,
  SCENE_ATTR,
  SCENE_DRIVES,
  SCENE_TIMELINE,
  SCRUB_ATTR,
  SHARE_PREFIX,
  shareName,
  STATE_ATTR,
  styleDeclarations,
  timingVars,
  type CompiledMotion,
  type CompileOptions,
  type MotionPlan,
  type PlannedNode,
  type PlannedScene,
  type PlannedTransition,
  type SceneDrive,
} from './compile';

export { keyOf, resolveChoreography, runtimeOf, type ChoreographyIssue, type TransitionKey } from './choreography';

export { PRESETS, preset, type PresetName } from './presets';

export {
  createMotionNode,
  MotionAfterSchema,
  MotionInputSchema,
  type MotionAfter,
  MotionShareSchema,
  MotionStateSchema,
  MotionStyleSchema,
  MotionTimelineSchema,
  MotionTimingSchema,
  MotionTransitionSchema,
  NodeMotionSchema,
  ReducedSchema,
  REST_STATE,
  TimelineKeySchema,
  type MotionInput,
  type MotionNode,
  type MotionShare,
  type MotionState,
  type MotionStyle,
  type MotionTimeline,
  type MotionTiming,
  type MotionTransition,
  type NodeMotion,
  type TimelineKey,
} from './schemas';
