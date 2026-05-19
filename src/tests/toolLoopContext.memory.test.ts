import assert from "node:assert/strict";
import test from "node:test";
import { redactFunctionCallArgs } from "../ai/toolLoop/toolLoopContext.js";
import { recordToolEvent } from "../ai/toolLoop/toolLoopRunnerUtils.js";

test("redactFunctionCallArgs: insert_element redacts element payload but keeps route/parent_id", () => {
  const args = {
    route: "/",
    parent_id: "root",
    element: {
      type: "div",
      className: "x".repeat(200),
      children: [
        { type: "text", props: { text: "Hello world" } },
        { type: "div", children: [{ type: "text", props: { text: "Nested" } }] },
      ],
    },
  } as any;

  const redacted = redactFunctionCallArgs("insert_element", args) as any;
  assert.equal(redacted.route, "/");
  assert.equal(redacted.parent_id, "root");
  assert.ok(redacted.element);
  assert.equal(redacted.element.omitted, true);
  assert.equal(redacted.element.type, "div");
  assert.equal(redacted.element.children_count, 2);
  assert.equal(redacted.element.className_len, 200);
  assert.equal(typeof redacted.element.className_preview, "string");
  assert.ok(redacted.element.className_preview.includes("..."));
  assert.equal(redacted.element.text_preview, "Hello world");
  assert.equal((redacted.element as any).children, undefined);
});

test("recordToolEvent: insert_element writes an insert ledger summary including inserted_id", () => {
  const toolEvents: Array<{ name: string; summary: string }> = [];
  recordToolEvent({
    toolEvents,
    name: "insert_element",
    effectiveArgs: {
      route: "/pricing",
      parent_id: "root",
      element: {
        type: "div",
        className: "flex ".repeat(40),
        children: [{ type: "text", props: { text: "Pricing" } }],
      },
    },
    modelArgs: {},
    readFileMeta: null,
    toolResult: { success: true, inserted_id: "el_abc123" },
    toolResultRaw: { success: true, inserted_id: "el_abc123" },
  });

  assert.equal(toolEvents.length, 1);
  const s = toolEvents[0]?.summary ?? "";
  assert.ok(s.includes("insert_element"));
  assert.ok(s.includes("route=/pricing"));
  assert.ok(s.includes("parent=root"));
  assert.ok(s.includes("inserted_id=el_abc123"));
  assert.ok(s.includes("type=div"));
  assert.ok(s.includes("children=1"));
  assert.ok(s.includes('text="Pricing"'));
});
