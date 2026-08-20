/**
 * Generates static/og/board.png — the link-preview image for every board.
 *
 * The same composition the site uses: navy chrome top and bottom, a gold rule
 * where it meets the green field, and a coach's chalk playbook across the
 * middle. Drawn straight into a pixel buffer and encoded as PNG — no image
 * library, no wasm font renderer, nothing added to the Worker bundle. The
 * title and description in the unfurl are dynamic (rendered per board in
 * +page.svelte); this is the fixed backdrop behind them.
 *
 * This script no longer writes static/apple-touch-icon.png. That icon is now
 * the league crest, downscaled from DFFL_Logo.png — a hand-drawn field would
 * overwrite the badge with something off-brand every time this was run.
 *
 * Run: node scripts/make-og.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const W = 1200;
const H = 630;

const NAVY = [0x17, 0x34, 0x56];
const NAVY_DEEP = [0x0e, 0x23, 0x40];
const TURF_DARK = [0x12, 0x2a, 0x1c];
const TURF_MID = [0x1d, 0x4a, 0x30];
const CHALK = [0xf4, 0xef, 0xe2];
const GOLD = [0xc9, 0xa2, 0x27];

/** Where the navy chrome ends and the field begins. */
const TOP = 108;
const BOTTOM = H - 96;
const RULE = 6;

const px = Buffer.alloc(W * H * 3);

function set(x, y, [r, g, b]) {
	if (x < 0 || y < 0 || x >= W || y >= H) return;
	const i = (y * W + x) * 3;
	px[i] = r;
	px[i + 1] = g;
	px[i + 2] = b;
}

function mix(a, b, t) {
	return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

/** Composite `color` over what is already there. Chalk is never opaque. */
function blend(x, y, color, alpha) {
	if (x < 0 || y < 0 || x >= W || y >= H) return;
	const i = (y * W + x) * 3;
	for (let c = 0; c < 3; c++) {
		px[i + c] = Math.round(px[i + c] + (color[c] - px[i + c]) * alpha);
	}
}

function disc(cx, cy, r, color, alpha) {
	for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
		for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
			if (Math.hypot(x - cx, y - cy) <= r) blend(x, y, color, alpha);
		}
	}
}

/** A stroked circle — the O in an X-and-O. */
function ring(cx, cy, r, w, color, alpha) {
	const outer = r + w;
	for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y++) {
		for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
			if (Math.abs(Math.hypot(x - cx, y - cy) - r) <= w / 2) blend(x, y, color, alpha);
		}
	}
}

/** A stroked segment, stamped from overlapping discs so the ends are round. */
function seg(x0, y0, x1, y1, w, color, alpha) {
	const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
	for (let s = 0; s <= steps; s++) {
		const t = s / steps;
		disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, color, alpha);
	}
}

function cross(cx, cy, size, w, color, alpha) {
	seg(cx - size, cy - size, cx + size, cy + size, w, color, alpha);
	seg(cx + size, cy - size, cx - size, cy + size, w, color, alpha);
}

// ── Ground ────────────────────────────────────────────────────────────────

// Navy chrome, top and bottom, gradient toward the outer edges.
for (let y = 0; y < H; y++) {
	for (let x = 0; x < W; x++) {
		if (y < TOP) {
			set(x, y, mix(NAVY, NAVY_DEEP, 1 - y / TOP));
		} else if (y >= BOTTOM) {
			set(x, y, mix(NAVY, NAVY_DEEP, (y - BOTTOM) / (H - BOTTOM)));
		} else {
			// The field: mown stripes, darkening toward the edges.
			const stripe = Math.floor(x / 110) % 2 === 0 ? 0.12 : 0;
			const vignette = 1 - Math.min(1, (Math.abs(y - H / 2) / (H / 2)) ** 2) * 0.3;
			set(x, y, mix(TURF_DARK, TURF_MID, (0.5 + stripe) * vignette));
		}
	}
}

// The gold rules, where chrome meets field.
for (let x = 0; x < W; x++) {
	for (let t = 0; t < RULE; t++) {
		set(x, TOP - RULE + t, GOLD);
		set(x, BOTTOM + t, GOLD);
	}
}

// ── The playbook ──────────────────────────────────────────────────────────

const INK = 0.3;
const MID = (TOP + BOTTOM) / 2;

// Line of scrimmage, dashed the whole way across.
for (let x = 0; x < W; x += 34) {
	seg(x, MID - 46, x + 20, MID - 46, 4, CHALK, 0.22);
}

// Receivers and defenders either side of it.
for (const cx of [150, 216, 700, 940]) ring(cx, MID + 6, 17, 5, CHALK, INK);
for (const cx of [430, 830]) cross(cx, MID - 88, 15, 5, CHALK, INK);
ring(560, MID + 62, 17, 5, CHALK, INK);

// Routes off the line.
seg(150, MID - 16, 150, MID - 190, 5, CHALK, 0.26); // go
seg(216, MID - 16, 320, MID - 140, 5, CHALK, 0.26); // slant
seg(940, MID - 16, 940, MID - 110, 5, CHALK, 0.26); // out, stem
seg(940, MID - 110, 1070, MID - 110, 5, CHALK, 0.26); // out, break
seg(700, MID - 16, 700, MID - 120, 5, CHALK, 0.26); // curl, stem
seg(700, MID - 120, 640, MID - 150, 5, CHALK, 0.26); // curl, hook

// Blocking assignments out of the backfield.
seg(524, MID + 50, 480, MID + 4, 5, CHALK, 0.22);
seg(596, MID + 50, 640, MID + 4, 5, CHALK, 0.22);

// Pre-snap motion, dotted.
for (let i = 0; i < 14; i++) {
	disc(300 - i * 14, MID + 34 + i * 1.6, 2.6, CHALK, 0.22);
}

// ── PNG encoding ───────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
	const t = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c;
	}
	return t;
})();

function crc32(buf) {
	let c = -1;
	for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: truecolour
// 10..12 stay 0: deflate, adaptive filtering, no interlace

// Each scanline is prefixed with its filter byte (0 = none).
const raw = Buffer.alloc(H * (W * 3 + 1));
for (let y = 0; y < H; y++) {
	raw[y * (W * 3 + 1)] = 0;
	px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}

const png = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	chunk('IHDR', ihdr),
	chunk('IDAT', deflateSync(raw, { level: 9 })),
	chunk('IEND', Buffer.alloc(0))
]);

const out = 'static/og/board.png';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} — ${W}x${H}, ${(png.length / 1024).toFixed(1)} KB`);
