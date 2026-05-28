import { isPlainObject } from "../../../utils/utils.js";
import { normalizeReadFileArgs } from "./readFile.helpers.js";

export function normalizeToolArgs(
  name: string,
  args: Record<string, unknown>,
  options: {
    readFileDefaultMaxLines: number;
    styleTokenKeySet: Set<string>;
  }
): {
  effectiveArgs: Record<string, unknown>;
  readFileMeta: {
    start: number;
    end: number;
    wasCapped: boolean;
  } | null;
} {
  let effectiveArgs: Record<string, unknown> = args;
  let readFileMeta: {
    start: number;
    end: number;
    wasCapped: boolean;
  } | null = null;

  if (name === "read_file") {
    const normalized = normalizeReadFileArgs(
      effectiveArgs,
      options.readFileDefaultMaxLines,
    );
    effectiveArgs = normalized.effectiveArgs;
    readFileMeta = {
      start: normalized.start,
      end: normalized.end,
      wasCapped: normalized.wasCapped,
    };
  }

  if (name === "update_global_styles") {
    const tokensMaybe = (effectiveArgs as any)?.tokens;
    const normalized: Record<string, unknown> = {};

    if (isPlainObject(tokensMaybe)) {
      for (const [k, v] of Object.entries(tokensMaybe)) {
        if (!options.styleTokenKeySet.has(k)) continue;
        if (typeof v !== "string") continue;
        normalized[k] = v;
      }
    }

    for (const [k, v] of Object.entries(effectiveArgs ?? {})) {
      if (!options.styleTokenKeySet.has(k)) continue;
      if (typeof v !== "string") continue;
      normalized[k] = v;
    }

    effectiveArgs = normalized;
  }

  return { effectiveArgs, readFileMeta };
}
