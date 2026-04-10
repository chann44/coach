Coach — Technical Specification v1
1. Product summary
What: A personal health coach that lives in iMessage. Tracks meals, workouts, and reads your calendar. Proactively plans your day around your body.
How: Single Bun-compiled binary, runs as a launchd agent on the user's Mac, reads/writes iMessage via Photon, uses Vercel AI SDK + OpenRouter for LLM, stores everything in local SQLite. Zero cloud, zero hosting, zero data leaves the Mac except LLM calls.
Install: curl -fsSL https://coach.sh/install | sh → coach init → done.
Platform: macOS 13+ (Ventura and later), Apple Silicon and Intel. iMessage user on any iPhone.

2. Stack
LayerTechWhyRuntimeBun 1.1+Native SQLite, zero-dep Photon, bun build --compile single binaryLanguageTypeScript 5.3Photon is TS-native, strict modeiMessage I/O@photon-ai/imessage-kitOnly sane option, zero deps on BunLLMVercel AI SDK (ai + @openrouter/ai-sdk-provider)Model-agnostic, clean streaming + tool use + structured outputLLM routingOpenRouterOne key, any model, BYOKStorageSQLite via bun:sqliteZero deps, built into Bun, plenty fastCalendarosascript → Calendar.appZero deps, no entitlements needed, read-onlySchedulingPhoton MessageScheduler + internal cron loopRecurring morning/evening pingsProcess mgmtlaunchd (user agent)Native macOS, survives rebootsBuildbun build --compileSingle ~55MB binary per archDistributionGitHub Releases + shell installerNo infra, no cost
Not using:

No Node.js (Bun only — simpler single binary)
No better-sqlite3 (using bun:sqlite)
No Anthropic SDK directly (going through Vercel AI SDK)
No Postgres, Redis, Drizzle, Zod (overkill for local single-user)
No OAuth, no server, no cloud functions

Wait — reconsidering Zod. Vercel AI SDK's generateObject needs a schema. Zod is the de facto. Fine, keep it. One dep.
Revised: zod stays for LLM structured output schemas.

3. Repository layout
coach/
├── src/
│   ├── index.ts                    # CLI entry: init | run | status | stop | uninstall
│   ├── config.ts                   # ~/.coach/config.json read/write
│   ├── paths.ts                    # ~/.coach/* path constants
│   │
│   ├── cli/
│   │   ├── init.ts                 # onboarding: keys, profile, launchd install
│   │   ├── run.ts                  # main daemon loop
│   │   ├── status.ts               # print running state, last message, db stats
│   │   ├── stop.ts                 # launchctl unload
│   │   └── uninstall.ts            # remove launchd + ~/.coach (confirmed)
│   │
│   ├── transport/
│   │   ├── imessage.ts             # Photon SDK wrapper: onMessage, send, sendImage
│   │   └── types.ts                # IncomingMessage, OutgoingReply
│   │
│   ├── memory/
│   │   ├── db.ts                   # bun:sqlite init, migrations runner
│   │   ├── migrations/
│   │   │   └── 001_initial.sql
│   │   ├── user.ts                 # profile getters/setters
│   │   ├── meals.ts                # insertMeal, mealsForDay, todayTotals
│   │   ├── workouts.ts             # insertSet, lastSessionFor, prFor
│   │   ├── facts.ts                # kv store for extracted user facts
│   │   └── nudges.ts               # sent_nudges, dedupe logic
│   │
│   ├── brain/
│   │   ├── llm.ts                  # Vercel AI SDK + OpenRouter client
│   │   ├── router.ts               # main: incoming msg → intent → action → reply
│   │   ├── prompts.ts              # system prompt, voice, rules
│   │   ├── schemas.ts              # Zod schemas for structured output
│   │   ├── context.ts              # builds context blob per call
│   │   ├── vision.ts               # meal photo → macros
│   │   └── voice.ts                # (stretch) voice memo → text via whisper
│   │
│   ├── integrations/
│   │   ├── types.ts                # Integration interface
│   │   ├── registry.ts             # active integrations
│   │   └── calendar/
│   │       ├── index.ts            # Integration impl
│   │       └── osascript.ts        # reads Calendar.app via osascript
│   │
│   ├── scheduler/
│   │   ├── loop.ts                 # internal 60s tick, checks what to send
│   │   ├── morning.ts              # 7am briefing builder
│   │   ├── preworkout.ts           # dynamic: 60min before calendar gym block
│   │   ├── proteinCheck.ts         # 9pm conditional
│   │   └── windDown.ts             # 10:30pm
│   │
│   └── launchd/
│       ├── plist.ts                # generates sh.coach.agent.plist
│       └── install.ts              # writes plist, launchctl load/unload
│
├── scripts/
│   ├── build.ts                    # bun build --compile for arm64 + x64
│   └── release.ts                  # tag + github release + upload binaries
│
├── install.sh                      # hosted, curl-piped installer
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE

