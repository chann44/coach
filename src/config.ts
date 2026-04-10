import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { paths } from "./paths";

export type Goal = "cut" | "maintain" | "bulk";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export interface CoachConfig {
  version: number;
  openrouter_api_key: string;
  nutritionix_app_id?: string;
  nutritionix_app_key?: string;
  imessage_handle: string;
  model: string;
  vision_model: string;
  timezone: string;
  schedule: {
    morning_briefing: string;
    wind_down: string;
    protein_check: string;
  };
  integrations: {
    calendar: { enabled: boolean };
  };
}

export const defaultConfig: CoachConfig = {
  version: 1,
  openrouter_api_key: "",
  nutritionix_app_id: "",
  nutritionix_app_key: "",
  imessage_handle: "",
  model: "anthropic/claude-sonnet-4",
  vision_model: "anthropic/claude-sonnet-4",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  schedule: {
    morning_briefing: "07:00",
    wind_down: "22:30",
    protein_check: "21:00"
  },
  integrations: {
    calendar: { enabled: true }
  }
};

export function getConfig(): CoachConfig {
  if (!existsSync(paths.configPath)) {
    throw new Error(`Missing config at ${paths.configPath}. Run: coach init`);
  }

  const raw = readFileSync(paths.configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<CoachConfig>;
  const merged: CoachConfig = {
    ...defaultConfig,
    ...parsed,
    schedule: {
      ...defaultConfig.schedule,
      ...(parsed.schedule ?? {})
    },
    integrations: {
      ...defaultConfig.integrations,
      ...(parsed.integrations ?? {})
    }
  };

  validateConfig(merged, true);
  return merged;
}

export function saveConfig(config: CoachConfig): void {
  validateConfig(config, false);
  mkdirSync(dirname(paths.configPath), { recursive: true });
  writeFileSync(paths.configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  chmodSync(paths.configPath, 0o600);
}

function validateConfig(config: CoachConfig, requireSecrets: boolean): void {
  if (!config.timezone) throw new Error("Config timezone is required");
  if (requireSecrets && !config.openrouter_api_key) throw new Error("Config openrouter_api_key is required");
  if (requireSecrets && !config.imessage_handle) throw new Error("Config imessage_handle is required");
}
