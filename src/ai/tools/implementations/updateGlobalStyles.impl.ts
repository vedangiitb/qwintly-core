import path from "node:path";
import { toWorkspacePath } from "../helpers/fileSystem.helpers.js";
import { writeFileAtomic } from "../helpers/pageConfigJson.helpers.js";
import {
  assertStyleConfig,
  defaultStyleConfigJson,
  type StyleConfig,
  type StyleTokenKey,
} from "../../../types/styleConfig.js";
import { type WorkspaceDeps } from "./workspaceDeps.js";
import { UpdateGlobalStylesArgsZod } from "../validators/updateGlobalStyles.zod.js";

const STYLE_CONFIG_REL_PATH = path.posix.join("app", "styleConfig.json");

const parseStyleConfigOrDefault = (raw: string): StyleConfig => {
  try {
    const parsed = JSON.parse(String(raw ?? ""));
    return assertStyleConfig(parsed);
  } catch {
    return assertStyleConfig(defaultStyleConfigJson);
  }
};

export const createUpdateGlobalStylesImpl = (deps: WorkspaceDeps) => {
  const { workspaceRoot, fs } = deps;

  return async (rawArgs: unknown) => {
    const normalizedArgs: unknown = (() => {
      if (typeof rawArgs !== "string") return rawArgs;
      try {
        return JSON.parse(rawArgs);
      } catch {
        return rawArgs;
      }
    })();

    const parsed = UpdateGlobalStylesArgsZod.safeParse(normalizedArgs);
    if (!parsed.success) {
      return {
        success: false,
        error: "invalid args",
        error_detail: parsed.error.flatten(),
      };
    }

    const tokensPatch = parsed.data as Partial<Record<StyleTokenKey, string>>;

    const configPath = toWorkspacePath(workspaceRoot, STYLE_CONFIG_REL_PATH);

    let beforeConfig: StyleConfig;
    let existed = true;
    try {
      const raw = await fs.readFile(configPath);
      beforeConfig = parseStyleConfigOrDefault(raw);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code !== "ENOENT") {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      existed = false;
      beforeConfig = assertStyleConfig(defaultStyleConfigJson);
    }

    const merged: StyleConfig = {
      version: beforeConfig.version,
      tokens: {
        ...beforeConfig.tokens,
        ...(tokensPatch as Partial<Record<StyleTokenKey, string>>),
      } as any,
    };

    let validated: StyleConfig;
    try {
      validated = assertStyleConfig(merged);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const nextVersion = Number.isFinite(validated.version)
      ? validated.version + 1
      : 1;
    const afterConfig: StyleConfig = { ...validated, version: nextVersion };

    const after = JSON.stringify(afterConfig, null, 2) + "\n";
    try {
      await writeFileAtomic(configPath, after);
      return {
        success: true,
        changed: true,
        file: STYLE_CONFIG_REL_PATH,
        version: nextVersion,
        created: !existed,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
};
