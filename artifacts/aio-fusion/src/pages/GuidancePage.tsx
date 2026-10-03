import { useListPublishedHowto, getListPublishedHowtoQueryKey, useGetPublishedHowto, getGetPublishedHowtoQueryKey } from "@workspace/api-client-react";
import { vars } from "../marketing/vars";
import { BodyView } from "../components/howto/HowtoBlocks";
import { GuidanceCard } from "../components/howto/GuidanceCard";
import { errorMessage, errorStatus } from "../lib/howto";
import type { HowtoEntry } from "../lib/howto";
import type { GuidanceFilter, GuidanceRoute } from "../lib/guidanceRoute";
import { ArrowLeft, BookOpen, FileText, Pencil, Play, RefreshCw } from "lucide-react";

type Props = {
  onBack: () => void; canManage?: boolean; onManage?: () => void;
  route: GuidanceRoute;
  onRouteChange: (route: GuidanceRoute) => void;
  onCloseGuide?: () => void;
};

function Header({ left, label, onClick }: { left?: boolean; label: string; onClick: () => void }) {
  return (
    <header className="border-b px-4 sm:px-10 py-4 sm:py-5 flex items-center justify-between" style={{ background: "white", borderColor: vars.g200 }}>
      <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-12 sm:h-16" />
      <button onClick={onClick} className="aio-button aio-button--text aio-button--compact" style={{ color: vars.g500 }} data-testid={left ? "button-back-guidance" : "button-back"}>
        <ArrowLeft size={14} /> {label}
      </button>
    </header>
  );
}

