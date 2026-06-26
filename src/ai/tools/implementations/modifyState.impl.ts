import type { WorkspaceDeps } from "./workspaceDeps.js";
import { toWorkspacePath } from "../helpers/fileSystem.helpers.js";
import { loadAndPreparePageConfig, writeFileAtomic } from "../helpers/pageConfigJson.helpers.js";

export const createModifyStateImpl = (deps: WorkspaceDeps) => {
  const { workspaceRoot, fs } = deps;

  return async (args: Record<string, unknown>) => {
    const route = String(args.route ?? "/");
    const scope = String(args.scope ?? "page");
    const action = String(args.action ?? "update");

    if (scope === "global") {
      const globalPath = toWorkspacePath(workspaceRoot, "app/globalConfig.json");
      let globalConfig: any = { state: {}, components: {} };

      try {
        const fileContent = await fs.readFile(globalPath);
        globalConfig = JSON.parse(fileContent);
      } catch (err) {
        // If file doesn't exist, we will initialize it.
      }

      if (!globalConfig.state) globalConfig.state = {};

      if (action === "update") {
        const statePayload = args.state as Record<string, any> | undefined;
        if (!statePayload || typeof statePayload !== "object") {
          return { success: false, error: "Missing or invalid 'state' object for action 'update'" };
        }
        Object.assign(globalConfig.state, statePayload);
      } else if (action === "delete") {
        const key = String(args.key ?? "");
        if (!key) return { success: false, error: "Missing 'key' for action 'delete'" };
        delete globalConfig.state[key];
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

      if (!rawConfig.state) rawConfig.state = {};

      if (action === "update") {
        const statePayload = args.state as Record<string, any> | undefined;
        if (!statePayload || typeof statePayload !== "object") {
          return { success: false, error: "Missing or invalid 'state' object for action 'update'" };
        }
        Object.assign(rawConfig.state, statePayload);
      } else if (action === "delete") {
        const key = String(args.key ?? "");
        if (!key) return { success: false, error: "Missing 'key' for action 'delete'" };
        delete rawConfig.state[key];
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
