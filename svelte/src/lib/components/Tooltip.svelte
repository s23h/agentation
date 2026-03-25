<script lang="ts">
	import type { Snippet } from 'svelte';
	import { originalSetTimeout } from '../utils/freeze-animations';

	interface Props {
		content: string;
		children: Snippet;
		class?: string;
		[key: string]: unknown;
	}

	let { content, children, class: className, ...rest }: Props = $props();

	let visible = $state(false);
	let shouldRender = $state(false);
	let position = $state({ top: 0, right: 0 });
	let triggerRef: HTMLSpanElement | undefined = $state();

	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let exitTimeoutId: ReturnType<typeof setTimeout> | null = null;

	function updatePosition() {
		if (triggerRef) {
			const rect = triggerRef.getBoundingClientRect();
			position = {
				top: rect.top + rect.height / 2,
				right: window.innerWidth - rect.left + 8
			};
		}
	}

	function handleMouseEnter() {
		shouldRender = true;
		if (exitTimeoutId) {
			clearTimeout(exitTimeoutId);
			exitTimeoutId = null;
		}
		updatePosition();
		timeoutId = originalSetTimeout(() => {
			visible = true;
		}, 500);
	}

	function handleMouseLeave() {
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
		visible = false;
		exitTimeoutId = originalSetTimeout(() => {
			shouldRender = false;
		}, 150);
	}

	let portalEl: HTMLDivElement | null = null;

	$effect(() => {
		if (shouldRender) {
			if (!portalEl) {
				portalEl = document.createElement('div');
				portalEl.setAttribute('data-feedback-toolbar', '');
				document.body.appendChild(portalEl);
			}
		}

		return () => {
			// Cleanup handled separately
		};
	});

	$effect(() => {
		if (portalEl) {
			if (!shouldRender) {
				portalEl.remove();
				portalEl = null;
				return;
			}

			Object.assign(portalEl.style, {
				position: 'fixed',
				top: `${position.top}px`,
				right: `${position.right}px`,
				transform: 'translateY(-50%)',
				padding: '6px 10px',
				background: '#383838',
				color: 'rgba(255, 255, 255, 0.7)',
				fontSize: '11px',
				fontWeight: '400',
				lineHeight: '14px',
				borderRadius: '10px',
				width: '180px',
				textAlign: 'left',
				zIndex: '100020',
				pointerEvents: 'none',
				boxShadow: '0px 1px 8px rgba(0, 0, 0, 0.28)',
				opacity: visible ? '1' : '0',
				transition: 'opacity 0.15s ease'
			});

			portalEl.textContent = content;
		}
	});

	$effect(() => {
		return () => {
			if (timeoutId) clearTimeout(timeoutId);
			if (exitTimeoutId) clearTimeout(exitTimeoutId);
			if (portalEl) {
				portalEl.remove();
				portalEl = null;
			}
		};
	});
</script>

<span bind:this={triggerRef} class={className} onmouseenter={handleMouseEnter} onmouseleave={handleMouseLeave} {...rest}>
	{@render children()}
</span>
