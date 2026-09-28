import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, Search, FileEdit, LineChart } from "lucide-react";
import { BookDemoForm } from "./ContactPage";
import { DEMO_OPT_OUT_KEY } from "./demoPreference";

export default function DemoDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("[data-dialog-close]")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]'));
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus();
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-[#102B36]/75" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="demo-dialog-title" className="relative w-full max-w-5xl max-h-[min(90vh,850px)] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <button type="button" data-dialog-close onClick={onClose} aria-label="Close demo enquiry" className="absolute right-4 top-4 z-10 rounded-full p-2 bg-white text-[#102B36] border border-[#102B36]/20 hover:bg-[#FBE3ED]"><X size={22} /></button>
        <div className="grid md:grid-cols-2">
          <div className="p-7 sm:p-10 text-white" style={{ background: "#1A647B" }}>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#F4B4CD]"><Sparkles size={16} /> AIO Fusion platform demo</span>
            <h2 id="demo-dialog-title" className="text-3xl sm:text-4xl mt-5 mb-5 leading-tight" style={{ fontFamily: "'Alice', Georgia, serif" }}>See your AI visibility more clearly.</h2>
            <p className="leading-relaxed text-white/90">A personalised walkthrough for your PR or marketing team. See how AIO Fusion brings your visibility, content and reporting work together.</p>
            <ul className="mt-8 space-y-5 text-sm">
              <li className="flex gap-3"><Search className="shrink-0 text-[#F4B4CD]" size={20} /><span>Diagnose where your brand appears in ChatGPT and Claude.</span></li>
              <li className="flex gap-3"><FileEdit className="shrink-0 text-[#F4B4CD]" size={20} /><span>Plan and optimise PR and marketing content in one place.</span></li>
              <li className="flex gap-3"><LineChart className="shrink-0 text-[#F4B4CD]" size={20} /><span>Measure progress and share useful reports with your team.</span></li>
            </ul>
          </div>
          <div className="p-7 sm:p-10 pt-14 sm:pt-10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#A33860] mb-3">Let's talk</p>
            <h3 className="text-2xl mb-6 text-[#102B36]" style={{ fontFamily: "'Alice', Georgia, serif" }}>Book your platform demo</h3>
            <BookDemoForm />
            <label className="mt-5 flex items-center gap-3 text-sm text-[#102B36] cursor-pointer">
              <input type="checkbox" checked={doNotShowAgain} onChange={(e) => updatePreference(e.target.checked)} className="h-4 w-4 accent-[#C8497A]" />
              Don't show this again
            </label>
            {preferenceError && <p role="alert" className="mt-2 text-sm text-[#A33860]">Your browser couldn't save this preference. Please enable browser storage and try again.</p>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}