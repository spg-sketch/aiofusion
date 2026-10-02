// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlatformDesktopFrame } from "./PlatformDesktopFrame";

afterEach(cleanup);

describe("PlatformDesktopFrame", () => {
  it.each(["hero", "subtle"] as const)(
    "keeps the screen and complete stand in one shared %s perspective",
    (perspective) => {
      const { container } = render(
        <PlatformDesktopFrame
          src="/images/platform-dashboard-real.webp"
          alt="Example platform dashboard"
          title="Example authority dashboard"
          perspective={perspective}
        />,
      );
      const frames = container.querySelectorAll<HTMLImageElement>(
        'img[src$="/images/platform-imac-frame.png"]',
      );
      expect(frames).toHaveLength(1);
      const frame = frames[0]!;
      expect(frame.style.clipPath).toBe("");
      expect(frame.style.transform).toBe("");
      const screenImage = screen.getByRole("img", { name: "Example platform dashboard" });
      expect(frame.parentElement).toBe(screenImage.parentElement?.parentElement);
      expect(frame.parentElement?.style.transform).toBe(
        perspective === "hero"
          ? "perspective(1100px) rotateY(-12deg) rotateX(1.5deg) rotateZ(1.2deg)"
          : "perspective(1100px) rotateY(-8deg) rotateX(1deg) rotateZ(-0.3deg)",
      );
    },
  );
});