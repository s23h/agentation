# agentation-svelte

Svelte 5 port of [Agentation](https://github.com/benjitaylor/agentation) — visual feedback for AI coding agents.

Click elements, add notes, and let AI agents fix them in real-time via MCP.

## Install

```bash
pnpm add github:s23h/agentation#svelte-support
```

## Quick Start

Add to your root layout (dev only):

```svelte
<script>
  import { Agentation } from 'agentation-svelte';
  import { dev } from '$app/environment';
</script>

{#if dev}
  <Agentation />
{/if}
```

## MCP Server (agent integration)

Connect to AI coding agents like Claude Code for real-time annotation sync.

### 1. Start the MCP server

```bash
npx agentation-mcp server
```

### 2. Point the component at it

```svelte
{#if dev}
  <Agentation endpoint="http://localhost:4747" />
{/if}
```

### 3. Connect Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "agentation": {
      "command": "npx",
      "args": ["-y", "agentation-mcp", "server"]
    }
  }
}
```

Restart Claude Code and approve the MCP server when prompted.

### The loop

1. You annotate elements in the browser
2. Claude Code calls `agentation_get_all_pending` to see your feedback
3. Claude Code makes the fix, then calls `agentation_resolve`
4. The marker disappears from your browser in real-time

For hands-free mode, tell Claude Code: *"watch for annotations and fix them as they come in"*

## Props

All props are optional.

| Prop | Type | Description |
|------|------|-------------|
| `endpoint` | `string` | MCP server URL (e.g. `"http://localhost:4747"`) |
| `sessionId` | `string` | Join an existing session |
| `onSessionCreated` | `(id: string) => void` | Fired when a new session is created |
| `onAnnotationAdd` | `(annotation) => void` | Fired when an annotation is added |
| `onAnnotationDelete` | `(annotation) => void` | Fired when an annotation is deleted |
| `onAnnotationUpdate` | `(annotation) => void` | Fired when a comment is edited |
| `onAnnotationsClear` | `(annotations[]) => void` | Fired when all annotations are cleared |
| `onCopy` | `(markdown) => void` | Fired when copy button is clicked |
| `onSubmit` | `(output, annotations) => void` | Fired when "Send to Agent" is clicked |
| `copyToClipboard` | `boolean` | Auto-copy on add (default: `true`) |
| `webhookUrl` | `string` | Webhook URL for annotation events |
| `className` | `string` | Custom class for positioning |
| `enableDemoMode` | `boolean` | Enable demo playback |
| `demoAnnotations` | `DemoAnnotation[]` | Annotations for demo mode |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd+Shift+F` | Toggle feedback mode |
| `P` | Pause/resume animations |
| `H` | Toggle marker visibility |
| `C` | Copy feedback to clipboard |
| `X` | Clear all annotations |
| `S` | Send annotations (webhook) |
| `Esc` | Exit feedback mode |
| `Cmd+Shift+Click` | Multi-select elements |

## Requirements

- Svelte 5+
- SvelteKit (or any Svelte-based framework)
- Client-side only (requires DOM access)
- Desktop only (not optimized for mobile)

## Differences from React version

- React fiber detection and source location removed (React-only features)
- "React Components" toggle removed from settings
- Uses Svelte 5 runes (`$state`, `$effect`, `$derived`, `$props`)
- Scoped CSS instead of CSS modules
- No runtime dependencies beyond Svelte

## License

PolyForm Shield 1.0.0 (same as upstream)
