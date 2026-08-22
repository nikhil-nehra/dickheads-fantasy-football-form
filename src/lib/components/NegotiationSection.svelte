<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { NegotiationField, NegotiationQuestion } from '$lib/surveys/types';
	import {
		NONE,
		fieldStatus,
		isNone,
		ownValue,
		readsAsNone,
		type Entry,
		type FieldState,
		type Ruling
	} from '$lib/negotiation';
	import { colorsClash } from '$lib/rivalryPattern';
	import { normaliseHex } from '$lib/color';
	import { norm } from '$lib/text';
	import { RIVALRY } from '$lib/voice';
	import RichText from './RichText.svelte';

	/* ═══════════════════════════════════════════════════════════════════════
	   ONE ANSWER EACH. THEY MATCH OR THEY DON'T.
	   ═══════════════════════════════════════════════════════════════════════
	   Every card is the same two parts in the same order, so the second and
	   third cards are read at a glance rather than re-read:

	       your box   →   their line

	   Nothing is said twice, and nothing is narrated. Your answer is in your
	   box, theirs is on their line, and the badge in the header says whether
	   the two agree. There is no sentence underneath explaining that — a card
	   that tells you what you are already looking at is a card you stop
	   reading.

	   There is no proposing, no backing, and now no saving either: what is in
	   the box is your answer, and it is written for you. Agreement is still
	   derived by comparing the pair, exactly as it always was.

	   Two of the three lines can have no answer at all, and that is a switch
	   under the box rather than a mode in front of it: flip it and the question
	   goes away, flip it back and it returns. Declining is still a written,
	   compared answer, so a pair only lands on "no bet" when both of them say
	   so.

	   Team colours are the odd one out — an OWN line, with no second side to
	   satisfy. Your colours are yours. They live here rather than in the
	   response blob for one reason: your rival's pick is already loaded beside
	   yours, so you can see it before you pick against them, and matching is
	   the one outcome the header cannot draw.
	   ═══════════════════════════════════════════════════════════════════════ */

	type Negotiation = {
		pairingId: string;
		rival: { id: string; name: string } | null;
		mine: Entry[];
		theirs: Entry[];
		rulings: Ruling[];
	} | null;

	let {
		question,
		negotiation,
		surveyId,
		me,
		disabled = false
	}: {
		question: NegotiationQuestion;
		negotiation: Negotiation;
		surveyId: string;
		me: { id: string; display_name: string };
		disabled?: boolean;
	} = $props();

	// Local drafts, so typing is never clobbered by a background refresh —
	// the old page had to skip re-rendering whenever a text field had focus.
	let drafts = $state<Record<string, string>>({});
	let busy = $state<string | null>(null);
	/** Per field, so a failure is reported at the box that caused it. */
	let errs = $state<Record<string, string>>({});
	/** Per field, cleared on a timer — "it saved" needs saying, not just doing. */
	let saved = $state<Record<string, boolean>>({});

	/* ── Autosave ────────────────────────────────────────────────────────────
	   Long enough that a normal typing rhythm produces one write per thought
	   rather than one per keystroke, short enough that nobody navigates away
	   before it fires. A `change` on the field flushes it immediately, so
	   leaving the box never depends on the timer at all. */
	const AUTOSAVE_MS = 700;
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};

	$effect(() => () => {
		for (const t of Object.values(timers)) clearTimeout(t);
	});

	let rivalName = $derived(negotiation?.rival?.name ?? 'your rival');
	let firstName = $derived(rivalName.split(' ')[0]);

	/* ── Cards ───────────────────────────────────────────────────────────────
	   Fields sharing a `group` are one card. Colours are the case: a secondary
	   is only judgeable against the primary sitting beside it, and split across
	   two cards they read as two unrelated questions. An ungrouped own field is
	   simply a group of one, so there is no third code path. */
	type Card =
		| { id: string; own: false; field: NegotiationField }
		| { id: string; own: true; fields: NegotiationField[] };

	let cards = $derived.by(() => {
		const out: Card[] = [];
		const groups = new Map<string, NegotiationField[]>();

		for (const f of question.fields) {
			if (f.mode !== 'own') {
				out.push({ id: f.key, own: false, field: f });
				continue;
			}
			const name = f.group ?? f.key;
			let bucket = groups.get(name);
			if (!bucket) {
				bucket = [];
				groups.set(name, bucket);
				out.push({ id: `g:${name}`, own: true, fields: bucket });
			}
			bucket.push(f);
		}
		return out;
	});

	function fieldOf(key: string) {
		return fieldStatus(key, negotiation?.mine ?? [], negotiation?.theirs ?? [], negotiation?.rulings ?? []);
	}

	/* ── Reading a negotiated line ───────────────────────────────────────── */

	/** Your answer as stored, or '' — a switched-off line has no text. */
	function stored(st: FieldState): string {
		if (isNone(st.myPick)) return '';
		return st.myPick ?? st.myProposal ?? '';
	}

	function draft(key: string): string {
		return drafts[key] ?? stored(fieldOf(key));
	}

	/** Their answer, or null when they have none or have switched it off. */
	function theirText(st: FieldState): string | null {
		const v = st.theirPick ?? st.theirProposal;
		return v && !isNone(v) ? v : null;
	}

	const off = (st: FieldState) => isNone(st.myPick);
	const theyTurnedOff = (st: FieldState) => isNone(st.theirPick);

	/** Nothing to agree to when the two of you already wrote the same thing. */
	function matches(st: FieldState, theirs: string | null): boolean {
		return !!(theirs && st.myPick && norm(st.myPick) === norm(theirs));
	}

	/* ── Reading an own line ─────────────────────────────────────────────── */

	const myPickFor = (key: string) => ownValue(key, negotiation?.mine ?? []);
	const theirPickFor = (key: string) => ownValue(key, negotiation?.theirs ?? []);

	function colorDraft(key: string): string {
		return drafts[key] ?? myPickFor(key) ?? '';
	}

	/** Which rows of a colour card would read as the rival's on the board. */
	function clashing(fields: NegotiationField[]): NegotiationField[] {
		return fields.filter((f) => colorsClash(myPickFor(f.key), theirPickFor(f.key)));
	}

	/** What the wheel opens on before anything is chosen. */
	const dialValue = (f: NegotiationField) => normaliseHex(colorDraft(f.key)) ?? f.placeholder;

	/* ── Writing ─────────────────────────────────────────────────────────── */

	async function save(
		fieldKey: string,
		proposal: string | null,
		pick: string | null,
		opts: { keepDraft?: boolean } = {}
	) {
		if (!negotiation) return;
		busy = fieldKey;
		delete errs[fieldKey];
		delete saved[fieldKey];
		try {
			const res = await fetch(`/api/surveys/${surveyId}/negotiation`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					pairingId: negotiation.pairingId,
					playerId: me.id,
					fieldKey,
					proposal,
					pick
				})
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				errs[fieldKey] = body.message ?? 'That did not save. Try again.';
				return;
			}
			/* Mid-typing saves KEEP the draft: dropping it would re-render the box
			   from the server's copy under a cursor that is still in it. On the
			   way out it is dropped instead, so the box re-syncs to whatever the
			   server actually stored — which for a bet is normalised, and "20"
			   becomes "$20" in front of you rather than silently on the board. */
			if (!opts.keepDraft) delete drafts[fieldKey];
			saved[fieldKey] = true;
			setTimeout(() => delete saved[fieldKey], 2200);
			await invalidateAll();
		} catch {
			errs[fieldKey] = "Couldn't reach the server.";
		} finally {
			busy = null;
		}
	}

	/* ── Nothing means nothing ───────────────────────────────────────────────
	   On a line that can be declined, an empty box and a bet of zero are not
	   half-finished answers — they are the answer, and the same one the switch
	   gives. Left as a blank they would sit on the board as "not set", which
	   reads as two people who never got round to it rather than two people who
	   decided against it.

	   Only on the way OUT, though. Mid-typing, an empty box is somebody who has
	   selected all and is about to retype, and flipping the switch under them
	   would take the field away as they reached for it. So the debounce simply
	   skips a transient blank; leaving the field is what makes it a decision. */
	const meansNone = (f: NegotiationField, value: string) =>
		readsAsNone(value, { optional: !!f.optional, money: f.kind === 'money' });

	/* One value per person. `proposal` and `pick` are written together because
	   there is no longer a difference between them: what you wrote IS what you
	   are backing. Both columns stay populated so the board and the Desk, which
	   read either, keep working unchanged.

	   An emptied box on a line that CANNOT be declined is an emptied answer,
	   not a skipped write — otherwise deleting a rivalry name leaves the old
	   one standing on the board. */
	function commit(f: NegotiationField, keepDraft: boolean) {
		const st = fieldOf(f.key);
		const v = draft(f.key).trim();

		if (meansNone(f, v)) {
			// Transient while typing; a decision once you leave.
			if (keepDraft) return;
			if (!isNone(st.myPick)) save(f.key, null, NONE, { keepDraft: true });
			return;
		}

		if (v === stored(st).trim()) {
			if (!keepDraft) delete drafts[f.key];
			return;
		}
		save(f.key, v || null, v || null, { keepDraft });
	}

	function typing(f: NegotiationField, value: string) {
		drafts[f.key] = value;
		clearTimeout(timers[f.key]);
		timers[f.key] = setTimeout(() => commit(f, true), AUTOSAVE_MS);
	}

	/** Leaving the box, or pressing Enter, writes it now rather than in 700ms. */
	function settle(f: NegotiationField) {
		clearTimeout(timers[f.key]);
		commit(f, false);
	}

	/** Take their answer as your own. The box fills in with it. */
	function agree(fieldKey: string, value: string) {
		clearTimeout(timers[fieldKey]);
		drafts[fieldKey] = value;
		save(fieldKey, value, value);
	}

	/* Agreeing to a rival who wants none of it. Deliberately NOT `agree`: that
	   would put the literal string "None" in the box, which is what the reader
	   would find waiting for them if they ever flipped the switch back off. The
	   switch is the answer, so the switch is what moves. */
	function agreeNone(fieldKey: string) {
		clearTimeout(timers[fieldKey]);
		save(fieldKey, null, NONE, { keepDraft: true });
	}

	function toggleOff(fieldKey: string, isOff: boolean) {
		clearTimeout(timers[fieldKey]);
		if (isOff) save(fieldKey, null, null, { keepDraft: true });
		else save(fieldKey, null, NONE, { keepDraft: true });
	}

	/* A colour is committed as you choose it — the native picker fires `change`
	   when the dial is released, and the hex box when it loses focus or takes
	   Enter. Parsed here as well as on the server so a half-typed "#b19" never
	   leaves the page as a request that can only fail. */
	function commitColor(fieldKey: string, value: string) {
		const hex = normaliseHex(value);
		if (!hex) {
			errs[fieldKey] = 'That is not a color. Use the wheel, or type a hex like #b91932.';
			return;
		}
		delete errs[fieldKey];
		if (hex !== myPickFor(fieldKey)) save(fieldKey, null, hex);
		else delete drafts[fieldKey];
	}
