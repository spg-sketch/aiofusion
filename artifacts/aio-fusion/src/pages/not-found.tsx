import { useEffect } from "react";
import { ArrowLeft, Home, MessageCircleWarning } from "lucide-react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function NotFound() {
  useEffect(() => {
    const path = window.location.pathname.replace(/\/{2,}/g, "/").slice(0, 160);
    const key = `aio:not-found:${path}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    window.gtag?.("event", "page_not_found", {
      page_path: path,
      route_group: path.split("/").filter(Boolean)[0] || "root",
    });
  }, []);

  return (
    <main className="min-h-screen bg-[#f8fafc] px-6 py-12 text-[#17213a]">
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center">
        <section className="w-full rounded-[28px] border border-[#dfe5ef] bg-white p-8 shadow-[0_24px_70px_rgba(23,33,58,0.08)] sm:p-12">
          <div className="mb-8 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fce8f1] text-[#a31154]">
            <MessageCircleWarning aria-hidden="true" className="h-7 w-7" />
          </div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-[#a31154]">Page not found</p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-[#17213a] sm:text-5xl">
            We could not find the page you requested.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#5d667a]">
            The link may be out of date, or the page may have moved. We record the missing route without query details so we can reduce broken links.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="/" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#17213a] px-5 py-3 font-semibold text-white transition hover:bg-[#263455]">
              <Home aria-hidden="true" className="h-4 w-4" />
              Go to the homepage
            </a>
            <a href="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cfd6e3] px-5 py-3 font-semibold text-[#17213a] transition hover:bg-[#f5f7fb]">
              <MessageCircleWarning aria-hidden="true" className="h-4 w-4" />
              Let us know
            </a>
            <button type="button" onClick={() => window.history.back()} className="inline-flex items-center justify-center gap-2 px-4 py-3 font-semibold text-[#5d667a] transition hover:text-[#17213a]">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Go back
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
