import { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { CONSENT_EVENT, OPEN_CONSENT_EVENT, readCookiePreference, saveCookiePreference } from "../lib/cookieConsent";

export function CookiePreferencesButton({ className = "" }: { className?: string }) {
  return <button type="button" className={`hover:underline ${className}`}
    onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}>Cookie preferences</button>;
}

export function CookieConsent() {
  const [visible, setVisible] = useState(() => !readCookiePreference());
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(() => readCookiePreference()?.analytics === true);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const open = () => {
      setAnalytics(readCookiePreference()?.analytics === true);
      setExpanded(true);
      setVisible(true);
    };
    const sync = () => { setVisible(!readCookiePreference()); };
    window.addEventListener(OPEN_CONSENT_EVENT, open);
    window.addEventListener(CONSENT_EVENT, sync);
    return () => {
      window.removeEventListener(OPEN_CONSENT_EVENT, open);
      window.removeEventListener(CONSENT_EVENT, sync);
    };
  }, []);
  function save(allow: boolean) {
    const persisted = saveCookiePreference(allow);
    setAnalytics(allow);
    setVisible(false);
    setExpanded(false);
    if (!persisted) setNotice("Your cookie choice applies in this tab. Your browser prevented us from saving it for future visits.");
  }
  const button = "rounded-full border px-4 py-2.5 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8497A]";
  if (!visible) return notice ? <div role="status" className="fixed bottom-4 left-4 right-4 z-[110] mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-lg">
    {notice}<button type="button" onClick={() => setNotice("")} className="ml-3 underline">Dismiss</button>
  </div> : null;
  return (
    <section aria-label="Cookie choices" className="fixed bottom-3 left-3 right-3 z-[110] mx-auto max-h-[70vh] max-w-4xl overflow-y-auto rounded-2xl border border-[#DCE5E7] bg-white p-4 shadow-[0_8px_40px_rgba(16,43,54,0.16)] sm:bottom-5 sm:p-5"
      style={{ color: "#102B36" }}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F0F6F6]"><ShieldCheck size={17} aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold">{expanded ? "Your cookie preferences" : "A small note on cookies"}</h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[#475569]">
            Essential cookies support security and sign-in. With your permission, Google Analytics helps us understand website use. Analytics stays off unless you allow it.
          </p>
          {expanded && <div className="mt-4 space-y-3 border-t border-[#E2E8F0] pt-3 text-[12px]">
            <div className="flex items-center justify-between gap-3"><span><strong>Essential</strong><br />Security, sign-in and saving this choice.</span><span className="shrink-0 font-medium text-[#475569]">Always on</span></div>
            <label className="flex cursor-pointer items-center justify-between gap-3" htmlFor="aio-analytics-choice">
              <span><strong>Analytics</strong><br />Optional Google Analytics measurement.</span>
              <input id="aio-analytics-choice" type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)}
                className="h-5 w-5 shrink-0 accent-[#C8497A]" />
            </label>
          </div>}
          <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
            <button type="button" className={`${button} border-[#102B36] bg-white text-[#102B36] hover:bg-[#F0F6F6]`} onClick={() => save(false)}>Essential only</button>
            <button type="button" className={`${button} border-[#102B36] bg-[#102B36] text-white hover:bg-[#1A647B]`} onClick={() => save(expanded ? analytics : true)}>{expanded ? "Save preferences" : "Allow analytics"}</button>
            {!expanded && <button type="button" className="px-1 py-2 text-[12px] underline underline-offset-4" onClick={() => setExpanded(true)}>Preferences</button>}
            <a href={`${import.meta.env.BASE_URL}cookie-policy`} className="px-1 py-2 text-[12px] underline underline-offset-4">Cookie policy</a>
          </div>
        </div>
        <button type="button" className="rounded-full p-1.5 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C8497A]"
          aria-label="Continue with essential cookies only" onClick={() => save(false)}><X size={16} /></button>
      </div>
    </section>
  );
}
