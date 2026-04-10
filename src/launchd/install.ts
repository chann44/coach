import { existsSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { paths } from "../paths";
import { buildLaunchdPlist, LAUNCHD_LABEL } from "./plist";

export function installLaunchdAgent(): void {
  const plist = buildLaunchdPlist(paths.logsDir);
  writeFileSync(paths.launchdPlistPath, plist, "utf8");
  writeFileSync(paths.launchAgentPlistPath, plist, "utf8");

  unloadLaunchdAgent();
  runLaunchctl(["load", paths.launchAgentPlistPath], true);
}

export function unloadLaunchdAgent(): void {
  if (existsSync(paths.launchAgentPlistPath)) {
    runLaunchctl(["unload", paths.launchAgentPlistPath], true);
  }
}

export function removeLaunchdAgentFiles(): void {
  unloadLaunchdAgent();
  if (existsSync(paths.launchAgentPlistPath)) {
    rmSync(paths.launchAgentPlistPath, { force: true });
  }
  if (existsSync(paths.launchdPlistPath)) {
    rmSync(paths.launchdPlistPath, { force: true });
  }
}

export function isLaunchdAgentLoaded(): boolean {
  const result = runLaunchctl(["list", LAUNCHD_LABEL], true);
  return result.status === 0;
}

function runLaunchctl(args: string[], ignoreError = false): { status: number; stderr: string } {
  const result = spawnSync("launchctl", args, { encoding: "utf8" });
  const status = result.status ?? 1;
  const stderr = result.stderr?.trim() ?? "";

  if (!ignoreError && status !== 0) {
    throw new Error(stderr || `launchctl ${args.join(" ")} failed`);
  }

  return { status, stderr };
}
