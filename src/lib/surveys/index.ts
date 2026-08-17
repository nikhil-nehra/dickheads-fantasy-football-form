/* ═══════════════════════════════════════════════════════════════════════════
   THE SURVEY REGISTRY
   ═══════════════════════════════════════════════════════════════════════════
   Add a definition here and it appears on the hub, gets a route at
   /s/<id>, gets a tab on the Desk, and gets open/close controls — with no
   other edit anywhere. Nothing in the app is allowed to switch on a survey id.

   Adding a survey to the OLD site meant a new HTML file, an entry in SURVEYS,
   a prefix in Code.gs's KEY_OWNER, an Apps Script redeploy, and then three
   hardcoded dispatch sites that it still got wrong.
   ═══════════════════════════════════════════════════════════════════════════ */

import { intake } from './intake';
import { rivalry } from './rivalry';
import type { SurveyDefinition } from './types';

export const SURVEYS: SurveyDefinition[] = [intake, rivalry];

export function surveyById(id: string): SurveyDefinition | undefined {
	return SURVEYS.find((s) => s.id === id);
}

export * from './types';
