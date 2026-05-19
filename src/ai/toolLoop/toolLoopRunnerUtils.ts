import { FunctionCallingConfigMode, Tool } from "@google/genai";
import { EVENT_TYPES } from "../../types/events.js";
import { getApplyPatchEventMeta, ToolEvent } from "./toolLoopContext.js";
import { AiCallFn, Logger } from "./toolLoopRunner.js";

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
  const anyErr = err as any;

  const code =
    anyErr?.error?.code ??
    anyErr?.code ??
    anyErr?.statusCode ??
    anyErr?.response?.status;

  const status =
    anyErr?.error?.status ??
    anyErr?.status ??
    anyErr?.response?.data?.error?.status;

  const message =
    anyErr?.error?.message ??
    anyErr?.message ??
    anyErr?.response?.data?.error?.message;

  const msg = typeof message === "string" ? message.toLowerCase() : "";
  const stat = typeof status === "string" ? status.toUpperCase() : "";

  if (code === 503) return true;
  if (code === 429) return true;
  if (stat === "UNAVAILABLE") return true;
  if (stat === "RESOURCE_EXHAUSTED") return true;
  if (msg.includes("high demand")) return true;
  if (msg.includes("try again later")) return true;
  if (msg.includes("temporar")) return true;

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
) => {
  if (name === "read_file" && readFileMeta) {
    return `AI tool: read_file (${readFileMeta.start}-${readFileMeta.end}${
      readFileMeta.wasCapped ? ", capped" : ""
    })`;
  }

  if (name === "apply_patch") {
    const meta = getApplyPatchEventMeta(effectiveArgs);
    const files = Array.isArray(meta.files) ? meta.files.length : 0;
    return `AI tool: apply_patch (${files} file${files === 1 ? "" : "s"})`;
  }

  if (name === "search") return "AI tool: search";
  if (name === "list_dir") return "AI tool: list_dir";
  if (name === "write_file") return "AI tool: write_file";
  if (name === "submit_planner_tasks") return "AI tool: submit_planner_tasks";
  if (name === "submit_codegen_done") return "AI tool: submit_codegen_done";

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
    const truncate = (value: string, max: number) => {
      const v = String(value ?? "");
      if (v.length <= max) return v;
      if (max <= 3) return "...".slice(0, Math.max(0, max));
      return v.slice(0, Math.max(0, max - 3)) + "...";
    };

    const firstTextPreview = (element: any): string | undefined => {
      try {
        if (!element || typeof element !== "object") return undefined;
        if (element.type === "text") {
          const t = element?.props?.text;
          if (typeof t === "string" && t.trim()) return truncate(t.trim(), 80);
        }
        const children = element.children;
        if (!Array.isArray(children)) return undefined;
        for (const child of children) {
          const preview = firstTextPreview(child);
          if (preview) return preview;
        }
        return undefined;
      } catch {
        return undefined;
      }
    };

    const summarizeElementSig = (element: any) => {
      if (!element || typeof element !== "object") {
        return { type: typeof element, children: 0 };
      }
      const type =
        typeof (element as any).type === "string" ? (element as any).type : "unknown";
      const className =
        typeof (element as any).className === "string" ? (element as any).className : "";
      const children = Array.isArray((element as any).children)
        ? ((element as any).children as any[])
        : [];
      const text = firstTextPreview(element);
      return {
        type,
        className: className ? truncate(className, 80) : undefined,
        children: children.length,
        text,
      };
    };

    if (name === "insert_element") {
      const route = String((effectiveArgs as any)?.route ?? "");
      const parent = String((effectiveArgs as any)?.parent_id ?? "");
      const sig = summarizeElementSig((effectiveArgs as any)?.element);
      const successVal = (toolResult as any)?.success;
      const insertedId = String((toolResult as any)?.inserted_id ?? "");
      const base = `insert_element route=${route || "?"} parent=${parent || "?"}`;
      if (successVal === true) {
        const parts = [
          base,
          insertedId ? `inserted_id=${insertedId}` : "",
          sig.type ? `type=${sig.type}` : "",
          typeof sig.className === "string" ? `class="${sig.className}"` : "",
          Number.isFinite(sig.children) ? `children=${sig.children}` : "",
          typeof sig.text === "string" ? `text="${sig.text}"` : "",
        ].filter(Boolean);
        toolEvents.push({ name, summary: parts.join(" ") });
      } else if (successVal === false) {
        const err = (toolResult as any)?.error;
        toolEvents.push({
          name,
          summary: `${base} failure error=${JSON.stringify(err ?? "unknown")}`,
        });
      } else {
        toolEvents.push({ name, summary: base });
      }
      return;
    }

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
          ? ` error=${JSON.stringify((toolResult as any)?.error ?? "unknown")}`
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
