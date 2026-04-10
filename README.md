# coach

local-first iMessage health coach. bun runtime only.

## setup

```bash
bun install
bun run src/index.ts init
```

`init` prompts for config, creates the sqlite db, runs migrations, and installs the launchd agent.

Nutrition lookup uses Nutritionix when you set `nutritionix_app_id` and `nutritionix_app_key` in config, then falls back to Open Food Facts and local defaults.

## run

```bash
bun run src/index.ts run
```

## cli

```bash
coach init
coach run
coach status
coach doctor
coach stop
coach uninstall
```

## test

```bash
bun test
```

## privacy

- all logs, meals, workouts, and facts stay in local sqlite at `~/.coach/coach.db`
- food photos and meal descriptions are sent only to your chosen llm provider via OpenRouter
- there is no coach server

## scheduling behavior

- day boundaries and dedupe keys use the user profile timezone
- calendar reads are cached with a 5 minute ttl
- pre-workout nudge checks next 24h events and sends 60-45 min before start