4. Data model
4.1 SQLite schema (migrations/001_initial.sql)
sqlPRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  imessage_handle TEXT NOT NULL,
  name TEXT,
  goal TEXT NOT NULL CHECK (goal IN ('cut', 'maintain', 'bulk')),
  weight_kg REAL NOT NULL,
  height_cm REAL NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('m', 'f')),
  activity_level TEXT NOT NULL CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  training_days_per_week INTEGER NOT NULL,
  daily_calorie_target INTEGER NOT NULL,
  daily_protein_target INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  description TEXT NOT NULL,
  calories INTEGER NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('text', 'photo', 'voice')),
  photo_path TEXT,
  raw_input TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_meals_ts ON meals(ts);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  exercise TEXT NOT NULL,
  exercise_normalized TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  reps INTEGER NOT NULL,
  set_number INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  raw_input TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_workouts_ts ON workouts(ts);
CREATE INDEX idx_workouts_exercise ON workouts(exercise_normalized, ts);

CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'coach')),
  content TEXT NOT NULL,
  has_image INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER,
  tokens_out INTEGER,
  model TEXT
);
CREATE INDEX idx_conversations_ts ON conversations(ts);

CREATE TABLE IF NOT EXISTS sent_nudges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  ts INTEGER NOT NULL,
  date_key TEXT NOT NULL
);
CREATE INDEX idx_nudges_dedupe ON sent_nudges(kind, date_key);

INSERT INTO schema_version (version) VALUES (1);
4.2 Config file (~/.coach/config.json)
json{
  "version": 1,
  "openrouter_api_key": "sk-or-v1-...",
  "imessage_handle": "+919xxxxxxxxx",
  "model": "anthropic/claude-sonnet-4",
  "vision_model": "anthropic/claude-sonnet-4",
  "schedule": {
    "morning_briefing": "07:00",
    "wind_down": "22:30",
    "protein_check": "21:00"
  },
  "integrations": {
    "calendar": { "enabled": true }
  }
}
Stored with chmod 600. Never logged.
4.3 Filesystem layout (~/.coach/)
~/.coach/
├── bin/
│   └── coach                # the binary
├── config.json              # chmod 600
├── coach.db                 # SQLite
├── coach.db-wal
├── coach.db-shm
├── photos/                  # received meal photos
│   └── 2026-04-10_124530.jpg
├── logs/
│   ├── coach.log
│   └── coach.err
└── launchd/
    └── sh.coach.agent.plist

5. The brain — LLM architecture
5.1 Model choice via OpenRouter
Default to anthropic/claude-sonnet-4. Let power users override in config. Vercel AI SDK makes this one line to swap.
5.2 The single-call router pattern
Every incoming user message triggers one generateObject call. The LLM receives:

