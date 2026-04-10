import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const coachHome = join(homedir(), ".coach");
const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");

export const paths = {
  coachHome,
  binDir: join(coachHome, "bin"),
  configPath: join(coachHome, "config.json"),
  dbPath: join(coachHome, "coach.db"),
  runPidPath: join(coachHome, "coach.pid"),
  photosDir: join(coachHome, "photos"),
  logsDir: join(coachHome, "logs"),
  launchdDir: join(coachHome, "launchd"),
  launchdPlistPath: join(coachHome, "launchd", "sh.coach.agent.plist"),
  launchAgentsDir,
  launchAgentPlistPath: join(launchAgentsDir, "sh.coach.agent.plist")
};

export function ensureCoachDirs(): void {
  mkdirSync(paths.coachHome, { recursive: true });
  mkdirSync(paths.binDir, { recursive: true });
  mkdirSync(paths.photosDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
  mkdirSync(paths.launchdDir, { recursive: true });
  mkdirSync(paths.launchAgentsDir, { recursive: true });
}
