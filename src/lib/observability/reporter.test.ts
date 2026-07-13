import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CRM_OBSERVABILITY_SERVICE_NAME,
  type AiEvent,
  validateAiEvent,
} from "@/lib/observability";

describe("validateAiEvent", () => {
  it("accepts a minimal valid single-event payload", () => {
    const event: AiEvent = {
      execution_id: "agent-chat:thread-1:call-1",
      service_name: CRM_OBSERVABILITY_SERVICE_NAME,
      usage_kind: "agent_run",
      status: "success",
      calls: [
        {
          provider: "groq",
          model: "llama-3.3-70b-versatile",
          promptTokens: 1200,
          cachedTokens: 400,
          completionTokens: 150,
        },
      ],
    };

    assert.deepEqual(validateAiEvent(event), []);
  });

  it("requires execution_id and catalog enums", () => {
    const event = {
      execution_id: "",
      service_name: "not-a-service",
      usage_kind: "not-a-kind",
      calls: [{ model: "gpt-4o-mini", promptTokens: 10, cachedTokens: 20 }],
    } as unknown as AiEvent;

    const issues = validateAiEvent(event);
    assert.ok(issues.some((issue) => issue.path === "execution_id"));
    assert.ok(issues.some((issue) => issue.path === "service_name"));
    assert.ok(issues.some((issue) => issue.path === "usage_kind"));
    assert.ok(
      issues.some((issue) => issue.path === "calls[0].promptTokens"),
    );
  });

  it("rejects prompt/completion text fields", () => {
    const event = {
      execution_id: "run-1",
      service_name: "backend",
      usage_kind: "chat_completion",
      input_text: "secret",
      output_text: "secret",
      calls: [{ model: "gpt-4o-mini", promptTokens: 5, cachedTokens: 0 }],
    } as AiEvent;

    const issues = validateAiEvent(event);
    assert.ok(issues.some((issue) => issue.path === "input_text"));
    assert.ok(issues.some((issue) => issue.path === "output_text"));
  });
});
