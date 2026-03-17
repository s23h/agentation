export { default as Agentation } from './components/Agentation.svelte';
export type { AgentationProps } from './components/Agentation.svelte';
export { default as AnnotationPopup } from './components/AnnotationPopup.svelte';
export { default as Tooltip } from './components/Tooltip.svelte';
export { default as HelpTooltip } from './components/HelpTooltip.svelte';

// Re-export framework-agnostic utilities from parent package
export {
  identifyElement,
  identifyAnimationElement,
  getElementPath,
  getNearbyText,
  getElementClasses,
  isInShadowDOM,
  getShadowHost,
  closestCrossingShadow,
} from './utils/element-identification';

export {
  loadAnnotations,
  saveAnnotations,
  getStorageKey,
} from './utils/storage';

export type { Annotation } from './types';
