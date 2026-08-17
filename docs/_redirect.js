/* ═══════════════════════════════════════════════════════════════════════════
   LEGACY REDIRECTS
   ═══════════════════════════════════════════════════════════════════════════
   GitHub Pages serves this `docs/` folder at the OLD address:

       https://nikhil-nehra.github.io/dickheads-fantasy-football-form/

   Links to those paths are already sitting in Sleeper league chat, and the
   entire premise of the site is that a shared link never breaks. So every old
   path keeps resolving and forwards to its new home.

   This is a script rather than a <meta http-equiv="refresh"> for one specific
   reason: the boards were deep-linked by HASH (…/boards.html#rivalry), the
   hash is never sent to a server, and a meta refresh drops it. Only JS running
   in the page can read location.hash and map it onto the new route.

   Set NEW_ORIGIN once the Worker is deployed.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
	var NEW_ORIGIN = 'https://dickheads-league.dickheads-league.workers.dev';

	// Old page  →  new path. Board hashes are appended by the map below.
	//
	// The old root served Survey 1 directly, and the old README planned a
	// "September swap" to rename files so the root became the hub once the
	// draft was done. Pointing the root at the hub from the start removes the
	// need for that swap: the hub lists intake with its live status, so the
	// link still reaches the survey in one tap AND still makes sense after the
	// survey closes, instead of becoming a dead end.
	var PAGES = {
		'index.html': '/',
		'intake.html': '/s/intake',
		'rivalry.html': '/s/rivalry',
		'hub.html': '/',
		'desk.html': '/desk',
		'boards.html': '/b/rivalry'
	};

	// The three board hashes that were shared.
	var BOARDS = { rivalry: '/b/rivalry', draft: '/b/draft', pot: '/b/pot' };

	var file = location.pathname.split('/').pop() || 'index.html';
	var hash = (location.hash || '').replace('#', '');

	var target = PAGES[file] || '/';
	if (file === 'boards.html' && BOARDS[hash]) target = BOARDS[hash];

	var url = NEW_ORIGIN + target + location.search;

	var link = document.getElementById('manual');
	if (link) {
		link.href = url;
		link.textContent = url;
	}

	// replace() so the dead URL doesn't linger in history behind the new page.
	location.replace(url);
})();
