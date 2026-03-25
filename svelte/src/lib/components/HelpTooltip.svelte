<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import IconHelp from './icons/IconHelp.svelte';

	interface Props {
		content: string;
	}

	let { content }: Props = $props();
</script>

<Tooltip class="tooltip" {content}>
	<IconHelp class="tooltip-icon" />
</Tooltip>

<style>
	:global(.tooltip) {
		display: flex;
		justify-content: center;
		align-items: center;
		cursor: help;
	}

	:global(.tooltip-icon) {
		transform: translateY(0.5px);
		color: #fff;
		opacity: 0.2;
		transition: opacity 0.15s ease;
	}

	:global(.tooltip:hover .tooltip-icon) {
		opacity: 0.5;
	}

	:global([data-agentation-theme='light']) :global(.tooltip-icon) {
		color: #000;
	}
</style>
