import type { Database } from "bun:sqlite";
import type { CoachConfig } from "../config";
import { runSchedulerAgent } from "../brain/agent";
import type { IMessageTransport } from "../transport/imessage";

interface TickDeps {
  db: Database;
  config: CoachConfig;
  transport: IMessageTransport;
}

export function startScheduler(deps: TickDeps): ReturnType<typeof setInterval> {
  let inFlight = false;

  const guardedTick = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    try {
      await tick(deps);
    } finally {
      inFlight = false;
    }
  };

  void guardedTick();
  return setInterval(() => {
    void guardedTick();
  }, 60_000);
}

export async function tick(deps: TickDeps): Promise<void> {
  await runSchedulerAgent({
    db: deps.db,
    config: deps.config,
    transport: deps.transport,
    now: new Date()
  });
}
