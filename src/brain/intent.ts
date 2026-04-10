import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import type { CoachConfig } from "../config";

const toolNameSchema = z.enum([
  "calendar_get_upcoming",
  "get_barcode_macros",
  "lookup_food",
  "log_meal",
  "log_workout",
  "set_goal",
  "set_training_schedule",
  "log_checkin",
  "remember_fact"
]);

const intentDecisionSchema = z.object({
  allow_meal_log: z.boolean(),
  allow_workout_log: z.boolean(),
  suggested_tools: z.array(toolNameSchema),
  reason: z.string().min(1).max(220)
});

export type IntentToolName = z.infer<typeof toolNameSchema>;

export interface IntentDecision {
  allowMealLog: boolean;
  allowWorkoutLog: boolean;
  suggestedTools: IntentToolName[];
  reason: string;
}

export async function inferMessageIntent(
  config: CoachConfig,
  userText: string,
  imagePath?: string
): Promise<IntentDecision> {
  const openrouter = createOpenRouter({ apiKey: config.openrouter_api_key });

  const content: Array<{ type: "text"; text: string } | { type: "image"; image: Uint8Array }> = [
    {
      type: "text",
      text: userText
    }
  ];

  if (imagePath) {
    const bytes = await Bun.file(imagePath).bytes().catch(() => null);
    if (bytes) content.push({ type: "image", image: bytes });
  }

  try {
    const { object } = await generateObject({
      model: openrouter.chat(imagePath ? config.vision_model : config.model),
      schema: intentDecisionSchema,
      system: [
        "You are an intent router for coaching tools.",
        "Infer user intent and choose relevant tools only.",
        "Set allow_meal_log true only when user intent is to explicitly log/save/track a meal now.",
        "Set allow_workout_log true only when user intent is to explicitly log a workout now.",
        "For image meal analysis without explicit logging intent, keep allow_meal_log=false and suggest get_barcode_macros/lookup_food.",
        "Keep reason short and concrete."
      ].join(" "),
      messages: [{ role: "user", content }],
      maxRetries: 1
    });

    return {
      allowMealLog: object.allow_meal_log,
      allowWorkoutLog: object.allow_workout_log,
      suggestedTools: object.suggested_tools,
      reason: object.reason
    };
  } catch (error) {
    console.error("[agent:intent] failed; using safe fallback", error);
    return {
      allowMealLog: false,
      allowWorkoutLog: false,
      suggestedTools: imagePath ? ["get_barcode_macros", "lookup_food"] : ["remember_fact"],
      reason: "fallback_intent_router"
    };
  }
}