Full system prompt (coach voice + rules)
Context blob (profile, today's state, calendar, recent messages, relevant facts)
The user's message (text + optional image)

And returns a structured response matching this Zod schema:
ts// src/brain/schemas.ts
import { z } from 'zod'

export const coachResponseSchema = z.object({
  intent: z.enum([
    'meal_log',
    'workout_log',
    'query',
    'profile_update',
    'correction',
    'chitchat',
    'unclear'
  ]),

  meal: z.object({
    description: z.string(),
    calories: z.number().int(),
    protein_g: z.number(),
    carbs_g: z.number(),
    fat_g: z.number(),
    confidence: z.enum(['high', 'medium', 'low'])
  }).optional(),

  workout: z.object({
    exercise: z.string(),
    exercise_normalized: z.string(),
    sets: z.array(z.object({
      weight_kg: z.number(),
      reps: z.number().int()
    }))
  }).optional(),

  facts_to_remember: z.array(z.object({
    key: z.string(),
    value: z.string()
  })).default([]),

  reply: z.string().max(500)
})

export type CoachResponse = z.infer<typeof coachResponseSchema>
One call, one response, one write transaction, one reply. Total latency budget: under 3 seconds.
5.3 Context blob (src/brain/context.ts)
Built fresh per message. Stays under ~2000 tokens:
## User
Vikash, 26, 72kg, 178cm, male, moderate activity
Goal: maintain. Targets: 2400 cal, 150g protein daily.
Timezone: Asia/Kolkata. Current time: 2026-04-10 14:23 IST.

## Today so far
Meals: 2 logged. Running totals: 1080 cal, 82g protein.
Remaining: 1320 cal, 68g protein.
Workouts today: none yet.

## Calendar (next 8 hours)
- 15:00-16:00 Design review
- 16:30-17:00 1:1 with Priya
- 19:00-20:30 Gym (strength)

## Recent PRs
bench press: 72.5kg x 8 (5 days ago)
squat: 95kg x 5 (3 days ago)

## Remembered facts
- kitchen: eggs, oats, chicken, rice, paneer
- regular lunch spot: "Rolls King" near office
- allergic to peanuts

## Last 3 messages
user (13:10): had a dosa for breakfast
coach (13:10): 450 cal, 12g protein. light on protein — hit it hard at lunch.
user (14:23): [current message]
This context gets assembled by pulling from:

user.ts (profile)
meals.ts (todayTotals)
workouts.ts (last PRs, today's sets)
integrations/calendar (next 8hr events)
facts.ts (all kv pairs)
conversations table (last 3-5 turns)

5.4 System prompt (src/brain/prompts.ts)
You are Coach. You run the user's body like a trainer runs an athlete.

VOICE RULES:
- lowercase. short. no fluff.
- direct like a trainer, not polite like an assistant.
- one line replies unless asked a question.
- never lecture. never explain nutrition science unless asked.
- no emojis. no exclamation points.
- acknowledge PRs in one word: "solid", "good", "nice"
- call out bad choices directly: "thats trash, eat protein"

BEHAVIOR:
- always log what the user tells you (set intent correctly)
- infer macros from food descriptions using standard values
- when the user logs a workout, compare to their last session for that lift
- use calendar data to plan around meetings
- if the user says something you should remember forever (allergies, goals, kitchen, schedule), add it to facts_to_remember
- if a photo is attached and its a meal, log it. if its not food, say "not food"
- never ask "what are your goals" — check the context
- never greet. start with the substance.

CONSTRAINTS:
- reply max 500 chars
- always return a valid structured response
- if unclear, use intent: unclear and ask one specific question
5.5 Vercel AI SDK + OpenRouter client (src/brain/llm.ts)
tsimport { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateObject } from 'ai'
import { coachResponseSchema } from './schemas'
import { getConfig } from '../config'

export async function runCoach(
  systemPrompt: string,
  context: string,
  userMessage: string,
  imagePath?: string
) {
  const cfg = getConfig()
  const openrouter = createOpenRouter({ apiKey: cfg.openrouter_api_key })

  const content: any[] = [
    { type: 'text', text: `${context}\n\n## User message\n${userMessage}` }
  ]

  if (imagePath) {
    const bytes = await Bun.file(imagePath).bytes()
    content.push({ type: 'image', image: bytes })
  }

  const { object, usage } = await generateObject({
    model: openrouter(cfg.model),
    schema: coachResponseSchema,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
    maxRetries: 2
  })

  return { object, usage }
}

6. Transport layer (src/transport/imessage.ts)
Thin wrapper over Photon. Only exposes what the brain needs.
tsimport { IMessageSDK } from '@photon-ai/imessage-kit'
import type { IncomingMessage } from './types'
import { paths } from '../paths'

export class IMessageTransport {
  private sdk: IMessageSDK

  constructor() {
    this.sdk = new IMessageSDK({ debug: false })
  }

  async start(onMessage: (msg: IncomingMessage) => Promise<void>) {
    await this.sdk.startWatching({
      onDirectMessage: async (msg) => {
        if (msg.isFromMe || msg.isReaction) return

        const normalized: IncomingMessage = {
          id: msg.id,
          from: msg.sender,
          text: msg.text ?? '',
          imagePath: msg.attachments[0]?.path,
          timestamp: msg.date
        }

        await onMessage(normalized)
      }
    })
  }

  async reply(to: string, text: string) {
    await this.sdk.send(to, text)
  }

  async replyWithImage(to: string, text: string, imagePath: string) {
    await this.sdk.send(to, { text, images: [imagePath] })
  }

  async stop() {
    this.sdk.stopWatching()
    await this.sdk.close()
  }
}
Brain only talks to IMessageTransport. Transport knows nothing about meals, workouts, or LLMs. Swappable for Twilio later in ~50 LOC.

7. Calendar integration (src/integrations/calendar/osascript.ts)
Read-only. Uses osascript to query Calendar.app. Returns events for next N hours.
tsimport { $ } from 'bun'

export async function getUpcomingEvents(hoursAhead = 8) {
  const script = `
    tell application "Calendar"
      set now to current date
      set future to now + (${hoursAhead} * hours)
      set output to ""
      repeat with cal in calendars
        try
          set evs to (every event of cal whose start date >= now and start date <= future)
          repeat with e in evs
            set output to output & (summary of e) & "|" & ((start date of e) as string) & "|" & ((end date of e) as string) & "\n"
          end repeat
        end try
      end repeat
      return output
    end tell
  `

  const result = await $`osascript -e ${script}`.text()
  return parseEvents(result)
}
First run asks the user to grant Calendar access (macOS prompt). Handled in init.
Note: osascript calendar access is slow (~2-4s). So we cache it in memory with a 5-minute TTL. For scheduled morning briefing, the cost is acceptable. For per-message context, use the cache.

8. Scheduler (src/scheduler/loop.ts)
Simple internal tick every 60 seconds. Checks what needs to send. Uses sent_nudges table with (kind, date_key) unique check for dedupe.
tsasync function tick() {
  const now = new Date()
  const dateKey = now.toISOString().slice(0, 10) // YYYY-MM-DD

  if (await shouldSendMorning(now, dateKey)) {
    await sendMorningBriefing()
    await markSent('morning', dateKey)
  }

  if (await shouldSendPreworkout(now, dateKey)) {
    await sendPreworkoutNudge()
    await markSent('preworkout', dateKey)
  }

  if (await shouldSendProteinCheck(now, dateKey)) {
    await sendProteinCheck()
    await markSent('protein', dateKey)
  }

  if (await shouldSendWindDown(now, dateKey)) {
    await sendWindDown()
    await markSent('winddown', dateKey)
  }
}

setInterval(tick, 60_000)
Anti-spam rule: before any scheduled send, check if the user messaged Coach in the last 30 minutes. If yes, skip — they're already in an active conversation.
Pre-workout timing: not a fixed time. Pulls from calendar — finds the next "gym" / "workout" / "training" event and schedules the nudge for 60min before.

9. CLI flows
9.1 coach init
→ Checking macOS version... ✓ (14.4)
→ Checking Full Disk Access... ✗

Coach needs Full Disk Access to read iMessage.
Opening System Settings now. Add this file to the list:
  /Users/vikash/.coach/bin/coach

Press ENTER when done.

→ Re-checking Full Disk Access... ✓
→ Checking Calendar access... (will prompt on first use)

Enter your OpenRouter API key:
> sk-or-v1-...

Enter the iMessage handle Coach should text you on (your phone or email):
> +919xxxxxxxxx

A few questions:

What's your goal?
  1) cut    2) maintain    3) bulk
