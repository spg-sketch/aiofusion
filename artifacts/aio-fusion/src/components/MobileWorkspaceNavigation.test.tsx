// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileDestinationScroll, MobileWorkspaceNavigation } from "./MobileWorkspaceNavigation";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("mobile destination scrolling", () => {
  it("resets the document and workspace after the signed-in destination mounts", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const documentScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const main = document.createElement("main");
    main.scrollTo = vi.fn();
    const readMain = () => main;
    const mounted = render(<MobileDestinationScroll routeKey="signed-out" scrollElement={readMain} />);
    documentScroll.mockClear();
    vi.mocked(main.scrollTo).mockClear();
    mounted.rerender(<MobileDestinationScroll routeKey="signed-in" scrollElement={readMain} />);
    expect(documentScroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
    expect(main.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });

  it("can restore the Hub position on mobile", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<MobileDestinationScroll routeKey="hub" top={320} />);
    expect(scroll).toHaveBeenCalledWith({ top: 320, left: 0, behavior: "instant" });
  });

  it("does not change desktop scrolling", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<MobileDestinationScroll routeKey="signed-in" />);
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe("mobile workspace controls", () => {
  it("uses labelled, mobile-only controls and disables unsafe Back", () => {
    const back = vi.fn();
    const hub = vi.fn();
    const mounted = render(<MobileWorkspaceNavigation title="Media Research" canGoBack={false} onBack={back} onHub={hub} />);
    expect(screen.getByRole("navigation").className).toContain("md:hidden");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Project Hub" }));
    expect(hub).toHaveBeenCalledOnce();
    mounted.rerender(<MobileWorkspaceNavigation title="Project Hub" canGoBack onBack={back} onHub={hub} atHub />);
    expect(screen.getByRole("button", { name: "Project Hub" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(back).toHaveBeenCalledOnce();
  });
});
