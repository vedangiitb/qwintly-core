import type { WorkspaceDeps } from "./workspaceDeps.js";
import { toWorkspacePath } from "../helpers/fileSystem.helpers.js";
import { loadAndPreparePageConfig, writeFileAtomic } from "../helpers/pageConfigJson.helpers.js";

export const createModifyComponentImpl = (deps: WorkspaceDeps) => {
  const { workspaceRoot, fs } = deps;

  return async (args: Record<string, unknown>) => {
    const route = String(args.route ?? "/");
    const scope = String(args.scope ?? "page");
    const action = String(args.action ?? "upsert");
    const componentId = String(args.component_id ?? "");

    if (!componentId) {
      return { success: false, error: "Missing 'component_id'" };
    }

    if (scope === "global") {
      const globalPath = toWorkspacePath(workspaceRoot, "app/globalConfig.json");
      let globalConfig: any = { state: {}, components: {} };

      try {
        const fileContent = await fs.readFile(globalPath);
        globalConfig = JSON.parse(fileContent);
      } catch (err) {
        // If file doesn't exist, we will initialize it.
      }

      if (!globalConfig.components) globalConfig.components = {};

      if (action === "upsert") {
        const element = args.element;
        if (!element || typeof element !== "object") {
          return { success: false, error: "Missing or invalid 'element' for action 'upsert'" };
        }
        globalConfig.components[componentId] = { element };
      } else if (action === "delete") {
        delete globalConfig.components[componentId];
      }

      try {
        await writeFileAtomic(globalPath, JSON.stringify(globalConfig, null, 2) + "\n");
        return { success: true, changed: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      // page scope
      const prep = await loadAndPreparePageConfig(workspaceRoot, route, fs);
      if (!prep.success) return prep;

      const { configPath, elements, idMap } = prep;
      
      let rawConfig: any = {};
      try {
        const rawContent = await fs.readFile(configPath);
        rawConfig = JSON.parse(rawContent);
      } catch (err) {
        return { success: false, error: "Failed to read pageConfig.json" };
      }

      if (!rawConfig.components) rawConfig.components = {};

      if (action === "upsert") {
        const element = args.element;
        if (!element || typeof element !== "object") {
          return { success: false, error: "Missing or invalid 'element' for action 'upsert'" };
        }
        rawConfig.components[componentId] = { element };
      } else if (action === "delete") {
        delete rawConfig.components[componentId];
      }

      rawConfig.elements = elements;
      rawConfig.idMap = idMap;

      try {
        await writeFileAtomic(configPath, JSON.stringify(rawConfig, null, 2) + "\n");
        return { success: true, changed: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  };
};
