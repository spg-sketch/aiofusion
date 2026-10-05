import { describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({
  default: class { chat = { completions: { create } }; },
}));
import { generateMediaPitchAngle, pitchContextHash, validatePitchAngle } from "./media-pitch-generation";

describe("media pitch generation", () => {
  it("rejects the historical generic template and unverified reporting claims", () => {
    expect(() => validatePitchAngle("Frame the article around clean power for the contact's energy coverage.")).toThrow();
    expect(() => validatePitchAngle("Build on your recent reporting about power prices with this new project announcement.")).toThrow();
    expect(() => validatePitchAngle("An angle")).toThrow();
    expect(validatePitchAngle("Offer Energy Daily a practical grid-storage explainer using the article's battery-cost comparison, with a proposed sidebar for energy operators.")).toContain("grid-storage");
  });
  it("hashes context changes and settles paid usage before accepting the suggestion", async () => {
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://example.test");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-not-a-real-key");
    const settle = vi.fn();
    create.mockResolvedValue({
      usage: { prompt_tokens: 100, completion_tokens: 50 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ angle: "Offer Energy Daily a practical grid-storage explainer using the article's battery-cost comparison, with a sidebar for energy operators." }) } }],
    });
    await expect(generateMediaPitchAngle({ article: "Battery costs" }, settle)).resolves.toContain("Energy Daily");
    expect(settle).toHaveBeenCalledWith(100, 50);
    expect(create.mock.calls[0][0]).toMatchObject({ model: "gpt-5.4-mini", max_completion_tokens: 600 });
    expect(pitchContextHash({ article: "A" })).not.toBe(pitchContextHash({ article: "B" }));
    settle.mockRejectedValueOnce(new Error("accounting unavailable"));
    await expect(generateMediaPitchAngle({}, settle)).rejects.toThrow("accounting unavailable");
    create.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(generateMediaPitchAngle({}, settle)).rejects.toThrow("provider unavailable");
    vi.unstubAllEnvs();
  });
});
