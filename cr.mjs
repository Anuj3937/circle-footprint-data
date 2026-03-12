#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════════════
 * CRYPTO FOOTPRINT BATCH DOWNLOADER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Downloads Binance aggTrades and generates footprint JSON for ALL crypto
 * symbols that have `hasFootprint: true` in symbols.ts.
 *
 * Usage:
 *   node scripts/download-crypto-footprint.mjs --from 2025-06-01 --to 2025-06-05
 *   node scripts/download-crypto-footprint.mjs --date 2025-06-01
 *   node scripts/download-crypto-footprint.mjs --date 2025-06-01 --symbols BTCUSDT,ETHUSDT
 *   node scripts/download-crypto-footprint.mjs --date 2025-06-01 --push
 *
 * Output: footprint/{SYMBOL}/{DATE}.json (ready for jsDelivr CDN)
 *
 * The --push flag auto-commits and pushes to the circle-market-data GitHub repo.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { resolve, join } from "path";

// ─── All Binance symbols with tick sizes (mirrors symbols.ts) ────────────────
const CRYPTO_SYMBOLS = [
    { binance: "BTCUSDT", display: "BTCUSD", name: "Bitcoin", tickSize: 1.0 },
    { binance: "ETHUSDT", display: "ETHUSD", name: "Ethereum", tickSize: 0.5 },
    { binance: "SOLUSDT", display: "SOLUSD", name: "Solana", tickSize: 0.05 },
    { binance: "BNBUSDT", display: "BNBUSD", name: "BNB", tickSize: 0.1 },
    { binance: "XRPUSDT", display: "XRPUSD", name: "XRP", tickSize: 0.001 },
    { binance: "DOGEUSDT", display: "DOGEUSD", name: "Dogecoin", tickSize: 0.0001 },
    { binance: "ADAUSDT", display: "ADAUSD", name: "Cardano", tickSize: 0.001 },
    { binance: "AVAXUSDT", display: "AVAXUSD", name: "Avalanche", tickSize: 0.01 },
    { binance: "LINKUSDT", display: "LINKUSD", name: "Chainlink", tickSize: 0.01 },
    { binance: "DOTUSDT", display: "DOTUSD", name: "Polkadot", tickSize: 0.01 },
];

// ─── Parse CLI Args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const DATE = getArg("date");
const FROM = getArg("from");
const TO = getArg("to");
const SYMBOLS_FILTER = getArg("symbols"); // Comma-separated filter
const DO_PUSH = hasFlag("push");

if (!DATE && !FROM) {
    console.error("Usage:");
    console.error("  node scripts/download-crypto-footprint.mjs --from 2025-06-01 --to 2025-06-05");
    console.error("  node scripts/download-crypto-footprint.mjs --date 2025-06-01");
    console.error("  node scripts/download-crypto-footprint.mjs --date 2025-06-01 --symbols BTCUSDT,ETHUSDT");
    console.error("  node scripts/download-crypto-footprint.mjs --date 2025-06-01 --push");
    process.exit(1);
}

// ─── Generate date range ────────────────────────────────────────────────────
function generateDates(from, to) {
    const dates = [];
    const current = new Date(from + "T00:00:00Z");
    const end = new Date((to || from) + "T00:00:00Z");
    while (current <= end) {
        dates.push(current.toISOString().split("T")[0]);
        current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
}

const datesToProcess = DATE ? [DATE] : generateDates(FROM, TO || FROM);

// Filter symbols if specified
const symbolsToProcess = SYMBOLS_FILTER
    ? CRYPTO_SYMBOLS.filter((s) => SYMBOLS_FILTER.split(",").includes(s.binance))
    : CRYPTO_SYMBOLS;

// ─── Detect output directory ────────────────────────────────────────────────
// If circle-market-data repo exists alongside this one, output there.
// Otherwise output to local data/footprint/
const REPO_DIR = resolve(process.cwd(), "..", "circle-market-data");
const LOCAL_DIR = resolve(process.cwd(), "data", "footprint");
const BASE_OUT = existsSync(REPO_DIR) ? join(REPO_DIR, "footprint") : LOCAL_DIR;

const scriptPath = resolve(process.cwd(), "scripts", "process-tick-data.mjs");

// ─── Main ───────────────────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`);
console.log(`║  Crypto Footprint Batch Downloader                      ║`);
console.log(`║  Symbols: ${symbolsToProcess.length} │ Dates: ${datesToProcess.length} │ Total: ${symbolsToProcess.length * datesToProcess.length} jobs      ║`);
console.log(`║  Output:  ${BASE_OUT.length > 40 ? "..." + BASE_OUT.slice(-40) : BASE_OUT.padEnd(43)}║`);
console.log(`║  Push:    ${DO_PUSH ? "YES (auto-commit + push)" : "NO"}${" ".repeat(DO_PUSH ? 20 : 32)}║`);
console.log(`╚══════════════════════════════════════════════════════════╝\n`);

let success = 0;
let skipped = 0;
let failed = 0;

for (const sym of symbolsToProcess) {
    const outDir = join(BASE_OUT, sym.binance);
    mkdirSync(outDir, { recursive: true });

    console.log(`\n─── ${sym.name} (${sym.binance}) ── tick: $${sym.tickSize} ───`);

    for (const date of datesToProcess) {
        const outFile = join(outDir, `${date}.json`);

        if (existsSync(outFile)) {
            console.log(`  ⏭️  ${date} — exists, skip`);
            skipped++;
            continue;
        }

        try {
            console.log(`  ⏳ ${date}...`);
            execSync(
                `node "${scriptPath}" --symbol ${sym.binance} --date ${date} --tick-size ${sym.tickSize} --output-dir "${outDir}"`,
                { stdio: "pipe", timeout: 300_000 }
            );
            console.log(`  ✅ ${date}`);
            success++;
        } catch (err) {
            console.error(`  ❌ ${date} — ${err.message?.split("\n")[0] || "Unknown"}`);
            failed++;
        }
    }
}

// ─── Auto-push if requested ─────────────────────────────────────────────────
if (DO_PUSH && existsSync(REPO_DIR)) {
    console.log(`\n📤 Pushing to GitHub...`);
    try {
        execSync("git add -A && git commit -m 'footprint: batch update' && git push origin main", {
            cwd: REPO_DIR,
            stdio: "inherit",
            timeout: 60_000,
        });
        console.log(`✅ Pushed to circle-market-data`);
    } catch (err) {
        console.error(`❌ Push failed: ${err.message?.split("\n")[0]}`);
    }
}

// ─── Generate manifest (FOOTPRINT_DATES) ────────────────────────────────────
console.log(`\n📋 Updated FOOTPRINT_DATES manifest:`);
console.log(`// Copy this into lib/simulator/symbols.ts → FOOTPRINT_DATES`);
console.log(`export const FOOTPRINT_DATES: Record<string, string[]> = {`);
for (const sym of CRYPTO_SYMBOLS) {
    const dir = join(BASE_OUT, sym.binance);
    if (!existsSync(dir)) {
        console.log(`    ${sym.binance}: [],`);
        continue;
    }
    const files = readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(".json", ""))
        .sort();
    console.log(`    ${sym.binance}: [${files.map((f) => `"${f}"`).join(", ")}],`);
}
console.log(`}\n`);

console.log(`╔══════════════════════════════════════════════════════════╗`);
console.log(`║  DONE!  ✅ ${String(success).padStart(3)} saved  │  ⏭️ ${String(skipped).padStart(3)} skipped  │  ❌ ${String(failed).padStart(3)} failed  ║`);
console.log(`╚══════════════════════════════════════════════════════════╝\n`);
