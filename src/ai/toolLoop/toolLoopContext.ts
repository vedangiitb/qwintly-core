import crypto from "node:crypto";

export type ToolEvent = {
  name: string;
  summary: string;
};

export type ToolLoopContextPolicy = {
  readFileDefaultMaxLines?: number;
  tailMessages?: number;
  maxModelChars?: number;
  logApproxModelChars?: boolean;
};

export const DEFAULT_CONTEXT_POLICY: Required<ToolLoopContextPolicy> = {
  readFileDefaultMaxLines: 200,
  tailMessages: 6,
  maxModelChars: 120_000,
  logApproxModelChars: false,
};

const sha256Hex = (value: string) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

const extractPatchFiles = (patchString: string): string[] => {
  const lines = patchString.replace(/\r\n/g, "\n").split("\n");
  const files = new Set<string>();

  for (const line of lines) {
    const match =
      /^\*\*\* (Update File|Add File|Delete File):\s+(.+)$/.exec(line) ??
      /^\*\*\* Move to:\s+(.+)$/.exec(line);

    if (!match) continue;

    const filePath = (match[2] ?? match[1] ?? "").trim();
    if (filePath) files.add(filePath);
  }

  return [...files];
};

export const redactFunctionCallArgs = (
  name: string,
  args: Record<string, unknown>,
) => {
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

  const summarizeElement = (element: any) => {
    if (!element || typeof element !== "object") {
      return { omitted: true, type: typeof element };
    }
    const type =
      typeof (element as any).type === "string" ? (element as any).type : "unknown";
    const className =
      typeof (element as any).className === "string" ? (element as any).className : "";
    const children = Array.isArray((element as any).children)
      ? ((element as any).children as any[])
      : [];
    const text_preview = firstTextPreview(element);
    return {
      omitted: true,
      type,
      className_len: className.length,
      className_preview: className ? truncate(className, 80) : undefined,
      children_count: children.length,
      text_preview,
    };
  };

  if (name === "insert_element") {
    return {
      ...args,
      element: summarizeElement((args as any).element),
    };
  }

  if (name !== "apply_patch") return args;

  const patch = typeof args.patch_string === "string" ? args.patch_string : "";
  if (!patch) {
    return {
      ...args,
      patch_string: { omitted: true, chars: 0, sha256: sha256Hex(""), files: [] },
    };
  }

  return {
    ...args,
    patch_string: {
      omitted: true,
      chars: patch.length,
      sha256: sha256Hex(patch),
      files: extractPatchFiles(patch),
    },
  };
};

const isMemoryMessage = (item: any) => {
  const text = item?.parts?.[0]?.text;
  return (
    item?.role === "model" &&
    typeof text === "string" &&
    text.startsWith("MEMORY (tool trace summary):")
  );
};

const buildMemoryText = (events: ToolEvent[]) => {
  if (events.length === 0) return "";
  const lines = events.map((e) => `- ${e.summary}`);
  return `MEMORY (tool trace summary):\n${lines.join("\n")}`;
};

export const compactForModel = (input: {
  initialCount: number;
  modelContents: any[];
  toolEvents: ToolEvent[];
  policy: Required<ToolLoopContextPolicy>;
}) => {
  const { initialCount, modelContents, toolEvents, policy } = input;

  const withoutOldMemory = modelContents.filter((c) => !isMemoryMessage(c));
  const tailStart = Math.max(
    initialCount,
    withoutOldMemory.length - policy.tailMessages,
  );

  const initial = withoutOldMemory.slice(0, initialCount);
  const tail = withoutOldMemory.slice(tailStart);
  const memoryText = buildMemoryText(toolEvents);
  const memory = memoryText
    ? [{ role: "model", parts: [{ text: memoryText }] }]
    : [];

  let compacted = [...initial, ...memory, ...tail];

  const maxChars = Math.max(10_000, policy.maxModelChars);
  while (JSON.stringify(compacted).length > maxChars) {
    const minLen = initial.length + memory.length + 1;
    if (compacted.length <= minLen) break;
    compacted = [
      ...initial,
      ...memory,
      ...compacted.slice(initial.length + memory.length + 1),
    ];
  }

  return compacted;
};

export const normalizeReadFileArgs = (
  args: Record<string, unknown>,
  maxLines: number,
) => {
  const requestedStart =
    args.start_line === undefined || args.start_line === null
      ? 1
      : Number(args.start_line);

  const requestedEnd =
    args.end_line === undefined || args.end_line === null
      ? undefined
      : Number(args.end_line);

  const start =
    Number.isFinite(requestedStart) && requestedStart > 0 ? requestedStart : 1;
  const cap = Math.max(1, Math.floor(maxLines));

  const desiredEnd =
    requestedEnd === undefined ||
    !Number.isFinite(requestedEnd) ||
    requestedEnd < start
      ? start + cap - 1
      : requestedEnd;

  const cappedEnd = Math.min(desiredEnd, start + cap - 1);
  const wasCapped =
    requestedEnd === undefined ||
    desiredEnd !== requestedEnd ||
    cappedEnd !== desiredEnd;

  return {
    effectiveArgs: { ...args, start_line: start, end_line: cappedEnd },
    start,
    end: cappedEnd,
    wasCapped,
  };
};

export const getApplyPatchEventMeta = (args: Record<string, unknown>) => {
  const patch = typeof args.patch_string === "string" ? args.patch_string : "";
  return {
    chars: patch.length,
    sha256: sha256Hex(patch),
    files: extractPatchFiles(patch),
  };
};
