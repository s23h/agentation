<script lang="ts">
  import { onMount } from 'svelte';
  import type { Annotation } from '../types';
  import {
    identifyElement,
    getNearbyText,
    getElementClasses,
    getDetailedComputedStyles,
    getForensicComputedStyles,
    parseComputedStylesString,
    getFullElementPath,
    getAccessibilityInfo,
    getNearbyElements,
    closestCrossingShadow,
  } from '../utils/element-identification';
  import {
    loadAnnotations,
    loadAllAnnotations,
    saveAnnotations,
    getStorageKey,
    loadSessionId,
    saveSessionId,
    clearSessionId,
    saveAnnotationsWithSyncMarker,
    loadToolbarHidden,
    saveToolbarHidden,
  } from '../utils/storage';
  import {
    createSession,
    getSession,
    syncAnnotation,
    updateAnnotation as updateAnnotationOnServer,
    deleteAnnotation as deleteAnnotationFromServer,
    requestAction,
  } from '../utils/sync';
  import {
    freeze as freezeAll,
    unfreeze as unfreezeAll,
    originalSetTimeout,
    originalSetInterval,
  } from '../utils/freeze-animations';
  import AnnotationPopup from './AnnotationPopup.svelte';
  import type { AnnotationPopupHandle } from './AnnotationPopup.svelte';
  import HelpTooltip from './HelpTooltip.svelte';
  import {
    IconListSparkle,
    IconPlayAlt,
    IconPauseAlt,
    IconClose,
    IconPlus,
    IconGear,
    IconCheck,
    IconCheckSmall,
    IconCheckSmallAnimated,
    IconHelp,
    AnimatedBunny,
    IconEye,
    IconEyeMinus,
    IconCopyAlt,
    IconCopyAnimated,
    IconSendArrow,
    IconTrashAlt,
    IconXmark,
    IconCheckmark,
    IconCheckmarkLarge,
    IconCheckmarkCircle,
    IconPause,
    IconEyeAnimated,
    IconPausePlayAnimated,
    IconSun,
    IconMoon,
    IconXmarkLarge,
    IconEdit,
    IconChevronLeft,
    IconChevronRight,
  } from './icons';

  // =========================================================================
  // Props
  // =========================================================================

  interface AgentationProps {
    demoAnnotations?: DemoAnnotation[];
    demoDelay?: number;
    enableDemoMode?: boolean;
    onAnnotationAdd?: (annotation: Annotation) => void;
    onAnnotationDelete?: (annotation: Annotation) => void;
    onAnnotationUpdate?: (annotation: Annotation) => void;
    onAnnotationsClear?: (annotations: Annotation[]) => void;
    onCopy?: (markdown: string) => void;
    onSubmit?: (output: string, annotations: Annotation[]) => void;
    copyToClipboard?: boolean;
    endpoint?: string;
    sessionId?: string;
    onSessionCreated?: (sessionId: string) => void;
    webhookUrl?: string;
    className?: string;
  }

  let {
    demoAnnotations,
    demoDelay = 1000,
    enableDemoMode = false,
    onAnnotationAdd,
    onAnnotationDelete,
    onAnnotationUpdate,
    onAnnotationsClear,
    onCopy,
    onSubmit,
    copyToClipboard = true,
    endpoint,
    sessionId: initialSessionId,
    onSessionCreated,
    webhookUrl,
    className: userClassName,
  }: AgentationProps = $props();

  // =========================================================================
  // Types
  // =========================================================================

  type DemoAnnotation = {
    selector: string;
    comment: string;
    selectedText?: string;
  };

  type HoverInfo = {
    element: string;
    elementName: string;
    elementPath: string;
    rect: DOMRect | null;
  };

  type OutputDetailLevel = 'compact' | 'standard' | 'detailed' | 'forensic';
  type MarkerClickBehavior = 'edit' | 'delete';

  type ToolbarSettings = {
    outputDetail: OutputDetailLevel;
    autoClearAfterCopy: boolean;
    annotationColorId: string;
    blockInteractions: boolean;
    markerClickBehavior: MarkerClickBehavior;
    webhookUrl: string;
    webhooksEnabled: boolean;
  };

  type PendingAnnotation = {
    x: number;
    y: number;
    clientY: number;
    element: string;
    elementPath: string;
    selectedText?: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
    nearbyText?: string;
    cssClasses?: string;
    isMultiSelect?: boolean;
    isFixed?: boolean;
    fullPath?: string;
    accessibility?: string;
    computedStyles?: string;
    computedStylesObj?: Record<string, string>;
    nearbyElements?: string;
    sourceFile?: string;
    elementBoundingBoxes?: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    multiSelectElements?: HTMLElement[];
    targetElement?: HTMLElement;
  };

  // =========================================================================
  // Constants
  // =========================================================================

  const DEFAULT_SETTINGS: ToolbarSettings = {
    outputDetail: 'standard',
    autoClearAfterCopy: false,
    annotationColorId: 'blue',
    blockInteractions: true,
    markerClickBehavior: 'edit',
    webhookUrl: '',
    webhooksEnabled: true,
  };

  const OUTPUT_DETAIL_OPTIONS: { value: OutputDetailLevel; label: string }[] = [
    { value: 'compact', label: 'Compact' },
    { value: 'standard', label: 'Standard' },
    { value: 'detailed', label: 'Detailed' },
    { value: 'forensic', label: 'Forensic' },
  ];

  const COLOR_OPTIONS = [
    { id: 'indigo', label: 'Indigo', srgb: '#6155F5', p3: 'color(display-p3 0.38 0.33 0.96)' },
    { id: 'blue', label: 'Blue', srgb: '#0088FF', p3: 'color(display-p3 0.00 0.53 1.00)' },
    { id: 'cyan', label: 'Cyan', srgb: '#00C3D0', p3: 'color(display-p3 0.00 0.76 0.82)' },
    { id: 'green', label: 'Green', srgb: '#34C759', p3: 'color(display-p3 0.20 0.78 0.35)' },
    { id: 'yellow', label: 'Yellow', srgb: '#FFCC00', p3: 'color(display-p3 1.00 0.80 0.00)' },
    { id: 'orange', label: 'Orange', srgb: '#FF8D28', p3: 'color(display-p3 1.00 0.55 0.16)' },
    { id: 'red', label: 'Red', srgb: '#FF383C', p3: 'color(display-p3 1.00 0.22 0.24)' },
  ];

  const MARKER_CLICK_OPTIONS: { value: MarkerClickBehavior; label: string }[] = [
    { value: 'edit', label: 'Edit' },
    { value: 'delete', label: 'Delete' },
  ];

  const DRAG_THRESHOLD = 8;
  const ELEMENT_UPDATE_THROTTLE = 50;

  // =========================================================================
  // Module-level
  // =========================================================================

  let hasPlayedEntranceAnimation = false;

  // =========================================================================
  // Utility functions
  // =========================================================================

  const isValidUrl = (url: string): boolean => {
    if (!url || !url.trim()) return false;
    try {
      const parsed = new URL(url.trim());
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  function identifyElementForSvelte(element: HTMLElement): {
    name: string;
    elementName: string;
    path: string;
  } {
    const { name: elementName, path } = identifyElement(element);
    return { name: elementName, elementName, path };
  }

  function deepElementFromPoint(x: number, y: number): HTMLElement | null {
    let element = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!element) return null;
    while (element?.shadowRoot) {
      const deeper = element.shadowRoot.elementFromPoint(x, y) as HTMLElement | null;
      if (!deeper || deeper === element) break;
      element = deeper;
    }
    return element;
  }

  function isElementFixed(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      if (style.position === 'fixed' || style.position === 'sticky') return true;
      current = current.parentElement;
    }
    return false;
  }

  function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function isRenderableAnnotation(annotation: Annotation): boolean {
    return annotation.status !== 'resolved' && annotation.status !== 'dismissed';
  }

  function generateOutput(
    annotations: Annotation[],
    pathname: string,
    detailLevel: OutputDetailLevel = 'standard',
  ): string {
    if (annotations.length === 0) return '';
    const viewport =
      typeof window !== 'undefined'
        ? `${window.innerWidth}\u00D7${window.innerHeight}`
        : 'unknown';
    let output = `## Page Feedback: ${pathname}\n`;
    if (detailLevel === 'forensic') {
      output += `\n**Environment:**\n`;
      output += `- Viewport: ${viewport}\n`;
      if (typeof window !== 'undefined') {
        output += `- URL: ${window.location.href}\n`;
        output += `- User Agent: ${navigator.userAgent}\n`;
        output += `- Timestamp: ${new Date().toISOString()}\n`;
        output += `- Device Pixel Ratio: ${window.devicePixelRatio}\n`;
      }
      output += `\n---\n`;
    } else if (detailLevel !== 'compact') {
      output += `**Viewport:** ${viewport}\n`;
    }
    output += '\n';
    annotations.forEach((a, i) => {
      if (detailLevel === 'compact') {
        output += `${i + 1}. **${a.element}**${a.sourceFile ? ` (${a.sourceFile})` : ''}: ${a.comment}`;
        if (a.selectedText) {
          output += ` (re: "${a.selectedText.slice(0, 30)}${a.selectedText.length > 30 ? '...' : ''}")`;
        }
        output += '\n';
      } else if (detailLevel === 'forensic') {
        output += `### ${i + 1}. ${a.element}\n`;
        if (a.isMultiSelect && a.fullPath) output += `*Forensic data shown for first element of selection*\n`;
        if (a.fullPath) output += `**Full DOM Path:** ${a.fullPath}\n`;
        if (a.cssClasses) output += `**CSS Classes:** ${a.cssClasses}\n`;
        if (a.boundingBox)
          output += `**Position:** x:${Math.round(a.boundingBox.x)}, y:${Math.round(a.boundingBox.y)} (${Math.round(a.boundingBox.width)}\u00D7${Math.round(a.boundingBox.height)}px)\n`;
        output += `**Annotation at:** ${a.x.toFixed(1)}% from left, ${Math.round(a.y)}px from top\n`;
        if (a.selectedText) output += `**Selected text:** "${a.selectedText}"\n`;
        if (a.nearbyText && !a.selectedText) output += `**Context:** ${a.nearbyText.slice(0, 100)}\n`;
        if (a.computedStyles) output += `**Computed Styles:** ${a.computedStyles}\n`;
        if (a.accessibility) output += `**Accessibility:** ${a.accessibility}\n`;
        if (a.nearbyElements) output += `**Nearby Elements:** ${a.nearbyElements}\n`;
        if (a.sourceFile) output += `**Source:** ${a.sourceFile}\n`;
        output += `**Feedback:** ${a.comment}\n\n`;
      } else {
        output += `### ${i + 1}. ${a.element}\n`;
        output += `**Location:** ${a.elementPath}\n`;
        if (a.sourceFile) output += `**Source:** ${a.sourceFile}\n`;
        if (detailLevel === 'detailed') {
          if (a.cssClasses) output += `**Classes:** ${a.cssClasses}\n`;
          if (a.boundingBox)
            output += `**Position:** ${Math.round(a.boundingBox.x)}px, ${Math.round(a.boundingBox.y)}px (${Math.round(a.boundingBox.width)}\u00D7${Math.round(a.boundingBox.height)}px)\n`;
        }
        if (a.selectedText) output += `**Selected text:** "${a.selectedText}"\n`;
        if (detailLevel === 'detailed' && a.nearbyText && !a.selectedText)
          output += `**Context:** ${a.nearbyText.slice(0, 100)}\n`;
        output += `**Feedback:** ${a.comment}\n\n`;
      }
    });
    return output.trim();
  }

  function injectAgentationColorTokens() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('agentation-color-tokens')) return;
    const style = document.createElement('style');
    style.id = 'agentation-color-tokens';
    style.textContent = [
      ...COLOR_OPTIONS.map(
        (c) => `
      [data-agentation-accent="${c.id}"] {
        --agentation-color-accent: ${c.srgb};
      }
      @supports (color: color(display-p3 0 0 0)) {
        [data-agentation-accent="${c.id}"] {
          --agentation-color-accent: ${c.p3};
        }
      }
    `,
      ),
      `:root {
      ${COLOR_OPTIONS.map((c) => `--agentation-color-${c.id}: ${c.srgb};`).join('\n')}
    }`,
      `@supports (color: color(display-p3 0 0 0)) {
      :root {
        ${COLOR_OPTIONS.map((c) => `--agentation-color-${c.id}: ${c.p3};`).join('\n')}
      }
    }`,
    ].join('');
    document.head.appendChild(style);
  }

  // =========================================================================
  // State
  // =========================================================================

  let isActive = $state(false);
  let annotations = $state<Annotation[]>([]);
  let showMarkers = $state(true);
  let isToolbarHidden = $state(false);
  let isToolbarHiding = $state(false);

  let markersVisible = $state(false);
  let markersExiting = $state(false);
  let hoverInfo = $state<HoverInfo | null>(null);
  let hoverPosition = $state({ x: 0, y: 0 });
  let pendingAnnotation = $state<PendingAnnotation | null>(null);
  let copied = $state(false);
  let sendState = $state<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  let cleared = $state(false);
  let isClearing = $state(false);
  let hoveredMarkerId = $state<string | null>(null);
  let hoveredTargetElement = $state<HTMLElement | null>(null);
  let hoveredTargetElements = $state<HTMLElement[]>([]);
  let deletingMarkerId = $state<string | null>(null);
  let renumberFrom = $state<number | null>(null);
  let editingAnnotation = $state<Annotation | null>(null);
  let editingTargetElement = $state<HTMLElement | null>(null);
  let editingTargetElements = $state<HTMLElement[]>([]);
  let scrollY = $state(0);
  let isScrolling = $state(false);
  let mounted = $state(false);
  let isFrozen = $state(false);
  let showSettings = $state(false);
  let showSettingsVisible = $state(false);
  let settingsPage = $state<'main' | 'automations'>('main');
  let tooltipsHidden = $state(false);
  let tooltipSessionActive = $state(false);
  let pendingMultiSelectElements = $state<
    Array<{
      element: HTMLElement;
      rect: DOMRect;
      name: string;
      path: string;
    }>
  >([]);

  let settings = $state<ToolbarSettings>((() => {
    try {
      const saved = JSON.parse(localStorage.getItem('feedback-toolbar-settings') ?? '');
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        annotationColorId: COLOR_OPTIONS.find((c) => c.id === saved.annotationColorId)
          ? saved.annotationColorId
          : DEFAULT_SETTINGS.annotationColorId,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  })());

  let isDarkMode = $state(true);
  let showEntranceAnimation = $state(false);

  let currentSessionId = $state<string | null>(initialSessionId ?? null);
  let connectionStatus = $state<'disconnected' | 'connecting' | 'connected'>(
    endpoint ? 'connecting' : 'disconnected',
  );

  let toolbarPosition = $state<{ x: number; y: number } | null>(null);
  let isDraggingToolbar = $state(false);
  let dragStartPos = $state<{
    x: number;
    y: number;
    toolbarX: number;
    toolbarY: number;
  } | null>(null);
  let dragRotation = $state(0);

  let animatedMarkers = $state<Set<string>>(new Set());
  let exitingMarkers = $state<Set<string>>(new Set());
  let pendingExiting = $state(false);
  let editExiting = $state(false);
  let isDragging = $state(false);

  // =========================================================================
  // Refs (mutable, non-reactive)
  // =========================================================================

  let portalWrapper: HTMLDivElement;
  let popupRef: AnnotationPopupHandle | undefined;
  let editPopupRef: AnnotationPopupHandle | undefined;
  let scrollTimeoutRef: ReturnType<typeof setTimeout> | null = null;
  let tooltipSessionTimerRef: ReturnType<typeof setTimeout> | null = null;
  let mouseDownPosRef: { x: number; y: number } | null = null;
  let dragStartRef: { x: number; y: number } | null = null;
  let dragRectRef: HTMLDivElement | undefined;
  let highlightsContainerRef: HTMLDivElement | undefined;
  let justFinishedDragRef = false;
  let lastElementUpdateRef = 0;
  let recentlyAddedIdRef: string | null = null;
  let prevConnectionStatusRef: typeof connectionStatus | null = null;
  let prevDraggingRef = false;
  let justFinishedToolbarDragRef = false;
  let modifiersHeldRef = { cmd: false, shift: false };
  let sessionInitializedRef = false;

  // =========================================================================
  // Derived
  // =========================================================================

  let pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  let shouldShowMarkers = $derived(isActive && showMarkers);
  let hasAnnotations = $derived(annotations.length > 0);
  let visibleAnnotations = $derived(
    annotations.filter((a) => !exitingMarkers.has(a.id) && isRenderableAnnotation(a)),
  );
  let exitingAnnotationsList = $derived(annotations.filter((a) => exitingMarkers.has(a.id)));

  // =========================================================================
  // Functions
  // =========================================================================

  function hideTooltipsUntilMouseLeave() {
    tooltipsHidden = true;
  }

  function showTooltipsAgain() {
    tooltipsHidden = false;
  }

  function handleControlsMouseEnter() {
    if (!tooltipSessionActive) {
      tooltipSessionTimerRef = setTimeout(() => (tooltipSessionActive = true), 850);
    }
  }

  function handleControlsMouseLeave() {
    if (tooltipSessionTimerRef) {
      clearTimeout(tooltipSessionTimerRef);
      tooltipSessionTimerRef = null;
    }
    tooltipSessionActive = false;
    showTooltipsAgain();
  }

  function toggleTheme() {
    portalWrapper?.classList.add('disableTransitions');
    isDarkMode = !isDarkMode;
    requestAnimationFrame(() => {
      portalWrapper?.classList.remove('disableTransitions');
    });
  }

  function freezeAnimations() {
    if (isFrozen) return;
    freezeAll();
    isFrozen = true;
  }

  function unfreezeAnimations() {
    if (!isFrozen) return;
    unfreezeAll();
    isFrozen = false;
  }

  function toggleFreeze() {
    if (isFrozen) unfreezeAnimations();
    else freezeAnimations();
  }

  function hideToolbarTemporarily() {
    if (isToolbarHiding) return;
    isToolbarHiding = true;
    showSettings = false;
    isActive = false;
    originalSetTimeout(() => {
      saveToolbarHidden(true);
      isToolbarHidden = true;
      isToolbarHiding = false;
    }, 400);
  }

  function createMultiSelectPendingAnnotation() {
    if (pendingMultiSelectElements.length === 0) return;
    const firstItem = pendingMultiSelectElements[0];
    const firstEl = firstItem.element;
    const isMulti = pendingMultiSelectElements.length > 1;
    const freshRects = pendingMultiSelectElements.map((item) =>
      item.element.getBoundingClientRect(),
    );

    if (!isMulti) {
      const rect = freshRects[0];
      const fixed = isElementFixed(firstEl);
      pendingAnnotation = {
        x: (rect.left / window.innerWidth) * 100,
        y: fixed ? rect.top : rect.top + window.scrollY,
        clientY: rect.top,
        element: firstItem.name,
        elementPath: firstItem.path,
        boundingBox: {
          x: rect.left,
          y: fixed ? rect.top : rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
        },
        isFixed: fixed,
        fullPath: getFullElementPath(firstEl),
        accessibility: getAccessibilityInfo(firstEl),
        computedStyles: getForensicComputedStyles(firstEl),
        computedStylesObj: getDetailedComputedStyles(firstEl),
        nearbyElements: getNearbyElements(firstEl),
        cssClasses: getElementClasses(firstEl),
        nearbyText: getNearbyText(firstEl),
      };
    } else {
      const bounds = {
        left: Math.min(...freshRects.map((r) => r.left)),
        top: Math.min(...freshRects.map((r) => r.top)),
        right: Math.max(...freshRects.map((r) => r.right)),
        bottom: Math.max(...freshRects.map((r) => r.bottom)),
      };
      const names = pendingMultiSelectElements.slice(0, 5).map((item) => item.name).join(', ');
      const suffix = pendingMultiSelectElements.length > 5
        ? ` +${pendingMultiSelectElements.length - 5} more`
        : '';
      const elementBoundingBoxes = freshRects.map((rect) => ({
        x: rect.left,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      }));
      const lastItem = pendingMultiSelectElements[pendingMultiSelectElements.length - 1];
      const lastEl = lastItem.element;
      const lastRect = freshRects[freshRects.length - 1];
      const lastCenterX = lastRect.left + lastRect.width / 2;
      const lastCenterY = lastRect.top + lastRect.height / 2;
      const lastIsFixed = isElementFixed(lastEl);
      pendingAnnotation = {
        x: (lastCenterX / window.innerWidth) * 100,
        y: lastIsFixed ? lastCenterY : lastCenterY + window.scrollY,
        clientY: lastCenterY,
        element: `${pendingMultiSelectElements.length} elements: ${names}${suffix}`,
        elementPath: 'multi-select',
        boundingBox: {
          x: bounds.left,
          y: bounds.top + window.scrollY,
          width: bounds.right - bounds.left,
          height: bounds.bottom - bounds.top,
        },
        isMultiSelect: true,
        isFixed: lastIsFixed,
        elementBoundingBoxes,
        multiSelectElements: pendingMultiSelectElements.map((item) => item.element),
        targetElement: lastEl,
        fullPath: getFullElementPath(firstEl),
        accessibility: getAccessibilityInfo(firstEl),
        computedStyles: getForensicComputedStyles(firstEl),
        computedStylesObj: getDetailedComputedStyles(firstEl),
        nearbyElements: getNearbyElements(firstEl),
        cssClasses: getElementClasses(firstEl),
        nearbyText: getNearbyText(firstEl),
      };
    }
    pendingMultiSelectElements = [];
    hoverInfo = null;
  }

  async function fireWebhook(
    event: string,
    payload: Record<string, unknown>,
    force?: boolean,
  ): Promise<boolean> {
    const targetUrl = settings.webhookUrl || webhookUrl;
    if (!targetUrl || (!settings.webhooksEnabled && !force)) return false;
    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          timestamp: Date.now(),
          url: typeof window !== 'undefined' ? window.location.href : undefined,
          ...payload,
        }),
      });
      return response.ok;
    } catch (error) {
      console.warn('[Agentation] Webhook failed:', error);
      return false;
    }
  }

  function addAnnotation(comment: string) {
    if (!pendingAnnotation) return;
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      x: pendingAnnotation.x,
      y: pendingAnnotation.y,
      comment,
      element: pendingAnnotation.element,
      elementPath: pendingAnnotation.elementPath,
      timestamp: Date.now(),
      selectedText: pendingAnnotation.selectedText,
      boundingBox: pendingAnnotation.boundingBox,
      nearbyText: pendingAnnotation.nearbyText,
      cssClasses: pendingAnnotation.cssClasses,
      isMultiSelect: pendingAnnotation.isMultiSelect,
      isFixed: pendingAnnotation.isFixed,
      fullPath: pendingAnnotation.fullPath,
      accessibility: pendingAnnotation.accessibility,
      computedStyles: pendingAnnotation.computedStyles,
      nearbyElements: pendingAnnotation.nearbyElements,
      sourceFile: pendingAnnotation.sourceFile,
      elementBoundingBoxes: pendingAnnotation.elementBoundingBoxes,
      ...(endpoint && currentSessionId
        ? {
            sessionId: currentSessionId,
            url: typeof window !== 'undefined' ? window.location.href : undefined,
            status: 'pending' as const,
          }
        : {}),
    };
    annotations = [...annotations, newAnnotation];
    recentlyAddedIdRef = newAnnotation.id;
    originalSetTimeout(() => {
      recentlyAddedIdRef = null;
    }, 300);
    originalSetTimeout(() => {
      animatedMarkers = new Set(animatedMarkers).add(newAnnotation.id);
    }, 250);

    onAnnotationAdd?.(newAnnotation);
    fireWebhook('annotation.add', { annotation: newAnnotation });

    pendingExiting = true;
    originalSetTimeout(() => {
      pendingAnnotation = null;
      pendingExiting = false;
    }, 150);

    window.getSelection()?.removeAllRanges();

    if (endpoint && currentSessionId) {
      syncAnnotation(endpoint, currentSessionId, newAnnotation)
        .then((serverAnnotation) => {
          if (serverAnnotation.id !== newAnnotation.id) {
            annotations = annotations.map((a) =>
              a.id === newAnnotation.id ? { ...a, id: serverAnnotation.id } : a,
            );
            const next = new Set(animatedMarkers);
            next.delete(newAnnotation.id);
            next.add(serverAnnotation.id);
            animatedMarkers = next;
          }
        })
        .catch((error) => {
          console.warn('[Agentation] Failed to sync annotation:', error);
        });
    }
  }

  function cancelAnnotation() {
    pendingExiting = true;
    originalSetTimeout(() => {
      pendingAnnotation = null;
      pendingExiting = false;
    }, 150);
  }

  function deleteAnnotation(id: string) {
    const deletedIndex = annotations.findIndex((a) => a.id === id);
    const deletedAnnotation = annotations[deletedIndex];

    if (editingAnnotation?.id === id) {
      editExiting = true;
      originalSetTimeout(() => {
        editingAnnotation = null;
        editingTargetElement = null;
        editingTargetElements = [];
        editExiting = false;
      }, 150);
    }

    deletingMarkerId = id;
    exitingMarkers = new Set(exitingMarkers).add(id);

    if (deletedAnnotation) {
      onAnnotationDelete?.(deletedAnnotation);
      fireWebhook('annotation.delete', { annotation: deletedAnnotation });
    }

    if (endpoint) {
      deleteAnnotationFromServer(endpoint, id).catch((error) => {
        console.warn('[Agentation] Failed to delete annotation from server:', error);
      });
    }

    originalSetTimeout(() => {
      annotations = annotations.filter((a) => a.id !== id);
      const next = new Set(exitingMarkers);
      next.delete(id);
      exitingMarkers = next;
      deletingMarkerId = null;

      if (deletedIndex < annotations.length) {
        renumberFrom = deletedIndex;
        originalSetTimeout(() => (renumberFrom = null), 200);
      }
    }, 150);
  }

  function startEditAnnotation(annotation: Annotation) {
    editingAnnotation = annotation;
    hoveredMarkerId = null;
    hoveredTargetElement = null;
    hoveredTargetElements = [];

    if (annotation.elementBoundingBoxes?.length) {
      const elements: HTMLElement[] = [];
      for (const bb of annotation.elementBoundingBoxes) {
        const centerX = bb.x + bb.width / 2;
        const centerY = bb.y + bb.height / 2 - window.scrollY;
        const el = deepElementFromPoint(centerX, centerY);
        if (el) elements.push(el);
      }
      editingTargetElements = elements;
      editingTargetElement = null;
    } else if (annotation.boundingBox) {
      const bb = annotation.boundingBox;
      const centerX = bb.x + bb.width / 2;
      const centerY = annotation.isFixed
        ? bb.y + bb.height / 2
        : bb.y + bb.height / 2 - window.scrollY;
      const el = deepElementFromPoint(centerX, centerY);
      if (el) {
        const elRect = el.getBoundingClientRect();
        const widthRatio = elRect.width / bb.width;
        const heightRatio = elRect.height / bb.height;
        editingTargetElement = widthRatio < 0.5 || heightRatio < 0.5 ? null : el;
      } else {
        editingTargetElement = null;
      }
      editingTargetElements = [];
    } else {
      editingTargetElement = null;
      editingTargetElements = [];
    }
  }

  function handleMarkerHover(annotation: Annotation | null) {
    if (!annotation) {
      hoveredMarkerId = null;
      hoveredTargetElement = null;
      hoveredTargetElements = [];
      return;
    }
    hoveredMarkerId = annotation.id;

    if (annotation.elementBoundingBoxes?.length) {
      const elements: HTMLElement[] = [];
      for (const bb of annotation.elementBoundingBoxes) {
        const centerX = bb.x + bb.width / 2;
        const centerY = bb.y + bb.height / 2 - window.scrollY;
        const allEls = document.elementsFromPoint(centerX, centerY);
        const el = allEls.find(
          (e) => !e.closest('[data-annotation-marker]') && !e.closest('[data-agentation-root]'),
        ) as HTMLElement | undefined;
        if (el) elements.push(el);
      }
      hoveredTargetElements = elements;
      hoveredTargetElement = null;
    } else if (annotation.boundingBox) {
      const bb = annotation.boundingBox;
      const centerX = bb.x + bb.width / 2;
      const centerY = annotation.isFixed
        ? bb.y + bb.height / 2
        : bb.y + bb.height / 2 - window.scrollY;
      const el = deepElementFromPoint(centerX, centerY);
      if (el) {
        const elRect = el.getBoundingClientRect();
        const widthRatio = elRect.width / bb.width;
        const heightRatio = elRect.height / bb.height;
        hoveredTargetElement = widthRatio < 0.5 || heightRatio < 0.5 ? null : el;
      } else {
        hoveredTargetElement = null;
      }
      hoveredTargetElements = [];
    } else {
      hoveredTargetElement = null;
      hoveredTargetElements = [];
    }
  }

  function updateAnnotation(newComment: string) {
    if (!editingAnnotation) return;
    const updatedAnnotation = { ...editingAnnotation, comment: newComment };
    annotations = annotations.map((a) =>
      a.id === editingAnnotation!.id ? updatedAnnotation : a,
    );
    onAnnotationUpdate?.(updatedAnnotation);
    fireWebhook('annotation.update', { annotation: updatedAnnotation });

    if (endpoint) {
      updateAnnotationOnServer(endpoint, editingAnnotation.id, {
        comment: newComment,
      }).catch((error) => {
        console.warn('[Agentation] Failed to update annotation on server:', error);
      });
    }

    editExiting = true;
    originalSetTimeout(() => {
      editingAnnotation = null;
      editingTargetElement = null;
      editingTargetElements = [];
      editExiting = false;
    }, 150);
  }

  function cancelEditAnnotation() {
    editExiting = true;
    originalSetTimeout(() => {
      editingAnnotation = null;
      editingTargetElement = null;
      editingTargetElements = [];
      editExiting = false;
    }, 150);
  }

  function clearAll() {
    const count = annotations.length;
    if (count === 0) return;

    onAnnotationsClear?.(annotations);
    fireWebhook('annotations.clear', { annotations });

    if (endpoint) {
      Promise.all(
        annotations.map((a) =>
          deleteAnnotationFromServer(endpoint!, a.id).catch((error) => {
            console.warn('[Agentation] Failed to delete annotation from server:', error);
          }),
        ),
      );
    }

    isClearing = true;
    cleared = true;

    const totalAnimationTime = count * 30 + 200;
    originalSetTimeout(() => {
      annotations = [];
      animatedMarkers = new Set();
      localStorage.removeItem(getStorageKey(pathname));
      isClearing = false;
    }, totalAnimationTime);

    originalSetTimeout(() => (cleared = false), 1500);
  }

  async function copyOutput() {
    const displayUrl =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search + window.location.hash
        : pathname;
    const output = generateOutput(annotations, displayUrl, settings.outputDetail);
    if (!output) return;

    if (copyToClipboard) {
      try {
        await navigator.clipboard.writeText(output);
      } catch {
        // Clipboard may fail
      }
    }

    onCopy?.(output);
    copied = true;
    originalSetTimeout(() => (copied = false), 2000);

    if (settings.autoClearAfterCopy) {
      originalSetTimeout(() => clearAll(), 500);
    }
  }

  async function sendToWebhook() {
    const displayUrl =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search + window.location.hash
        : pathname;
    const output = generateOutput(annotations, displayUrl, settings.outputDetail);
    if (!output) return;

    if (onSubmit) onSubmit(output, annotations);

    sendState = 'sending';
    await new Promise((resolve) => originalSetTimeout(resolve, 150));
    const success = await fireWebhook('submit', { output, annotations }, true);

    sendState = success ? 'sent' : 'failed';
    originalSetTimeout(() => (sendState = 'idle'), 2500);

    if (success && settings.autoClearAfterCopy) {
      originalSetTimeout(() => clearAll(), 500);
    }
  }

  function handleToolbarMouseDown(e: MouseEvent) {
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('.settingsPanel')
    ) {
      return;
    }
    const toolbarParent = (e.currentTarget as HTMLElement).parentElement;
    if (!toolbarParent) return;
    const rect = toolbarParent.getBoundingClientRect();
    const currentX = toolbarPosition?.x ?? rect.left;
    const currentY = toolbarPosition?.y ?? rect.top;
    const randomRotation = (Math.random() - 0.5) * 10;
    dragRotation = randomRotation;
    dragStartPos = {
      x: e.clientX,
      y: e.clientY,
      toolbarX: currentX,
      toolbarY: currentY,
    };
  }

  function getTooltipPositionStyle(annotation: Annotation): string {
    const tooltipMaxWidth = 200;
    const tooltipEstimatedHeight = 80;
    const markerSize = 22;
    const gap = 10;
    const markerX = (annotation.x / 100) * window.innerWidth;
    const markerY =
      typeof annotation.y === 'string' ? parseFloat(annotation.y) : annotation.y;
    let styles = '';
    const spaceBelow = window.innerHeight - markerY - markerSize - gap;
    if (spaceBelow < tooltipEstimatedHeight) {
      styles += `top: auto; bottom: calc(100% + ${gap}px); `;
    }
    const centerX = markerX - tooltipMaxWidth / 2;
    const edgePadding = 10;
    if (centerX < edgePadding) {
      const offset = edgePadding - centerX;
      styles += `left: calc(50% + ${offset}px); `;
    } else if (centerX + tooltipMaxWidth > window.innerWidth - edgePadding) {
      const overflow = centerX + tooltipMaxWidth - (window.innerWidth - edgePadding);
      styles += `left: calc(50% - ${overflow}px); `;
    }
    return styles;
  }

  function clearHighlightsContainer() {
    if (highlightsContainerRef) {
      while (highlightsContainerRef.firstChild) {
        highlightsContainerRef.removeChild(highlightsContainerRef.firstChild);
      }
    }
  }

  // =========================================================================
  // Effects
  // =========================================================================

  // Inject color tokens on mount
  onMount(() => {
    injectAgentationColorTokens();
    isToolbarHidden = loadToolbarHidden();

    mounted = true;
    scrollY = window.scrollY;
    const stored = loadAnnotations<Annotation>(pathname);
    annotations = stored.filter(isRenderableAnnotation);

    if (!hasPlayedEntranceAnimation) {
      showEntranceAnimation = true;
      hasPlayedEntranceAnimation = true;
      originalSetTimeout(() => (showEntranceAnimation = false), 750);
    }

    try {
      const savedTheme = localStorage.getItem('feedback-toolbar-theme');
      if (savedTheme !== null) isDarkMode = savedTheme === 'dark';
    } catch {}

    try {
      const savedPosition = localStorage.getItem('feedback-toolbar-position');
      if (savedPosition) {
        const pos = JSON.parse(savedPosition);
        if (typeof pos.x === 'number' && typeof pos.y === 'number') {
          toolbarPosition = pos;
        }
      }
    } catch {}

    // Stop native events from bubbling past body when from toolbar portal
    const stop = (e: Event) => {
      if (portalWrapper && portalWrapper.contains(e.target as Node)) {
        e.stopPropagation();
      }
    };
    const events = ['mousedown', 'click', 'pointerdown'] as const;
    events.forEach((evt) => document.body.addEventListener(evt, stop));

    // Scroll tracking
    const handleScroll = () => {
      scrollY = window.scrollY;
      isScrolling = true;
      if (scrollTimeoutRef) clearTimeout(scrollTimeoutRef);
      scrollTimeoutRef = originalSetTimeout(() => {
        isScrolling = false;
      }, 150);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      events.forEach((evt) => document.body.removeEventListener(evt, stop));
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef) clearTimeout(scrollTimeoutRef);
      if (tooltipSessionTimerRef) clearTimeout(tooltipSessionTimerRef);
      unfreezeAll();
    };
  });

  // showSettings exit animation
  $effect(() => {
    if (showSettings) {
      showSettingsVisible = true;
    } else {
      tooltipsHidden = false;
      settingsPage = 'main';
      const timer = originalSetTimeout(() => (showSettingsVisible = false), 0);
      return () => clearTimeout(timer);
    }
  });

  // Unified marker visibility
  $effect(() => {
    if (shouldShowMarkers) {
      markersExiting = false;
      markersVisible = true;
      animatedMarkers = new Set();
      const timer = originalSetTimeout(() => {
        const newSet = new Set(animatedMarkers);
        annotations.forEach((a) => newSet.add(a.id));
        animatedMarkers = newSet;
      }, 350);
      return () => clearTimeout(timer);
    } else if (markersVisible) {
      markersExiting = true;
      const timer = originalSetTimeout(() => {
        markersVisible = false;
        markersExiting = false;
      }, 250);
      return () => clearTimeout(timer);
    }
  });

  // Save settings
  $effect(() => {
    if (mounted) {
      localStorage.setItem('feedback-toolbar-settings', JSON.stringify(settings));
    }
  });

  // Save theme
  $effect(() => {
    if (mounted) {
      localStorage.setItem('feedback-toolbar-theme', isDarkMode ? 'dark' : 'light');
    }
  });

  // Save toolbar position when drag ends
  $effect(() => {
    const wasDragging = prevDraggingRef;
    prevDraggingRef = isDraggingToolbar;
    if (wasDragging && !isDraggingToolbar && toolbarPosition && mounted) {
      localStorage.setItem('feedback-toolbar-position', JSON.stringify(toolbarPosition));
    }
  });

  // Initialize server session
  $effect(() => {
    if (!endpoint || !mounted || sessionInitializedRef) return;
    sessionInitializedRef = true;
    connectionStatus = 'connecting';

    const initSession = async () => {
      try {
        const storedSessionId = loadSessionId(pathname);
        const sessionIdToJoin = initialSessionId || storedSessionId;
        let sessionEstablished = false;

        if (sessionIdToJoin) {
          try {
            const session = await getSession(endpoint!, sessionIdToJoin);
            currentSessionId = session.id;
            connectionStatus = 'connected';
            saveSessionId(pathname, session.id);
            sessionEstablished = true;

            const allLocalAnnotations = loadAnnotations<Annotation>(pathname);
            const serverIds = new Set(session.annotations.map((a: Annotation) => a.id));
            const localToMerge = allLocalAnnotations.filter((a) => !serverIds.has(a.id));

            if (localToMerge.length > 0) {
              const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
              const pageUrl = `${baseUrl}${pathname}`;
              const results = await Promise.allSettled(
                localToMerge.map((annotation) =>
                  syncAnnotation(endpoint!, session.id, {
                    ...annotation,
                    sessionId: session.id,
                    url: pageUrl,
                  }),
                ),
              );
              const syncedAnnotations = results.map((result, i) => {
                if (result.status === 'fulfilled') return result.value;
                console.warn('[Agentation] Failed to sync annotation:', (result as PromiseRejectedResult).reason);
                return localToMerge[i];
              });
              const allAnnotations = [...session.annotations, ...syncedAnnotations];
              annotations = allAnnotations.filter(isRenderableAnnotation);
              saveAnnotationsWithSyncMarker(
                pathname,
                allAnnotations.filter(isRenderableAnnotation),
                session.id,
              );
            } else {
              annotations = session.annotations.filter(isRenderableAnnotation);
              saveAnnotationsWithSyncMarker(
                pathname,
                session.annotations.filter(isRenderableAnnotation),
                session.id,
              );
            }
          } catch (joinError) {
            console.warn('[Agentation] Could not join session, creating new:', joinError);
            clearSessionId(pathname);
          }
        }

        if (!sessionEstablished) {
          const currentUrl = typeof window !== 'undefined' ? window.location.href : '/';
          const session = await createSession(endpoint!, currentUrl);
          currentSessionId = session.id;
          connectionStatus = 'connected';
          saveSessionId(pathname, session.id);
          onSessionCreated?.(session.id);

          const allLocalAnnotations = loadAllAnnotations<Annotation>();
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
          const syncPromises: Promise<void>[] = [];
          for (const [pagePath, pageAnnotations] of allLocalAnnotations) {
            const unsyncedAnnotations = pageAnnotations.filter(
              (a) => !(a as Annotation & { _syncedTo?: string })._syncedTo,
            );
            if (unsyncedAnnotations.length === 0) continue;
            const pageUrl = `${baseUrl}${pagePath}`;
            const isCurrentPage = pagePath === pathname;
            syncPromises.push(
              (async () => {
                try {
                  const targetSession = isCurrentPage
                    ? session
                    : await createSession(endpoint!, pageUrl);
                  const results = await Promise.allSettled(
                    unsyncedAnnotations.map((annotation) =>
                      syncAnnotation(endpoint!, targetSession.id, {
                        ...annotation,
                        sessionId: targetSession.id,
                        url: pageUrl,
                      }),
                    ),
                  );
                  const syncedAnnotations = results.map((result, i) => {
                    if (result.status === 'fulfilled') return result.value;
                    return unsyncedAnnotations[i];
                  });
                  const renderableSyncedAnnotations = syncedAnnotations.filter(isRenderableAnnotation);
                  saveAnnotationsWithSyncMarker(pagePath, renderableSyncedAnnotations, targetSession.id);
                  if (isCurrentPage) {
                    const originalIds = new Set(unsyncedAnnotations.map((a) => a.id));
                    annotations = [
                      ...renderableSyncedAnnotations,
                      ...annotations.filter((a) => !originalIds.has(a.id)),
                    ];
                  }
                } catch (err) {
                  console.warn(`[Agentation] Failed to sync annotations for ${pagePath}:`, err);
                }
              })(),
            );
          }
          await Promise.allSettled(syncPromises);
        }
      } catch (error) {
        connectionStatus = 'disconnected';
        console.warn('[Agentation] Failed to initialize session:', error);
      }
    };
    initSession();
  });

  // Health check
  $effect(() => {
    if (!endpoint || !mounted) return;
    const checkHealth = async () => {
      try {
        const response = await fetch(`${endpoint}/health`);
        connectionStatus = response.ok ? 'connected' : 'disconnected';
      } catch {
        connectionStatus = 'disconnected';
      }
    };
    checkHealth();
    const interval = originalSetInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  });

  // SSE for server-side annotation updates
  $effect(() => {
    if (!endpoint || !mounted || !currentSessionId) return;
    const eventSource = new EventSource(`${endpoint}/sessions/${currentSessionId}/events`);
    const removedStatuses = ['resolved', 'dismissed'];
    const handler = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data);
        if (removedStatuses.includes(event.payload?.status)) {
          const id = event.payload.id as string;
          exitingMarkers = new Set(exitingMarkers).add(id);
          originalSetTimeout(() => {
            annotations = annotations.filter((a) => a.id !== id);
            const next = new Set(exitingMarkers);
            next.delete(id);
            exitingMarkers = next;
          }, 150);
        }
      } catch {}
    };
    eventSource.addEventListener('annotation.updated', handler);
    return () => {
      eventSource.removeEventListener('annotation.updated', handler);
      eventSource.close();
    };
  });

  // Sync local annotations on reconnect
  $effect(() => {
    if (!endpoint || !mounted) return;
    const wasDisconnected = prevConnectionStatusRef === 'disconnected';
    const isNowConnected = connectionStatus === 'connected';
    prevConnectionStatusRef = connectionStatus;
    if (wasDisconnected && isNowConnected) {
      const syncLocalAnnotations = async () => {
        try {
          const localAnnotations = loadAnnotations<Annotation>(pathname);
          if (localAnnotations.length === 0) return;
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
          const pageUrl = `${baseUrl}${pathname}`;
          let sessionId = currentSessionId;
          let serverAnnotations: Annotation[] = [];
          if (sessionId) {
            try {
              const session = await getSession(endpoint!, sessionId);
              serverAnnotations = session.annotations;
            } catch {
              sessionId = null;
            }
          }
          if (!sessionId) {
            const newSession = await createSession(endpoint!, pageUrl);
            sessionId = newSession.id;
            currentSessionId = sessionId;
            saveSessionId(pathname, sessionId);
          }
          const serverIds = new Set(serverAnnotations.map((a) => a.id));
          const unsyncedLocal = localAnnotations.filter((a) => !serverIds.has(a.id));
          if (unsyncedLocal.length > 0) {
            const results = await Promise.allSettled(
              unsyncedLocal.map((annotation) =>
                syncAnnotation(endpoint!, sessionId!, {
                  ...annotation,
                  sessionId: sessionId!,
                  url: pageUrl,
                }),
              ),
            );
            const syncedAnnotations = results.map((result, i) => {
              if (result.status === 'fulfilled') return result.value;
              return unsyncedLocal[i];
            });
            const allAnnotations = [...serverAnnotations, ...syncedAnnotations];
            const renderableAnnotations = allAnnotations.filter(isRenderableAnnotation);
            annotations = renderableAnnotations;
            saveAnnotationsWithSyncMarker(pathname, renderableAnnotations, sessionId!);
          }
        } catch (err) {
          console.warn('[Agentation] Failed to sync on reconnect:', err);
        }
      };
      syncLocalAnnotations();
    }
  });

  // Demo annotations
  $effect(() => {
    if (!enableDemoMode) return;
    if (!mounted || !demoAnnotations || demoAnnotations.length === 0) return;
    if (annotations.length > 0) return;

    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    timeoutIds.push(
      originalSetTimeout(() => {
        isActive = true;
      }, demoDelay - 200),
    );
    demoAnnotations.forEach((demo, index) => {
      const annotationDelay = demoDelay + index * 300;
      timeoutIds.push(
        originalSetTimeout(() => {
          const element = document.querySelector(demo.selector) as HTMLElement;
          if (!element) return;
          const rect = element.getBoundingClientRect();
          const { name, path } = identifyElement(element);
          const newAnnotation: Annotation = {
            id: `demo-${Date.now()}-${index}`,
            x: ((rect.left + rect.width / 2) / window.innerWidth) * 100,
            y: rect.top + rect.height / 2 + window.scrollY,
            comment: demo.comment,
            element: name,
            elementPath: path,
            timestamp: Date.now(),
            selectedText: demo.selectedText,
            boundingBox: {
              x: rect.left,
              y: rect.top + window.scrollY,
              width: rect.width,
              height: rect.height,
            },
            nearbyText: getNearbyText(element),
            cssClasses: getElementClasses(element),
          };
          annotations = [...annotations, newAnnotation];
        }, annotationDelay),
      );
    });
    return () => {
      timeoutIds.forEach(clearTimeout);
    };
  });

  // Save annotations
  $effect(() => {
    if (mounted && annotations.length > 0) {
      if (currentSessionId) {
        saveAnnotationsWithSyncMarker(pathname, annotations, currentSessionId);
      } else {
        saveAnnotations(pathname, annotations);
      }
    } else if (mounted && annotations.length === 0) {
      localStorage.removeItem(getStorageKey(pathname));
    }
  });

  // Reset state when deactivating
  $effect(() => {
    if (!isActive) {
      pendingAnnotation = null;
      editingAnnotation = null;
      editingTargetElement = null;
      editingTargetElements = [];
      hoverInfo = null;
      showSettings = false;
      pendingMultiSelectElements = [];
      modifiersHeldRef = { cmd: false, shift: false };
      if (isFrozen) unfreezeAnimations();
    }
  });

  // Custom cursor
  $effect(() => {
    if (!isActive) return;
    const style = document.createElement('style');
    style.id = 'feedback-cursor-styles';
    style.textContent = `
      body * { cursor: crosshair !important; }
      body p, body span, body h1, body h2, body h3, body h4, body h5, body h6,
      body li, body td, body th, body label, body blockquote, body figcaption,
      body caption, body legend, body dt, body dd, body pre, body code,
      body em, body strong, body b, body i, body u, body s, body a,
      body time, body address, body cite, body q, body abbr, body dfn,
      body mark, body small, body sub, body sup, body [contenteditable],
      body p *, body span *, body h1 *, body h2 *, body h3 *, body h4 *,
      body h5 *, body h6 *, body li *, body a *, body label *, body pre *,
      body code *, body blockquote *, body [contenteditable] * {
        cursor: text !important;
      }
      [data-feedback-toolbar], [data-feedback-toolbar] * { cursor: auto !important; }
      [data-feedback-toolbar] textarea,
      [data-feedback-toolbar] input[type="text"],
      [data-feedback-toolbar] input[type="url"] { cursor: text !important; }
      [data-feedback-toolbar] button, [data-feedback-toolbar] button *,
      [data-feedback-toolbar] label, [data-feedback-toolbar] label *,
      [data-feedback-toolbar] a, [data-feedback-toolbar] a *,
      [data-feedback-toolbar] [role="button"], [data-feedback-toolbar] [role="button"] * {
        cursor: pointer !important;
      }
      [data-annotation-marker], [data-annotation-marker] * { cursor: pointer !important; }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById('feedback-cursor-styles')?.remove();
    };
  });

  // Handle mouse move for hover
  $effect(() => {
    if (!isActive || pendingAnnotation) return;
    const handleMouseMove = (e: MouseEvent) => {
      const target = (e.composedPath()[0] || e.target) as HTMLElement;
      if (closestCrossingShadow(target, '[data-feedback-toolbar]')) {
        hoverInfo = null;
        return;
      }
      const elementUnder = deepElementFromPoint(e.clientX, e.clientY);
      if (!elementUnder || closestCrossingShadow(elementUnder, '[data-feedback-toolbar]')) {
        hoverInfo = null;
        return;
      }
      const { name, elementName, path } = identifyElementForSvelte(elementUnder);
      const rect = elementUnder.getBoundingClientRect();
      hoverInfo = { element: name, elementName, elementPath: path, rect };
      hoverPosition = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  });

  // Handle click
  $effect(() => {
    if (!isActive) return;
    const handleClick = (e: MouseEvent) => {
      if (justFinishedDragRef) {
        justFinishedDragRef = false;
        return;
      }
      const target = (e.composedPath()[0] || e.target) as HTMLElement;
      if (closestCrossingShadow(target, '[data-feedback-toolbar]')) return;
      if (closestCrossingShadow(target, '[data-annotation-popup]')) return;
      if (closestCrossingShadow(target, '[data-annotation-marker]')) return;

      // cmd+shift+click multi-select
      if (e.metaKey && e.shiftKey && !pendingAnnotation && !editingAnnotation) {
        e.preventDefault();
        e.stopPropagation();
        const elementUnder = deepElementFromPoint(e.clientX, e.clientY);
        if (!elementUnder) return;
        const rect = elementUnder.getBoundingClientRect();
        const { name, path } = identifyElementForSvelte(elementUnder);
        const existingIndex = pendingMultiSelectElements.findIndex(
          (item) => item.element === elementUnder,
        );
        if (existingIndex >= 0) {
          pendingMultiSelectElements = pendingMultiSelectElements.filter((_, i) => i !== existingIndex);
        } else {
          pendingMultiSelectElements = [...pendingMultiSelectElements, { element: elementUnder, rect, name, path }];
        }
        return;
      }

      const isInteractive = closestCrossingShadow(
        target,
        "button, a, input, select, textarea, [role='button'], [onclick]",
      );
      if (settings.blockInteractions && isInteractive) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (pendingAnnotation) {
        if (isInteractive && !settings.blockInteractions) return;
        e.preventDefault();
        popupRef?.shake();
        return;
      }
      if (editingAnnotation) {
        if (isInteractive && !settings.blockInteractions) return;
        e.preventDefault();
        editPopupRef?.shake();
        return;
      }
      e.preventDefault();
      const elementUnder = deepElementFromPoint(e.clientX, e.clientY);
      if (!elementUnder) return;
      const { name, path } = identifyElementForSvelte(elementUnder);
      const rect = elementUnder.getBoundingClientRect();
      const x = (e.clientX / window.innerWidth) * 100;
      const fixed = isElementFixed(elementUnder);
      const y = fixed ? e.clientY : e.clientY + window.scrollY;
      const selection = window.getSelection();
      let selectedText: string | undefined;
      if (selection && selection.toString().trim().length > 0) {
        selectedText = selection.toString().trim().slice(0, 500);
      }
      const computedStylesObj = getDetailedComputedStyles(elementUnder);
      const computedStylesStr = getForensicComputedStyles(elementUnder);
      pendingAnnotation = {
        x, y,
        clientY: e.clientY,
        element: name,
        elementPath: path,
        selectedText,
        boundingBox: {
          x: rect.left,
          y: fixed ? rect.top : rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
        },
        nearbyText: getNearbyText(elementUnder),
        cssClasses: getElementClasses(elementUnder),
        isFixed: fixed,
        fullPath: getFullElementPath(elementUnder),
        accessibility: getAccessibilityInfo(elementUnder),
        computedStyles: computedStylesStr,
        computedStylesObj,
        nearbyElements: getNearbyElements(elementUnder),
        targetElement: elementUnder,
      };
      hoverInfo = null;
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  });

  // cmd+shift multi-select key listeners
  $effect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta') modifiersHeldRef.cmd = true;
      if (e.key === 'Shift') modifiersHeldRef.shift = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const wasHoldingBoth = modifiersHeldRef.cmd && modifiersHeldRef.shift;
      if (e.key === 'Meta') modifiersHeldRef.cmd = false;
      if (e.key === 'Shift') modifiersHeldRef.shift = false;
      const nowHoldingBoth = modifiersHeldRef.cmd && modifiersHeldRef.shift;
      if (wasHoldingBoth && !nowHoldingBoth && pendingMultiSelectElements.length > 0) {
        createMultiSelectPendingAnnotation();
      }
    };
    const handleBlur = () => {
      modifiersHeldRef = { cmd: false, shift: false };
      pendingMultiSelectElements = [];
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  });

  // Multi-select drag - mousedown
  $effect(() => {
    if (!isActive || pendingAnnotation) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = (e.composedPath()[0] || e.target) as HTMLElement;
      if (closestCrossingShadow(target, '[data-feedback-toolbar]')) return;
      if (closestCrossingShadow(target, '[data-annotation-marker]')) return;
      if (closestCrossingShadow(target, '[data-annotation-popup]')) return;
      const textTags = new Set([
        'P','SPAN','H1','H2','H3','H4','H5','H6','LI','TD','TH','LABEL',
        'BLOCKQUOTE','FIGCAPTION','CAPTION','LEGEND','DT','DD','PRE','CODE',
        'EM','STRONG','B','I','U','S','A','TIME','ADDRESS','CITE','Q','ABBR',
        'DFN','MARK','SMALL','SUB','SUP',
      ]);
      if (textTags.has(target.tagName) || target.isContentEditable) return;
      mouseDownPosRef = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  });

  // Multi-select drag - mousemove
  $effect(() => {
    if (!isActive || pendingAnnotation) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseDownPosRef) return;
      const dx = e.clientX - mouseDownPosRef.x;
      const dy = e.clientY - mouseDownPosRef.y;
      const distance = dx * dx + dy * dy;
      const thresholdSq = DRAG_THRESHOLD * DRAG_THRESHOLD;
      if (!isDragging && distance >= thresholdSq) {
        dragStartRef = mouseDownPosRef;
        isDragging = true;
      }
      if ((isDragging || distance >= thresholdSq) && dragStartRef) {
        if (dragRectRef) {
          const left = Math.min(dragStartRef.x, e.clientX);
          const top = Math.min(dragStartRef.y, e.clientY);
          const width = Math.abs(e.clientX - dragStartRef.x);
          const height = Math.abs(e.clientY - dragStartRef.y);
          dragRectRef.style.transform = `translate(${left}px, ${top}px)`;
          dragRectRef.style.width = `${width}px`;
          dragRectRef.style.height = `${height}px`;
        }
        const now = Date.now();
        if (now - lastElementUpdateRef < ELEMENT_UPDATE_THROTTLE) return;
        lastElementUpdateRef = now;
        const startX = dragStartRef.x;
        const startY = dragStartRef.y;
        const left = Math.min(startX, e.clientX);
        const top = Math.min(startY, e.clientY);
        const right = Math.max(startX, e.clientX);
        const bottom = Math.max(startY, e.clientY);
        const midX = (left + right) / 2;
        const midY = (top + bottom) / 2;
        const candidateElements = new Set<HTMLElement>();
        const points = [
          [left, top],[right, top],[left, bottom],[right, bottom],
          [midX, midY],[midX, top],[midX, bottom],[left, midY],[right, midY],
        ];
        for (const [x, y] of points) {
          const elements = document.elementsFromPoint(x, y);
          for (const el of elements) {
            if (el instanceof HTMLElement) candidateElements.add(el);
          }
        }
        const nearbyElements = document.querySelectorAll(
          'button, a, input, img, p, h1, h2, h3, h4, h5, h6, li, label, td, th, div, span, section, article, aside, nav',
        );
        for (const el of nearbyElements) {
          if (el instanceof HTMLElement) {
            const rect = el.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const centerInside = centerX >= left && centerX <= right && centerY >= top && centerY <= bottom;
            const overlapX = Math.min(rect.right, right) - Math.max(rect.left, left);
            const overlapY = Math.min(rect.bottom, bottom) - Math.max(rect.top, top);
            const overlapArea = overlapX > 0 && overlapY > 0 ? overlapX * overlapY : 0;
            const elementArea = rect.width * rect.height;
            const overlapRatio = elementArea > 0 ? overlapArea / elementArea : 0;
            if (centerInside || overlapRatio > 0.5) candidateElements.add(el);
          }
        }
        const allMatching: DOMRect[] = [];
        const meaningfulTags = new Set([
          'BUTTON','A','INPUT','IMG','P','H1','H2','H3','H4','H5','H6',
          'LI','LABEL','TD','TH','SECTION','ARTICLE','ASIDE','NAV',
        ]);
        for (const el of candidateElements) {
          if (
            closestCrossingShadow(el, '[data-feedback-toolbar]') ||
            closestCrossingShadow(el, '[data-annotation-marker]')
          ) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.5) continue;
          if (rect.width < 10 || rect.height < 10) continue;
          if (rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top) {
            let shouldInclude = meaningfulTags.has(el.tagName);
            if (!shouldInclude && (el.tagName === 'DIV' || el.tagName === 'SPAN')) {
              const hasText = el.textContent && el.textContent.trim().length > 0;
              const isInteractiveEl =
                el.onclick !== null ||
                el.getAttribute('role') === 'button' ||
                el.getAttribute('role') === 'link' ||
                el.classList.contains('clickable') ||
                el.hasAttribute('data-clickable');
              if (
                (hasText || isInteractiveEl) &&
                !el.querySelector('p, h1, h2, h3, h4, h5, h6, button, a')
              ) {
                shouldInclude = true;
              }
            }
            if (shouldInclude) {
              let dominated = false;
              for (const existingRect of allMatching) {
                if (
                  existingRect.left <= rect.left &&
                  existingRect.right >= rect.right &&
                  existingRect.top <= rect.top &&
                  existingRect.bottom >= rect.bottom
                ) {
                  dominated = true;
                  break;
                }
              }
              if (!dominated) allMatching.push(rect);
            }
          }
        }
        if (highlightsContainerRef) {
          const container = highlightsContainerRef;
          while (container.children.length > allMatching.length) {
            container.removeChild(container.lastChild!);
          }
          allMatching.forEach((rect, i) => {
            let div = container.children[i] as HTMLDivElement;
            if (!div) {
              div = document.createElement('div');
              div.className = 'selectedElementHighlight';
              container.appendChild(div);
            }
            div.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
            div.style.width = `${rect.width}px`;
            div.style.height = `${rect.height}px`;
          });
        }
      }
    };
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => document.removeEventListener('mousemove', handleMouseMove);
  });

  // Multi-select drag - mouseup
  $effect(() => {
    if (!isActive) return;
    const handleMouseUp = (e: MouseEvent) => {
      const wasDragging = isDragging;
      const dragStart = dragStartRef;
      if (isDragging && dragStart) {
        justFinishedDragRef = true;
        const left = Math.min(dragStart.x, e.clientX);
        const top = Math.min(dragStart.y, e.clientY);
        const right = Math.max(dragStart.x, e.clientX);
        const bottom = Math.max(dragStart.y, e.clientY);
        const allMatching: { element: HTMLElement; rect: DOMRect }[] = [];
        const selector = 'button, a, input, img, p, h1, h2, h3, h4, h5, h6, li, label, td, th';
        document.querySelectorAll(selector).forEach((el) => {
          if (!(el instanceof HTMLElement)) return;
          if (
            closestCrossingShadow(el, '[data-feedback-toolbar]') ||
            closestCrossingShadow(el, '[data-annotation-marker]')
          ) return;
          const rect = el.getBoundingClientRect();
          if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.5) return;
          if (rect.width < 10 || rect.height < 10) return;
          if (rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top) {
            allMatching.push({ element: el, rect });
          }
        });
        const finalElements = allMatching.filter(
          ({ element: el }) =>
            !allMatching.some(({ element: other }) => other !== el && el.contains(other)),
        );
        const x = (e.clientX / window.innerWidth) * 100;
        const y = e.clientY + window.scrollY;
        if (finalElements.length > 0) {
          const bounds = finalElements.reduce(
            (acc, { rect }) => ({
              left: Math.min(acc.left, rect.left),
              top: Math.min(acc.top, rect.top),
              right: Math.max(acc.right, rect.right),
              bottom: Math.max(acc.bottom, rect.bottom),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
          );
          const elementNames = finalElements.slice(0, 5).map(({ element }) => identifyElement(element).name).join(', ');
          const suffix = finalElements.length > 5 ? ` +${finalElements.length - 5} more` : '';
          const firstElement = finalElements[0].element;
          pendingAnnotation = {
            x, y,
            clientY: e.clientY,
            element: `${finalElements.length} elements: ${elementNames}${suffix}`,
            elementPath: 'multi-select',
            boundingBox: {
              x: bounds.left,
              y: bounds.top + window.scrollY,
              width: bounds.right - bounds.left,
              height: bounds.bottom - bounds.top,
            },
            isMultiSelect: true,
            fullPath: getFullElementPath(firstElement),
            accessibility: getAccessibilityInfo(firstElement),
            computedStyles: getForensicComputedStyles(firstElement),
            computedStylesObj: getDetailedComputedStyles(firstElement),
            nearbyElements: getNearbyElements(firstElement),
            cssClasses: getElementClasses(firstElement),
            nearbyText: getNearbyText(firstElement),
          };
        } else {
          const width = Math.abs(right - left);
          const height = Math.abs(bottom - top);
          if (width > 20 && height > 20) {
            pendingAnnotation = {
              x, y,
              clientY: e.clientY,
              element: 'Area selection',
              elementPath: `region at (${Math.round(left)}, ${Math.round(top)})`,
              boundingBox: { x: left, y: top + window.scrollY, width, height },
              isMultiSelect: true,
            };
          }
        }
        hoverInfo = null;
      } else if (wasDragging) {
        justFinishedDragRef = true;
      }
      mouseDownPosRef = null;
      dragStartRef = null;
      isDragging = false;
      clearHighlightsContainer();
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  });

  // Toolbar dragging
  $effect(() => {
    if (!dragStartPos) return;
    const TOOLBAR_DRAG_THRESHOLD = 10;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartPos!.x;
      const deltaY = e.clientY - dragStartPos!.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (!isDraggingToolbar && distance > TOOLBAR_DRAG_THRESHOLD) {
        isDraggingToolbar = true;
      }
      if (isDraggingToolbar || distance > TOOLBAR_DRAG_THRESHOLD) {
        let newX = dragStartPos!.toolbarX + deltaX;
        let newY = dragStartPos!.toolbarY + deltaY;
        const padding = 20;
        const wrapperWidth = 297;
        const toolbarHeight = 44;
        const contentWidth = isActive
          ? connectionStatus === 'connected' ? 297 : 257
          : 44;
        const contentOffset = wrapperWidth - contentWidth;
        const minX = padding - contentOffset;
        const maxX = window.innerWidth - padding - wrapperWidth;
        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(padding, Math.min(window.innerHeight - toolbarHeight - padding, newY));
        toolbarPosition = { x: newX, y: newY };
      }
    };
    const handleMouseUp = () => {
      if (isDraggingToolbar) justFinishedToolbarDragRef = true;
      isDraggingToolbar = false;
      dragStartPos = null;
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  });

  // Constrain toolbar on resize
  $effect(() => {
    if (!toolbarPosition) return;
    const constrainPosition = () => {
      const padding = 20;
      const wrapperWidth = 297;
      const toolbarHeight = 44;
      let newX = toolbarPosition!.x;
      let newY = toolbarPosition!.y;
      const contentWidth = isActive
        ? connectionStatus === 'connected' ? 297 : 257
        : 44;
      const contentOffset = wrapperWidth - contentWidth;
      const minX = padding - contentOffset;
      const maxX = window.innerWidth - padding - wrapperWidth;
      newX = Math.max(minX, Math.min(maxX, newX));
      newY = Math.max(padding, Math.min(window.innerHeight - toolbarHeight - padding, newY));
      if (newX !== toolbarPosition!.x || newY !== toolbarPosition!.y) {
        toolbarPosition = { x: newX, y: newY };
      }
    };
    constrainPosition();
    window.addEventListener('resize', constrainPosition);
    return () => window.removeEventListener('resize', constrainPosition);
  });

  // Keyboard shortcuts
  $effect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === 'Escape') {
        if (pendingMultiSelectElements.length > 0) {
          pendingMultiSelectElements = [];
          return;
        }
        if (pendingAnnotation) {
          // Let popup handle
        } else if (isActive) {
          hideTooltipsUntilMouseLeave();
          isActive = false;
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        hideTooltipsUntilMouseLeave();
        isActive = !isActive;
        return;
      }
      if (isTyping || e.metaKey || e.ctrlKey) return;
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        hideTooltipsUntilMouseLeave();
        toggleFreeze();
      }
      if ((e.key === 'h' || e.key === 'H') && annotations.length > 0) {
        e.preventDefault();
        hideTooltipsUntilMouseLeave();
        showMarkers = !showMarkers;
      }
      if ((e.key === 'c' || e.key === 'C') && annotations.length > 0) {
        e.preventDefault();
        hideTooltipsUntilMouseLeave();
        copyOutput();
      }
      if ((e.key === 'x' || e.key === 'X') && annotations.length > 0) {
        e.preventDefault();
        hideTooltipsUntilMouseLeave();
        clearAll();
      }
      if (e.key === 's' || e.key === 'S') {
        const hasValidWebhook = isValidUrl(settings.webhookUrl) || isValidUrl(webhookUrl || '');
        if (annotations.length > 0 && hasValidWebhook && sendState === 'idle') {
          e.preventDefault();
          hideTooltipsUntilMouseLeave();
          sendToWebhook();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });
</script>

{#if mounted && !isToolbarHidden}
  <div
    bind:this={portalWrapper}
    style="display: contents"
    data-agentation-theme={isDarkMode ? 'dark' : 'light'}
    data-agentation-accent={settings.annotationColorId}
  >
    <!-- Toolbar -->
    <div
      class="toolbar {userClassName || ''}"
      data-feedback-toolbar
      style={toolbarPosition
        ? `left: ${toolbarPosition.x}px; top: ${toolbarPosition.y}px; right: auto; bottom: auto;`
        : ''}
    >
      <div
        class="toolbarContainer {isActive ? 'expanded' : 'collapsed'} {showEntranceAnimation ? 'entrance' : ''} {isToolbarHiding ? 'hiding' : ''} {isDraggingToolbar ? 'dragging' : ''} {!settings.webhooksEnabled && (isValidUrl(settings.webhookUrl) || isValidUrl(webhookUrl || '')) ? 'serverConnected' : ''}"
        onclick={!isActive
          ? (e: MouseEvent) => {
              if (justFinishedToolbarDragRef) {
                justFinishedToolbarDragRef = false;
                e.preventDefault();
                return;
              }
              isActive = true;
            }
          : undefined}
        onmousedown={handleToolbarMouseDown}
        role={!isActive ? 'button' : undefined}
        tabindex={!isActive ? 0 : -1}
        style={isDraggingToolbar
          ? `transform: scale(1.05) rotate(${dragRotation}deg); cursor: grabbing;`
          : ''}
      >
        <div class="toggleContent {!isActive ? 'visible' : 'hidden'}">
          <IconListSparkle size={24} />
          {#if hasAnnotations}
            <span class="badge {isActive ? 'fadeOut' : ''} {showEntranceAnimation ? 'entrance' : ''}">
              {annotations.length}
            </span>
          {/if}
        </div>

        <div
          class="controlsContent {isActive ? 'visible' : 'hidden'} {toolbarPosition && toolbarPosition.y < 100 ? 'tooltipBelow' : ''} {tooltipsHidden || showSettings ? 'tooltipsHidden' : ''} {tooltipSessionActive ? 'tooltipsInSession' : ''}"
          onmouseenter={handleControlsMouseEnter}
          onmouseleave={handleControlsMouseLeave}
        >
          <div class="buttonWrapper {toolbarPosition && toolbarPosition.x < 120 ? 'buttonWrapperAlignLeft' : ''}">
            <button class="controlButton" onclick={(e: MouseEvent) => { e.stopPropagation(); hideTooltipsUntilMouseLeave(); toggleFreeze(); }} data-active={isFrozen}>
              <IconPausePlayAnimated size={24} isPaused={isFrozen} />
            </button>
            <span class="buttonTooltip">{isFrozen ? 'Resume animations' : 'Pause animations'}<span class="shortcut">P</span></span>
          </div>

          <div class="buttonWrapper">
            <button class="controlButton" onclick={(e: MouseEvent) => { e.stopPropagation(); hideTooltipsUntilMouseLeave(); showMarkers = !showMarkers; }} disabled={!hasAnnotations}>
              <IconEyeAnimated size={24} isOpen={showMarkers} />
            </button>
            <span class="buttonTooltip">{showMarkers ? 'Hide markers' : 'Show markers'}<span class="shortcut">H</span></span>
          </div>

          <div class="buttonWrapper">
            <button class="controlButton {copied ? 'statusShowing' : ''}" onclick={(e: MouseEvent) => { e.stopPropagation(); hideTooltipsUntilMouseLeave(); copyOutput(); }} disabled={!hasAnnotations} data-active={copied}>
              <IconCopyAnimated size={24} copied={copied} />
            </button>
            <span class="buttonTooltip">Copy feedback<span class="shortcut">C</span></span>
          </div>

          <div class="buttonWrapper sendButtonWrapper {isActive && !settings.webhooksEnabled && (isValidUrl(settings.webhookUrl) || isValidUrl(webhookUrl || '')) ? 'sendButtonVisible' : ''}">
            <button
              class="controlButton {sendState === 'sent' || sendState === 'failed' ? 'statusShowing' : ''}"
              onclick={(e: MouseEvent) => { e.stopPropagation(); hideTooltipsUntilMouseLeave(); sendToWebhook(); }}
              disabled={!hasAnnotations || (!isValidUrl(settings.webhookUrl) && !isValidUrl(webhookUrl || '')) || sendState === 'sending'}
              data-no-hover={sendState === 'sent' || sendState === 'failed'}
              tabindex={isValidUrl(settings.webhookUrl) || isValidUrl(webhookUrl || '') ? 0 : -1}
            >
              <IconSendArrow size={24} state={sendState} />
              {#if hasAnnotations && sendState === 'idle'}
                <span class="buttonBadge">{annotations.length}</span>
              {/if}
            </button>
            <span class="buttonTooltip">Send Annotations<span class="shortcut">S</span></span>
          </div>

          <div class="buttonWrapper">
            <button class="controlButton" onclick={(e: MouseEvent) => { e.stopPropagation(); hideTooltipsUntilMouseLeave(); clearAll(); }} disabled={!hasAnnotations} data-danger>
              <IconTrashAlt size={24} />
            </button>
            <span class="buttonTooltip">Clear all<span class="shortcut">X</span></span>
          </div>

          <div class="buttonWrapper">
            <button class="controlButton" onclick={(e: MouseEvent) => { e.stopPropagation(); hideTooltipsUntilMouseLeave(); showSettings = !showSettings; }}>
              <IconGear size={24} />
            </button>
            {#if endpoint && connectionStatus !== 'disconnected'}
              <span class="mcpIndicator {connectionStatus} {showSettings ? 'hidden' : ''}" title={connectionStatus === 'connected' ? 'MCP Connected' : 'MCP Connecting...'}></span>
            {/if}
            <span class="buttonTooltip">Settings</span>
          </div>

          <div class="divider"></div>

          <div class="buttonWrapper {toolbarPosition && typeof window !== 'undefined' && toolbarPosition.x > window.innerWidth - 120 ? 'buttonWrapperAlignRight' : ''}">
            <button class="controlButton" onclick={(e: MouseEvent) => { e.stopPropagation(); hideTooltipsUntilMouseLeave(); isActive = false; }}>
              <IconXmarkLarge size={24} />
            </button>
            <span class="buttonTooltip">Exit<span class="shortcut">Esc</span></span>
          </div>
        </div>

        <!-- Settings Panel -->
        <div class="settingsPanel {showSettingsVisible ? 'enter' : 'exit'}" onclick={(e: MouseEvent) => e.stopPropagation()} style={toolbarPosition && toolbarPosition.y < 230 ? 'bottom: auto; top: calc(100% + 0.5rem);' : ''}>
          <div class="settingsPanelContainer">
            <div class="settingsPage {settingsPage === 'automations' ? 'slideLeft' : ''}">
              <div class="settingsHeader">
                <span class="settingsBrand"><span class="settingsBrandSlash">/</span>agentation</span>
                <span class="settingsVersion"></span>
                <button class="themeToggle" onclick={toggleTheme} title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
                  <span class="themeIconWrapper"><span class="themeIcon">
                    {#if isDarkMode}<IconSun size={20} />{:else}<IconMoon size={20} />{/if}
                  </span></span>
                </button>
              </div>

              <div class="settingsSection">
                <div class="settingsRow">
                  <div class="settingsLabel">Output Detail<HelpTooltip content="Controls how much detail is included in the copied output" /></div>
                  <button class="cycleButton" onclick={() => { const ci = OUTPUT_DETAIL_OPTIONS.findIndex((o) => o.value === settings.outputDetail); const ni = (ci + 1) % OUTPUT_DETAIL_OPTIONS.length; settings = { ...settings, outputDetail: OUTPUT_DETAIL_OPTIONS[ni].value }; }}>
                    <span class="cycleButtonText">{OUTPUT_DETAIL_OPTIONS.find((o) => o.value === settings.outputDetail)?.label}</span>
                    <span class="cycleDots">{#each OUTPUT_DETAIL_OPTIONS as option}<span class="cycleDot {settings.outputDetail === option.value ? 'active' : ''}"></span>{/each}</span>
                  </button>
                </div>
                <div class="settingsRow settingsRowMarginTop">
                  <div class="settingsLabel">Hide Until Restart<HelpTooltip content="Hides the toolbar until you open a new tab" /></div>
                  <label class="toggleSwitch">
                    <input type="checkbox" checked={false} onchange={(e: Event) => { if ((e.target as HTMLInputElement).checked) hideToolbarTemporarily(); }} />
                    <span class="toggleSlider"></span>
                  </label>
                </div>
              </div>

              <div class="settingsSection">
                <div class="settingsLabel settingsLabelMarker">Marker Color</div>
                <div class="colorOptions">
                  {#each COLOR_OPTIONS as color}
                    <div role="button" tabindex="0" onclick={() => (settings = { ...settings, annotationColorId: color.id })} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') settings = { ...settings, annotationColorId: color.id }; }} style="--swatch: {color.srgb}; --swatch-p3: {color.p3};" class="colorOptionRing {settings.annotationColorId === color.id ? 'selected' : ''}">
                      <div class="colorOption {settings.annotationColorId === color.id ? 'selected' : ''}" title={color.label}></div>
                    </div>
                  {/each}
                </div>
              </div>

              <div class="settingsSection">
                <label class="settingsToggle">
                  <input type="checkbox" id="autoClearAfterCopy" checked={settings.autoClearAfterCopy} onchange={(e: Event) => (settings = { ...settings, autoClearAfterCopy: (e.target as HTMLInputElement).checked })} />
                  <label class="customCheckbox {settings.autoClearAfterCopy ? 'checked' : ''}" for="autoClearAfterCopy">
                    {#if settings.autoClearAfterCopy}<IconCheckSmallAnimated size={14} />{/if}
                  </label>
                  <span class="toggleLabel">Clear on copy/send<HelpTooltip content="Automatically clear annotations after copying" /></span>
                </label>
                <label class="settingsToggle settingsToggleMarginBottom">
                  <input type="checkbox" id="blockInteractions" checked={settings.blockInteractions} onchange={(e: Event) => (settings = { ...settings, blockInteractions: (e.target as HTMLInputElement).checked })} />
                  <label class="customCheckbox {settings.blockInteractions ? 'checked' : ''}" for="blockInteractions">
                    {#if settings.blockInteractions}<IconCheckSmallAnimated size={14} />{/if}
                  </label>
                  <span class="toggleLabel">Block page interactions</span>
                </label>
              </div>

              <div class="settingsSection settingsSectionExtraPadding">
                <button class="settingsNavLink" onclick={() => (settingsPage = 'automations')}>
                  <span>Manage MCP & Webhooks</span>
                  <span class="settingsNavLinkRight">
                    {#if endpoint && connectionStatus !== 'disconnected'}<span class="mcpNavIndicator {connectionStatus}"></span>{/if}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 12.5L12 8L7.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </button>
              </div>
            </div>

            <div class="settingsPage automationsPage {settingsPage === 'automations' ? 'slideIn' : ''}">
              <button class="settingsBackButton" onclick={() => (settingsPage = 'main')}><IconChevronLeft size={16} /><span>Manage MCP & Webhooks</span></button>
              <div class="settingsSection">
                <div class="settingsRow">
                  <span class="automationHeader">MCP Connection<HelpTooltip content="Connect via Model Context Protocol to let AI agents like Claude Code receive annotations in real-time." /></span>
                  {#if endpoint}<div class="mcpStatusDot {connectionStatus}" title={connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}></div>{/if}
                </div>
                <p class="automationDescription" style="padding-bottom: 6px;">MCP connection allows agents to receive and act on annotations. <a href="https://agentation.dev/mcp" target="_blank" rel="noopener noreferrer" class="learnMoreLink">Learn more</a></p>
              </div>
              <div class="settingsSection settingsSectionGrow">
                <div class="settingsRow">
                  <span class="automationHeader">Webhooks<HelpTooltip content="Send annotation data to any URL endpoint when annotations change. Useful for custom integrations." /></span>
                  <div class="autoSendRow">
                    <span class="autoSendLabel {settings.webhooksEnabled ? 'active' : ''}">Auto-Send</span>
                    <label class="toggleSwitch {!settings.webhookUrl ? 'disabled' : ''}">
                      <input type="checkbox" checked={settings.webhooksEnabled} disabled={!settings.webhookUrl} onchange={() => (settings = { ...settings, webhooksEnabled: !settings.webhooksEnabled })} />
                      <span class="toggleSlider"></span>
                    </label>
                  </div>
                </div>
                <p class="automationDescription">The webhook URL will receive live annotation changes and annotation data.</p>
                <textarea class="webhookUrlInput" placeholder="Webhook URL" value={settings.webhookUrl} onkeydown={(e: KeyboardEvent) => e.stopPropagation()} oninput={(e: Event) => (settings = { ...settings, webhookUrl: (e.target as HTMLTextAreaElement).value })}></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Markers layer -->
    <div class="markersLayer" data-feedback-toolbar>
      {#if markersVisible}
        {#each visibleAnnotations.filter((a) => !a.isFixed) as annotation, index (annotation.id)}
          {@const isHovered = !markersExiting && hoveredMarkerId === annotation.id}
          {@const isDeleting = deletingMarkerId === annotation.id}
          {@const showDeleteState = (isHovered || isDeleting) && !editingAnnotation}
          {@const isMulti = annotation.isMultiSelect}
          {@const markerColor = isMulti ? 'var(--agentation-color-green)' : 'var(--agentation-color-accent)'}
          {@const globalIndex = annotations.findIndex((a) => a.id === annotation.id)}
          {@const needsEnterAnimation = !animatedMarkers.has(annotation.id)}
          {@const animClass = markersExiting ? 'exit' : isClearing ? 'clearing' : needsEnterAnimation ? 'enter' : ''}
          {@const showDeleteHover = showDeleteState && settings.markerClickBehavior === 'delete'}
          <div
            class="marker {isMulti ? 'multiSelect' : ''} {animClass} {showDeleteHover ? 'hovered' : ''}"
            data-annotation-marker
            style="left: {annotation.x}%; top: {annotation.y}px; {showDeleteHover ? '' : `background-color: ${markerColor};`} animation-delay: {markersExiting ? `${(visibleAnnotations.filter((a) => !a.isFixed).length - 1 - index) * 20}ms` : `${index * 20}ms`};"
            onmouseenter={() => { if (!markersExiting && annotation.id !== recentlyAddedIdRef) handleMarkerHover(annotation); }}
            onmouseleave={() => handleMarkerHover(null)}
            onclick={(e: MouseEvent) => { e.stopPropagation(); if (!markersExiting) { if (settings.markerClickBehavior === 'delete') deleteAnnotation(annotation.id); else startEditAnnotation(annotation); } }}
            oncontextmenu={(e: MouseEvent) => { if (settings.markerClickBehavior === 'delete') { e.preventDefault(); e.stopPropagation(); if (!markersExiting) startEditAnnotation(annotation); } }}
          >
            {#if showDeleteState}
              {#if showDeleteHover}<IconXmark size={isMulti ? 18 : 16} />{:else}<IconEdit size={16} />{/if}
            {:else}
              <span class={renumberFrom !== null && globalIndex >= renumberFrom ? 'renumber' : ''}>{globalIndex + 1}</span>
            {/if}
            {#if isHovered && !editingAnnotation}
              <div class="markerTooltip enter" style={getTooltipPositionStyle(annotation)}>
                <span class="markerQuote">{annotation.element}{#if annotation.selectedText}{` "${annotation.selectedText.slice(0, 30)}${annotation.selectedText.length > 30 ? '...' : ''}"`}{/if}</span>
                <span class="markerNote">{annotation.comment}</span>
              </div>
            {/if}
          </div>
        {/each}
        {#if !markersExiting}
          {#each exitingAnnotationsList.filter((a) => !a.isFixed) as annotation (annotation.id)}
            {@const isMulti = annotation.isMultiSelect}
            <div class="marker hovered {isMulti ? 'multiSelect' : ''} exit" data-annotation-marker style="left: {annotation.x}%; top: {annotation.y}px;">
              <IconXmark size={isMulti ? 12 : 10} />
            </div>
          {/each}
        {/if}
      {/if}
    </div>

    <!-- Fixed markers layer -->
    <div class="fixedMarkersLayer" data-feedback-toolbar>
      {#if markersVisible}
        {#each visibleAnnotations.filter((a) => a.isFixed) as annotation, index (annotation.id)}
          {@const fixedAnnotations = visibleAnnotations.filter((a) => a.isFixed)}
          {@const isHovered = !markersExiting && hoveredMarkerId === annotation.id}
          {@const isDeleting = deletingMarkerId === annotation.id}
          {@const showDeleteState = (isHovered || isDeleting) && !editingAnnotation}
          {@const isMulti = annotation.isMultiSelect}
          {@const markerColor = isMulti ? 'var(--agentation-color-green)' : 'var(--agentation-color-accent)'}
          {@const globalIndex = annotations.findIndex((a) => a.id === annotation.id)}
          {@const needsEnterAnimation = !animatedMarkers.has(annotation.id)}
          {@const animClass = markersExiting ? 'exit' : isClearing ? 'clearing' : needsEnterAnimation ? 'enter' : ''}
          {@const showDeleteHover = showDeleteState && settings.markerClickBehavior === 'delete'}
          <div
            class="marker fixed {isMulti ? 'multiSelect' : ''} {animClass} {showDeleteHover ? 'hovered' : ''}"
            data-annotation-marker
            style="left: {annotation.x}%; top: {annotation.y}px; {showDeleteHover ? '' : `background-color: ${markerColor};`} animation-delay: {markersExiting ? `${(fixedAnnotations.length - 1 - index) * 20}ms` : `${index * 20}ms`};"
            onmouseenter={() => { if (!markersExiting && annotation.id !== recentlyAddedIdRef) handleMarkerHover(annotation); }}
            onmouseleave={() => handleMarkerHover(null)}
            onclick={(e: MouseEvent) => { e.stopPropagation(); if (!markersExiting) { if (settings.markerClickBehavior === 'delete') deleteAnnotation(annotation.id); else startEditAnnotation(annotation); } }}
            oncontextmenu={(e: MouseEvent) => { if (settings.markerClickBehavior === 'delete') { e.preventDefault(); e.stopPropagation(); if (!markersExiting) startEditAnnotation(annotation); } }}
          >
            {#if showDeleteState}
              {#if showDeleteHover}<IconXmark size={isMulti ? 18 : 16} />{:else}<IconEdit size={16} />{/if}
            {:else}
              <span class={renumberFrom !== null && globalIndex >= renumberFrom ? 'renumber' : ''}>{globalIndex + 1}</span>
            {/if}
            {#if isHovered && !editingAnnotation}
              <div class="markerTooltip enter" style={getTooltipPositionStyle(annotation)}>
                <span class="markerQuote">{annotation.element}{#if annotation.selectedText}{` "${annotation.selectedText.slice(0, 30)}${annotation.selectedText.length > 30 ? '...' : ''}"`}{/if}</span>
                <span class="markerNote">{annotation.comment}</span>
              </div>
            {/if}
          </div>
        {/each}
        {#if !markersExiting}
          {#each exitingAnnotationsList.filter((a) => a.isFixed) as annotation (annotation.id)}
            {@const isMulti = annotation.isMultiSelect}
            <div class="marker fixed hovered {isMulti ? 'multiSelect' : ''} exit" data-annotation-marker style="left: {annotation.x}%; top: {annotation.y}px;">
              <IconClose size={isMulti ? 12 : 10} />
            </div>
          {/each}
        {/if}
      {/if}
    </div>

    <!-- Interactive overlay -->
    {#if isActive}
      <div class="overlay" data-feedback-toolbar style={pendingAnnotation || editingAnnotation ? 'z-index: 99999;' : ''}>
        {#if hoverInfo?.rect && !pendingAnnotation && !isScrolling && !isDragging}
          <div class="hoverHighlight enter" style="left: {hoverInfo.rect.left}px; top: {hoverInfo.rect.top}px; width: {hoverInfo.rect.width}px; height: {hoverInfo.rect.height}px;"></div>
        {/if}

        {#each pendingMultiSelectElements.filter((item) => document.contains(item.element)) as item, index}
          {@const rect = item.element.getBoundingClientRect()}
          {@const isMulti = pendingMultiSelectElements.length > 1}
          <div class={isMulti ? 'multiSelectOutline' : 'singleSelectOutline'} style="position: fixed; left: {rect.left}px; top: {rect.top}px; width: {rect.width}px; height: {rect.height}px; {!isMulti ? 'border-color: color-mix(in srgb, var(--agentation-color-accent) 60%, transparent); background-color: color-mix(in srgb, var(--agentation-color-accent) 5%, transparent);' : ''}"></div>
        {/each}

        {#if hoveredMarkerId && !pendingAnnotation}
          {@const hoveredAnnotation = annotations.find((a) => a.id === hoveredMarkerId)}
          {#if hoveredAnnotation?.boundingBox}
            {#if hoveredAnnotation.elementBoundingBoxes?.length}
              {#if hoveredTargetElements.length > 0}
                {#each hoveredTargetElements.filter((el) => document.contains(el)) as el, index}
                  {@const rect = el.getBoundingClientRect()}
                  <div class="multiSelectOutline enter" style="left: {rect.left}px; top: {rect.top}px; width: {rect.width}px; height: {rect.height}px;"></div>
                {/each}
              {:else}
                {#each hoveredAnnotation.elementBoundingBoxes as bb, index}
                  <div class="multiSelectOutline enter" style="left: {bb.x}px; top: {bb.y - scrollY}px; width: {bb.width}px; height: {bb.height}px;"></div>
                {/each}
              {/if}
            {:else}
              {@const rect = hoveredTargetElement && document.contains(hoveredTargetElement) ? hoveredTargetElement.getBoundingClientRect() : null}
              {@const bb = rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : { x: hoveredAnnotation.boundingBox.x, y: hoveredAnnotation.isFixed ? hoveredAnnotation.boundingBox.y : hoveredAnnotation.boundingBox.y - scrollY, width: hoveredAnnotation.boundingBox.width, height: hoveredAnnotation.boundingBox.height }}
              {@const isMulti = hoveredAnnotation.isMultiSelect}
              <div class="{isMulti ? 'multiSelectOutline' : 'singleSelectOutline'} enter" style="left: {bb.x}px; top: {bb.y}px; width: {bb.width}px; height: {bb.height}px; {!isMulti ? 'border-color: color-mix(in srgb, var(--agentation-color-accent) 60%, transparent); background-color: color-mix(in srgb, var(--agentation-color-accent) 5%, transparent);' : ''}"></div>
            {/if}
          {/if}
        {/if}

        {#if hoverInfo && !pendingAnnotation && !isScrolling && !isDragging}
          <div class="hoverTooltip enter" style="left: {Math.max(8, Math.min(hoverPosition.x, window.innerWidth - 100))}px; top: {Math.max(hoverPosition.y - 32, 8)}px;">
            <div class="hoverElementName">{hoverInfo.elementName}</div>
          </div>
        {/if}

        {#if pendingAnnotation}
          {#if pendingAnnotation.multiSelectElements?.length}
            {#each pendingAnnotation.multiSelectElements.filter((el) => document.contains(el)) as el, index}
              {@const rect = el.getBoundingClientRect()}
              <div class="multiSelectOutline {pendingExiting ? 'exit' : 'enter'}" style="left: {rect.left}px; top: {rect.top}px; width: {rect.width}px; height: {rect.height}px;"></div>
            {/each}
          {:else if pendingAnnotation.targetElement && document.contains(pendingAnnotation.targetElement)}
            {@const rect = pendingAnnotation.targetElement.getBoundingClientRect()}
            <div class="singleSelectOutline {pendingExiting ? 'exit' : 'enter'}" style="left: {rect.left}px; top: {rect.top}px; width: {rect.width}px; height: {rect.height}px; border-color: color-mix(in srgb, var(--agentation-color-accent) 60%, transparent); background-color: color-mix(in srgb, var(--agentation-color-accent) 5%, transparent);"></div>
          {:else if pendingAnnotation.boundingBox}
            <div class="{pendingAnnotation.isMultiSelect ? 'multiSelectOutline' : 'singleSelectOutline'} {pendingExiting ? 'exit' : 'enter'}" style="left: {pendingAnnotation.boundingBox.x}px; top: {pendingAnnotation.boundingBox.y - scrollY}px; width: {pendingAnnotation.boundingBox.width}px; height: {pendingAnnotation.boundingBox.height}px; {!pendingAnnotation.isMultiSelect ? 'border-color: color-mix(in srgb, var(--agentation-color-accent) 60%, transparent); background-color: color-mix(in srgb, var(--agentation-color-accent) 5%, transparent);' : ''}"></div>
          {/if}

          {@const markerX = pendingAnnotation.x}
          {@const markerY = pendingAnnotation.isFixed ? pendingAnnotation.y : pendingAnnotation.y - scrollY}
          <div class="marker pending {pendingAnnotation.isMultiSelect ? 'multiSelect' : ''} {pendingExiting ? 'exit' : 'enter'}" style="left: {markerX}%; top: {markerY}px; background-color: {pendingAnnotation.isMultiSelect ? 'var(--agentation-color-green)' : 'var(--agentation-color-accent)'};">
            <IconPlus size={12} />
          </div>

          <AnnotationPopup
            bind:this={popupRef}
            element={pendingAnnotation.element}
            selectedText={pendingAnnotation.selectedText}
            computedStyles={pendingAnnotation.computedStylesObj}
            placeholder={pendingAnnotation.element === 'Area selection' ? 'What should change in this area?' : pendingAnnotation.isMultiSelect ? 'Feedback for this group of elements...' : 'What should change?'}
            onSubmit={addAnnotation}
            onCancel={cancelAnnotation}
            isExiting={pendingExiting}
            lightMode={!isDarkMode}
            accentColor={pendingAnnotation.isMultiSelect ? 'var(--agentation-color-green)' : 'var(--agentation-color-accent)'}
            style="left: {Math.max(160, Math.min(window.innerWidth - 160, (markerX / 100) * window.innerWidth))}px; {markerY > window.innerHeight - 290 ? `bottom: ${window.innerHeight - markerY + 20}px;` : `top: ${markerY + 20}px;`}"
          />
        {/if}

        {#if editingAnnotation}
          {#if editingAnnotation.elementBoundingBoxes?.length}
            {#if editingTargetElements.length > 0}
              {#each editingTargetElements.filter((el) => document.contains(el)) as el, index}
                {@const rect = el.getBoundingClientRect()}
                <div class="multiSelectOutline enter" style="left: {rect.left}px; top: {rect.top}px; width: {rect.width}px; height: {rect.height}px;"></div>
              {/each}
            {:else}
              {#each editingAnnotation.elementBoundingBoxes as bb, index}
                <div class="multiSelectOutline enter" style="left: {bb.x}px; top: {bb.y - scrollY}px; width: {bb.width}px; height: {bb.height}px;"></div>
              {/each}
            {/if}
          {:else}
            {@const rect = editingTargetElement && document.contains(editingTargetElement) ? editingTargetElement.getBoundingClientRect() : null}
            {@const bb = rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : editingAnnotation.boundingBox ? { x: editingAnnotation.boundingBox.x, y: editingAnnotation.isFixed ? editingAnnotation.boundingBox.y : editingAnnotation.boundingBox.y - scrollY, width: editingAnnotation.boundingBox.width, height: editingAnnotation.boundingBox.height } : null}
            {#if bb}
              <div class="{editingAnnotation.isMultiSelect ? 'multiSelectOutline' : 'singleSelectOutline'} enter" style="left: {bb.x}px; top: {bb.y}px; width: {bb.width}px; height: {bb.height}px; {!editingAnnotation.isMultiSelect ? 'border-color: color-mix(in srgb, var(--agentation-color-accent) 60%, transparent); background-color: color-mix(in srgb, var(--agentation-color-accent) 5%, transparent);' : ''}"></div>
            {/if}
          {/if}

          {@const editMarkerY = editingAnnotation.isFixed ? editingAnnotation.y : editingAnnotation.y - scrollY}
          <AnnotationPopup
            bind:this={editPopupRef}
            element={editingAnnotation.element}
            selectedText={editingAnnotation.selectedText}
            computedStyles={parseComputedStylesString(editingAnnotation.computedStyles)}
            placeholder="Edit your feedback..."
            initialValue={editingAnnotation.comment}
            submitLabel="Save"
            onSubmit={updateAnnotation}
            onCancel={cancelEditAnnotation}
            onDelete={() => deleteAnnotation(editingAnnotation!.id)}
            isExiting={editExiting}
            lightMode={!isDarkMode}
            accentColor={editingAnnotation.isMultiSelect ? 'var(--agentation-color-green)' : 'var(--agentation-color-accent)'}
            style="left: {Math.max(160, Math.min(window.innerWidth - 160, (editingAnnotation.x / 100) * window.innerWidth))}px; {editMarkerY > window.innerHeight - 290 ? `bottom: ${window.innerHeight - editMarkerY + 20}px;` : `top: ${editMarkerY + 20}px;`}"
          />
        {/if}

        {#if isDragging}
          <div bind:this={dragRectRef} class="dragSelection"></div>
          <div bind:this={highlightsContainerRef} class="highlightsContainer"></div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  @keyframes toolbarEnter { from { opacity: 0; transform: scale(0.5) rotate(90deg); } to { opacity: 1; transform: scale(1) rotate(0deg); } }
  @keyframes toolbarHide { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.8); } }
  @keyframes badgeEnter { from { opacity: 0; transform: scale(0); } to { opacity: 1; transform: scale(1); } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
  @keyframes markerIn { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
  @keyframes markerOut { 0% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
  @keyframes tooltipIn { from { opacity: 0; transform: translateX(-50%) translateY(2px) scale(0.891); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(0.909); } }
  @keyframes hoverHighlightIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
  @keyframes hoverTooltipIn { from { opacity: 0; transform: scale(0.95) translateY(4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  @keyframes connectionPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.9); } }
  @keyframes mcpIndicatorPulseConnected { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--agentation-color-green) 50%, transparent); } 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--agentation-color-green) 0%, transparent); } }
  @keyframes mcpIndicatorPulseConnecting { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--agentation-color-yellow) 50%, transparent); } 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--agentation-color-yellow) 0%, transparent); } }
  @keyframes mcpPulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--agentation-color-green) 50%, transparent); } 70% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--agentation-color-green) 0%, transparent); } 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--agentation-color-green) 0%, transparent); } }
  @keyframes mcpPulseError { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--agentation-color-red) 50%, transparent); } 70% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--agentation-color-red) 0%, transparent); } 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--agentation-color-red) 0%, transparent); } }
  @keyframes renumberRoll { 0% { transform: translateX(-40%); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
  @keyframes cycleTextIn { 0% { opacity: 0; transform: translateY(-6px); } 100% { opacity: 1; transform: translateY(0); } }
  @keyframes themeIconIn { 0% { opacity: 0; transform: scale(0.8) rotate(-30deg); } 100% { opacity: 1; transform: scale(1) rotate(0deg); } }

  :global(.disableTransitions) :is(*, *::before, *::after) { transition: none !important; }
  .toolbar :global(svg[fill="none"]) { fill: none !important; }
  .toolbar :global(svg[fill="none"] :not([fill])) { fill: none !important; }
  .markersLayer :global(svg[fill="none"]) { fill: none !important; }
  .fixedMarkersLayer :global(svg[fill="none"]) { fill: none !important; }
  .toolbar :where(button, input, select, textarea, label) { background: unset; border: unset; border-radius: unset; padding: unset; margin: unset; color: unset; font: unset; letter-spacing: unset; text-transform: unset; text-decoration: unset; box-shadow: unset; outline: unset; }

  .toolbar { position: fixed; width: 297px; z-index: 100000; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; pointer-events: none; transition: left 0s, top 0s, right 0s, bottom 0s; }
  :where(.toolbar) { bottom: 1.25rem; right: 1.25rem; }
  .toolbarContainer { user-select: none; margin-left: auto; align-self: flex-end; display: flex; align-items: center; justify-content: center; background: #1a1a1a; color: #fff; border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1); pointer-events: auto; cursor: grab; transition: width 0.4s cubic-bezier(0.19,1,0.22,1), transform 0.4s cubic-bezier(0.19,1,0.22,1); }
  .toolbarContainer.dragging { transition: width 0.4s cubic-bezier(0.19,1,0.22,1); cursor: grabbing; }
  .toolbarContainer.entrance { animation: toolbarEnter 0.5s cubic-bezier(0.34,1.2,0.64,1) forwards; }
  .toolbarContainer.hiding { animation: toolbarHide 0.4s cubic-bezier(0.4,0,1,1) forwards; pointer-events: none; }
  .toolbarContainer.collapsed { width: 44px; height: 44px; border-radius: 22px; padding: 0; cursor: pointer; }
  .toolbarContainer.collapsed :global(svg) { margin-top: -1px; }
  .toolbarContainer.collapsed:hover { background: #2a2a2a; }
  .toolbarContainer.collapsed:active { transform: scale(0.95); }
  .toolbarContainer.expanded { height: 44px; border-radius: 1.5rem; padding: 0.375rem; width: 257px; }
  .toolbarContainer.expanded.serverConnected { width: 297px; }
  .toggleContent { position: absolute; display: flex; align-items: center; justify-content: center; transition: opacity 0.1s cubic-bezier(0.19,1,0.22,1); }
  .toggleContent.visible { opacity: 1; visibility: visible; pointer-events: auto; }
  .toggleContent.hidden { opacity: 0; pointer-events: none; }
  .controlsContent { display: flex; align-items: center; gap: 0.375rem; transition: filter 0.8s cubic-bezier(0.19,1,0.22,1), opacity 0.8s cubic-bezier(0.19,1,0.22,1), transform 0.6s cubic-bezier(0.19,1,0.22,1); }
  .controlsContent.visible { opacity: 1; filter: blur(0px); transform: scale(1); visibility: visible; pointer-events: auto; }
  .controlsContent.hidden { pointer-events: none; opacity: 0; filter: blur(10px); transform: scale(0.4); }
  .badge { position: absolute; top: -13px; right: -13px; user-select: none; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background-color: var(--agentation-color-accent); color: white; font-size: 0.625rem; font-weight: 600; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.04); transition: transform 0.3s ease, opacity 0.2s ease; }
  .badge.fadeOut { opacity: 0; transform: scale(0); pointer-events: none; }
  .badge.entrance { animation: badgeEnter 0.3s cubic-bezier(0.34,1.2,0.64,1) 0.4s both; }
  .controlButton { position: relative; cursor: pointer !important; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; border: none; background: transparent; color: rgba(255,255,255,0.85); transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease, opacity 0.2s ease; }
  .controlButton:hover:not(:disabled):not([data-active="true"]):not([data-failed="true"]):not([data-auto-sync="true"]):not([data-error="true"]):not([data-no-hover="true"]) { background: rgba(255,255,255,0.12); color: #fff; }
  .controlButton:active:not(:disabled) { transform: scale(0.92); }
  .controlButton:disabled { opacity: 0.35; cursor: not-allowed; }
  .controlButton[data-active="true"] { color: var(--agentation-color-blue); background-color: color-mix(in srgb, var(--agentation-color-blue) 25%, transparent); }
  .controlButton[data-error="true"] { color: var(--agentation-color-red); background-color: color-mix(in srgb, var(--agentation-color-red) 25%, transparent); }
  .controlButton[data-danger]:hover:not(:disabled):not([data-active="true"]):not([data-failed="true"]) { background-color: color-mix(in srgb, var(--agentation-color-red) 25%, transparent); color: var(--agentation-color-red); }
  .controlButton[data-no-hover="true"], .controlButton.statusShowing { cursor: default !important; pointer-events: none; background: transparent !important; }
  .controlButton[data-auto-sync="true"] { color: var(--agentation-color-green); background: transparent; cursor: default; }
  .controlButton[data-failed="true"] { color: var(--agentation-color-red); background-color: color-mix(in srgb, var(--agentation-color-red) 25%, transparent); }
  .buttonBadge { position: absolute; top: 0; right: 0; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background-color: var(--agentation-color-accent); color: white; font-size: 0.625rem; font-weight: 600; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px #1a1a1a, 0 1px 3px rgba(0,0,0,0.2); pointer-events: none; }
  [data-agentation-theme="light"] .buttonBadge { box-shadow: 0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,0.2); }
  .mcpIndicator { position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; pointer-events: none; transition: background-color 0.3s ease, opacity 0.15s ease, transform 0.15s ease; }
  .mcpIndicator.connected { background-color: var(--agentation-color-green); animation: mcpIndicatorPulseConnected 2.5s ease-in-out infinite; }
  .mcpIndicator.connecting { background-color: var(--agentation-color-yellow); animation: mcpIndicatorPulseConnecting 1.5s ease-in-out infinite; }
  .mcpIndicator.hidden { opacity: 0; transform: scale(0); animation: none; }
  .buttonWrapper { position: relative; display: flex; align-items: center; justify-content: center; }
  .buttonWrapper:hover .buttonTooltip { opacity: 1; visibility: visible; transform: translateX(-50%) scale(1); transition-delay: 0.85s; }
  .buttonWrapper:has(.controlButton:disabled):hover .buttonTooltip { opacity: 0; visibility: hidden; }
  .tooltipsInSession .buttonWrapper:hover .buttonTooltip { transition-delay: 0s; }
  .sendButtonWrapper { width: 0; opacity: 0; overflow: hidden; pointer-events: none; margin-left: -0.375rem; transition: width 0.4s cubic-bezier(0.19,1,0.22,1), opacity 0.3s cubic-bezier(0.19,1,0.22,1), margin 0.4s cubic-bezier(0.19,1,0.22,1); }
  .sendButtonWrapper .controlButton { transform: scale(0.8); transition: transform 0.4s cubic-bezier(0.19,1,0.22,1); }
  .sendButtonWrapper.sendButtonVisible { width: 34px; opacity: 1; overflow: visible; pointer-events: auto; margin-left: 0; }
  .sendButtonWrapper.sendButtonVisible .controlButton { transform: scale(1); }
  .buttonTooltip { position: absolute; bottom: calc(100% + 14px); left: 50%; transform: translateX(-50%) scale(0.95); padding: 6px 10px; background: #1a1a1a; color: rgba(255,255,255,0.9); font-size: 12px; font-weight: 500; border-radius: 8px; white-space: nowrap; opacity: 0; visibility: hidden; pointer-events: none; z-index: 100001; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: opacity 0.135s ease, transform 0.135s ease, visibility 0.135s ease; }
  .buttonTooltip::after { content: ''; position: absolute; top: calc(100% - 4px); left: 50%; transform: translateX(-50%) rotate(45deg); width: 8px; height: 8px; background: #1a1a1a; border-radius: 0 0 2px 0; }
  .shortcut { margin-left: 4px; opacity: 0.5; }
  .tooltipBelow .buttonTooltip { bottom: auto; top: calc(100% + 14px); }
  .tooltipBelow .buttonTooltip::after { top: -4px; border-radius: 2px 0 0 0; }
  .tooltipBelow .buttonWrapper:hover .buttonTooltip { transform: translateX(-50%) scale(1); }
  .tooltipsHidden .buttonTooltip { opacity: 0 !important; visibility: hidden !important; transition: none !important; }
  .buttonWrapperAlignLeft .buttonTooltip { left: 50%; transform: translateX(-12px) scale(0.95); }
  .buttonWrapperAlignLeft .buttonTooltip::after { left: 16px; }
  .buttonWrapperAlignLeft:hover .buttonTooltip { transform: translateX(-12px) scale(1); }
  .buttonWrapperAlignRight .buttonTooltip { left: 50%; transform: translateX(calc(-100% + 12px)) scale(0.95); }
  .buttonWrapperAlignRight .buttonTooltip::after { left: auto; right: 8px; }
  .buttonWrapperAlignRight:hover .buttonTooltip { transform: translateX(calc(-100% + 12px)) scale(1); }
  .divider { width: 1px; height: 12px; background: rgba(255,255,255,0.15); margin: 0 0.125rem; }
  .overlay { position: fixed; inset: 0; z-index: 99997; pointer-events: none; }
  .overlay > :global(*) { pointer-events: auto; }
  .hoverHighlight { position: fixed; border: 2px solid color-mix(in srgb, var(--agentation-color-accent) 50%, transparent); border-radius: 4px; background-color: color-mix(in srgb, var(--agentation-color-accent) 4%, transparent); pointer-events: none !important; box-sizing: border-box; will-change: opacity; contain: layout style; }
  .hoverHighlight.enter { animation: hoverHighlightIn 0.12s ease-out forwards; }
  .multiSelectOutline { position: fixed; border: 2px dashed color-mix(in srgb, var(--agentation-color-green) 60%, transparent); border-radius: 4px; pointer-events: none !important; background-color: color-mix(in srgb, var(--agentation-color-green) 5%, transparent); box-sizing: border-box; will-change: opacity; }
  .multiSelectOutline.enter { animation: fadeIn 0.15s ease-out forwards; }
  .multiSelectOutline.exit { animation: fadeOut 0.15s ease-out forwards; }
  .singleSelectOutline { position: fixed; border: 2px solid color-mix(in srgb, var(--agentation-color-blue) 60%, transparent); border-radius: 4px; pointer-events: none !important; background-color: color-mix(in srgb, var(--agentation-color-blue) 5%, transparent); box-sizing: border-box; will-change: opacity; }
  .singleSelectOutline.enter { animation: fadeIn 0.15s ease-out forwards; }
  .singleSelectOutline.exit { animation: fadeOut 0.15s ease-out forwards; }
  .hoverTooltip { position: fixed; font-size: 0.6875rem; font-weight: 500; color: #fff; background: rgba(0,0,0,0.85); padding: 0.35rem 0.6rem; border-radius: 0.375rem; pointer-events: none !important; white-space: nowrap; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
  .hoverTooltip.enter { animation: hoverTooltipIn 0.1s ease-out forwards; }
  .hoverElementName { overflow: hidden; text-overflow: ellipsis; }
  .markersLayer { position: absolute; top: 0; left: 0; right: 0; height: 0; z-index: 99998; pointer-events: none; }
  .markersLayer > :global(*) { pointer-events: auto; }
  .fixedMarkersLayer { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 99998; pointer-events: none; }
  .fixedMarkersLayer > :global(*) { pointer-events: auto; }
  .marker { position: absolute; width: 22px; height: 22px; background: var(--agentation-color-blue); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6875rem; font-weight: 600; transform: translate(-50%, -50%) scale(1); cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(0,0,0,0.04); user-select: none; will-change: transform, opacity; contain: layout style; z-index: 1; }
  .marker:hover { z-index: 2; }
  .marker:not(.enter):not(.exit):not(.clearing) { transition: background-color 0.15s ease, transform 0.1s ease; }
  .marker.enter { animation: markerIn 0.25s cubic-bezier(0.22,1,0.36,1) both; }
  .marker.exit { animation: markerOut 0.2s ease-out both; pointer-events: none; }
  .marker.clearing { animation: markerOut 0.15s ease-out both; pointer-events: none; }
  .marker:not(.enter):not(.exit):not(.clearing):hover { transform: translate(-50%, -50%) scale(1.1); }
  .marker.pending { position: fixed; background-color: var(--agentation-color-blue); }
  .marker.fixed { position: fixed; }
  .marker.multiSelect { background-color: var(--agentation-color-green); width: 26px; height: 26px; border-radius: 6px; font-size: 0.75rem; }
  .marker.multiSelect.pending { background-color: var(--agentation-color-green); }
  .marker.hovered { background-color: var(--agentation-color-red); }
  .renumber { display: block; animation: renumberRoll 0.2s ease-out; }
  .markerTooltip { position: absolute; top: calc(100% + 10px); left: 50%; transform: translateX(-50%) scale(0.909); z-index: 100002; background: #1a1a1a; padding: 8px 0.75rem; border-radius: 0.75rem; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 400; color: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08); min-width: 120px; max-width: 200px; pointer-events: none; cursor: default; }
  .markerTooltip.enter { animation: tooltipIn 0.1s ease-out forwards; }
  .markerQuote { display: block; font-size: 12px; font-style: italic; color: rgba(255,255,255,0.6); margin-bottom: 0.3125rem; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .markerNote { display: block; font-size: 13px; font-weight: 400; line-height: 1.4; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-bottom: 2px; }
  .settingsPanel { position: absolute; right: 5px; bottom: calc(100% + 0.5rem); z-index: 1; overflow: hidden; background: #1c1c1c; border-radius: 1rem; padding: 13px 0 16px; min-width: 205px; cursor: default; box-shadow: 0 1px 8px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.04); transition: background-color 0.25s ease, box-shadow 0.25s ease; }
  .settingsPanel::before, .settingsPanel::after { content: ''; position: absolute; top: 0; bottom: 0; width: 16px; z-index: 2; pointer-events: none; }
  .settingsPanel::before { left: 0; background: linear-gradient(to right, #1c1c1c 0%, transparent 100%); }
  .settingsPanel::after { right: 0; background: linear-gradient(to left, #1c1c1c 0%, transparent 100%); }
  .settingsPanel.enter { opacity: 1; transform: translateY(0) scale(1); filter: blur(0px); transition: opacity 0.2s ease, transform 0.2s ease, filter 0.2s ease; }
  .settingsPanel.exit { opacity: 0; transform: translateY(8px) scale(0.95); filter: blur(5px); pointer-events: none; transition: opacity 0.1s ease, transform 0.1s ease, filter 0.1s ease; }
  [data-agentation-theme="dark"] .settingsPanel { background: #1a1a1a; box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08); }
  .settingsPanelContainer { overflow: visible; position: relative; display: flex; padding: 0 1rem; }
  .settingsPage { min-width: 100%; flex-shrink: 0; transition: transform 0.2s ease, opacity 0.2s ease; opacity: 1; }
  .settingsPage.slideLeft { transform: translateX(-24px); opacity: 0; pointer-events: none; }
  .automationsPage { position: absolute; top: 0; left: 24px; width: 100%; height: 100%; padding: 3px 1rem 0; box-sizing: border-box; display: flex; flex-direction: column; transition: transform 0.2s ease, opacity 0.2s ease; opacity: 0; pointer-events: none; }
  .automationsPage.slideIn { transform: translateX(-24px); opacity: 1; pointer-events: auto; }
  .settingsHeader { display: flex; align-items: center; justify-content: space-between; min-height: 24px; margin-bottom: 0.5rem; padding-bottom: 9px; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .settingsBrand { font-size: 0.8125rem; font-weight: 600; letter-spacing: -0.0094em; color: #fff; }
  .settingsBrandSlash { color: var(--agentation-color-accent); transition: color 0.2s ease; }
  .settingsVersion { font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.4); margin-left: auto; letter-spacing: -0.0094em; }
  .settingsSection + .settingsSection { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.07); }
  .settingsSectionExtraPadding { padding-top: calc(0.5rem + 4px); }
  .settingsSectionGrow { flex: 1; display: flex; flex-direction: column; }
  .settingsRow { display: flex; align-items: center; justify-content: space-between; min-height: 24px; }
  .settingsRowMarginTop { margin-top: 8px; }
  .settingsLabel { font-size: 0.8125rem; font-weight: 400; letter-spacing: -0.0094em; color: rgba(255,255,255,0.5); display: flex; align-items: center; gap: 0.125rem; }
  [data-agentation-theme="light"] .settingsLabel { color: rgba(0,0,0,0.5); }
  .settingsLabelMarker { padding-top: 3px; margin-bottom: 10px; }
  .cycleButton { display: flex; align-items: center; gap: 0.5rem; padding: 0; border: none; background: transparent; font-size: 0.8125rem; font-weight: 500; color: #fff; cursor: pointer; letter-spacing: -0.0094em; }
  [data-agentation-theme="light"] .cycleButton { color: rgba(0,0,0,0.85); }
  .cycleButtonText { display: inline-block; animation: cycleTextIn 0.2s ease-out; }
  .cycleDots { display: flex; flex-direction: column; gap: 2px; }
  .cycleDot { width: 3px; height: 3px; border-radius: 50%; background: rgba(255,255,255,0.3); transform: scale(0.667); transition: background-color 0.25s ease-out, transform 0.25s ease-out; }
  .cycleDot.active { background: #fff; transform: scale(1); }
  [data-agentation-theme="light"] .cycleDot { background: rgba(0,0,0,0.2); }
  [data-agentation-theme="light"] .cycleDot.active { background: rgba(0,0,0,0.7); }
  .colorOptions { display: flex; gap: 0.5rem; margin-top: 0.375rem; margin-bottom: 1px; }
  .colorOption { display: block; width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; background-color: var(--swatch); cursor: pointer; transition: transform 0.2s cubic-bezier(0.25,1,0.5,1); }
  @supports (color: color(display-p3 0 0 0)) { .colorOption { background-color: var(--swatch-p3); } }
  .colorOption:hover { transform: scale(1.15); }
  .colorOption.selected { transform: scale(0.83); }
  .colorOptionRing { display: flex; width: 24px; height: 24px; border: 2px solid transparent; border-radius: 50%; transition: border-color 0.3s ease; }
  .colorOptionRing.selected { border-color: var(--swatch); }
  @supports (color: color(display-p3 0 0 0)) { .colorOptionRing.selected { border-color: var(--swatch-p3); } }
  .settingsToggle { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
  .settingsToggle + .settingsToggle { margin-top: calc(0.5rem + 6px); }
  .settingsToggle input[type="checkbox"] { position: absolute; opacity: 0; width: 0; height: 0; }
  .settingsToggleMarginBottom { margin-bottom: calc(0.5rem + 6px); }
  .customCheckbox { position: relative; width: 14px; height: 14px; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background-color 0.25s ease, border-color 0.25s ease; }
  .customCheckbox :global(svg) { color: #1a1a1a; }
  input[type="checkbox"]:checked + .customCheckbox { border-color: rgba(255,255,255,0.3); background: rgba(255,255,255,1); }
  [data-agentation-theme="light"] .customCheckbox { border: 1px solid rgba(0,0,0,0.15); background: #fff; }
  [data-agentation-theme="light"] .customCheckbox.checked { border-color: #1a1a1a; background: #1a1a1a; }
  [data-agentation-theme="light"] .customCheckbox.checked :global(svg) { color: #fff; }
  .toggleLabel { font-size: 0.8125rem; font-weight: 400; color: rgba(255,255,255,0.5); letter-spacing: -0.0094em; display: flex; align-items: center; gap: 0.25rem; }
  [data-agentation-theme="light"] .toggleLabel { color: rgba(0,0,0,0.5); }
  .toggleSwitch { position: relative; display: inline-block; width: 24px; height: 16px; flex-shrink: 0; cursor: pointer; }
  .toggleSwitch input { opacity: 0; width: 0; height: 0; }
  .toggleSwitch input:checked + .toggleSlider { background-color: var(--agentation-color-blue); }
  .toggleSwitch input:checked + .toggleSlider::before { transform: translateX(8px); }
  .toggleSwitch.disabled { opacity: 0.4; pointer-events: none; }
  .toggleSlider { position: absolute; cursor: pointer; inset: 0; border-radius: 16px; background: #484848; }
  [data-agentation-theme="light"] .toggleSlider { background: #ddd; }
  .toggleSlider::before { content: ''; position: absolute; height: 12px; width: 12px; left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: transform 0.2s cubic-bezier(0.4,0,0.2,1); }
  .settingsNavLink { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0; border: none; background: transparent; font-family: inherit; font-size: 0.8125rem; font-weight: 400; color: rgba(255,255,255,0.5); cursor: pointer; transition: color 0.15s ease; }
  .settingsNavLink:hover { color: rgba(255,255,255,0.9); }
  [data-agentation-theme="light"] .settingsNavLink { color: rgba(0,0,0,0.5); }
  [data-agentation-theme="light"] .settingsNavLink:hover { color: rgba(0,0,0,0.8); }
  .settingsNavLink :global(svg) { color: rgba(255,255,255,0.4); transition: color 0.15s ease; }
  .settingsNavLink:hover :global(svg) { color: #fff; }
  .settingsNavLinkRight { display: flex; align-items: center; gap: 6px; }
  .mcpNavIndicator { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .mcpNavIndicator.connected { background-color: var(--agentation-color-green); animation: mcpPulse 2.5s ease-in-out infinite; }
  .mcpNavIndicator.connecting { background-color: var(--agentation-color-yellow); animation: mcpPulse 1.5s ease-in-out infinite; }
  .settingsBackButton { display: flex; align-items: center; gap: 4px; padding: 6px 0 12px 0; margin: -6px 0 0.5rem 0; border: none; border-bottom: 1px solid rgba(255,255,255,0.07); border-radius: 0; background: transparent; font-family: inherit; font-size: 0.8125rem; font-weight: 500; letter-spacing: -0.15px; color: #fff; cursor: pointer; }
  .settingsBackButton :global(svg) { opacity: 0.4; flex-shrink: 0; }
  .settingsBackButton:hover :global(svg) { opacity: 1; }
  [data-agentation-theme="light"] .settingsBackButton { color: rgba(0,0,0,0.85); border-bottom-color: rgba(0,0,0,0.08); }
  .automationHeader { display: flex; align-items: center; gap: 0.125rem; font-size: 0.8125rem; font-weight: 400; color: #fff; }
  [data-agentation-theme="light"] .automationHeader { color: rgba(0,0,0,0.85); }
  .automationDescription { font-size: 0.6875rem; font-weight: 300; color: rgba(255,255,255,0.5); margin-top: 2px; line-height: 14px; }
  [data-agentation-theme="light"] .automationDescription { color: rgba(0,0,0,0.5); }
  .learnMoreLink { color: rgba(255,255,255,0.8); text-decoration: underline dotted; text-decoration-color: rgba(255,255,255,0.2); text-underline-offset: 2px; }
  .learnMoreLink:hover { color: #fff; }
  [data-agentation-theme="light"] .learnMoreLink { color: rgba(0,0,0,0.6); text-decoration-color: rgba(0,0,0,0.2); }
  .autoSendRow { display: flex; align-items: center; gap: 8px; }
  .autoSendLabel { font-size: 0.6875rem; font-weight: 400; color: rgba(255,255,255,0.4); }
  .autoSendLabel.active { color: #66b8ff; }
  [data-agentation-theme="light"] .autoSendLabel { color: rgba(0,0,0,0.4); }
  [data-agentation-theme="light"] .autoSendLabel.active { color: var(--agentation-color-blue); }
  .webhookUrlInput { display: block; width: 100%; flex: 1; min-height: 60px; box-sizing: border-box; margin-top: 11px; padding: 8px 10px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; background: rgba(255,255,255,0.03); font-family: inherit; font-size: 0.75rem; font-weight: 400; color: #fff; outline: none; resize: none; cursor: text !important; user-select: text; }
  .webhookUrlInput::placeholder { color: rgba(255,255,255,0.3); }
  .webhookUrlInput:focus { border-color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.08); }
  [data-agentation-theme="light"] .webhookUrlInput { border-color: rgba(0,0,0,0.1); background: rgba(0,0,0,0.03); color: rgba(0,0,0,0.85); }
  [data-agentation-theme="light"] .webhookUrlInput::placeholder { color: rgba(0,0,0,0.3); }
  [data-agentation-theme="light"] .webhookUrlInput:focus { border-color: rgba(0,0,0,0.25); background: rgba(0,0,0,0.05); }
  .mcpStatusDot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .mcpStatusDot.connecting { background-color: var(--agentation-color-yellow); animation: mcpPulse 1.5s infinite; }
  .mcpStatusDot.connected { background-color: var(--agentation-color-green); animation: mcpPulse 2.5s ease-in-out infinite; }
  .mcpStatusDot.disconnected { background-color: var(--agentation-color-red); animation: mcpPulseError 2s infinite; }
  .themeToggle { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; margin-left: 0.5rem; border: none; border-radius: 6px; background: transparent; color: rgba(255,255,255,0.4); cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease; }
  .themeToggle:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }
  [data-agentation-theme="light"] .themeToggle { color: rgba(0,0,0,0.4); }
  [data-agentation-theme="light"] .themeToggle:hover { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.7); }
  .themeIconWrapper { display: flex; align-items: center; justify-content: center; position: relative; width: 20px; height: 20px; }
  .themeIcon { display: flex; align-items: center; justify-content: center; animation: themeIconIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards; }
  .dragSelection { position: fixed; top: 0; left: 0; border: 2px solid color-mix(in srgb, var(--agentation-color-green) 60%, transparent); border-radius: 4px; background-color: color-mix(in srgb, var(--agentation-color-green) 8%, transparent); pointer-events: none; z-index: 99997; will-change: transform, width, height; contain: layout style; }
  .highlightsContainer { position: fixed; top: 0; left: 0; pointer-events: none; z-index: 99996; }
  :global(.selectedElementHighlight) { position: fixed; top: 0; left: 0; border: 2px solid color-mix(in srgb, var(--agentation-color-green) 50%, transparent); border-radius: 4px; background: color-mix(in srgb, var(--agentation-color-green) 6%, transparent); pointer-events: none; will-change: transform, width, height; contain: layout style; }

  /* Light mode overrides */
  [data-agentation-theme="light"] .toolbarContainer { background: #fff; color: rgba(0,0,0,0.85); box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04); }
  [data-agentation-theme="light"] .toolbarContainer.collapsed:hover { background: #f5f5f5; }
  [data-agentation-theme="light"] .controlButton { color: rgba(0,0,0,0.5); }
  [data-agentation-theme="light"] .controlButton:hover:not(:disabled):not([data-active="true"]):not([data-failed="true"]):not([data-auto-sync="true"]):not([data-error="true"]):not([data-no-hover="true"]) { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.85); }
  [data-agentation-theme="light"] .controlButton[data-active="true"] { color: var(--agentation-color-blue); background: color-mix(in srgb, var(--agentation-color-blue) 15%, transparent); }
  [data-agentation-theme="light"] .controlButton[data-danger]:hover:not(:disabled):not([data-active="true"]):not([data-failed="true"]) { color: var(--agentation-color-red); background: color-mix(in srgb, var(--agentation-color-red) 15%, transparent); }
  [data-agentation-theme="light"] .buttonTooltip { background: #fff; color: rgba(0,0,0,0.85); box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04); }
  [data-agentation-theme="light"] .buttonTooltip::after { background: #fff; }
  [data-agentation-theme="light"] .divider { background: rgba(0,0,0,0.1); }
  [data-agentation-theme="light"] .markerTooltip { background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06); }
  [data-agentation-theme="light"] .markerQuote { color: rgba(0,0,0,0.5); }
  [data-agentation-theme="light"] .markerNote { color: rgba(0,0,0,0.85); }
  [data-agentation-theme="light"] .settingsPanel { background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04); }
  [data-agentation-theme="light"] .settingsPanel::before { background: linear-gradient(to right, #fff 0%, transparent 100%); }
  [data-agentation-theme="light"] .settingsPanel::after { background: linear-gradient(to left, #fff 0%, transparent 100%); }
  [data-agentation-theme="light"] .settingsHeader { border-bottom-color: rgba(0,0,0,0.08); }
  [data-agentation-theme="light"] .settingsBrand { color: rgba(0,0,0,0.85); }
  [data-agentation-theme="light"] .settingsVersion { color: rgba(0,0,0,0.4); }
  [data-agentation-theme="light"] .settingsSection + .settingsSection { border-top-color: rgba(0,0,0,0.08); }
</style>
