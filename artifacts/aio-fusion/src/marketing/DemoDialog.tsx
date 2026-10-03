import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, Search, FileEdit, LineChart } from "lucide-react";
import { BookDemoForm } from "./ContactPage";
import { DEMO_OPT_OUT_KEY } from "./demoPreference";
import "./DemoDialog.css";

export default function DemoDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnFocus = useRef<HTMLElement | null>(null);
  const [doNotShowAgain, setDoNotShowAgain] = useState(() => {
    try {
      return window.localStorage.getItem(DEMO_OPT_OUT_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [preferenceError, setPreferenceError] = useState(false);

  function updatePreference(checked: boolean) {
    try {
      if (checked) window.localStorage.setItem(DEMO_OPT_OUT_KEY, "1");
      else window.localStorage.removeItem(DEMO_OPT_OUT_KEY);
      setDoNotShowAgain(checked);
      setPreferenceError(false);
    } catch {
      setPreferenceError(true);
    }
  }

  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement;
    const body = document.body;
    const previous = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    const scrollY = window.scrollY;
    Object.assign(body.style, { overflow: "hidden", position: "fixed", top: `${-scrollY}px`, width: "100%" });
    dialog.current?.querySelector<HTMLButtonElement>("[data-dialog-close]")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab" || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]'))
        .filter(item => {
          if (item.closest("[hidden], [inert]") || item.tabIndex < 0) return false;
          for (let parent: HTMLElement | null = item; parent && parent !== dialog.current; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (style.display === "none" || style.visibility === "hidden") return false;
          }
          return true;
        });
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog.current.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      Object.assign(body.style, previous);
      returnFocus.current?.focus({ preventScroll: true });
      if (scrollY) window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    function revealField() {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches("input:not([type=checkbox]), textarea, select") && dialog.current?.contains(active)) {
        active.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
    }
    function updateViewport() {
      const viewport = window.visualViewport;
      const element = overlay.current;
      if (element) {
        element.style.setProperty("--demo-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
        element.style.setProperty("--demo-viewport-top", `${viewport?.offsetTop ?? 0}px`);
        element.style.setProperty("--demo-viewport-left", `${viewport?.offsetLeft ?? 0}px`);
        element.style.setProperty("--demo-viewport-width", `${viewport?.width ?? window.innerWidth}px`);
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealField);
    }
    const viewport = window.visualViewport;
    updateViewport();
    window.addEventListener("resize", updateViewport);
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    dialog.current?.addEventListener("focusin", updateViewport);
    const element = dialog.current;
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      element?.removeEventListener("focusin", updateViewport);
    };
  }, []);
  return createPortal(
    <div ref={overlay} className="demo-dialog-overlay z-[100] bg-[#102B36]/75" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="demo-dialog-title" className="demo-dialog relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
        <button type="button" data-dialog-close onClick={onClose} aria-label="Close demo enquiry" className="demo-dialog-close absolute z-10 rounded-full bg-white text-[#102B36] border border-[#102B36]/20 hover:bg-[#FBE3ED] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A33860]"><X size={22} /></button>
        <div className="demo-dialog-mobile-bar" aria-hidden="true"><Sparkles size={16} /> AIO Fusion demo</div>
        <div data-dialog-scroll className="demo-dialog-scroll">
        <div className="demo-dialog-columns">
          <div className="demo-dialog-intro text-white" style={{ background: "#1A647B" }}>
            <span className="demo-dialog-desktop demo-dialog-eyebrow items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#F4B4CD]"><Sparkles size={16} /> AIO Fusion platform demo</span>
            <h2 id="demo-dialog-title" className="demo-dialog-title leading-tight" style={{ fontFamily: "'Alice', Georgia, serif" }}>See your AI visibility more clearly.</h2>
            <p className="demo-dialog-mobile text-sm leading-relaxed text-white/90">Book a personalised demo for your PR or marketing team.</p>
            <p className="demo-dialog-desktop leading-relaxed text-white/90">A personalised walkthrough for your PR or marketing team. See how AIO Fusion brings your visibility, content and reporting work together.</p>
            <ul className="demo-dialog-desktop mt-8 space-y-5 text-sm">
              <li className="flex gap-3"><Search className="shrink-0 text-[#F4B4CD]" size={20} /><span>Diagnose where your brand appears in ChatGPT and Claude.</span></li>
              <li className="flex gap-3"><FileEdit className="shrink-0 text-[#F4B4CD]" size={20} /><span>Plan and optimise PR and marketing content in one place.</span></li>
              <li className="flex gap-3"><LineChart className="shrink-0 text-[#F4B4CD]" size={20} /><span>Measure progress and share useful reports with your team.</span></li>
            </ul>
          </div>
          <div className="demo-dialog-form">
            <p className="demo-dialog-desktop text-xs font-bold uppercase tracking-widest text-[#A33860] mb-3">Let's talk</p>
            <h3 className="demo-dialog-desktop text-2xl mb-6 text-[#102B36]" style={{ fontFamily: "'Alice', Georgia, serif" }}>Book your platform demo</h3>
            <BookDemoForm />
            <label className="demo-dialog-preference mt-3 md:mt-5 flex items-center gap-3 text-sm text-[#102B36] cursor-pointer">
              <input type="checkbox" checked={doNotShowAgain} onChange={(e) => updatePreference(e.target.checked)} className="h-4 w-4 accent-[#C8497A]" />
              Don't show this again
            </label>
            {preferenceError && <p role="alert" className="mt-2 text-sm text-[#A33860]">Your browser couldn't save this preference. Please enable browser storage and try again.</p>}
          </div>
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}