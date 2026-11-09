// Generates the golden parity fixtures for percent-core.
//
// It runs the ORIGINAL v1.1 JavaScript math (src/calculations.js from the
// Electron app) over a deterministic set of edge-case and random inputs and
// records the exact outputs. The Rust port must reproduce every one of them.
//
// The JS file no longer lives on the main branch. To regenerate:
//   git show v1.1.0-electron:src/calculations.js > /tmp/calculations.mjs
//   node crates/percent-core/tests/fixtures/generate-golden.mjs /tmp/calculations.mjs
//
// Numbers are stored as JS strings (String(x)), which round-trip exactly and
// also cover Infinity / -Infinity / NaN.
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(process.argv[2] ?? join(here, "../../../../src/calculations.js"));
const calc = await import(pathToFileURL(source).href);

// Deterministic PRNG (mulberry32) so the fixture is reproducible.
let seed = 0x5eed1234;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(rand() * list.length)];

const EDGE = [
  0, -0, 1, -1, 0.5, -0.5, 0.005, -0.005, 0.125, -0.125, 2.675, 1.005, 99.995,
  20, 25, 50, 79.99, 100, 150, 180, 200, 0.1, 1 / 3, -2.5, 1e-7, 5e-324,
  2 ** 49 + 0.125, 1e15, 9.99e20, 1e21, -1.5e21, 1e300, 1.7976931348623157e308,
  Infinity, -Infinity
];

function randomNumber() {
  switch (Math.floor(rand() * 8)) {
    case 0: return Math.floor(rand() * 1001);                        // whole numbers
    case 1: return Math.round(rand() * 100000) / 100;                // prices
    case 2: return -Math.round(rand() * 100000) / 100;               // negative prices
    case 3: return Math.floor(rand() * 10000) / 100 + 0.005;         // .xx5 rounding boundary
    case 4: return (rand() - 0.5) * 10 ** Math.floor(rand() * 30 - 8); // wide magnitudes
    case 5: return Math.round(rand() * 200 * 8) / 8;                 // exact binary ties (k/8)
    case 6: return rand() * 100;                                     // percentages
    default: return pick(EDGE);
  }
}

const str = (n) => (n === undefined ? undefined : String(n));

function serialize(result) {
  if (!result.ok) return { ok: false, error: result.error };
  const out = { ok: true, label: result.label };
  if ("value" in result) out.value = str(result.value);
  if ("finalPrice" in result) {
    out.finalPrice = str(result.finalPrice);
    out.saved = str(result.saved);
    out.copyText = result.copyText;
  }
  return out;
}

const FUNCTIONS = {
  percentageChange: calc.calculatePercentageChange,
  percentageOfTotal: calc.calculatePercentageOfTotal,
  percentagePortion: calc.calculatePercentagePortion,
  discount: calc.calculateDiscount,
  originalValue: calc.calculateOriginalValue
};

const cases = [];

// formatDecimal on its own: edges, NaN, plus random values.
for (const x of [...EDGE, NaN, ...Array.from({ length: 1500 }, randomNumber)]) {
  cases.push({ f: "formatDecimal", a: [str(x)], r: calc.formatDecimal(x) });
}

// Every calculator: full edge x edge grid plus random pairs.
for (const [name, fn] of Object.entries(FUNCTIONS)) {
  const pairs = [];
  for (const a of EDGE) for (const b of EDGE) pairs.push([a, b]);
  for (let i = 0; i < 600; i += 1) pairs.push([randomNumber(), randomNumber()]);
  for (const [a, b] of pairs) {
    cases.push({ f: name, a: [str(a), str(b)], r: serialize(fn(a, b)) });
  }
}

const target = join(here, "golden.json");
writeFileSync(target, "[\n" + cases.map((c) => JSON.stringify(c)).join(",\n") + "\n]\n");
console.log(`Wrote ${cases.length} golden cases to ${target}`);
