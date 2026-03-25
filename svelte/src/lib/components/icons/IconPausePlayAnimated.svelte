<script lang="ts">
	let { size = 24, isPaused = false }: { size?: number; isPaused?: boolean } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none">
	<!-- Pause bars - visible when not paused -->
	<g class="icon-fade-fast" class:visible={!isPaused} class:hidden={isPaused}>
		<path
			d="M8 6L8 18"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
		/>
		<path
			d="M16 18L16 6"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
		/>
	</g>
	<!-- Play triangle - visible when paused -->
	<path
		class="icon-fade-fast"
		class:visible={isPaused}
		class:hidden={!isPaused}
		d="M17.75 10.701C18.75 11.2783 18.75 12.7217 17.75 13.299L8.75 18.4952C7.75 19.0725 6.5 18.3509 6.5 17.1962L6.5 6.80384C6.5 5.64914 7.75 4.92746 8.75 5.50481L17.75 10.701Z"
		stroke="currentColor"
		stroke-width="1.5"
	/>
</svg>

<style>
	.icon-fade-fast {
		transition: opacity 0.15s ease;
	}
	.visible {
		opacity: 1;
	}
	.hidden {
		opacity: 0;
	}
</style>
