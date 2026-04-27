import path from "node:path";
import { toWorkspacePath } from "../helpers/fileSystem.helpers.js";
import { type WorkspaceDeps } from "./workspaceDeps.js";

export const createWriteFileImpl = (deps: WorkspaceDeps) => {
  const { workspaceRoot, fs, logger } = deps;

  return async (filePath: string, content: string) => {
    const fullPath = toWorkspacePath(workspaceRoot, filePath);
    logger?.info?.("Tool write_file", { path: fullPath });

    await fs.mkdirp(path.dirname(fullPath));
    await fs.writeFile(fullPath, content ?? "");
    return { ok: true };
  };
};
