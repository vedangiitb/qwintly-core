import { Type } from "@google/genai";

export const ModifyStateSchema = {
  name: "modify_state",
  description:
    "Modifies states in page-local config (pageConfig.json) or global config (globalConfig.json). Supports adding/updating state variables or deleting state variables.",
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
        description: "The scope of the state to modify: 'page' (local config) or 'global' (globalConfig.json).",
      },
      action: {
        type: Type.STRING,
        enum: ["update", "delete"],
        description: "The action to perform: 'update' (to add or update keys) or 'delete' (to remove a key).",
      },
      state: {
        type: Type.OBJECT,
        description: "Required for 'update'. Key-value pairs of state variables to add/update (e.g. {'counter': 10, 'showMenu': false}).",
      },
      key: {
        type: Type.STRING,
        description: "Required for 'delete'. The key of the state variable to delete.",
      },
    },
    required: ["route", "scope", "action"],
  },
};
