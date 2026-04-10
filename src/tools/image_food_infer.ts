import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import type { CoachConfig } from "../config";

const imageFoodInferSchema = z.object({
  is_food: z.boolean(),
  barcode: z
    .string()
    .regex(/^\d{8,14}$/)
    .nullable(),
  barcode_candidates: z.array(z.string().regex(/^\d{8,14}$/)).max(5),
  food_query: z.string().min(1).max(120).nullable(),
  brand: z.string().min(1).max(80).nullable(),
  portion: z.string().min(1).max(60).nullable(),
  fssai_license: z.string().regex(/^\d{14}$/).nullable()
});

export type ImageFoodInferResult = z.infer<typeof imageFoodInferSchema>;

export async function inferFoodFromImage(imagePath: string, config: CoachConfig): Promise<ImageFoodInferResult | null> {
  console.log(`[tool:image_food_infer] start path=${imagePath}`);
  const bytes = await Bun.file(imagePath).bytes().catch(() => null);
  if (!bytes) {
    console.log("[tool:image_food_infer] no image bytes");
    return null;
  }

  const openrouter = createOpenRouter({ apiKey: config.openrouter_api_key });

  try {
    const { object } = await generateObject({
      model: openrouter.chat(config.vision_model),
      schema: imageFoodInferSchema,
      system: [
        "You are extracting food info from a single image.",
        "Return barcode only when clearly visible and numeric.",
        "Return barcode_candidates as up to 5 numeric barcode guesses (or empty array).",
        "If there is an India FSSAI license number, extract 14 digits into fssai_license, else null.",
        "If no clear barcode, infer likely food query, brand, and portion from packaging text.",
        "If a field is unknown, return null (never omit keys).",
        "If this is not food packaging/food, set is_food=false."
      ].join(" "),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract barcode or food lookup hints from this image." },
            { type: "image", image: bytes }
          ]
        }
      ]
    });

    console.log(`[tool:image_food_infer] result=${JSON.stringify(object)}`);
    return object;
  } catch (error) {
    console.error("[tool:image_food_infer] failed", error);
    return null;
  }
}
