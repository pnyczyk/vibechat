#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BASELINE = "scripts/bundle-baseline.json";

export function parseSizeToKb(value) {
  if (typeof value !== "string") {
    throw new TypeError("Size value must be a string");
  }
  const match = value.trim().match(/([\d.]+)\s*(kb|mb|b)/i);
  if (!match) {
    throw new Error(`Unable to parse size from \"${value}\"`);
  }
  const numeric = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const kb =
    unit === "mb" ? numeric * 1024 : unit === "b" ? numeric / 1024 : numeric;
  return Number(kb.toFixed(1));
}

export function parseBuildOutput(output) {
  if (typeof output !== "string" || output.length === 0) {
    throw new Error("Build output is empty");
  }

  const lines = output.split(/\r?\n/);
  const routes = {};
  let sharedFirstLoadJsKb = null;

  const routePattern = /^[\s│]*[┌├└]\s+[○ƒ]\s+([^\s]+)\s+([\d.]+\s*(?:kB|MB|B))\s+([\d.]+\s*(?:kB|MB|B))/;
  const sharedPattern = /^\s*\+\s*First Load JS shared by all\s+([\d.]+\s*(?:kB|MB|B))/i;

  for (const line of lines) {
    const routeMatch = line.match(routePattern);
    if (routeMatch) {
      const [, route, sizeText, firstLoadText] = routeMatch;
      routes[route] = {
        sizeKb: parseSizeToKb(sizeText),
        firstLoadJsKb: parseSizeToKb(firstLoadText),
      };
      continue;
    }

    const sharedMatch = line.match(sharedPattern);
    if (sharedMatch) {
      sharedFirstLoadJsKb = parseSizeToKb(sharedMatch[1]);
    }
  }

  if (!routes["/"]) {
    throw new Error("Could not find metrics for route '/'");
  }

  return {
    routes,
    sharedFirstLoadJsKb,
  };
}

export function calculateDelta(current, baseline) {
  if (!baseline) {
    return null;
  }

  const deltaValue = current - baseline;
  const percent = baseline === 0 ? null : Number(((deltaValue / baseline) * 100).toFixed(2));

  return {
    absolute: Number(deltaValue.toFixed(1)),
    percent,
  };
}

function resolveArgPair(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  if (index === args.length - 1) {
    throw new Error(`Expected value after ${name}`);
  }
  return args[index + 1];
}

async function runBundleReport() {
  const args = process.argv.slice(2);
  const baselineArg = resolveArgPair(args, "--baseline");
  const outArg = resolveArgPair(args, "--out");
  const jsonOnly = args.includes("--json");
  const baselinePath = path.resolve(process.cwd(), baselineArg ?? DEFAULT_BASELINE);

  let baseline = null;
  if (existsSync(baselinePath)) {
    const raw = await readFile(baselinePath, "utf8");
    baseline = JSON.parse(raw);
  }

  const env = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    CI: process.env.CI ?? "1",
  };

  const build = await new Promise((resolve, reject) => {
    const proc = spawn("npx", ["next", "build", "--no-lint"], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
  });

  if (build.code !== 0) {
    console.error(build.stdout);
    console.error(build.stderr);
    process.exit(typeof build.code === "number" ? build.code : 1);
  }

  const metrics = parseBuildOutput(build.stdout);
  const routeCurrent = metrics.routes["/"];
  const baselineRoute = baseline?.routes?.["/"] ?? null;
  const baselineShared = baseline?.sharedFirstLoadJsKb ?? null;

  const summary = {
    generatedAt: new Date().toISOString(),
    baselinePath: baseline ? path.relative(process.cwd(), baselinePath) : null,
    metrics: {
      sharedFirstLoadJsKb: metrics.sharedFirstLoadJsKb,
      routes: {
        "/": routeCurrent,
      },
    },
    deltas: baselineRoute
      ? {
          routeFirstLoadJs: calculateDelta(routeCurrent.firstLoadJsKb, baselineRoute.firstLoadJsKb),
          routeSize: calculateDelta(routeCurrent.sizeKb, baselineRoute.sizeKb),
          sharedFirstLoadJs: calculateDelta(
            metrics.sharedFirstLoadJsKb ?? 0,
            baselineShared ?? 0,
          ),
        }
      : null,
  };

  if (!jsonOnly) {
    console.log("Bundle Report");
    console.log(
      `- Route / First Load JS: ${routeCurrent.firstLoadJsKb.toFixed(1)} kB` +
        (baselineRoute
          ? ` (baseline ${baselineRoute.firstLoadJsKb.toFixed(1)} kB, ${summary.deltas?.routeFirstLoadJs?.percent ?? 0}% change)`
          : ""),
    );
    console.log(
      `- Route / Size: ${routeCurrent.sizeKb.toFixed(1)} kB` +
        (baselineRoute
          ? ` (baseline ${baselineRoute.sizeKb.toFixed(1)} kB, ${summary.deltas?.routeSize?.percent ?? 0}% change)`
          : ""),
    );
    if (metrics.sharedFirstLoadJsKb !== null) {
      const sharedCurrent = metrics.sharedFirstLoadJsKb;
      const sharedBaseline = baselineShared;
      const sharedDelta = calculateDelta(sharedCurrent, sharedBaseline ?? 0);
      console.log(
        `- Shared First Load JS: ${sharedCurrent.toFixed(1)} kB` +
          (sharedBaseline !== null
            ? ` (baseline ${sharedBaseline.toFixed(1)} kB, ${sharedDelta?.percent ?? 0}% change)`
            : ""),
      );
    }
  }

  const jsonOutput = JSON.stringify(summary, null, 2);
  console.log(jsonOutput);

  if (outArg) {
    const outPath = path.resolve(process.cwd(), outArg);
    await writeFile(outPath, jsonOutput, "utf8");
  }
}

const directTarget = process.argv[1]
  ? pathToFileURL(path.resolve(process.cwd(), process.argv[1])).href
  : null;
if (directTarget && import.meta.url === directTarget) {
  runBundleReport().catch((error) => {
    console.error("Bundle report failed", error);
    process.exit(1);
  });
}

export default runBundleReport;
