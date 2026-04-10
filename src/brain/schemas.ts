import { z } from "zod";

export const coachResponseSchema = z.object({
  intent: z.enum(["meal_log", "workout_log", "query", "profile_update", "correction", "chitchat", "unclear"]),
  meal: z
    .object({
      description: z.string(),
      calories: z.number().int(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
      confidence: z.enum(["high", "medium", "low"])
    })
    .optional(),
  workout: z
    .object({
      exercise: z.string(),
      exercise_normalized: z.string(),
      sets: z.array(
        z.object({
          weight_kg: z.number(),
          reps: z.number().int()
        })
      )
    })
    .optional(),
  facts_to_remember: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  reply: z.string().max(500)
});

export type CoachResponse = z.infer<typeof coachResponseSchema>;
