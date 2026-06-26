import { Type } from "@google/genai";

export const ModifyComponentSchema = {
  name: "modify_component",
  description:
    "Modifies component templates in page-local config (pageConfig.json) or global config (globalConfig.json). Supports defining/updating components or deleting components.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      route: {
        type: Type.STRING,
        pattern: String.raw`^(?:/(?:[A-Za-z0-9_.[\\\]-]+(?:/[A-Za-z0-9_.[\\\]-]+)*)?|[A-Za-z0-9_.[\\\]-]+(?:/[A-Za-z0-9_.[\\\]-]+)*)$`,
        description:
          "The route of the page config to modify. Required even if modifying global scope (to locate the workspace path, e.g. '/' or '/about').",
      },
      scope: {
        type: Type.STRING,
        enum: ["page", "global"],
        description: "The scope of the component to modify: 'page' (local config) or 'global' (globalConfig.json).",
      },
      action: {
        type: Type.STRING,
        enum: ["upsert", "delete"],
        description: "The action to perform: 'upsert' (to add or update the component) or 'delete' (to remove it).",
      },
      component_id: {
        type: Type.STRING,
        description: "The ID/name of the component to define or delete (e.g. 'Header', 'Footer', 'StatCard').",
      },
      element: {
        type: Type.OBJECT,
        description: "Required for 'upsert'. The root BuilderElement tree of the component template.",
      },
    },
    required: ["route", "scope", "action", "component_id"],
  },
};