> 2

Weight (kg)? > 72
Height (cm)? > 178
Age? > 26
Sex (m/f)? > m
Activity level? (sedentary/light/moderate/active/very_active) > moderate
Training days per week? > 4

Computing targets...
  Daily calories: 2400
  Daily protein: 150g

Installing launchd agent... ✓
Starting Coach... ✓

Coach is online. Check your iMessage.
Meanwhile on the phone: "coach online. text me your first meal when you eat it."
9.2 coach run
Main daemon. Called by launchd. Steps:

Load config
Open DB
Initialize Photon transport
Start scheduler loop
Start transport watcher → router → LLM → reply
Handle SIGTERM gracefully

9.3 coach status
coach v0.1.0
status: running (pid 12456, uptime 3d 14h)
handle: +919xxxxxxxxx
db: ~/.coach/coach.db (2.4 MB)
meals logged today: 3 (1840 cal, 112g protein)
workouts this week: 3
last message: 2 minutes ago
model: anthropic/claude-sonnet-4
9.4 coach stop / coach uninstall
stop: launchctl unload + graceful shutdown.
uninstall: confirm, launchctl unload, remove plist, remove ~/.coach/.

10. launchd plist
xml<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>sh.coach.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/USERNAME/.coach/bin/coach</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>/Users/USERNAME/.coach/logs/coach.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/USERNAME/.coach/logs/coach.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>/Users/USERNAME</string>
  </dict>
