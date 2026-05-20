import { Type } from "@google/genai";

export const UpdateGlobalStylesSchema = {
  name: "update_global_styles",
  description:
    "Updates global design tokens in app/styleConfig.json. Use this to change theme colors/radius used by semantic Tailwind classes like bg-background and text-foreground.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      tokens: {
        type: Type.OBJECT,
        description:
          "Partial tokens patch. Keys must be one of the StyleTokenKey values (see types/styleConfig.ts). Values must be non-empty safe CSS strings. Unknown keys are rejected.",
      },
    },
    required: ["tokens"],
  },
};

