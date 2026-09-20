import { describe, expect, it } from "vitest";
import { trimFailureMessage } from "./movie-recap";

describe("trimFailureMessage", () => {
  it("leaves a short message exactly as it is", () => {
    expect(trimFailureMessage("Cancelled.")).toBe("Cancelled.");
  });

  it("trims surrounding whitespace", () => {
    expect(trimFailureMessage("  Render failed.\n")).toBe("Render failed.");
  });

  it("keeps the command that failed and the reason it gave", () => {
    // ffmpeg names the command at the top and the reason at the bottom; the
    // banner in between is what made one stored message 85,975 characters.
    const message = `Command failed: ffmpeg -y -i source.mp4${"\n banner line".repeat(4000)}\nOutput file is empty`;
    const trimmed = trimFailureMessage(message);
    expect(trimmed).toContain("Command failed: ffmpeg");
    expect(trimmed).toContain("Output file is empty");
  });

  it("caps what reaches the row, which is polled every two seconds", () => {
    const trimmed = trimFailureMessage("x".repeat(90_000));
    expect(trimmed.length).toBeLessThan(2_000);
  });

  it("says how much it dropped rather than hiding the cut", () => {
    const trimmed = trimFailureMessage("x".repeat(10_000));
    expect(trimmed).toContain("characters trimmed");
    expect(trimmed).toMatch(/… 8200 characters trimmed …/);
  });

  it("does not touch a message that is exactly at the limit", () => {
    const exact = "y".repeat(1800);
    expect(trimFailureMessage(exact)).toBe(exact);
  });
});
