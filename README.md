# coach

Local-first iMessage health coach for macOS, built with Bun.

`coach` runs as a background agent, listens for messages from your configured iMessage handle, and responds with context-aware coaching using your OpenRouter model.

## Highlights

- Local-first by default: conversations, meals, workouts, facts, and nudges are stored in `~/.coach/coach.db`
- No hosted backend: data stays on your machine
- iMessage-native transport with dedupe and sender filtering
- Calendar-aware scheduling (for pre-workout nudges and daily planning)
- Built-in diagnostics via `coach doctor`

## Requirements

- macOS (uses iMessage + `launchd`)
- Bun runtime
- OpenRouter API key
- Full Disk Access for Messages DB (`~/Library/Messages/chat.db`)
- Calendar permission (optional but recommended)

## Quick Start

```bash
bun install
bun run src/index.ts init
```

During `init`, Coach will:

1. Prompt for your API key, iMessage handle, timezone, and model
2. Create local config + SQLite data files under `~/.coach`
3. Install a `launchd` agent for background execution

Then run Coach:

```bash
bun run src/index.ts run
```

## CLI Commands

```bash
coach init
coach install
coach run
coach status
coach doctor
coach stop
coach uninstall
```

- `init` / `install`: interactive setup and launchd installation
- `run`: start the daemon in the current process
- `status`: show daemon, launchd, config, and DB state
- `doctor`: run environment and permission checks
- `stop`: stop running daemon and unload launchd job
- `uninstall`: remove launchd files and delete `~/.coach`

## Configuration

Config is stored at `~/.coach/config.json` with file permissions `0600`.

Key fields:

- `openrouter_api_key`
- `imessage_handle`
- `model` / `vision_model`
- `timezone`
- `schedule` (`morning_briefing`, `wind_down`, `protein_check`)
- `integrations.calendar.enabled`

Default model: `anthropic/claude-sonnet-4`

## Privacy and Data Handling

- Coach stores local state in SQLite only (`~/.coach/coach.db`)
- Meal photos and message content can be sent to your configured model provider through OpenRouter
- No Coach-managed cloud service or sync backend is required

## Scheduling Notes

- Day boundaries and dedupe keys use your configured timezone
- Calendar reads are cached for 5 minutes
- Pre-workout nudges look ahead 24 hours and trigger about 45-60 minutes before events

## Development

Install dependencies:

```bash
bun install
```

Run tests:

```bash
bun test
```

Run in development:

```bash
bun run src/index.ts run
```

## Project Status

This project is under active development. If you plan to open-source it broadly, consider adding:

- `LICENSE`
- `CONTRIBUTING.md`
- issue and pull request templates
