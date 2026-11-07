// Carbon Dated question bank tool.
//
// The live bank sits inside index.html in scrambled form, so the answers can't be read by opening the page
// source or browsing the public repo. Use this tool to get a readable copy, edit it, and scramble it back.
//
//   node tools/bank.mjs unpack   -> writes tools/bank.json (readable; git ignores it, never commit it)
//   node tools/bank.mjs pack     -> scrambles tools/bank.json back into index.html
//   node tools/bank.mjs check    -> unscrambles index.html and prints how many questions of each kind it holds
//
// bank.json holds { pct, date, pin, strata, intrusive, forgery, pair, fakes }: the same objects the game used
// before (ids, topics, field notes). Scrambling is a deterrent, not encryption: someone determined can undo it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(here, '..', 'index.html');
const JSON_FILE = path.join(here, 'bank.json');
const START = '// ---- BANK:START (scrambled — edit with tools/bank.mjs, not by hand) ----';
const END = '// ---- BANK:END ----';
const KEY = 'trowel-and-strata';

// Must match nbUnscramble() in index.html
function keystream(n) {
  let h = 2166136261;
  for (const ch of KEY) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; out[i] = h >>> 24; }
  return out;
}
export function scramble(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const ks = keystream(bytes.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= ks[i];
  return Buffer.from(bytes).toString('base64');
}
export function unscramble(b64) {
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  const ks = keystream(bytes.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= ks[i];
  return JSON.parse(new TextDecoder().decode(bytes));
}
function block(html) {
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error('Bank markers not found in index.html');
  return { a, b: b + END.length, body: html.slice(a, b + END.length) };
}
function readBank(html) {
  const m = /const NB_DATA = "([A-Za-z0-9+/=]+)";/.exec(block(html).body);
  if (!m) throw new Error('No scrambled bank found between the markers');
  return unscramble(m[1]);
}
export function bankBlock(obj) {
  return `${START}\nconst NB_DATA = "${scramble(obj)}";\n${END}`;
}

const cmd = process.argv[2];
if (cmd === 'unpack') {
  fs.writeFileSync(JSON_FILE, JSON.stringify(readBank(fs.readFileSync(HTML, 'utf8')), null, 2) + '\n');
  console.log('Wrote', path.relative(process.cwd(), JSON_FILE), '— edit it, then run: node tools/bank.mjs pack');
} else if (cmd === 'pack') {
  const obj = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  const html = fs.readFileSync(HTML, 'utf8'), { a, b } = block(html);
  fs.writeFileSync(HTML, html.slice(0, a) + bankBlock(obj) + html.slice(b));
  console.log('Scrambled the bank back into index.html');
} else if (cmd === 'check') {
  const obj = readBank(fs.readFileSync(HTML, 'utf8'));
  for (const [k, v] of Object.entries(obj)) console.log(k.padEnd(10), v.length);
} else if (cmd) {
  console.error('Usage: node tools/bank.mjs unpack | pack | check');
  process.exit(1);
}