</script>

{#if !negotiation}
	<p class="notice">
		You haven't been paired up yet. The commissioner sets the rivalries. Check back once
		they're posted.
	</p>
{:else}
	<!-- The broadcast title card, matching the one the public rivalry board
	     uses, so a pairing looks the same wherever you meet it. -->
	<div class="vs">
		<span class="vs-name">{me.display_name}</span>
		<span class="vs-mark" aria-hidden="true">VS</span>
		<span class="vs-name">{rivalName}</span>
		<span class="sr-only">versus</span>
	</div>

	{#each cards as card (card.id)}
		{#if card.own}
			<!-- ── A card with nobody to argue with ───────────────────────────
			     No agreement, no dispute, no ruling: two sets of colours that
			     both stand. `fieldStatus` is not called at all here, and must not
			     be — two teams landing on the same colour would come back
			     "agreed", which is precisely backwards. -->
			{@const lead = card.fields[0]}
			{@const set = card.fields.filter((f) => myPickFor(f.key)).length}
			{@const clashes = clashing(card.fields)}
			<section class="neg" class:neg--done={set === card.fields.length}>
				<header class="neg-head">
					<span class="down-tag">{lead.tag}</span>
					<span
						class="badge"
						class:badge--open={set === card.fields.length}
						class:badge--draft={set < card.fields.length}
					>
						{#if set === card.fields.length}Picked
						{:else if set > 0}One to go
						{:else}Not set{/if}
					</span>
				</header>

				<h3 class="neg-prompt">{lead.prompt}</h3>
				<p class="neg-help"><RichText text={lead.help} /></p>

				<div class="colors">
					{#each card.fields as f (f.key)}
						<div class="color-row">
							<label class="color-label" for="hex-{f.key}">{f.short}</label>
							<!-- The wheel and the hex box are one value from two
							     directions: one for hunting a shade, one for anybody who
							     already knows their team's hex. -->
							<input
								class="dial"
								type="color"
								aria-label="{f.short} color wheel"
								value={dialValue(f)}
								{disabled}
								oninput={(e) => (drafts[f.key] = e.currentTarget.value)}
								onchange={(e) => commitColor(f.key, e.currentTarget.value)}
							/>
							<input
								id="hex-{f.key}"
								class="hex"
								type="text"
								inputmode="text"
								spellcheck="false"
								autocomplete="off"
								maxlength="9"
								placeholder={f.placeholder}
								aria-describedby={errs[f.key] ? `err-${f.key}` : undefined}
								aria-invalid={errs[f.key] ? 'true' : undefined}
								value={colorDraft(f.key)}
								{disabled}
								oninput={(e) => (drafts[f.key] = e.currentTarget.value)}
								onchange={(e) => commitColor(f.key, e.currentTarget.value)}
							/>
						</div>
						{#if errs[f.key]}
							<p class="field-err" id="err-{f.key}" role="alert">{errs[f.key]}</p>
						{/if}
					{/each}
				</div>

				<p class="theirs">
					<span class="theirs-who">{firstName}</span>
					{#if card.fields.some((f) => theirPickFor(f.key))}
						{#each card.fields as f (f.key)}
							{@const hex = theirPickFor(f.key)}
							{#if hex}
								<span class="theirs-color">
									<span class="ink-chip" style="--c:{hex}" aria-hidden="true"></span>{hex}
								</span>
							{/if}
						{/each}
					{:else}
						<span class="theirs-empty">hasn't picked yet</span>
					{/if}
				</p>

				{#each clashes as f (f.key)}
					<p class="field-err" role="alert">{RIVALRY.clash(f.short, firstName)}</p>
				{/each}
			</section>
		{:else}
			{@const f = card.field}
			{@const st = fieldOf(f.key)}
			{@const theirs = theirText(st)}
			{@const isOff = off(st)}
			<section class="neg" class:neg--done={st.state === 'agreed' || st.state === 'forced'} class:neg--off={isOff && st.state !== 'agreed'}>
				<header class="neg-head">
					<span class="down-tag">{f.tag}</span>
					<span
						class="badge"
						class:badge--open={st.state === 'agreed'}
						class:badge--closed={st.state === 'waiting'}
						class:badge--draft={st.state === 'open'}
						class:badge--archived={st.state === 'forced'}
					>
						{#if st.state === 'agreed'}Agreed
						{:else if st.state === 'forced'}Ruled
						{:else if st.state === 'waiting'}Not matching
						{:else}Not set{/if}
					</span>
				</header>

				{#if st.state === 'forced'}
					<!-- A ruling overrides both sides, so there is nothing here to
					     type into. -->
					<p class="ruled-value">{isNone(st.value) ? (f.optional?.none ?? "There isn't one.") : st.value}</p>
					<p class="neg-help">
						The commissioner ruled on this one. It stands unless they withdraw it.
					</p>
				{:else}
					<h3 class="neg-prompt">{f.prompt}</h3>
					<p class="neg-help"><RichText text={f.help} /></p>

					{#if !isOff}
						<div class="field">
							<div class="field-head">
								<label class="field-label" for="prop-{f.key}">Your answer</label>
								<!-- There is no save button, so the page has to say what it is
								     doing on its own. Idle copy states the rule; the other two
								     confirm it happened. -->
								{#if !disabled}
									<span class="autosave" class:autosave--on={busy === f.key || saved[f.key]} role="status">
										{#if busy === f.key}Saving…
										{:else if saved[f.key]}Saved
										{:else}Saves as you type{/if}
									</span>
								{/if}
							</div>

							{#if f.kind === 'money'}
								<!-- A bet is an amount, so it gets an amount field: a numeric
								     keypad on a phone, and no way to type a sentence into a
								     line the board prints as a figure. -->
								<span class="money">
									<span class="money-mark" aria-hidden="true">$</span>
									<input
										id="prop-{f.key}"
										type="number"
										min="0"
										step="1"
										inputmode="decimal"
										{disabled}
										placeholder={f.placeholder}
										aria-describedby={errs[f.key] ? `err-${f.key}` : undefined}
										aria-invalid={errs[f.key] ? 'true' : undefined}
										value={draft(f.key).replace(/^\$/, '')}
										oninput={(e) => typing(f, e.currentTarget.value)}
										onchange={() => settle(f)}
									/>
								</span>
							{:else}
								<textarea
									id="prop-{f.key}"
									class="answer"
									rows="2"
									{disabled}
									placeholder={f.placeholder}
									aria-describedby={errs[f.key] ? `err-${f.key}` : undefined}
									aria-invalid={errs[f.key] ? 'true' : undefined}
									value={draft(f.key)}
									oninput={(e) => typing(f, e.currentTarget.value)}
									onchange={() => settle(f)}
								></textarea>
							{/if}

							{#if errs[f.key]}
								<p class="field-err" id="err-{f.key}" role="alert">{errs[f.key]}</p>
							{/if}
						</div>

						<!-- Their side, on ONE line. It was a bordered panel with a
						     heading of its own, which for a three-character answer like
						     "$25" was a box of mostly nothing. A name, a value and the
						     way to take it is all there ever is here. -->
						<p class="theirs">
							<span class="theirs-who">{firstName}</span>
							{#if theirs}
								<span class="theirs-value">{theirs}</span>
								{#if !disabled && !matches(st, theirs)}
									<button
										class="btn btn--ghost btn--sm agree"
										disabled={busy === f.key}
										onclick={() => agree(f.key, theirs)}>Agree</button
									>
								{/if}
							{:else if theyTurnedOff(st)}
								<span class="theirs-empty">doesn't want one</span>
								<!-- Agreeing to a decline is the same one tap as agreeing to a
								     value, and it flips your own switch. Without it the only
								     way to match your rival here is to notice a control at the
								     other end of the card and work out that it is the same
								     answer. -->
								{#if !disabled}
									<button
										class="btn btn--ghost btn--sm agree"
										disabled={busy === f.key}
										onclick={() => agreeNone(f.key)}>Agree</button
									>
								{/if}
							{:else}
								<span class="theirs-empty">hasn't answered yet</span>
							{/if}
						</p>
					{/if}

					<!-- ── No status line ──────────────────────────────────────────
					     There used to be a sentence here for every state, and every
					     one of them restated something already on screen: the badge
					     says Agreed or Not matching, and their line says whether they
					     have answered. "Your move." was three words that added
					     nothing to a card you were already looking at.

					     One case survives, because it is the only place the
					     information exists. Switching a line off hides their answer
					     along with everything else, so a rival still holding one has
					     to be reported somewhere. -->
					{#if isOff && st.theirPick && !theyTurnedOff(st)}
						<p class="neg-foot" role="status">{firstName} still wants one.</p>
					{/if}

					{#if f.optional && !disabled}
						<!-- A real switch: native checkbox, so state, keyboard and the
						     accessible name come from the platform rather than from
						     three ARIA attributes on a div. -->
						<label class="switch">
							<input
								type="checkbox"
								role="switch"
								checked={isOff}
								disabled={busy === f.key}
								onchange={() => toggleOff(f.key, isOff)}
							/>
							<span class="track" aria-hidden="true"><span class="thumb"></span></span>
							<span class="switch-text">{f.optional.decline}</span>
						</label>
					{/if}
				{/if}
			</section>
		{/if}
	{/each}

	<!-- The deadline, last, where somebody who has just failed to agree
	     something is looking. -->
	<p class="notice">{RIVALRY.deadline}</p>
{/if}

<style>
	/* ── The card ────────────────────────────────────────────────────────────
	   Three of these stack, and they are deliberately identical in shape: tag
	   and badge, prompt, help, your box, their line, whose move it is. Reading
	   the first one teaches the other two. */
	.neg {
		padding: var(--s-4);
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		background: var(--surface-2);
		margin-bottom: var(--s-3);
	}

	.neg--done {
		border-color: var(--ok);
		background: var(--ok-soft);
	}

	/* Switched off is not settled and must not look it — it is a card with its
	   question withdrawn, which reads as quieter, not as finished. */
	.neg--off {
		background: var(--surface);
	}

	.neg-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
		margin-bottom: var(--s-3);
	}

	.neg-head .down-tag {
		margin: 0;
	}

	/* A status badge is a fixed vocabulary — it should never be the thing that
	   wraps to a second line. */
	.neg-head .badge {
		flex: 0 0 auto;
		white-space: nowrap;
	}

	.neg-prompt {
		font-size: var(--t-md);
		font-weight: 800;
		line-height: 1.3;
		margin: 0 0 var(--s-1);
	}

	.neg-help {
		font-size: var(--t-sm);
		color: var(--ink-soft);
		line-height: 1.5;
		margin: 0 0 var(--s-4);
	}

	.ruled-value {
		font-size: var(--t-md);
		font-weight: 800;
		margin: 0 0 var(--s-2);
	}

	/* ── Your box ────────────────────────────────────────────────────────── */

	.field {
		margin-bottom: var(--s-3);
	}

	/* Label left, autosave state right — the state belongs to the field, so it
	   sits on the field's own line rather than floating near the buttons. */
	.field-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-2);
		margin-bottom: var(--s-2);
	}

	.field-label {
		margin: 0;
		font-size: var(--t-sm);
		font-weight: 700;
	}

	.autosave {
		flex: 0 0 auto;
		font-size: var(--t-xs);
		color: var(--ink-faint);
		white-space: nowrap;
		transition: color var(--dur-1) var(--ease);
	}

	.autosave--on {
		color: var(--ok);
		font-weight: 700;
	}

	.answer {
		display: block;
		width: 100%;
		margin: 0;
	}

	.money {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}

	.money-mark {
		font-family: var(--font-display);
		font-size: var(--t-lg);
		color: var(--ink-soft);
	}

	/* The currency mark belongs to the field, not to the value — typing over an
	   amount should never mean re-typing a "$". */
	.money input {
		width: 8ch;
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--t-lg);
		font-variant-numeric: tabular-nums;
	}

	/* Beside the field it belongs to, not in a summary at the top of the
	   section — an error you have to go looking for is an error you have to
	   guess at. */
	.field-err {
		margin: var(--s-2) 0 0;
		font-size: var(--t-sm);
		font-weight: 600;
		color: var(--danger);
	}

	/* ── Their side ──────────────────────────────────────────────────────────
	   One line: who, what, and the way to take it. A rule above it does the
	   separating that a border box used to, at none of the cost — a panel with
	   its own heading around the word "$25" was four lines of chrome for three
	   characters of content. */
	.theirs {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--s-2) var(--s-3);
		margin: 0;
		padding-top: var(--s-3);
		border-top: 1px solid var(--border);
		font-size: var(--t-sm);
	}

	.theirs-who {
		flex: 0 0 auto;
		font-weight: 700;
		color: var(--ink-soft);
	}

	.theirs-value {
		flex: 1 1 8ch;
		min-width: 0;
		font-size: var(--t-base);
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.theirs-empty {
		flex: 1 1 auto;
		color: var(--ink-faint);
	}

	.theirs-color {
		display: inline-flex;
		align-items: center;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.agree {
		flex: 0 0 auto;
		margin-left: auto;
	}

	.neg-foot {
		margin: var(--s-3) 0 0;
		font-size: var(--t-sm);
		color: var(--ink-soft);
		line-height: 1.5;
	}

	/* ── The switch ──────────────────────────────────────────────────────────
	   A native checkbox doing the work, with `role="switch"` for the name it
	   deserves: state, keyboard operation and the label association all come
	   from the platform instead of from three ARIA attributes on a div.

	   The input is clipped rather than `display: none`, because a hidden input
	   is not focusable — and the focus ring is moved onto the track it drives,
	   so keyboard users get the site's own ring on the thing they can see. */
	.switch {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		min-height: var(--tap);
		margin: var(--s-3) 0 0;
		padding-top: var(--s-3);
		border-top: 1px solid var(--border);
		cursor: pointer;
		font-size: var(--t-sm);
		color: var(--ink-soft);
	}

	.switch input {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.track {
		flex: 0 0 auto;
		position: relative;
		display: block;
		width: 44px;
		height: 26px;
		border-radius: var(--r-pill);
		border: 2px solid var(--border-strong);
		background: var(--field);
		transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease);
	}

	.thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--ink-soft);
		transition: transform var(--dur-1) var(--ease), background var(--dur-1) var(--ease);
	}

	.switch input:checked + .track {
		background: var(--ok);
		border-color: var(--ok);
	}

	.switch input:checked + .track .thumb {
		background: var(--surface);
		transform: translateX(18px);
	}

	.switch input:focus-visible + .track {
		outline: 3px solid var(--gold-bright);
		outline-offset: 2px;
	}

	.switch input:checked ~ .switch-text {
		color: var(--ink);
		font-weight: 700;
	}

	.switch input:disabled ~ .switch-text,
	.switch input:disabled + .track {
		opacity: 0.5;
	}

	/* ── Colours ─────────────────────────────────────────────────────────────
	   One card, one row per colour, because a secondary is a decision about the
	   primary and has to be visible next to it. No grid of suggestions: the
	   wheel is the whole point, and a shortlist would quietly become the only
	   colours anybody picks. */
	.colors {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		margin-bottom: var(--s-3);
	}

	.color-row {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}

	.color-label {
		flex: 0 0 auto;
		min-width: 9ch;
		margin: 0;
		font-size: var(--t-sm);
		font-weight: 700;
	}

	.dial {
		flex: 0 0 auto;
		width: var(--tap);
		height: var(--tap);
		padding: 2px;
		margin: 0;
		border-radius: var(--r-sm);
		border: 1px solid var(--border-strong);
		background: var(--surface);
		cursor: pointer;
	}

	.hex {
		width: 11ch;
		margin: 0;
		font-variant-numeric: tabular-nums;
	}

	/* The rival's pick, in words as well as in colour — a swatch alone is not
	   an answer for anybody who cannot see it. */
	.ink-chip {
		display: inline-block;
		width: 0.9em;
		height: 0.9em;
		vertical-align: -0.1em;
		margin-right: 0.35em;
		border-radius: 3px;
		border: 1px solid var(--border-strong);
		background: var(--c);
	}

	/* ── The title card ──────────────────────────────────────────────────── */

	.vs {
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: var(--s-3);
		padding: var(--s-4) var(--s-3);
		margin-bottom: var(--s-4);
		border-radius: var(--r-md);
		background: linear-gradient(135deg, var(--turf-mid), var(--turf-dark));
		color: var(--chalk);
		text-align: center;
	}

	.vs::before {
		content: '';
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(90deg, rgb(255 255 255 / 4%) 0 2px, transparent 2px 40px);
	}

	.vs-name {
		position: relative;
		font-family: var(--font-display);
		text-transform: uppercase;
		font-size: clamp(14px, 4vw, 18px);
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.vs-mark {
		position: relative;
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--chalk);
		color: var(--endzone);
		font-family: var(--font-display);
		font-size: 12px;
	}
</style>
