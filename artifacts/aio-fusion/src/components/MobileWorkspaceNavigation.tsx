import { useLayoutEffect } from "react";
import { ArrowLeft, LayoutGrid } from "lucide-react";

export function isMobileWorkspace() {
  return window.matchMedia("(max-width: 767px)").matches;
}

/** Mount inside the destination's Suspense boundary, not its loading screen. */
export function MobileDestinationScroll({
  routeKey,
  scrollElement,
  top = 0,
}: {
  routeKey: string;
  scrollElement?: () => HTMLElement | null;
  top?: number;
}) {
  useLayoutEffect(() => {
    if (!isMobileWorkspace()) return;
    window.scrollTo({ top, left: 0, behavior: "instant" });
    scrollElement?.()?.scrollTo({ top, left: 0, behavior: "instant" });
  }, [routeKey, scrollElement, top]);
  return null;
}

export function MobileWorkspaceNavigation({
  title,
  canGoBack,
  onBack,
  onHub,
  atHub = false,
  fixedHeader = false,
}: {
  title: string;
  canGoBack: boolean;
  onBack: () => void;
  onHub: () => void;
  atHub?: boolean;
  fixedHeader?: boolean;
}) {
  return (
    <nav
      aria-label="Mobile workspace navigation"
      className={`md:hidden z-30 flex h-14 min-w-0 items-center gap-2 border-b bg-white px-3 py-1 text-[#0a1628] ${fixedHeader ? "fixed inset-x-0" : "sticky"}`}
      style={{ top: fixedHeader ? "calc(3.5rem + var(--banner-h, 0px))" : 0, borderColor: "#e2e8f0" }}
    >
      <button type="button" disabled={!canGoBack} onClick={onBack}
        className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold disabled:opacity-40 focus-visible:outline-2">
        <ArrowLeft size={17} aria-hidden="true" /> Back
      </button>
      <span className="min-w-0 flex-1 truncate text-center text-xs font-semibold" title={title}>{title}</span>
      <button type="button" disabled={atHub} onClick={onHub} aria-current={atHub ? "page" : undefined}
        className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold disabled:opacity-60 focus-visible:outline-2">
        <LayoutGrid size={16} aria-hidden="true" /> Project Hub
      </button>
    </nav>
  );
}
