import { FunctionCallingConfigMode, Tool } from "@google/genai";
import { EVENT_TYPES } from "../../types/events.js";
import { getApplyPatchEventMeta, ToolEvent } from "./toolLoopContext.js";
import { AiCallFn, Logger } from "./toolLoopRunner.js";
import { STYLE_TOKEN_KEYS } from "../../types/styleConfig.js";

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

export const serializeError = (err: unknown) => {
  if (err instanceof Error) {
    const cause = (err as any).cause as unknown;
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause:
        cause instanceof Error
          ? {
              name: cause.name,
              message: cause.message,
              stack: cause.stack,
            }
          : cause,
    };
  }

  return {
    name: typeof err,
    message: typeof err === "string" ? err : "Non-Error thrown",
    value: err,
  };
};

export const isTransientAiCallError = (err: unknown) => {
  let cur: any = err as any;
  for (let depth = 0; depth < 4 && cur; depth++) {
    const code =
      cur?.error?.code ?? cur?.code ?? cur?.statusCode ?? cur?.response?.status;

    const status =
      cur?.error?.status ?? cur?.status ?? cur?.response?.data?.error?.status;

    const message =
      cur?.error?.message ?? cur?.message ?? cur?.response?.data?.error?.message;

    const msg = typeof message === "string" ? message.toLowerCase() : "";
    const stat = typeof status === "string" ? status.toUpperCase() : "";

    if (code === 503) return true;
    if (code === 429) return true;
    if (stat === "UNAVAILABLE") return true;
    if (stat === "RESOURCE_EXHAUSTED") return true;
    if (msg.includes("high demand")) return true;
    if (msg.includes("try again later")) return true;
    if (msg.includes("temporar")) return true;

    cur = cur?.cause;
  }

  return false;
};

export const computeBackoffMs = (
  attempt: number,
  baseMs: number,
  maxMs: number,
) => {
  const exp = baseMs * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(maxMs, exp);
  const jitter = capped * (0.2 * Math.random());
  return Math.round(capped + jitter);
};

export const aiCallWithRetry = async (params: {
  aiCall: AiCallFn;
  request: unknown;
  options: { tools?: Tool[]; toolCallingMode?: FunctionCallingConfigMode };
  retryMax: number;
  retryBaseMs: number;
  retryMaxMs: number;
  step: number;
  logger: Logger;
}) => {
  const {
    aiCall,
    request,
    options,
    retryMax,
    retryBaseMs,
    retryMaxMs,
    logger,
  } = params;

  let retryCount = 0;
  while (true) {
    try {
      return await aiCall(request, options);
    } catch (err) {
      const transient = isTransientAiCallError(err);
      if (!transient || retryMax <= 0 || retryCount >= retryMax) {
        throw err;
      }

      retryCount += 1;
      const delayMs = computeBackoffMs(retryCount, retryBaseMs, retryMaxMs);
      logger("Tool loop: aiCall failed; retrying", EVENT_TYPES.STEP_RETRY);
      await sleep(delayMs);
    }
  }
};

