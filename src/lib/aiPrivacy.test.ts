import { describe, expect, it } from "vitest";
import { prepareAiMessages, redactSensitiveAiText } from "./aiPrivacy";

describe("AI privacy safeguards", () => {
  it("redacts common patient identifiers before transmission", () => {
    const result = redactSensitiveAiText("DNI 70592180, 993465858 y paciente@correo.pe");
    expect(result).not.toContain("70592180");
    expect(result).not.toContain("993465858");
    expect(result).not.toContain("paciente@correo.pe");
    expect(result).toContain("[documento protegido]");
    expect(result).toContain("[telefono protegido]");
    expect(result).toContain("[correo protegido]");
  });

  it("limits history and message size", () => {
    const messages = Array.from({ length: 15 }, (_, index) => ({
      role: index % 2 ? "assistant" as const : "user" as const,
      content: "a".repeat(2_500)
    }));
    const prepared = prepareAiMessages(messages);
    expect(prepared).toHaveLength(12);
    expect(prepared.every((message) => message.content.length === 2_000)).toBe(true);
  });
});
