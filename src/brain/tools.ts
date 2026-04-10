import type { Database } from "bun:sqlite";
import { tool } from "ai";
import { z } from "zod";
import type { CoachConfig } from "../config";
import { getUpcomingEvents } from "../integrations/calendar/osascript";
import { insertConversation } from "../memory/conversations";
import { upsertFact } from "../memory/facts";
import { insertMeal, mealTotalsBetween } from "../memory/meals";
import { recordOutboundEcho } from "../memory/message_dedupe";
import { markNudgeSent } from "../memory/nudges";
import { insertWorkoutSet } from "../memory/workouts";
import type { IMessageTransport } from "../transport/imessage";
import { dayRangeInTimezone } from "../time";
import { buildContext } from "./context";
import { getDueNudges, type NudgeKind } from "../scheduler/due";

export interface ToolRuntime {
  db: Database;
  config: CoachConfig;
  transport: IMessageTransport;
  now: Date;
  sentMessages: string[];
  maxSends?: number;
}

const workoutSetSchema = z.object({
  weight_kg: z.number(),
  reps: z.number().int().min(1)
});

export function createCoachTools(runtime: ToolRuntime) {
  return {
    get_context: tool({
      description: "Get current user context for coaching decisions",
      inputSchema: z.object({}),
      execute: async () => ({
        context: await buildContext(runtime.db, runtime.config, runtime.now)
      })
    }),

    calendar_get_upcoming: tool({
      description: "Get upcoming calendar events",
      inputSchema: z.object({ hoursAhead: z.number().int().min(1).max(24).default(8) }),
      execute: async ({ hoursAhead }) => {
        const events = await getUpcomingEvents(hoursAhead);
        return {
          events: events.map((event) => ({
            title: event.title,
            startsAt: event.startsAt,
            endsAt: event.endsAt
          }))
        };
      }
    }),

    log_meal: tool({
      description: "Log a meal with macros",
      inputSchema: z.object({
        description: z.string().min(1),
        calories: z.number().int().min(0),
        protein_g: z.number().min(0),
        carbs_g: z.number().min(0),
        fat_g: z.number().min(0),
        source: z.enum(["text", "photo", "voice"]).default("text"),
        raw_input: z.string().min(1),
        photo_path: z.string().optional()
      }),
      execute: async (input) => {
        insertMeal(runtime.db, {
          ts: runtime.now.getTime(),
          ...input
        });

        const { startTs, endTs } = dayRangeInTimezone(runtime.now, runtime.config.timezone);
        const totals = mealTotalsBetween(runtime.db, startTs, endTs);
        const userTargets = runtime.db
          .query(
            `SELECT daily_calorie_target, daily_protein_target
             FROM user
             WHERE id = 1
             LIMIT 1`
          )
          .get() as { daily_calorie_target: number; daily_protein_target: number } | null;

        return {
          ok: true,
          logged: {
            calories: input.calories,
            protein_g: input.protein_g,
            carbs_g: input.carbs_g,
            fat_g: input.fat_g
          },
          todayTotals: {
            calories: Math.round(totals.calories),
            protein_g: Math.round(totals.protein_g),
            carbs_g: Math.round(totals.carbs_g),
            fat_g: Math.round(totals.fat_g),
            meals_count: totals.meals_count
          },
          targets: userTargets
            ? {
                calories: userTargets.daily_calorie_target,
                protein_g: Math.round(userTargets.daily_protein_target)
              }
            : null,
          remaining: userTargets
            ? {
                calories: Math.max(0, Math.round(userTargets.daily_calorie_target - totals.calories)),
                protein_g: Math.max(0, Math.round(userTargets.daily_protein_target - totals.protein_g))
              }
            : null
        };
      }
    }),

    log_workout: tool({
      description: "Log workout sets for an exercise",
      inputSchema: z.object({
        exercise: z.string().min(1),
        exercise_normalized: z.string().min(1),
        sets: z.array(workoutSetSchema).min(1),
        raw_input: z.string().min(1)
      }),
      execute: async ({ exercise, exercise_normalized, sets, raw_input }) => {
        sets.forEach((set, index) => {
          insertWorkoutSet(runtime.db, {
            ts: runtime.now.getTime(),
            exercise,
            exercise_normalized,
            weight_kg: set.weight_kg,
            reps: set.reps,
            set_number: index + 1,
            raw_input
          });
        });
        return { ok: true, setsLogged: sets.length };
      }
    }),

    remember_fact: tool({
      description: "Remember durable user fact",
      inputSchema: z.object({ key: z.string().min(1), value: z.string().min(1) }),
      execute: async ({ key, value }) => {
        upsertFact(runtime.db, { key, value });
        return { ok: true };
      }
    }),

    set_goal: tool({
      description: "Set or update user's body-composition goal",
      inputSchema: z.object({
        goal: z.enum(["cut", "maintain", "bulk"]),
        timeframe_weeks: z.number().int().min(1).max(52).optional(),
        notes: z.string().max(200).optional()
      }),
      execute: async ({ goal, timeframe_weeks, notes }) => {
        runtime.db.query("UPDATE user SET goal = ?1, updated_at = ?2 WHERE id = 1").run(goal, Date.now());

        upsertFact(runtime.db, { key: "goal", value: goal });
        if (typeof timeframe_weeks === "number") {
          upsertFact(runtime.db, { key: "goal_timeframe_weeks", value: String(timeframe_weeks) });
        }
        if (notes && notes.trim().length > 0) {
          upsertFact(runtime.db, { key: "goal_notes", value: notes.trim() });
        }

        return { ok: true, goal, timeframe_weeks: timeframe_weeks ?? null };
      }
    }),

    set_training_schedule: tool({
      description: "Set user's weekly training schedule",
      inputSchema: z.object({
        days_per_week: z.number().int().min(1).max(7),
        preferred_time: z.string().min(2).max(40).optional(),
        split: z.string().max(120).optional()
      }),
      execute: async ({ days_per_week, preferred_time, split }) => {
        runtime.db
          .query("UPDATE user SET training_days_per_week = ?1, updated_at = ?2 WHERE id = 1")
          .run(days_per_week, Date.now());

        upsertFact(runtime.db, { key: "training_days_per_week", value: String(days_per_week) });
        if (preferred_time && preferred_time.trim().length > 0) {
          upsertFact(runtime.db, { key: "training_preferred_time", value: preferred_time.trim() });
        }
        if (split && split.trim().length > 0) {
          upsertFact(runtime.db, { key: "training_split", value: split.trim() });
        }

        return { ok: true, days_per_week, preferred_time: preferred_time ?? null, split: split ?? null };
      }
    }),

    log_checkin: tool({
      description: "Log daily wellbeing check-in",
      inputSchema: z.object({
        sleep_hours: z.number().min(0).max(24).optional(),
        energy_1_10: z.number().int().min(1).max(10).optional(),
        stress_1_10: z.number().int().min(1).max(10).optional(),
        soreness_1_10: z.number().int().min(1).max(10).optional(),
        notes: z.string().max(200).optional()
      }),
      execute: async (input) => {
        upsertFact(runtime.db, {
          key: "last_checkin",
          value: JSON.stringify({ ...input, ts: runtime.now.getTime() })
        });
        return { ok: true };
      }
    }),

    send_message: tool({
      description: "Send final coach message to user",
      inputSchema: z.object({ text: z.string().min(1).max(500) }),
      execute: async ({ text }) => {
        const maxSends = runtime.maxSends ?? Number.POSITIVE_INFINITY;
        if (runtime.sentMessages.length >= maxSends) {
          console.log(`[tool:send_message] blocked by maxSends=${maxSends}`);
          return { ok: true, skipped: true, reason: "send_limit_reached" };
        }

        console.log(`[tool:send_message] sending text=${text.slice(0, 120)}`);
        const sendResult = await runtime.transport.reply(runtime.config.imessage_handle, text);
        recordOutboundEcho(runtime.db, {
          guid: sendResult.message?.guid,
          chatId: sendResult.message?.chatId,
          text,
          ts: Date.now()
        });
        runtime.sentMessages.push(text);
        insertConversation(runtime.db, {
          ts: Date.now(),
          role: "coach",
          content: text,
          hasImage: false,
          model: runtime.config.model
        });
        return { ok: true };
      }
    }),

    scheduler_get_due: tool({
      description: "Get due scheduler nudges for this minute",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await getDueNudges(runtime.db, runtime.config, runtime.now);
        return result;
      }
    }),

    scheduler_mark_sent: tool({
      description: "Mark scheduler nudge as sent",
      inputSchema: z.object({
        kind: z.enum(["morning", "protein", "winddown", "preworkout"]),
        dateKey: z.string().min(8)
      }),
      execute: async ({ kind, dateKey }) => {
        const inserted = markNudgeSent(runtime.db, kind as NudgeKind, dateKey, runtime.now.getTime());
        return { ok: true, inserted };
      }
    })
  };
}
