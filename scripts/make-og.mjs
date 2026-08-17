/**
 * Generates static/og/board.png — the link-preview image for every board.
 *
 * A turf field with chalk yard lines and an end-zone stripe, drawn straight
 * into a pixel buffer and encoded as PNG. No image library, no wasm font
 * renderer, nothing added to the Worker bundle: the title and description in
 * the unfurl are dynamic (rendered per board in +page.svelte), and this is the
 * fixed backdrop behind them.
 *
 * Run: node scripts/make-og.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const W = 1200;
const H = 630;

const TURF_DARK = [0x12, 0x2a, 0x1c];
const TURF_MID = [0x1d, 0x4a, 0x30];
const CHALK = [0xf4, 0xef, 0xe2];
const GOLD = [0xd4, 0xa0, 0x17];
const ENDZONE = [0xa3, 0x26, 0x38];

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

// Field: alternating mowed stripes, darkening towards the edges.
for (let y = 0; y < H; y++) {
	for (let x = 0; x < W; x++) {
		const stripe = Math.floor(x / 100) % 2 === 0 ? 0.12 : 0;
		const vignette = 1 - Math.min(1, (Math.abs(y - H / 2) / (H / 2)) ** 2) * 0.35;
		set(x, y, mix(TURF_DARK, TURF_MID, (0.55 + stripe) * vignette));
	}
}

// Yard lines every 100px, thicker every 200.
for (let x = 100; x < W; x += 100) {
	const thick = (x / 100) % 2 === 0 ? 3 : 1;
	for (let t = 0; t < thick; t++) {
		for (let y = 60; y < H - 60; y++) set(x + t, y, mix(TURF_MID, CHALK, 0.55));
	}
}

// Sideline chalk.
for (let x = 0; x < W; x++) {
	for (let t = 0; t < 4; t++) {
		set(x, 56 + t, CHALK);
		set(x, H - 60 + t, CHALK);
	}
}

// End zones.
for (let y = 60; y < H - 60; y++) {
	for (let x = 0; x < 96; x++) set(x, y, mix(ENDZONE, TURF_DARK, 0.35));
	for (let x = W - 96; x < W; x++) set(x, y, mix(ENDZONE, TURF_DARK, 0.35));
}

// A gold bar across the middle, where the unfurl usually overlays the title.
for (let y = H / 2 - 4; y < H / 2 + 4; y++) {
	for (let x = 140; x < W - 140; x++) set(x, y, GOLD);
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

/* ── Home-screen icon ────────────────────────────────────────────────────── */

const N = 180;
const icon = Buffer.alloc(N * N * 3);

function setIcon(x, y, [r, g, b]) {
	const i = (y * N + x) * 3;
	icon[i] = r;
	icon[i + 1] = g;
	icon[i + 2] = b;
}

for (let y = 0; y < N; y++) {
	for (let x = 0; x < N; x++) {
		setIcon(x, y, Math.floor(x / 30) % 2 === 0 ? TURF_MID : TURF_DARK);
	}
}
// A single gold yard line across the middle.
for (let y = N / 2 - 7; y < N / 2 + 7; y++) {
	for (let x = 18; x < N - 18; x++) setIcon(x, y, GOLD);
}
// Chalk sidelines.
for (let x = 0; x < N; x++) {
	for (let t = 0; t < 3; t++) {
		setIcon(x, 14 + t, CHALK);
		setIcon(x, N - 17 + t, CHALK);
	}
}

const iconHdr = Buffer.alloc(13);
iconHdr.writeUInt32BE(N, 0);
iconHdr.writeUInt32BE(N, 4);
iconHdr[8] = 8;
iconHdr[9] = 2;

const iconRaw = Buffer.alloc(N * (N * 3 + 1));
for (let y = 0; y < N; y++) {
	iconRaw[y * (N * 3 + 1)] = 0;
	icon.copy(iconRaw, y * (N * 3 + 1) + 1, y * N * 3, (y + 1) * N * 3);
}

const iconPng = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	chunk('IHDR', iconHdr),
	chunk('IDAT', deflateSync(iconRaw, { level: 9 })),
	chunk('IEND', Buffer.alloc(0))
]);

writeFileSync('static/apple-touch-icon.png', iconPng);
console.log(`wrote static/apple-touch-icon.png — ${N}x${N}, ${(iconPng.length / 1024).toFixed(1)} KB`);
