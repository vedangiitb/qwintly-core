import { Type } from "@google/genai";

export const UpdatePropsSchema = {
  name: "update_element",
  description: "Updates element code.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      route: {
        type: Type.STRING,
        description:
          "The route to update the element at. Example. '/' or '/about' etc.",
      },
      element_id: {
        type: Type.STRING,
        description: "The id of the element to be updated.",
      },
      text: { type: Type.STRING },
      src: { type: Type.STRING },
      href: { type: Type.STRING },
      placeholder: { type: Type.STRING },
      name: { type: Type.STRING },
    },
    required: ["route","element_id"],
  },
};
