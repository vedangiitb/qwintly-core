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
      cur?.error?.message ??
      cur?.message ??
      cur?.response?.data?.error?.message;

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