</dict>
</plist>
Installed to ~/Library/LaunchAgents/sh.coach.agent.plist, loaded with launchctl load.

11. Build & release
11.1 Build (scripts/build.ts)
tsimport { $ } from 'bun'

const targets = [
  { target: 'bun-darwin-arm64', out: 'coach-darwin-arm64' },
  { target: 'bun-darwin-x64',   out: 'coach-darwin-x64' }
]

for (const { target, out } of targets) {
  await $`bun build --compile --target=${target} --minify --sourcemap=none ./src/index.ts --outfile ./dist/${out}`
  console.log(`✓ built ${out}`)
}
Produces two ~55MB binaries in ./dist/.
11.2 Install script (install.sh, hosted)
sh#!/bin/sh
set -e

[ "$(uname)" = "Darwin" ] || { echo "coach is macOS only"; exit 1; }

ARCH=$(uname -m)
case "$ARCH" in
  arm64)  BIN="coach-darwin-arm64" ;;
  x86_64) BIN="coach-darwin-x64" ;;
  *) echo "unsupported arch: $ARCH"; exit 1 ;;
esac

INSTALL_DIR="$HOME/.coach/bin"
mkdir -p "$INSTALL_DIR"

echo "→ downloading $BIN..."
curl -fsSL "https://github.com/chann44/coach/releases/latest/download/$BIN" \
  -o "$INSTALL_DIR/coach"
chmod +x "$INSTALL_DIR/coach"

SHELL_RC="$HOME/.zshrc"
if ! grep -q "\.coach/bin" "$SHELL_RC" 2>/dev/null; then
  echo 'export PATH="$HOME/.coach/bin:$PATH"' >> "$SHELL_RC"
  echo "→ added to PATH in $SHELL_RC"
fi

echo ""
echo "✓ coach installed"
echo ""
echo "next: open a new terminal and run:"
echo "  coach init"
11.3 Release (scripts/release.ts)
Tags, builds both binaries, creates GitHub release, uploads assets. Uses gh CLI.

12. Security & privacy

config.json chmod 600, owner-only
OpenRouter key never logged, never sent anywhere except OpenRouter
All meal/workout data stays in local SQLite
LLM calls go to OpenRouter → chosen provider. That's the one non-local dependency. Users accept this by providing a BYOK key.
Photos received from iMessage copied to ~/.coach/photos/, never uploaded anywhere except as part of the LLM vision call
README explicitly states the data flow: "Your food photos and meal descriptions go to your chosen LLM provider (via OpenRouter) for analysis. Nothing goes anywhere else. There is no Coach server."


13. Testing strategy (pragmatic for hackathon)

Unit: nutrition math helpers, cron predicates, context builder output shape
Integration: mock IMessageTransport, feed canned messages through the router, assert DB writes + replies
Manual e2e: the only test that matters — does it actually work when you text it? Run daily for 2 days before submission.

No mocking the LLM. Real calls. Cheap models during dev (meta-llama/llama-3.1-8b-instruct via OpenRouter, ~free). Swap to Claude Sonnet for demo.