export const buildToolStatusMessage = (
  name: string,
  effectiveArgs: Record<string, unknown>,
  readFileMeta: { start: number; end: number; wasCapped: boolean } | null,
): string => {
  if (name === "read_file") {
    const path = typeof effectiveArgs.path === "string" ? effectiveArgs.path : "";
    if (readFileMeta) {
      return `AI tool: Reading file "${path}" (lines ${readFileMeta.start}-${readFileMeta.end}${
        readFileMeta.wasCapped ? ", capped" : ""
      })`;
    }
    const start = effectiveArgs.start_line !== undefined ? Number(effectiveArgs.start_line) : 1;
    const end = effectiveArgs.end_line !== undefined ? Number(effectiveArgs.end_line) : undefined;
    const lines = end !== undefined ? `lines ${start}-${end}` : `starting at line ${start}`;
    return `AI tool: Reading file "${path}" (${lines})`;
  }

  if (name === "write_file") {
    const path = typeof effectiveArgs.path === "string" ? effectiveArgs.path : "";
    return `AI tool: Writing file "${path}"`;
  }

  if (name === "apply_patch") {
    const meta = getApplyPatchEventMeta(effectiveArgs);
    const files = Array.isArray(meta.files) ? meta.files : [];
    if (files.length === 0) {
      return "AI tool: Applying patch";
    }
    if (files.length <= 3) {
      return `AI tool: Applying changes to "${files.join(", ")}"`;
    }
    return `AI tool: Applying changes to ${files.length} files: "${files.slice(0, 3).join(", ")}" (+${files.length - 3} more)`;
  }

  if (name === "search") {
    const query = typeof effectiveArgs.search_query === "string" ? effectiveArgs.search_query : "";
    return query ? `AI tool: Searching workspace for "${query}"` : "AI tool: Searching workspace";
  }

  if (name === "list_dir") {
    const path = typeof effectiveArgs.path === "string" ? effectiveArgs.path : "";
    const depth = effectiveArgs.depth !== undefined ? Number(effectiveArgs.depth) : 1;
    return `AI tool: Listing contents of directory "${path}" (depth: ${depth})`;
  }

  if (name === "update_global_styles") {
    const keys = Object.keys(effectiveArgs);
    return keys.length > 0
      ? `AI tool: Updating global styles (${keys.join(", ")})`
      : "AI tool: Updating global styles";
  }

  if (name === "create_new_route") {
    const route = typeof effectiveArgs.route_name === "string" ? effectiveArgs.route_name : "";
    const parent = typeof effectiveArgs.parent_route === "string" ? effectiveArgs.parent_route : "/";
    return `AI tool: Creating new route "${route}" (parent: "${parent}")`;
  }

  if (name === "delete_element") {
    const route = typeof effectiveArgs.route === "string" ? effectiveArgs.route : "";
    const id = typeof effectiveArgs.element_id === "string" ? effectiveArgs.element_id : "";
    return `AI tool: Deleting element "${id}" from route "${route}"`;
  }

  if (name === "insert_element") {
    const route = typeof effectiveArgs.route === "string" ? effectiveArgs.route : "";
    const parent = typeof effectiveArgs.parent_id === "string" ? effectiveArgs.parent_id : "";
    const before = typeof effectiveArgs.before_id === "string" ? effectiveArgs.before_id : "";
    const beforeStr = before ? `, before "${before}"` : "";
    return `AI tool: Inserting element into route "${route}" (under parent "${parent}"${beforeStr})`;
  }

  if (name === "update_props") {
    const route = typeof effectiveArgs.route === "string" ? effectiveArgs.route : "";
    const id = typeof effectiveArgs.element_id === "string" ? effectiveArgs.element_id : "";
    return `AI tool: Updating properties for element "${id}" on route "${route}"`;
  }

  if (name === "update_classname") {
    const route = typeof effectiveArgs.route === "string" ? effectiveArgs.route : "";
    const id = typeof effectiveArgs.element_id === "string" ? effectiveArgs.element_id : "";
    const className = typeof effectiveArgs.class_name === "string" ? effectiveArgs.class_name : "";
    const classNameStr = className ? ` to "${className}"` : "";
    return `AI tool: Updating class name for element "${id}" on route "${route}"${classNameStr}`;
  }

  if (name === "get_available_routes") {
    return "AI tool: Retrieving available routes";
  }

  if (name === "submit_planner_tasks") {
    return "AI tool: Submitting planner tasks";
  }

  if (name === "submit_codegen_done") {
    const summary = typeof effectiveArgs.summary === "string" ? effectiveArgs.summary : "";
    return summary ? `AI tool: Submitting completed work: "${summary}"` : "AI tool: Submitting completed work";
  }

  return `AI tool: ${name}`;
};

