import assert from "node:assert/strict";
import test from "node:test";
import { runToolLoop } from "./toolLoopRunner.js";

test("runToolLoop: logger metadata is passed (approx chars + retry info)", async () => {
  const infoCalls: Array<{ msg: string; meta: any }> = [];
  const warnCalls: Array<{ msg: string; meta: any }> = [];

  const origRandom = Math.random;
  Math.random = () => 0;

  let calls = 0;
  try {
    await runToolLoop({
      initialContents: [{ role: "user", parts: [{ text: "hi" }] }],
      tools: [],
      handlers: {},
      maxSteps: 1,
      contextPolicy: { logApproxModelChars: true },
      aiCallAutoRetryMax: 1,
      aiCallAutoRetryBaseMs: 1,
      aiCallAutoRetryMaxMs: 1,
      logger: {
        status: () => {},
        info: (msg, meta) => infoCalls.push({ msg, meta }),
        warn: (msg, meta) => warnCalls.push({ msg, meta }),
      },
      aiCall: async () => {
        calls += 1;
        if (calls === 1) {
          throw { error: { code: 503, status: "UNAVAILABLE", message: "high demand" } };
        }
        return { text: "ok" };
      },
    });
  } finally {
    Math.random = origRandom;
  }

  assert.ok(infoCalls.length >= 1);
  assert.equal(infoCalls[0].msg, "Tool loop: approx model chars");
  assert.equal(typeof infoCalls[0].meta.approxChars, "number");
  assert.equal(infoCalls[0].meta.step, 1);

  assert.equal(warnCalls.length, 1);
  assert.equal(warnCalls[0].msg, "Tool loop: aiCall failed; retrying");
  assert.equal(warnCalls[0].meta.retryCount, 1);
  assert.equal(warnCalls[0].meta.aiCallAutoRetryMax, 1);
  assert.equal(warnCalls[0].meta.transient, true);
  assert.equal(warnCalls[0].meta.delayMs, 1);
});
