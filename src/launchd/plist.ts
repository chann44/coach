import { homedir } from "node:os";
import { resolve } from "node:path";

export const LAUNCHD_LABEL = "sh.coach.agent";

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildProgramArguments(): string[] {
  const scriptArg = process.argv[1];
  if (scriptArg && scriptArg.endsWith(".ts")) {
    return [process.execPath, "run", resolve(scriptArg), "run"];
  }

  return [process.execPath, "run"];
}

export function buildLaunchdPlist(logDir: string): string {
  const args = buildProgramArguments()
    .map((arg) => `    <string>${xmlEscape(arg)}</string>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(logDir)}/coach.log</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(logDir)}/coach.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${xmlEscape(homedir())}</string>
  </dict>
</dict>
</plist>
`;
}
