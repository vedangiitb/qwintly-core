import { Type } from "@google/genai";

export const ELEMENT_TYPES = [
  "fragment",
  "div",
  "text",
  "image",
  "button",
  "input",
  "textarea",
  "link",
  "icon",
] as const;

// Self-referential schema (children.items -> BuilderElementSchema)
export const BuilderElementSchema: any = {
  type: Type.OBJECT,
  properties: {
    type: {
      type: Type.STRING,
      enum: ELEMENT_TYPES,
    },
    className: {
      type: Type.STRING,
    },
    visible: {
      type: Type.BOOLEAN,
    },
    props: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING },
        src: { type: Type.STRING },
        href: { type: Type.STRING },
        placeholder: { type: Type.STRING },
        name: { type: Type.STRING },
      },
    },
    children: {
      type: Type.ARRAY,
      items: {},
    },
  },
  required: ["type"],
};

BuilderElementSchema.properties.children.items = BuilderElementSchema;

export const InsertElementSchema = {
  name: "insert_element",
  description:
    "Inserts element code. The element should be valid following the BuilderElement schema.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      route: {
        type: Type.STRING,
        description:
          "The route to insert the element at. Example. '/' or '/about' etc.",
      },
      parent_id: {
        type: Type.STRING,
        description: "The parent id to insert the element at.",
      },
      element: {
        ...BuilderElementSchema,
        description: "The element to insert.",
      },
    },
    required: ["route", "parent_id", "element"],
  },
};
