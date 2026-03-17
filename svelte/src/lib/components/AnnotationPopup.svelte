<script lang="ts">
  import { onMount } from 'svelte';
  import IconTrash from './icons/IconTrash.svelte';
  import { originalSetTimeout } from '../utils/freeze-animations';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Focus an element while temporarily blocking focus-trap libraries. */
  function focusBypassingTraps(el: HTMLElement | null) {
    if (!el) return;
    const trap = (e: Event) => e.stopImmediatePropagation();
    document.addEventListener('focusin', trap, true);
    document.addEventListener('focusout', trap, true);
    try {
      el.focus();
    } finally {
      document.removeEventListener('focusin', trap, true);
      document.removeEventListener('focusout', trap, true);
    }
  }

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------

  let {
    element,
    timestamp,
    selectedText,
    placeholder = 'What should change?',
    initialValue = '',
    submitLabel = 'Add',
    onSubmit,
    onCancel,
    onDelete,
    style,
    accentColor = '#3c82f7',
    isExiting = false,
    lightMode = false,
    computedStyles,
  }: {
    element: string;
    timestamp?: string;
    selectedText?: string;
    placeholder?: string;
    initialValue?: string;
    submitLabel?: string;
    onSubmit: (text: string) => void;
    onCancel: () => void;
    onDelete?: () => void;
    style?: Record<string, string>;
    accentColor?: string;
    isExiting?: boolean;
    lightMode?: boolean;
    computedStyles?: Record<string, string>;
  } = $props();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let text = $state(initialValue);
  let isShaking = $state(false);
  let animState = $state<'initial' | 'enter' | 'entered' | 'exit'>('initial');
  let isFocused = $state(false);
  let isStylesExpanded = $state(false);

  let textareaRef: HTMLTextAreaElement | undefined = $state();
  let popupRef: HTMLDivElement | undefined = $state();
  let cancelTimer: ReturnType<typeof setTimeout> | null = null;
  let shakeTimer: ReturnType<typeof setTimeout> | null = null;

  // ---------------------------------------------------------------------------
  // Exposed methods
  // ---------------------------------------------------------------------------

  export function shake() {
    if (shakeTimer) clearTimeout(shakeTimer);
    isShaking = true;
    shakeTimer = originalSetTimeout(() => {
      isShaking = false;
      focusBypassingTraps(textareaRef ?? null);
    }, 250);
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Sync with parent exit state
  $effect(() => {
    if (isExiting && animState !== 'exit') {
      animState = 'exit';
    }
  });

  // Animate in on mount and focus textarea
  onMount(() => {
    originalSetTimeout(() => {
      animState = 'enter';
    }, 0);

    const enterTimer = originalSetTimeout(() => {
      animState = 'entered';
    }, 200);

    const focusTimer = originalSetTimeout(() => {
      if (textareaRef) {
        focusBypassingTraps(textareaRef);
        textareaRef.selectionStart = textareaRef.selectionEnd = textareaRef.value.length;
        textareaRef.scrollTop = textareaRef.scrollHeight;
      }
    }, 50);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(focusTimer);
      if (cancelTimer) clearTimeout(cancelTimer);
      if (shakeTimer) clearTimeout(shakeTimer);
    };
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleCancel() {
    animState = 'exit';
    cancelTimer = originalSetTimeout(() => {
      onCancel();
    }, 150);
  }

  function handleSubmit() {
    if (!text.trim()) return;
    onSubmit(text.trim());
  }

  function handleKeyDown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  }

  function handleToggleStyles() {
    const wasExpanded = isStylesExpanded;
    isStylesExpanded = !isStylesExpanded;
    if (wasExpanded) {
      originalSetTimeout(() => focusBypassingTraps(textareaRef ?? null), 0);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  let styleString = $derived(
    style ? Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';') : undefined
  );

  let hasComputedStyles = $derived(
    computedStyles != null && Object.keys(computedStyles).length > 0
  );

  let computedStyleEntries = $derived(
    computedStyles ? Object.entries(computedStyles) : []
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={popupRef}
  class="popup"
  class:light={lightMode}
  class:enter={animState === 'enter'}
  class:entered={animState === 'entered'}
  class:exit={animState === 'exit'}
  class:shake={isShaking}
  data-annotation-popup
  style={styleString}
  onclick={(e) => e.stopPropagation()}
>
  <div class="header">
    {#if hasComputedStyles}
      <button class="header-toggle" onclick={handleToggleStyles} type="button">
        <svg
          class="chevron"
          class:expanded={isStylesExpanded}
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M5.5 10.25L9 7.25L5.75 4"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="element">{element}</span>
      </button>
    {:else}
      <span class="element">{element}</span>
    {/if}
    {#if timestamp}
      <span class="timestamp">{timestamp}</span>
    {/if}
  </div>

  {#if hasComputedStyles}
    <div class="styles-wrapper" class:expanded={isStylesExpanded}>
      <div class="styles-inner">
        <div class="styles-block">
          {#each computedStyleEntries as [key, value] (key)}
            <div class="style-line">
              <span class="style-property"
                >{key.replace(/([A-Z])/g, '-$1').toLowerCase()}</span
              >: <span class="style-value">{value}</span>;
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if selectedText}
    <div class="quote">
      &ldquo;{selectedText.slice(0, 80)}{selectedText.length > 80 ? '...' : ''}&rdquo;
    </div>
  {/if}

  <textarea
    bind:this={textareaRef}
    class="textarea"
    style:border-color={isFocused ? accentColor : undefined}
    placeholder={placeholder}
    bind:value={text}
    onfocus={() => (isFocused = true)}
    onblur={() => (isFocused = false)}
    rows={2}
    onkeydown={handleKeyDown}
  ></textarea>

  <div class="actions">
    {#if onDelete}
      <div class="delete-wrapper">
        <button class="delete-button" onclick={onDelete} type="button">
          <IconTrash size={22} />
        </button>
      </div>
    {/if}
    <button class="cancel" onclick={handleCancel}>Cancel</button>
    <button
      class="submit"
      style:background-color={accentColor}
      style:opacity={text.trim() ? 1 : 0.4}
      onclick={handleSubmit}
      disabled={!text.trim()}
    >
      {submitLabel}
    </button>
  </div>
</div>

<style>
  /* =========================================================================
     Animation Keyframes
     ========================================================================= */

  @keyframes popupEnter {
    from {
      opacity: 0;
      transform: translateX(-50%) scale(0.95) translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) scale(1) translateY(0);
    }
  }

  @keyframes popupExit {
    from {
      opacity: 1;
      transform: translateX(-50%) scale(1) translateY(0);
    }
    to {
      opacity: 0;
      transform: translateX(-50%) scale(0.95) translateY(4px);
    }
  }

  @keyframes shake {
    0%,
    100% {
      transform: translateX(-50%) scale(1) translateY(0) translateX(0);
    }
    20% {
      transform: translateX(-50%) scale(1) translateY(0) translateX(-3px);
    }
    40% {
      transform: translateX(-50%) scale(1) translateY(0) translateX(3px);
    }
    60% {
      transform: translateX(-50%) scale(1) translateY(0) translateX(-2px);
    }
    80% {
      transform: translateX(-50%) scale(1) translateY(0) translateX(2px);
    }
  }

  /* =========================================================================
     Popup Container
     ========================================================================= */

  .popup {
    position: fixed;
    transform: translateX(-50%);
    width: 280px;
    padding: 0.75rem 1rem 14px;
    background: #1a1a1a;
    border-radius: 16px;
    box-shadow:
      0 4px 24px rgba(0, 0, 0, 0.3),
      0 0 0 1px rgba(255, 255, 255, 0.08);
    cursor: default;
    z-index: 100001;
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      Roboto,
      sans-serif;
    will-change: transform, opacity;
    opacity: 0;
  }

  /* Protect stroke-based icons from host page svg fill rules */
  .popup :global(svg[fill='none']) {
    fill: none !important;
  }

  .popup :global(svg[fill='none'] :not([fill])) {
    fill: none !important;
  }

  .popup.enter {
    animation: popupEnter 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .popup.entered {
    opacity: 1;
    transform: translateX(-50%) scale(1) translateY(0);
  }

  .popup.exit {
    animation: popupExit 0.15s ease-in forwards;
  }

  .popup.entered.shake {
    animation: shake 0.25s ease-out;
  }

  /* =========================================================================
     Header
     ========================================================================= */

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5625rem;
  }

  .element {
    font-size: 0.75rem;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.5);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .header-toggle {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    flex: 1;
    min-width: 0;
    text-align: left;
  }

  .header-toggle .element {
    flex: 1;
  }

  .chevron {
    color: rgba(255, 255, 255, 0.5);
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    flex-shrink: 0;
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  /* =========================================================================
     Computed Styles Block
     ========================================================================= */

  .styles-wrapper {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .styles-wrapper.expanded {
    grid-template-rows: 1fr;
  }

  .styles-inner {
    overflow: hidden;
  }

  .styles-block {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.375rem;
    padding: 0.5rem 0.625rem;
    margin-bottom: 0.5rem;
    font-family:
      ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.6875rem;
    line-height: 1.5;
  }

  .style-line {
    color: rgba(255, 255, 255, 0.85);
    word-break: break-word;
  }

  .style-property {
    color: #c792ea;
  }

  .style-value {
    color: rgba(255, 255, 255, 0.85);
  }

  .timestamp {
    font-size: 0.625rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.35);
    font-variant-numeric: tabular-nums;
    margin-left: 0.5rem;
    flex-shrink: 0;
  }

  /* =========================================================================
     Quote
     ========================================================================= */

  .quote {
    font-size: 12px;
    font-style: italic;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 0.5rem;
    padding: 0.4rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.25rem;
    line-height: 1.45;
  }

  /* =========================================================================
     Textarea
     ========================================================================= */

  .textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 0.625rem;
    font-size: 0.8125rem;
    font-family: inherit;
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    resize: none;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .textarea:focus {
    border-color: var(--agentation-color-blue);
  }

  .textarea.green:focus {
    border-color: var(--agentation-color-green);
  }

  .textarea::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }

  .textarea::-webkit-scrollbar {
    width: 6px;
  }

  .textarea::-webkit-scrollbar-track {
    background: transparent;
  }

  .textarea::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }

  /* =========================================================================
     Actions
     ========================================================================= */

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.375rem;
    margin-top: 0.5rem;
  }

  .cancel,
  .submit {
    padding: 0.4rem 0.875rem;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: 1rem;
    border: none;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      opacity 0.15s ease;
  }

  .cancel {
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
  }

  .cancel:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
  }

  .submit {
    color: white;
  }

  .submit:hover:not(:disabled) {
    filter: brightness(0.9);
  }

  .submit:disabled {
    cursor: not-allowed;
  }

  .delete-wrapper {
    margin-right: auto;
  }

  .delete-button {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.4);
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      transform 0.1s ease;
  }

  .delete-button:hover {
    background-color: color-mix(
      in srgb,
      var(--agentation-color-red) 25%,
      transparent
    );
    color: var(--agentation-color-red);
  }

  .delete-button:active {
    transform: scale(0.92);
  }

  /* =========================================================================
     Light Mode
     ========================================================================= */

  .popup.light {
    background: #fff;
    box-shadow:
      0 4px 24px rgba(0, 0, 0, 0.12),
      0 0 0 1px rgba(0, 0, 0, 0.06);
  }

  .light .element {
    color: rgba(0, 0, 0, 0.6);
  }

  .light .timestamp {
    color: rgba(0, 0, 0, 0.4);
  }

  .light .chevron {
    color: rgba(0, 0, 0, 0.4);
  }

  .light .styles-block {
    background: rgba(0, 0, 0, 0.03);
  }

  .light .style-line {
    color: rgba(0, 0, 0, 0.75);
  }

  .light .style-property {
    color: #7c3aed;
  }

  .light .style-value {
    color: rgba(0, 0, 0, 0.75);
  }

  .light .quote {
    color: rgba(0, 0, 0, 0.55);
    background: rgba(0, 0, 0, 0.04);
  }

  .light .textarea {
    background: rgba(0, 0, 0, 0.03);
    color: #1a1a1a;
    border-color: rgba(0, 0, 0, 0.12);
  }

  .light .textarea::placeholder {
    color: rgba(0, 0, 0, 0.4);
  }

  .light .textarea::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
  }

  .light .cancel {
    color: rgba(0, 0, 0, 0.5);
  }

  .light .cancel:hover {
    background: rgba(0, 0, 0, 0.06);
    color: rgba(0, 0, 0, 0.75);
  }

  .light .delete-button {
    color: rgba(0, 0, 0, 0.4);
  }

  .light .delete-button:hover {
    background-color: color-mix(
      in srgb,
      var(--agentation-color-red) 25%,
      transparent
    );
    color: var(--agentation-color-red);
  }
</style>
