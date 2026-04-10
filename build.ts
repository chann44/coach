import { $ } from "bun";

const targets = [
  { target: "bun-darwin-arm64", out: "coach-darwin-arm64" },
  { target: "bun-darwin-x64", out: "coach-darwin-x64" }
];

for (const { target, out } of targets) {
  await $`bun build --compile --target=${target} --minify --sourcemap=none ./src/index.ts --outfile ./dist/${out}`;
  console.log(`built ${out}`);
}
