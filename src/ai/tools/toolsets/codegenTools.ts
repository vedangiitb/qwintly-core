import { Tool } from "@google/genai";
import { ReadFileSchema } from "../schemas/readFile.schema.js";
import { SubmitCodegenDoneSchema } from "../schemas/submitCodegenDone.schema.js";
import { CreateNewRouteSchema } from "../schemas/createNewRoute.schema.js";
import { ModifyElementSchema } from "../schemas/modifyElement.schema.js";
import { UpdateGlobalStylesSchema } from "../schemas/updateGlobalStyles.schema.js";
import { GetAvailableRoutesSchema } from "../schemas/getAvailableRoutes.schema.js";
import { ModifyStateSchema } from "../schemas/modifyState.schema.js";
import { ModifyComponentSchema } from "../schemas/modifyComponent.schema.js";

export const codegenTools = (): Tool[] => {
  return [
    {
      functionDeclarations: [
        ReadFileSchema,
        GetAvailableRoutesSchema,
        CreateNewRouteSchema,
        ModifyElementSchema,
        UpdateGlobalStylesSchema,
        ModifyStateSchema,
        ModifyComponentSchema,
        SubmitCodegenDoneSchema,
      ],
    },
  ];
};
