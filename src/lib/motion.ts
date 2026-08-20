import type { Action } from 'svelte/action';

/* ═══════════════════════════════════════════════════════════════════════════
   MOTION
   ═══════════════════════════════════════════════════════════════════════════
   Every animation on the site that needs JavaScript lives here. No library —
   Svelte's own transitions plus these four actions cover it, and the Worker
   bundle stays the size it was.

   Two rules hold everywhere in this file:

   1. Nothing here may hide content. Actions run on the client only, so a
      reveal that started life hidden in CSS would stay hidden forever for a
      reader without JavaScript. Instead the action marks the element as
      pending itself, at runtime, and CSS only hides what has been marked.

   2. `prefers-reduced-motion` is honoured in JS as well as CSS. The CSS media
      query can flatten a transition, but it cannot stop a requestAnimationFrame
      loop from repainting a number sixty times a second — so the loops check.
   ═══════════════════════════════════════════════════════════════════════════ */

/** True when the reader has asked their OS for less movement. */
export function reduced(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/* ── Scroll reveal ─────────────────────────────────────────────────────── */

export type RevealParams = {
	/** Explicit delay in ms. Wins over `index`. */
	delay?: number;
	/** Position in a list; multiplied by `step` to stagger a group. */
	index?: number;
	/** Per-item stagger, default 60ms. */
	step?: number;
} | undefined;

/**
 * Fade-and-rise an element the first time it scrolls into view.
 *
 * The element is only marked hidden once this runs, which is after hydration —
 * so the server-rendered page is always readable on its own.
 */
export const reveal: Action<HTMLElement, RevealParams> = (node, params) => {
	if (reduced() || typeof IntersectionObserver === 'undefined') return {};

	const delay = params?.delay ?? (params?.index ?? 0) * (params?.step ?? 60);
	node.style.setProperty('--reveal-delay', `${delay}ms`);
	node.dataset.reveal = 'pending';

	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				node.dataset.reveal = 'in';
				io.disconnect();
			}
		},
		// Fire a little before the element is fully on screen, so the animation
		// is finishing as it arrives rather than starting.
		{ rootMargin: '0px 0px -6% 0px', threshold: 0.04 }
	);

	io.observe(node);
	return { destroy: () => io.disconnect() };
};

/* ── Count-up numerals ─────────────────────────────────────────────────── */

export type CountParams = {
	value: number;
	/** Defaults to a thousands-separated integer. */
	format?: (n: number) => string;
	duration?: number;
};

const plain = (n: number): string => Math.round(n).toLocaleString();

/**
 * Roll a number up from zero when the tile first appears, and tween between
 * values on every change after that.
 *
 * The server renders the true value into the element, so this is decoration on
 * top of correct content — never the only thing that puts a number on screen.
 */
export const countUp: Action<HTMLElement, CountParams> = (node, params) => {
	let p = params;
	let raf = 0;
	let shown = p.value;
	let started = false;

	/* Write through the text node Svelte already owns rather than replacing it.
	   `node.textContent = …` detaches that node, and the next reactive update
	   to the same expression would then write into an orphan — the number on
	   screen would silently stop tracking the data. */
	const paint = (n: number) => {
		const text = (p.format ?? plain)(n);
		const first = node.firstChild;
		if (first && first.nodeType === Node.TEXT_NODE) first.nodeValue = text;
		else node.textContent = text;
	};

	function run(from: number, to: number) {
		cancelAnimationFrame(raf);
		shown = to;

		if (reduced() || from === to) {
			paint(to);
			return;
		}

		const dur = p.duration ?? 900;
		const t0 = performance.now();

		const tick = (now: number) => {
			const t = Math.min(1, (now - t0) / dur);
			// Cubic ease-out: quick off the mark, long settle. Matches --ease-out.
			paint(from + (to - from) * (1 - Math.pow(1 - t, 3)));
			if (t < 1) raf = requestAnimationFrame(tick);
			else paint(to);
		};

		raf = requestAnimationFrame(tick);
	}

	if (reduced() || typeof IntersectionObserver === 'undefined') {
		started = true;
	} else {
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting || started) continue;
					started = true;
					run(0, p.value);
					io.disconnect();
				}
			},
			{ threshold: 0.2 }
		);
		io.observe(node);

		return {
			update(next: CountParams) {
				const changed = next.value !== p.value;
				p = next;
				if (started && changed) run(shown, next.value);
				else if (!started) shown = next.value;
			},
			destroy() {
				cancelAnimationFrame(raf);
				io.disconnect();
			}
		};
	}

	return {
		update(next: CountParams) {
			p = next;
			paint(next.value);
		},
		destroy() {
			cancelAnimationFrame(raf);
		}
	};
};

/* ── One-shot class ────────────────────────────────────────────────────── */

/**
 * Add a class, let its animation finish, then take it off — so the same
 * animation can be replayed on the next wrong PIN or the next saved answer.
 * Returns immediately when motion is reduced.
 */
export function flash(node: HTMLElement | null | undefined, className: string): void {
	if (!node || reduced()) return;
	node.classList.remove(className);
	// Force a reflow so removing and re-adding actually restarts the animation.
	void node.offsetWidth;
	node.classList.add(className);
	node.addEventListener('animationend', () => node.classList.remove(className), { once: true });
}

/* ── Easter egg ────────────────────────────────────────────────────────── */

const KONAMI = [
	'ArrowUp',
	'ArrowUp',
	'ArrowDown',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'ArrowLeft',
	'ArrowRight',
	'b',
	'a'
];

/**
 * Call `fn` when the Konami code is typed. Returns an unsubscribe, so it drops
 * straight into an `$effect`.
 */
export function onKonami(fn: () => void): () => void {
	if (typeof window === 'undefined') return () => {};

	let i = 0;

	const onKey = (e: KeyboardEvent) => {
		const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
		if (key === KONAMI[i]) {
			i += 1;
			if (i === KONAMI.length) {
				i = 0;
				fn();
			}
			return;
		}
		// A wrong key restarts the sequence — but if it was itself the opening
		// key, it counts as the new first press rather than a reset to zero.
		i = key === KONAMI[0] ? 1 : 0;
	};

	window.addEventListener('keydown', onKey);
	return () => window.removeEventListener('keydown', onKey);
}
