import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import path from "node:path"
import ts from "typescript"

const require = createRequire(import.meta.url)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Transpile the single-file mirror to CommonJS (type imports are erased) and
// load it. SOURCE OF TRUTH: backend/app/adapters/pricing.py.
const src = readFileSync(path.resolve(__dirname, "../src/lib/pricing.ts"), "utf8")
const out = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const mod = { exports: {} }
new Function("module", "exports", "require", out)(mod, mod.exports, require)
const { resolvePrice, resolveTier } = mod.exports

const fixturePath = path.resolve(__dirname, "../../backend/tests/fixtures/pricing_matrix.json")
const cases = JSON.parse(readFileSync(fixturePath, "utf8"))

let failures = 0
const fail = (name, got, want) => {
  failures++
  console.error(`FAIL ${name}: got ${got}, want ${want}`)
}
for (const c of cases) {
  const price = resolvePrice(c.product, c.quantity, c.role, c.total_lots)
  if (price !== c.expected_price) fail(`${c.name} price`, price, c.expected_price)
  const tier = resolveTier(c.product, c.quantity, c.role, c.total_lots)
  if (tier !== c.expected_tier) fail(`${c.name} tier`, tier, c.expected_tier)
}

// Defensive stale-data clamps (mirror of backend pricing.py guards).
const staleWholesale = {
  retail_price_per_lot: 100, wholesale_price_per_lot: 120,
  approved_price_per_lot: 120, minimum_wholesale_lots: 3,
}
const clampW = resolvePrice(staleWholesale, 5, "retail", 10)
if (clampW !== 100) fail("wholesale>retail clamps to retail", clampW, 100)

const staleApproved = {
  retail_price_per_lot: 100, wholesale_price_per_lot: 120,
  approved_price_per_lot: 110, minimum_wholesale_lots: 3,
}
const clampA = resolvePrice(staleApproved, 5, "wholesale_approved", 5)
if (clampA !== 100) fail("approved>retail clamps to retail", clampA, 100)

// Combined config error: approved > wholesale AND wholesale > retail. The
// approved-invalid fallback goes through min(wholesale, retail), so the price
// must resolve to retail, never wholesale.
const staleBoth = {
  retail_price_per_lot: 80, wholesale_price_per_lot: 100,
  approved_price_per_lot: 110, minimum_wholesale_lots: 3,
}
const clampBoth = resolvePrice(staleBoth, 5, "wholesale_approved", 5)
if (clampBoth !== 80) fail("approved>wholesale>retail resolves to retail", clampBoth, 80)

if (failures) {
  console.error(`${failures} parity failure(s)`)
  process.exit(1)
}
console.log("pricing parity OK")
