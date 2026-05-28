/** OpenAI-style JSON schema for batched ingredient rating (LM Studio response_format). */
export const INGREDIENT_BATCH_JSON_SCHEMA = {
  type: "object",
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          normalized_name: { type: "string" },
          display_name: { type: ["string", "null"] },
          nova_class: { type: "integer", minimum: 1, maximum: 4 },
          role: {
            type: "string",
            enum: [
              "base_food",
              "sweetener",
              "fat",
              "starch",
              "thickener",
              "emulsifier",
              "preservative",
              "color",
              "flavor",
              "acid_regulator",
              "probiotic",
              "vitamin_mineral",
              "other",
            ],
          },
          concern_tier: {
            type: "string",
            enum: ["innocuous", "watchful", "problematic", "hazardous"],
          },
          concern_reasons: {
            type: "array",
            items: { type: "string" },
            maxItems: 2,
          },
          intrinsic_quality: { type: "integer", minimum: 0, maximum: 100 },
          synonyms: {
            type: "array",
            items: { type: "string" },
            maxItems: 5,
          },
        },
        required: [
          "normalized_name",
          "display_name",
          "nova_class",
          "role",
          "concern_tier",
          "concern_reasons",
          "intrinsic_quality",
          "synonyms",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["ingredients"],
  additionalProperties: false,
} as const;
