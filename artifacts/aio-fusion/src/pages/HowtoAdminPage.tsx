import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListAdminHowto, getListAdminHowtoQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, BookOpen, Plus, RefreshCw, Search } from "lucide-react";
import { vars } from "../marketing/vars";
import { HowtoEditor } from "../components/howto/HowtoEditor";
import type { EditorControl, EditorState } from "../components/howto/HowtoEditor";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog";
import { HOWTO_TYPES, errorMessage } from "../lib/howto";
import type { HowtoEntry } from "../lib/howto";
import type { UnsavedEditorRegistration } from "../lib/unsavedChanges";

type Props = {
  onBack: () => void;
  onRegisterUnsavedEditor?: (registration: UnsavedEditorRegistration | null) => void;
};

function HowtoAdminPage({ onBack, onRegisterUnsavedEditor }: Props) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useListAdminHowto({
    query: { queryKey: getListAdminHowtoQueryKey(), refetchOnMount: "always" },
  });
  const entries = (data ?? []) as HowtoEntry[];

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | (typeof HOWTO_TYPES)[number]>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "draft" | "published">("All");
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [editorEntry, setEditorEntry] = useState<HowtoEntry | null>(null);
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<EditorState>({ dirty: false, busy: false });
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const [guardSaving, setGuardSaving] = useState(false);
  const [guardError, setGuardError] = useState("");
  const controlRef = useRef<EditorControl | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const onStateChange = useCallback((s: EditorState) => setState(s), []);

  // Page level guard registration and browser unload protection.
  const registerRef = useRef(onRegisterUnsavedEditor);
  registerRef.current = onRegisterUnsavedEditor;
  useEffect(() => {
    registerRef.current?.({
      editor: "howto",
      dirty: state.dirty,
      busy: state.busy,
      save: async () => (controlRef.current ? controlRef.current.save() : { ok: true }),
    });
  }, [state.dirty, state.busy]);
  useEffect(() => () => registerRef.current?.(null), []);
  useEffect(() => {
    if (!state.dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.dirty]);

  const guarded = (run: () => void) => {
    if (stateRef.current.dirty || stateRef.current.busy) { setGuardError(""); setPendingNav(() => run); } else run();
  };

  const open = (id: string | "new") => guarded(() => { setEditorEntry(id === "new" ? null : entries.find((e) => e.id === id) ?? null); setSelected(id); setNonce((n) => n + 1); setState({ dirty: false, busy: false }); });

  const onPersisted = useCallback((saved: HowtoEntry) => {
    qc.setQueryData(getListAdminHowtoQueryKey(), (old: HowtoEntry[] | undefined) =>
      old ? (old.some((e) => e.id === saved.id) ? old.map((e) => (e.id === saved.id ? saved : e)) : [...old, saved]) : [saved]);
    void qc.invalidateQueries({ queryKey: getListAdminHowtoQueryKey() });
    setSelected((cur) => (cur === "new" ? saved.id : cur));
  }, [qc]);
  const onDeleted = useCallback(() => {
    void qc.invalidateQueries({ queryKey: getListAdminHowtoQueryKey() });
    setSelected(null);
    setState({ dirty: false, busy: false });
  }, [qc]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) =>
      (typeFilter === "All" || e.type === typeFilter) &&
      (statusFilter === "All" || e.status === statusFilter) &&
      (!q || e.title.toLowerCase().includes(q) || e.id.includes(q) || e.description.toLowerCase().includes(q)));
  }, [entries, search, typeFilter, statusFilter]);

    const chip = (active: boolean) => ({ background: active ? vars.accent : "white", color: active ? "white" : vars.g600, borderColor: active ? vars.accent : vars.g300 });

  return (
    <div className="min-h-[100dvh] font-['Inter',sans-serif]" style={{ background: vars.g50 }}>
      <header className="border-b px-4 sm:px-10 py-4 flex items-center justify-between" style={{ background: "white", borderColor: vars.g200 }}>
        <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-12 sm:h-14" />
        <button onClick={onBack} className="aio-button aio-button--return" data-testid="button-back"><ArrowLeft size={16} /> Back</button>
      </header>
      <div className="px-4 sm:px-10 py-8 max-w-[1280px] mx-auto">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="aio-type-eyebrow inline-flex items-center gap-1.5 mb-2" style={{ color: vars.accent }}><BookOpen size={12} /> How-to Library</div>
            <h1 className="aio-type-page-title">Manage guidance</h1>
          </div>
          <button className="aio-button aio-button--primary" onClick={() => open("new")} data-testid="button-new-entry"><Plus size={16} /> New entry</button>
        </div>

        <div className="grid lg:grid-cols-[340px_1fr] gap-8 items-start">
          <aside aria-label="Entries" className="grid gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
              <input aria-label="Search entries" data-testid="input-search" placeholder="Search title, id or description" className="w-full rounded-lg border pl-9 pr-3 py-2.5 text-[14px] bg-white" style={{ borderColor: vars.fieldBorder }} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
              {(["All", ...HOWTO_TYPES] as const).map((t) => (
                <button key={t} aria-pressed={typeFilter === t} onClick={() => setTypeFilter(t)} data-testid={`filter-type-${t}`} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border" style={chip(typeFilter === t)}>{t}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
              {(["All", "draft", "published"] as const).map((s) => (
                <button key={s} aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)} data-testid={`filter-status-${s}`} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border capitalize" style={chip(statusFilter === s)}>{s}</button>
              ))}
            </div>

            {isLoading ? (
              <div className="grid gap-2" data-testid="admin-loading" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-[72px] rounded-xl animate-pulse" style={{ background: vars.g200 }} />)}
              </div>
            ) : isError ? (
              <div role="alert" className="rounded-xl border p-4 text-[13px]" style={{ background: "#fef2f2", borderColor: "#fca5a5", color: "#7f1d1d" }} data-testid="admin-error">
                <p className="font-bold mb-1">The library could not be loaded</p>
                <p className="mb-3">{errorMessage(error)}</p>
                <button className="aio-button aio-button--outline aio-button--compact" onClick={() => void refetch()} data-testid="button-retry-list"><RefreshCw size={14} /> Retry</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-[13px]" style={{ borderColor: vars.g300, color: vars.g500 }} data-testid="admin-empty">
                {entries.length === 0 ? "No entries yet. Create the first guide with New entry." : "No entries match these filters."}
              </div>
            ) : (
              <ul className="grid gap-2">
                {filtered.map((e) => (
                  <li key={e.id}>
                    <button onClick={() => open(e.id)} aria-current={selected === e.id} data-testid={`row-entry-${e.id}`} className="w-full text-left rounded-xl border p-3.5 bg-white hover:shadow-sm" style={{ borderColor: selected === e.id ? vars.accent : vars.g200, borderWidth: selected === e.id ? 2 : 1 }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="aio-type-eyebrow px-1.5 py-0.5 rounded" style={{ background: vars.g100, color: vars.accent }}>{e.type}</span>
                        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: e.status === "published" ? "#166534" : "#92400e" }}>{e.status}</span>
                        <span className="text-[11px] ml-auto" style={{ color: vars.g400 }}>#{e.displayOrder}</span>
                      </div>
                      <p className="text-[14px] font-bold" style={{ color: vars.navy }}>{e.title}</p>
                      <p className="text-[12px] truncate" style={{ color: vars.g500 }}>{e.id}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <main aria-label="Editor">
            {selected !== null ? (
              <HowtoEditor key={`editor-${nonce}`} entry={editorEntry} onPersisted={onPersisted} onDeleted={onDeleted} onStateChange={onStateChange} controlRef={controlRef} />
            ) : (
              <div className="rounded-2xl border border-dashed px-6 py-16 text-center" style={{ borderColor: vars.g300 }} data-testid="editor-empty">
                <p className="aio-type-card-title mb-2">Choose an entry to edit</p>
                <p className="text-[13px]" style={{ color: vars.g500 }}>Pick one from the list, or start a new guide, article or video.</p>
              </div>
            )}
          </main>
        </div>
      </div>

      <UnsavedChangesDialog
        open={pendingNav !== null}
        busy={state.busy}
        destinationLabel="How-to Library"
        saving={guardSaving}
        error={guardError}
        onStay={() => setPendingNav(null)}
        onDiscard={() => { const run = pendingNav; setPendingNav(null); run?.(); }}
        onSave={async () => {
          setGuardSaving(true); setGuardError("");
          const res = controlRef.current ? await controlRef.current.save() : { ok: true };
          setGuardSaving(false);
          if (!res.ok) { setGuardError(res.error || "The entry could not be saved."); return; }
          const run = pendingNav; setPendingNav(null);
          // Let the saved baseline settle before switching entries.
          setTimeout(() => { stateRef.current = { dirty: false, busy: false }; run?.(); }, 0);
        }}
      />
    </div>
  );
}

export { HowtoAdminPage };
