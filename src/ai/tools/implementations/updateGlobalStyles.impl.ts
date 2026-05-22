import path from "node:path";
import { toWorkspacePath } from "../helpers/fileSystem.helpers.js";
import { writeFileAtomic } from "../helpers/pageConfigJson.helpers.js";
import {
  assertStyleConfig,
  defaultStyleConfigJson,
  type StyleConfig,
  type StyleTokenKey,
  STYLE_TOKEN_KEYS,
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractTokenPatch = (raw: unknown): Partial<Record<StyleTokenKey, string>> => {
  const allowed = new Set<string>(STYLE_TOKEN_KEYS as unknown as string[]);
  const out: Record<string, string> = {};

  if (!isPlainObject(raw)) return out as any;

  // Some callers may accidentally wrap args as { args: {...} } or { tokens: {...} }.
  const maybeArgs = isPlainObject((raw as any).args) ? ((raw as any).args as any) : null;
  const maybeTokens = isPlainObject((raw as any).tokens) ? ((raw as any).tokens as any) : null;

  const sources: Array<Record<string, unknown>> = [
    raw as Record<string, unknown>,
    ...(maybeArgs ? [maybeArgs as Record<string, unknown>] : []),
    ...(maybeTokens ? [maybeTokens as Record<string, unknown>] : []),
  ];

  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) {
      if (!allowed.has(k)) continue;
      if (typeof v !== "string") continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      out[k] = trimmed;
    }
  }

  return out as any;
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

    // First try strict-ish validation, but fall back to extraction so valid tool calls
    // don't fail due to extra wrapper keys like {tokens:{...}} or {args:{...}}.
    const parsed = UpdateGlobalStylesArgsZod.safeParse(normalizedArgs);
    const tokensPatch =
      parsed.success
        ? (parsed.data as Partial<Record<StyleTokenKey, string>>)
        : extractTokenPatch(normalizedArgs);

    if (!tokensPatch || Object.keys(tokensPatch).length === 0) {
      return {
        success: false,
        error: "invalid args",
        error_detail: parsed.success ? undefined : parsed.error.flatten(),
        note: "update_global_styles requires at least one valid token key/value (e.g. { primary: \"oklch(...)\" }).",
      };
    }

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