function Detail({ id, onClose, canManage, onManage }: { id: string; onClose: () => void; canManage?: boolean; onManage?: () => void }) {
  const { data, isLoading, isError, error, refetch } = useGetPublishedHowto(id, {
    query: { queryKey: getGetPublishedHowtoQueryKey(id), refetchOnMount: "always", retry: false },
  });
  const entry = data as HowtoEntry | undefined;
  const missing = isError && errorStatus(error) === 404;

  return (
    <div className="min-h-[100dvh] font-['Inter',sans-serif]" style={{ background: vars.g50 }}>
      <Header left label="Back to Guidance" onClick={onClose} />
      <div className="px-4 sm:px-10 py-8 sm:py-12 max-w-3xl mx-auto">
        {isLoading ? (
          <div data-testid="detail-loading" aria-busy="true" className="grid gap-3">
            <div className="h-6 w-24 rounded animate-pulse" style={{ background: vars.g200 }} />
            <div className="h-10 w-3/4 rounded animate-pulse" style={{ background: vars.g200 }} />
            <div className="h-64 rounded-2xl animate-pulse" style={{ background: vars.g200 }} />
          </div>
        ) : missing ? (
          <div className="rounded-2xl border p-8 text-center bg-white" style={{ borderColor: vars.g200 }} data-testid="detail-missing">
            <p className="aio-type-card-title mb-2">This guide is not available</p>
            <p className="text-[13px] mb-4" style={{ color: vars.g500 }}>It may have been unpublished or removed.</p>
            <button className="aio-button aio-button--outline" onClick={onClose}>Back to Guidance</button>
          </div>
        ) : isError || !entry ? (
          <div role="alert" className="rounded-2xl border p-8 text-center bg-white" style={{ borderColor: "#fca5a5" }} data-testid="detail-error">
            <p className="aio-type-card-title mb-2">This guide could not be loaded</p>
            <p className="text-[13px] mb-4" style={{ color: vars.g500 }}>{errorMessage(error)}</p>
            <button className="aio-button aio-button--primary" onClick={() => void refetch()} data-testid="button-retry-detail"><RefreshCw size={14} /> Try again</button>
          </div>
        ) : (
          <article>
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-[0.16em] mb-3" style={{ background: vars.lightBg, color: vars.accent }}>
                {entry.type === "Video" ? <Play size={11} /> : <FileText size={11} />}
                {entry.type}
              </div>
              <h1 className="text-2xl sm:text-3xl tracking-tight mb-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }} data-testid="detail-title">{entry.title}</h1>
              <p className="text-[13px]" style={{ color: vars.g500 }}>{entry.readTime}</p>
              {canManage && onManage && (
                <button className="aio-button aio-button--outline aio-button--compact mt-3" onClick={onManage} data-testid="button-manage-detail"><Pencil size={13} /> Manage How-to Library</button>
              )}
            </div>
            <div className="rounded-2xl border p-6 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
              <BodyView body={entry.body} />
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

function GuidancePage({ onBack, canManage = false, onManage, route, onRouteChange, onCloseGuide }: Props) {
  const { id: openId, filter } = route;
  const changeRoute = onRouteChange;
  const setFilter = (filter: GuidanceFilter) => changeRoute({ id: null, filter });
  const { data, isLoading, isError, error, refetch } = useListPublishedHowto({
    query: { queryKey: getListPublishedHowtoQueryKey(), refetchOnMount: "always" },
  });
  const entries = (data ?? []) as HowtoEntry[];
  const filtered = filter === "All" ? entries : entries.filter((a) => a.type === filter);

  if (openId) return <Detail key={openId} id={openId} onClose={onCloseGuide ?? (() => changeRoute({ id: null, filter }))} canManage={canManage} onManage={onManage} />;

  return (
    <div className="min-h-[100dvh] font-['Inter',sans-serif]" style={{ background: vars.g50 }}>
      <Header label="Back to platform home" onClick={onBack} />
      <div className="px-4 sm:px-10 py-8 sm:py-12 max-w-6xl mx-auto">
        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] mb-3" style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}>
              <BookOpen size={12} /> How-to Library
            </div>
            <h1 className="aio-type-page-title">Guidance</h1>
            <p className="aio-type-body mt-2 max-w-2xl" style={{ color: vars.g500 }}>
              Step-by-step guides for getting the most out of AIO Fusion, from first set-up to client reporting.
            </p>
          </div>
          {canManage && onManage && (
            <button className="aio-button aio-button--outline" onClick={onManage} data-testid="button-manage-library"><Pencil size={14} /> Manage How-to Library</button>
          )}
        </div>

        <div className="flex gap-2 mb-6 flex-wrap" role="group" aria-label="Filter by type">
          {(["All", "Article", "Guide", "Video"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} data-testid={`filter-${f}`} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all" style={{ background: filter === f ? vars.accent : "white", color: filter === f ? "white" : vars.g500, borderColor: filter === f ? vars.accent : vars.g200 }}>
              {f}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5" data-testid="library-loading" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-80 rounded-2xl animate-pulse" style={{ background: vars.g200 }} />)}
          </div>
        ) : isError ? (
          <div role="alert" className="rounded-2xl border p-8 text-center bg-white" style={{ borderColor: "#fca5a5" }} data-testid="library-error">
            <p className="aio-type-card-title mb-2">The library could not be loaded</p>
            <p className="text-[13px] mb-4" style={{ color: vars.g500 }}>{errorMessage(error)}</p>
            <button className="aio-button aio-button--primary" onClick={() => void refetch()} data-testid="button-retry-library"><RefreshCw size={14} /> Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center bg-white" style={{ borderColor: vars.g300 }} data-testid="library-empty">
            <p className="aio-type-card-title mb-1">{entries.length === 0 ? "Nothing published yet" : `No ${filter.toLowerCase()} entries`}</p>
            <p className="text-[13px]" style={{ color: vars.g500 }}>{entries.length === 0 ? "New guides will appear here as soon as they are published." : "Try another type."}</p>
          </div>
        ) : (
          <section aria-label="Published how-to content">
            <p className="text-sm mb-4" style={{ color: vars.g500 }}>{filtered.length} {filtered.length === 1 ? "entry" : "entries"}{filter !== "All" ? ` · ${filter}` : ""}</p>
            <div className={`grid gap-6 ${filtered.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`} data-testid="guidance-collection">
              {filtered.map((entry) => (
                <GuidanceCard key={entry.id} entry={entry} single={filtered.length === 1} onOpen={() => changeRoute({ id: entry.id, filter })} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export { GuidancePage };