export const recordToolEvent = (params: {
  toolEvents: ToolEvent[];
  name: string;
  effectiveArgs: Record<string, unknown>;
  modelArgs: Record<string, unknown>;
  readFileMeta: { start: number; end: number; wasCapped: boolean } | null;
  toolResult: unknown;
  toolResultRaw: unknown;
}) => {
  const oneLine = (value: unknown, maxLen = 140) => {
    const raw =
      typeof value === "string"
        ? value
        : value === undefined
          ? ""
          : value === null
            ? "null"
            : JSON.stringify(value);
    const collapsed = raw.replace(/\s+/g, " ").trim();
    if (collapsed.length <= maxLen) return collapsed;
    return `${collapsed.slice(0, Math.max(0, maxLen - 1))}…`;
  };

  const getStringArg = (key: string) => oneLine(params.effectiveArgs[key] ?? "");

  const {
    toolEvents,
    name,
    effectiveArgs,
    modelArgs,
    readFileMeta,
    toolResult,
    toolResultRaw,
  } = params;

  try {
    if (name === "read_file") {
      const path = String(effectiveArgs.path ?? "");
      const start =
        readFileMeta?.start ?? Number(effectiveArgs.start_line ?? 1);
      const end = readFileMeta?.end ?? Number(effectiveArgs.end_line ?? start);
      toolEvents.push({
        name,
        summary: `read_file ${path}:${start}-${end}${readFileMeta?.wasCapped ? " (capped)" : ""}`,
      });
      return;
    }

    if (name === "apply_patch") {
      const meta =
        typeof (modelArgs as any).patch_string === "object"
          ? ((modelArgs as any).patch_string as any)
          : null;
      const fallback = getApplyPatchEventMeta(effectiveArgs);
      const ok =
        (toolResult as any)?.success === true
          ? "success"
          : (toolResult as any)?.success === false
            ? "failure"
            : "done";
      toolEvents.push({
        name,
        summary: `apply_patch files=${JSON.stringify(meta?.files ?? fallback.files)} sha256=${String(meta?.sha256 ?? fallback.sha256).slice(0, 12)} chars=${meta?.chars ?? fallback.chars} result=${ok}`,
      });
      return;
    }

    if (name === "create_new_route") {
      const parentRoute = getStringArg("parent_route") || "/";
      const routeName = getStringArg("route_name");
      const successVal = (toolResult as any)?.success;
      if (typeof successVal === "boolean") {
        const route = oneLine((toolResult as any)?.route ?? "");
        const createdFiles = Array.isArray((toolResult as any)?.created_files)
          ? ((toolResult as any).created_files as unknown[])
          : [];
        const filesText =
          successVal === true
            ? ` created_files=${createdFiles.length}`
            : "";
        const routeText = route ? ` route=${route}` : "";
        const errText =
          successVal === false
            ? ` error=${oneLine((toolResult as any)?.error ?? "unknown", 160)}`
            : "";
        toolEvents.push({
          name,
          summary: `create_new_route ${successVal ? "success" : "failure"} parent_route=${parentRoute} route_name=${routeName}${routeText}${filesText}${errText}`,
        });
        return;
      }
    }

    if (name === "insert_element") {
      const route = getStringArg("route");
      const parentId = getStringArg("parent_id");
      const beforeId = getStringArg("before_id");
      const successVal = (toolResult as any)?.success;
      if (typeof successVal === "boolean") {
        const insertedId = oneLine((toolResult as any)?.inserted_id ?? "");
        const changedVal = (toolResult as any)?.changed;
        const changedText =
          typeof changedVal === "boolean" ? ` changed=${changedVal}` : "";
        const beforeText = beforeId ? ` before_id=${beforeId}` : "";
        const insertedText = insertedId ? ` inserted_id=${insertedId}` : "";
        const errText =
          successVal === false
            ? ` error=${oneLine((toolResult as any)?.error ?? "unknown", 160)}`
            : "";
        toolEvents.push({
          name,
          summary: `insert_element ${successVal ? "success" : "failure"} route=${route} parent_id=${parentId}${beforeText}${insertedText}${changedText}${errText}`,
        });
        return;
      }
    }

    if (name === "update_classname") {
      const route = getStringArg("route");
      const elementId = getStringArg("element_id");
      const className = oneLine(effectiveArgs.className ?? "", 160);
      const successVal = (toolResult as any)?.success;
      if (typeof successVal === "boolean") {
        const changedVal = (toolResult as any)?.changed;
        const changedText =
          typeof changedVal === "boolean" ? ` changed=${changedVal}` : "";
        const updatedId = oneLine((toolResult as any)?.updated_id ?? "");
        const updatedText = updatedId ? ` updated_id=${updatedId}` : "";
        const errText =
          successVal === false
            ? ` error=${oneLine((toolResult as any)?.error ?? "unknown", 160)}`
            : "";
        toolEvents.push({
          name,
          summary: `update_classname ${successVal ? "success" : "failure"} route=${route} element_id=${elementId} className="${className}"${updatedText}${changedText}${errText}`,
        });
        return;
      }
    }

    if (name === "update_props") {
      const route = getStringArg("route");
      const elementId = getStringArg("element_id");
      const successVal = (toolResult as any)?.success;
      if (typeof successVal === "boolean") {
        const changedVal = (toolResult as any)?.changed;
        const changedText =
          typeof changedVal === "boolean" ? ` changed=${changedVal}` : "";
        const updatedId = oneLine((toolResult as any)?.updated_id ?? "");
        const updatedText = updatedId ? ` updated_id=${updatedId}` : "";
        const patchKeys = Object.keys(effectiveArgs ?? {}).filter((k) => {
          if (k === "route" || k === "element_id") return false;
          const v = (effectiveArgs as any)[k];
          return v !== undefined && v !== null;
        });
        const keysText =
          patchKeys.length > 0
            ? ` keys=${oneLine(patchKeys.sort().join(","), 140)}`
            : "";
        const errText =
          successVal === false
            ? ` error=${oneLine((toolResult as any)?.error ?? "unknown", 160)}`
            : "";
        toolEvents.push({
          name,
          summary: `update_props ${successVal ? "success" : "failure"} route=${route} element_id=${elementId}${keysText}${updatedText}${changedText}${errText}`,
        });
        return;
      }
    }

    if (name === "update_global_styles") {
      const tokenKeySet = new Set<string>(STYLE_TOKEN_KEYS as unknown as string[]);
      const tokenKeys =
        Object.keys(effectiveArgs ?? {}).filter((k) => tokenKeySet.has(k));
      const successVal = (toolResult as any)?.success;
      if (typeof successVal === "boolean") {
        const changedVal = (toolResult as any)?.changed;
        const changedText =
          typeof changedVal === "boolean" ? ` changed=${changedVal}` : "";
        const version = (toolResult as any)?.version;
        const versionText =
          typeof version === "number" && Number.isFinite(version)
            ? ` version=${version}`
            : "";
        const created = (toolResult as any)?.created;
        const createdText =
          typeof created === "boolean" ? ` created=${created}` : "";
        const keysText =
          tokenKeys.length > 0
            ? ` tokens=${oneLine(tokenKeys.sort().join(","), 160)}`
            : "";
        const errText =
          successVal === false
            ? ` error=${oneLine((toolResult as any)?.error ?? "unknown", 160)}`
            : "";
        toolEvents.push({
          name,
          summary: `update_global_styles ${successVal ? "success" : "failure"}${keysText}${versionText}${createdText}${changedText}${errText}`,
        });
        return;
      }
    }

    if (name === "search") {
      const q = String(effectiveArgs.search_query ?? "").trim();
      const results = Array.isArray((toolResultRaw as any)?.results)
        ? (toolResultRaw as any).results
        : [];
      toolEvents.push({
        name,
        summary: `search "${q}" -> ${results.length} results`,
      });
      return;
    }

    if (name === "list_dir") {
      const p = String(effectiveArgs.path ?? "");
      const d = Number(effectiveArgs.depth ?? 1);
      toolEvents.push({ name, summary: `list_dir ${p} depth=${d}` });
      return;
    }

    if (name === "create_file") {
      const p = String(effectiveArgs.path ?? "");
      toolEvents.push({ name, summary: `create_file ${p}` });
      return;
    }

    if (name === "delete_file") {
      const p = String(effectiveArgs.path ?? "");
      toolEvents.push({ name, summary: `delete_file ${p}` });
      return;
    }

    const successVal = (toolResult as any)?.success;
    if (typeof successVal === "boolean") {
      const changedVal = (toolResult as any)?.changed;
      const changedText = typeof changedVal === "boolean" ? ` changed=${changedVal}` : "";
      const errText =
        successVal === false
          ? ` error=${oneLine((toolResult as any)?.error ?? "unknown", 160)}`
          : "";
      toolEvents.push({
        name,
        summary: `${name} ${successVal ? "success" : "failure"}${changedText}${errText}`,
      });
      return;
    }

    toolEvents.push({ name, summary: `${name} called` });
  } catch {
    toolEvents.push({ name, summary: `${name} called` });
  }
};
