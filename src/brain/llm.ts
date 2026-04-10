import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getConfig } from "../config";
import { coachResponseSchema, type CoachResponse } from "./schemas";

export async function runCoach(
  system: string,
  context: string,
  userMessage: string,
  imagePath?: string
): Promise<{ object: CoachResponse; usage?: unknown }> {
  const config = getConfig();
  const openrouter = createOpenRouter({ apiKey: config.openrouter_api_key });

  const content: any[] = [{ type: "text", text: `${context}\n\n## User message\n${userMessage}` }];
  if (imagePath) {
    const bytes = await Bun.file(imagePath).bytes();
    content.push({ type: "image", image: bytes });
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { object, usage } = await generateObject({
        model: openrouter.chat(config.model),
        schema: coachResponseSchema,
        system,
        messages: [{ role: "user", content }],
        maxRetries: 1
      });
      return { object, usage };
    } catch (error) {
      if (attempt === 2) {
        return {
          object: {
            intent: "unclear",
            facts_to_remember: [],
            reply: "missed that. send it again in one line."
          }
        };
      }
      await Bun.sleep(150 * (attempt + 1));
    }
  }

  return {
    object: {
      intent: "unclear",
      facts_to_remember: [],
      reply: "missed that. send it again in one line."
    }
  };
}
