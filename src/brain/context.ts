import type { Database } from "bun:sqlite";
import type { CoachConfig } from "../config";
import { getUpcomingEvents } from "../integrations/calendar/osascript";
import { listFacts } from "../memory/facts";
import { mealTotalsBetween } from "../memory/meals";
import { recentConversations } from "../memory/conversations";
import { recentPrs, workoutsBetween } from "../memory/workouts";
import { dayRangeInTimezone, formatLocalDateTime } from "../time";

interface UserRow {
  name: string | null;
  goal: string;
  weight_kg: number;
  height_cm: number;
  age: number;
  sex: string;
  activity_level: string;
  daily_calorie_target: number;
  daily_protein_target: number;
}

function getUser(db: Database): UserRow | null {
  const row = db
    .query(
      `SELECT name, goal, weight_kg, height_cm, age, sex, activity_level, daily_calorie_target, daily_protein_target
       FROM user WHERE id = 1 LIMIT 1`
    )
    .get() as UserRow | null;
  return row;
}

export async function buildContext(db: Database, config: CoachConfig, now = new Date()): Promise<string> {
  const user = getUser(db);
  const { startTs, endTs } = dayRangeInTimezone(now, config.timezone);
  const totals = mealTotalsBetween(db, startTs, endTs);
  const workoutSummary = workoutsBetween(db, startTs, endTs);
  const prs = recentPrs(db, 3);
  const facts = listFacts(db)
    .filter((fact) => !fact.key.startsWith("startup_"))
    .slice(0, 10);
  const factsMap = new Map(facts.map((fact) => [fact.key, fact.value]));
  const recent = recentConversations(db, 5).reverse();
  const events = config.integrations.calendar.enabled ? await getUpcomingEvents(8) : [];

  const effectiveGoal = factsMap.get("goal") ?? user?.goal ?? "unknown";
  const trainingSchedule = factsMap.get("training_days_per_week")
    ? `${factsMap.get("training_days_per_week")} days/week${factsMap.get("training_preferred_time") ? `, ${factsMap.get("training_preferred_time")}` : ""}`
    : "not set";

  const targets = user
    ? `${user.daily_calorie_target} cal, ${Math.round(user.daily_protein_target)}g protein`
    : "not set";

  const profileLine = user
    ? `${user.name ?? "user"}, ${user.age}, ${user.weight_kg}kg, ${user.height_cm}cm, ${user.sex}, ${user.activity_level}`
    : "profile not set";

  return [
    "## User",
    profileLine,
    `Goal: ${effectiveGoal}. Targets: ${targets}.`,
    `Training schedule: ${trainingSchedule}.`,
    `Timezone: ${config.timezone}. Current time: ${formatLocalDateTime(now, config.timezone)}.`,
    "",
    "## Today so far",
    `Meals: ${totals.meals_count}. Running totals: ${Math.round(totals.calories)} cal, ${Math.round(totals.protein_g)}g protein.`,
    `Workouts today: ${workoutSummary.sets_count} sets.`,
    "",
    "## Calendar (next 8 hours)",
    ...(events.length
      ? events.slice(0, 6).map((event) => `- ${new Date(event.startsAt).toISOString()} ${event.title}`)
      : ["- none"]),
    "",
    "## Recent PRs",
    ...(prs.length
      ? prs.map((pr) => `- ${pr.exercise_normalized}: ${pr.best_weight_kg}kg x ${pr.best_reps}`)
      : ["- none"]),
    "",
    "## Remembered facts",
    ...(facts.length ? facts.map((fact) => `- ${fact.key}: ${fact.value}`) : ["- none"]),
    "",
    "## Last messages",
    ...(recent.length
      ? recent.map((msg) => `- ${msg.role}: ${msg.content}`)
      : ["- no history"])
  ].join("\n");
}
