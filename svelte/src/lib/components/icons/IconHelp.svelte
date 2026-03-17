<script lang="ts">
	let { size = 20 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 20 20" fill="none">
	<circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="1.25" />
	<path
		d="M8.24 8.19C8.38 7.78 8.66 7.44 9.03 7.23C9.4 7.01 9.84 6.93 10.26 7C10.68 7.07 11.06 7.29 11.34 7.62C11.61 7.95 11.76 8.36 11.76 8.79152C11.76 10 10 10.6 10 10.6V10.83"
		stroke="currentColor"
		stroke-width="1.25"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	<circle cx="10" cy="13" r="0.625" fill="currentColor" />
</svg>
