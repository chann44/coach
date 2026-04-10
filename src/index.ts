import { constants, existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { getConfig, saveConfig, defaultConfig } from "./config";
import { runStartupAgent } from "./brain/agent";
import { handleIncomingMessage } from "./brain/router";
import { getUpcomingEvents } from "./integrations/calendar/osascript";
import { openDb } from "./memory/db";
import { installLaunchdAgent, isLaunchdAgentLoaded, removeLaunchdAgentFiles, unloadLaunchdAgent } from "./launchd/install";
import { ensureCoachDirs, paths } from "./paths";
import { startScheduler } from "./scheduler/loop";
import { IMessageTransport } from "./transport/imessage";

const command = Bun.argv[2] ?? "help";

switch (command) {
  case "init":
    init();
    break;
  case "install":
    init();
    break;
  case "run":
    run();
    break;
  case "status":
    status();
    break;
  case "doctor":
    void doctor();
    break;
  case "stop":
    stop();
    break;
  case "uninstall":
    uninstall();
    break;
  default:
    console.log("usage: coach init | install | run | status | doctor | stop | uninstall");
}

function init(): void {
  ensureCoachDirs();
  const existing = existsSync(paths.configPath)
    ? ({ ...defaultConfig, ...JSON.parse(readFileSync(paths.configPath, "utf8")) } as typeof defaultConfig)
    : defaultConfig;

  const openrouter_api_key = ask("OpenRouter API key", existing.openrouter_api_key);
  const nutritionix_app_id = ask("Nutritionix app id (optional)", existing.nutritionix_app_id ?? "");
  const nutritionix_app_key = ask("Nutritionix app key (optional)", existing.nutritionix_app_key ?? "");
  const imessage_handle = ask("iMessage handle", existing.imessage_handle);
  const timezone = ask("Timezone", existing.timezone);
  const model = ask("Model", existing.model);

  const config = {
    ...existing,
    openrouter_api_key,
    nutritionix_app_id,
    nutritionix_app_key,
    imessage_handle,
    timezone,
    model,
    vision_model: model
  };

  saveConfig(config);
  const db = openDb();
  db.close();
  installLaunchdAgent();

  console.log(`saved config: ${paths.configPath}`);
  console.log(`db ready: ${paths.dbPath}`);
  console.log(`launchd installed: ${paths.launchAgentPlistPath}`);
  console.log("coach is installed and configured");
}

function run(): void {
  ensureCoachDirs();
  const currentPid = process.pid;
  const runningPid = getRunningPid();
  if (runningPid !== null && runningPid !== currentPid) {
    console.log(`coach already running (pid ${runningPid})`);
    return;
  }

  const config = getConfig();
  const db = openDb();
  const transport = new IMessageTransport(config.imessage_handle);
  const chatLocks = new Map<string, Promise<void>>();
  writeFileSync(paths.runPidPath, `${currentPid}\n`, "utf8");

  const timer = startScheduler({
    db,
    config,
    transport
  });

  transport
    .start(async (message) => {
      const key = message.chatId ?? message.from;
      const prev = chatLocks.get(key) ?? Promise.resolve();
      const next = prev
        .catch(() => {})
        .then(async () => {
          await handleIncomingMessage(db, config, transport, message);
        })
        .catch((error) => {
          console.error("incoming message handling failed", error);
        })
        .finally(() => {
          if (chatLocks.get(key) === next) {
            chatLocks.delete(key);
          }
        });

      chatLocks.set(key, next);
    })
    .catch((error) => {
      console.error("transport start failed", error);
    });

  void runStartupAgent({
    db,
    config,
    transport,
    now: new Date()
  }).catch((error) => {
    console.error("startup agent failed", error);
  });

  console.log("coach daemon running");
  const shutdown = () => {
    clearInterval(timer);
    void transport.stop();
    db.close();
    if (existsSync(paths.runPidPath)) {
      try {
        unlinkSync(paths.runPidPath);
      } catch {
        // ignore
      }
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function status(): void {
  const hasConfig = existsSync(paths.configPath);
  const hasDb = existsSync(paths.dbPath);
  const runningPid = getRunningPid();
  const launchdLoaded = isLaunchdAgentLoaded();

  console.log(`status: ${runningPid !== null ? `running (pid ${runningPid})` : "stopped"}`);
  console.log(`launchd: ${launchdLoaded ? "loaded" : "not loaded"}`);
  console.log(`config: ${hasConfig ? "present" : "missing"} (${paths.configPath})`);
  console.log(`db: ${hasDb ? "present" : "missing"} (${paths.dbPath})`);
  if (hasConfig) {
    try {
      const config = getConfig();
      console.log(`timezone: ${config.timezone}`);
      console.log(`handle: ${config.imessage_handle || "<unset>"}`);
    } catch {
      console.log("config: present but incomplete (run init and fill required fields)");
    }
  }
}

async function doctor(): Promise<void> {
  console.log("coach doctor");

  let okCount = 0;
  let failCount = 0;

  const hasConfig = existsSync(paths.configPath);
  if (hasConfig) {
    console.log(`- config file: ok (${paths.configPath})`);
    okCount += 1;
  } else {
    console.log(`- config file: fail (${paths.configPath})`);
    failCount += 1;
  }

  if (existsSync(paths.dbPath)) {
    console.log(`- sqlite db: ok (${paths.dbPath})`);
    okCount += 1;
  } else {
    console.log(`- sqlite db: fail (${paths.dbPath})`);
    failCount += 1;
  }

  try {
    const config = getConfig();
    const keyState = config.openrouter_api_key ? "set" : "missing";
    const nutritionixState = config.nutritionix_app_id && config.nutritionix_app_key ? "set" : "missing";
    const handleState = config.imessage_handle ? "set" : "missing";
    console.log(`- openrouter key: ${keyState}`);
    console.log(`- nutritionix creds: ${nutritionixState}`);
    console.log(`- imessage handle: ${handleState}`);
    console.log(`- timezone: ${config.timezone}`);
    if (keyState === "set" && handleState === "set") {
      okCount += 1;
    } else {
      failCount += 1;
    }
  } catch {
    console.log("- config values: fail (run coach init)");
    failCount += 1;
  }

  const messagesDbPath = join(process.env.HOME ?? "", "Library", "Messages", "chat.db");
  try {
    await access(messagesDbPath, constants.R_OK);
    console.log("- full disk access (Messages DB read): ok");
    okCount += 1;
  } catch {
    console.log("- full disk access (Messages DB read): fail");
    failCount += 1;
  }

  try {
    await getUpcomingEvents(1, 1);
    console.log("- calendar access: ok");
    okCount += 1;
  } catch {
    console.log("- calendar access: fail (grant Calendar permission)");
    failCount += 1;
  }

  const launchdLoaded = isLaunchdAgentLoaded();
  console.log(`- launchd agent: ${launchdLoaded ? "loaded" : "not loaded"}`);
  if (launchdLoaded) okCount += 1;

  console.log(`doctor result: ${okCount} ok, ${failCount} fail`);
}

function stop(): void {
  unloadLaunchdAgent();

  const pid = getRunningPid();
  if (pid === null) {
    console.log("coach is not running");
    if (existsSync(paths.runPidPath)) {
      unlinkSync(paths.runPidPath);
    }
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    console.log(`sent SIGTERM to coach (pid ${pid})`);
  } catch {
    console.log(`failed to stop pid ${pid}`);
  }
}

function uninstall(): void {
  stop();
  removeLaunchdAgentFiles();
  rmSync(paths.coachHome, { recursive: true, force: true });
  console.log(`removed ${paths.coachHome}`);
}

function getRunningPid(): number | null {
  if (!existsSync(paths.runPidPath)) return null;
  const raw = readFileSync(paths.runPidPath, "utf8").trim();
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) return null;

  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function ask(label: string, defaultValue = ""): string {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const value = prompt(`${label}${suffix}: `)?.trim();
  return value && value.length > 0 ? value : defaultValue;
}
