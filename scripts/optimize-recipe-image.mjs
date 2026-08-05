import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);
const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error("Usage: node scripts/optimize-recipe-image.mjs <source> <sortie.jpg>");
}

const maxBytes = 350 * 1024;
const workDir = await mkdtemp(join(tmpdir(), "inflamm-image-"));

try {
  await mkdir(dirname(output), { recursive: true });
  let selected = null;
  for (const quality of [88, 84, 80, 76, 72, 68]) {
    const candidate = join(workDir, `candidate-${quality}.jpg`);
    await run("sips", [
      "-s", "format", "jpeg",
      "-s", "formatOptions", String(quality),
      "--resampleHeightWidth", "900", "900",
      input,
      "--out", candidate,
    ]);
    const details = await stat(candidate);
    selected = { candidate, quality, size: details.size };
    if (details.size <= maxBytes) break;
  }

  if (!selected || selected.size > maxBytes) {
    throw new Error(`Image encore trop lourde après optimisation : ${selected?.size ?? 0} octets`);
  }
  await rename(selected.candidate, output);
  console.log(`${output}: 900x900, qualité ${selected.quality}, ${Math.round(selected.size / 1024)} Ko.`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
