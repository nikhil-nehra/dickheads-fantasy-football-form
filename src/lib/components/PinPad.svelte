<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { length = 4 }: { length?: number } = $props();

	let digits = $state<string[]>([]);
	let error = $state('');
	let busy = $state(false);
	let shake = $state(false);

	const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

	function press(d: string) {
		if (busy || digits.length >= length) return;
		error = '';
		digits = [...digits, d];
		if (digits.length === length) submit();
	}

	function del() {
		if (busy) return;
		error = '';
		digits = digits.slice(0, -1);
	}

	/* The old pad exposed press()/del() only through onclick on non-focusable
	   divs. There was no keydown listener anywhere in the codebase, so a
	   desktop commissioner had to mouse four buttons and a keyboard-only user
	   could not reach the Desk at all. */
	function onKeydown(e: KeyboardEvent) {
		if (e.key >= '0' && e.key <= '9') {
			e.preventDefault();
			press(e.key);
		} else if (e.key === 'Backspace' || e.key === 'Delete') {
			e.preventDefault();
			del();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			digits = [];
		}
	}

	async function submit() {
		busy = true;
		error = '';
		try {
			const res = await fetch('/api/desk/session', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pin: digits.join('') })
			});

			if (res.ok) {
				// The PIN itself is never kept anywhere on the client — the server
				// hands back an httpOnly cookie and that is the whole session.
				await invalidateAll();
				return;
			}

			const body = (await res.json().catch(() => ({}))) as { message?: string };
			error = body.message ?? "That's not it.";
			shake = true;
			setTimeout(() => (shake = false), 400);
			digits = [];
		} catch {
			error = "Couldn't reach the server.";
			digits = [];
		} finally {
			busy = false;
		}
	}

</script>

<!-- Listening at the window means the pad is typable the moment the page
     loads, with nothing to focus first. -->
<svelte:window onkeydown={onKeydown} />

<div class="vault">
	<h2>Commissioner's Desk</h2>
	<p class="q-help">Enter the {length}-digit code. Type it or tap it.</p>

	<div class="pad" class:shake>
		<div class="dots" aria-hidden="true">
			{#each Array(length) as _, i}
				<span class="dot" class:filled={i < digits.length}></span>
			{/each}
		</div>
		<p class="sr-only" role="status" aria-live="polite">
			{digits.length} of {length} digits entered.
		</p>

		<div class="keys">
			{#each KEYS as k}
				{#if k === ''}
					<span></span>
				{:else if k === '⌫'}
					<button type="button" disabled={busy} aria-label="Delete last digit" onclick={del}
						>⌫</button
					>
				{:else}
					<button type="button" disabled={busy} onclick={() => press(k)}>{k}</button>
				{/if}
			{/each}
		</div>
	</div>

	{#if error}
		<p class="notice notice--danger" role="alert">{error}</p>
	{/if}
</div>

<style>
	.vault {
		text-align: center;
		max-width: 320px;
		margin: 0 auto;
	}

	.pad:focus-visible {
		outline: 3px solid var(--gold-bright);
		outline-offset: 6px;
		border-radius: var(--r-md);
	}

	.dots {
		display: flex;
		justify-content: center;
		gap: var(--s-3);
		margin: var(--s-5) 0;
	}

	.dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 2px solid var(--border-strong);
	}

	.dot.filled {
		background: var(--gold);
		border-color: var(--gold);
	}

	.keys {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--s-2);
	}

	.keys button {
		min-height: 56px;
		border-radius: var(--r-md);
		border: 1px solid var(--border-strong);
		background: var(--surface-2);
		font-size: var(--t-lg);
		font-weight: 700;
		cursor: pointer;
	}

	.keys button:disabled {
		opacity: 0.5;
	}

	.shake {
		animation: shake 0.35s;
	}

	@keyframes shake {
		25% {
			transform: translateX(-8px);
		}
		75% {
			transform: translateX(8px);
		}
	}
</style>
