import { describe, it, expect } from 'vitest';
import { SURVEYS } from '../../src/lib/surveys';

/**
 * Section headers are rendered now, and that changes what a definition owes.
 *
 * Every section has always carried a `title`, and until now nothing drew it:
 * the only thing marking a new question on the page was an 11px mono chip.
 * `SurveyForm` puts the title up as a heading, which turns two fields that
 * used to be free-form into contracts — a section with no title renders an
 * empty <h3>, and a title that repeats its own question's prompt prints the
 * same sentence twice, one line apart.
 *
 * Cheap to assert here, invisible until somebody opens the page otherwise.
 */
describe('every survey section can be used as a header', () => {
	for (const def of SURVEYS) {
		for (const section of def.sections) {
			describe(`${def.id} / ${section.id}`, () => {
				it('has a tag and a title to draw', () => {
					expect(section.tag.trim()).not.toBe('');
					expect(section.title.trim()).not.toBe('');
				});

				it('does not repeat itself between the tag, the title and the prompts', () => {
					const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
					const title = norm(section.title);

					// The tag went back to being just the down ("2ND DOWN") once the
					// title started rendering underneath it. A tag that still spells
					// out the subject reads as a stutter at heading size.
					expect(norm(section.tag)).not.toContain(title);

					for (const q of section.questions) {
						expect(norm(q.prompt)).not.toBe(title);
					}
				});
			});
		}
	}
});
