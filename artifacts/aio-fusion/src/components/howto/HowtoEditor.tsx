import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useCreateAdminHowto, useUpdateAdminHowto, useDeleteAdminHowto } from "@workspace/api-client-react";
import { AlertCircle, Check, Loader2, Trash2 } from "lucide-react";
import { vars } from "../../marketing/vars";
import { HowtoDocumentEditor } from "./HowtoDocumentEditor";
import { BodyView } from "./HowtoBlocks";
import { HOWTO_TYPES, buildPayload, draftFromEntry, emptyDraft, errorMessage, slugify, validateDraft } from "../../lib/howto";
import type { HowtoDraft, HowtoEntry, HowtoStatus, HowtoType } from "../../lib/howto";

export type EditorControl = { save: () => Promise<{ ok: boolean; error?: string }> };
export type EditorState = { dirty: boolean; busy: boolean };

type Props = {
  entry: HowtoEntry | null;
  onPersisted: (entry: HowtoEntry) => void;
  onDeleted: (id: string) => void;
  onStateChange: (state: EditorState) => void;
  controlRef: MutableRefObject<EditorControl | null>;
};

const fieldCls = "w-full rounded-lg border px-3 py-2.5 text-[14px] bg-white";
const labelCls = "block text-[12px] font-semibold mb-1.5";

export function HowtoEditor({ entry, onPersisted, onDeleted, onStateChange, controlRef }: Props) {
  const initial = entry ? draftFromEntry(entry) : emptyDraft();
  const [draft, setDraft] = useState<HowtoDraft>(initial);
  const [persistedId, setPersistedId] = useState<string | null>(entry?.id ?? null);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [idTouched, setIdTouched] = useState(!!entry);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [pending, setPending] = useState<null | "save" | "publish" | "unpublish" | "delete">(null);
  const [saveError, setSaveError] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const createM = useCreateAdminHowto();
  const updateM = useUpdateAdminHowto();
  const deleteM = useDeleteAdminHowto();

  const isNew = persistedId === null;
  const dirty = JSON.stringify(draft) !== baseline;
  const busy = pending !== null;

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const persistedRef = useRef(persistedId);
  persistedRef.current = persistedId;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => { onStateChange({ dirty, busy }); }, [dirty, busy, onStateChange]);

  const set = (patch: Partial<HowtoDraft>) => { setDraft((d) => ({ ...d, ...patch })); setSavedAt(null); };

  const persist = useCallback(async (status: HowtoStatus, kind: "save" | "publish" | "unpublish"): Promise<{ ok: boolean; error?: string }> => {
    if (pendingRef.current) return { ok: false, error: "A change is already being saved." };
    const sent = draftRef.current;
    const problems = validateDraft(sent, persistedRef.current === null);
    if (problems.length) {
      setSaveError(problems);
      return { ok: false, error: problems[0] };
    }
    const payload = buildPayload(sent, status);
    setPending(kind);
    setSaveError([]);
    try {
      let saved: HowtoEntry;
      if (persistedRef.current === null) {
        saved = (await createM.mutateAsync({ data: payload })) as HowtoEntry;
      } else {
        const { id, ...rest } = payload;
        saved = (await updateM.mutateAsync({ id: persistedRef.current ?? id, data: rest })) as HowtoEntry;
      }
      // Confirmed server success: snapshot what was sent, so edits made while pending stay dirty.
      const confirmed: HowtoDraft = { ...sent, id: saved.id, status: saved.status };
      setBaseline(JSON.stringify(confirmed));
      setPersistedId(saved.id);
      persistedRef.current = saved.id;
      setIdTouched(true);
      setDraft((d) => ({ ...d, id: saved.id, status: confirmed.status }));
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      onPersisted(saved);
      return { ok: true };
    } catch (err) {
      const msg = errorMessage(err);
      setSaveError([msg]);
      return { ok: false, error: msg };
    } finally {
      setPending(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPersisted]);

  controlRef.current = { save: () => persist(draftRef.current.status, "save") };

  const doDelete = async () => {
    if (!persistedId) return;
    setPending("delete");
    setSaveError([]);
    try {
      await deleteM.mutateAsync({ id: persistedId });
      onDeleted(persistedId);
    } catch (err) {
      setSaveError([errorMessage(err)]);
      setConfirmDelete(false);
    } finally {
      setPending(null);
    }
  };

  const published = draft.status === "published";

  return (
    <div data-testid="howto-editor">
      <div className="sticky top-0 z-10 -mx-1 px-1 py-3 flex flex-wrap items-center gap-2 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}>
        <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: vars.g300 }} role="tablist" aria-label="Editor view">
          {(["edit", "preview"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} data-testid={`tab-${m}`} className="px-4 py-2 text-[13px] font-semibold capitalize" style={{ background: mode === m ? vars.navy : "white", color: mode === m ? "white" : vars.g600 }}>{m}</button>
          ))}
        </div>
        <div className="flex-1 min-w-[140px] text-[13px] font-semibold" aria-live="polite" data-testid="save-status">
          {pending === "save" || pending === "publish" || pending === "unpublish" ? (
            <span className="inline-flex items-center gap-1.5" style={{ color: vars.g500 }}><Loader2 size={14} className="animate-spin" /> Saving...</span>
          ) : saveError.length ? (
            <span style={{ color: "#b91c1c" }}>Not saved. Your edits are kept.</span>
          ) : savedAt && !dirty ? (
            <span className="inline-flex items-center gap-1.5" style={{ color: "#166534" }}><Check size={14} /> Saved at {savedAt}</span>
          ) : dirty ? (
            <span style={{ color: "#92400e" }}>Unsaved changes</span>
          ) : (
            <span style={{ color: vars.g500 }}>{isNew ? "New entry" : "All changes saved"}</span>
          )}
        </div>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded" style={{ background: published ? "#dcfce7" : "#fef3c7", color: published ? "#166534" : "#92400e" }} data-testid="entry-status">{draft.status}</span>
        <button className="aio-button aio-button--outline aio-button--compact" disabled={busy} onClick={() => void persist(draft.status, "save")} data-testid="button-save">{published ? "Save changes" : "Save draft"}</button>
        {published ? (
          <button className="aio-button aio-button--secondary aio-button--compact" disabled={busy} onClick={() => void persist("draft", "unpublish")} data-testid="button-unpublish">Unpublish</button>
        ) : (
          <button className="aio-button aio-button--primary aio-button--compact" disabled={busy} onClick={() => void persist("published", "publish")} data-testid="button-publish">Publish</button>
        )}
        {!isNew && (
          <button className="aio-button aio-button--outline aio-button--compact" disabled={busy} onClick={() => setConfirmDelete(true)} data-testid="button-delete" style={{ color: "#b91c1c" }}><Trash2 size={14} /> Delete</button>
        )}
      </div>

      {saveError.length > 0 && (
        <div role="alert" data-testid="save-error" className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ background: "#fef2f2", borderColor: "#fca5a5", color: "#7f1d1d" }}>
          <p className="font-bold mb-1 flex items-center gap-1.5"><AlertCircle size={14} /> This entry was not saved</p>
          <ul className="list-disc pl-5">{saveError.map((e, i) => <li key={i}>{e}</li>)}</ul>
          <button className="aio-button aio-button--outline aio-button--compact mt-3" disabled={busy} onClick={() => void persist(draft.status, "save")} data-testid="button-retry-save">Retry save</button>
        </div>
      )}

      {confirmDelete && (
        <div role="alertdialog" aria-label="Confirm delete" data-testid="confirm-delete" className="mt-4 rounded-xl border px-4 py-3" style={{ background: "#fef2f2", borderColor: "#fca5a5" }}>
          <p className="text-[13px] font-semibold mb-2" style={{ color: "#7f1d1d" }}>Delete "{draft.title || persistedId}" permanently? Readers will lose access and this cannot be undone.</p>
          <div className="flex gap-2">
            <button className="aio-button aio-button--destructive aio-button--compact" disabled={busy} onClick={() => void doDelete()} data-testid="button-confirm-delete">{pending === "delete" ? "Deleting..." : "Delete entry"}</button>
            <button className="aio-button aio-button--outline aio-button--compact" disabled={busy} onClick={() => setConfirmDelete(false)} data-testid="button-cancel-delete">Keep entry</button>
          </div>
        </div>
      )}

      {mode === "preview" ? (
        <div className="mt-6 max-w-3xl" data-testid="preview">
          <h1 className="aio-type-page-title mb-2">{draft.title || "Untitled entry"}</h1>
          <p className="text-[13px] mb-1" style={{ color: vars.g500 }}>{draft.type} , {draft.readTime}</p>
          <p className="text-[14px] mb-5" style={{ color: vars.g600 }}>{draft.description}</p>
          <div className="rounded-2xl border p-6 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <BodyView body={buildPayload(draft, draft.status).body.map((b, i) => (b.type === "image" ? { ...b, url: (draft.body[i] as { url?: string }).url } : b))} />
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-8">
          <section aria-label="Entry details" className="rounded-2xl border p-5 sm:p-6 grid gap-4 sm:grid-cols-2" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="sm:col-span-2">
              <label htmlFor="f-title" className={labelCls} style={{ color: vars.g600 }}>Title</label>
              <input id="f-title" data-testid="input-title" className={fieldCls} style={{ borderColor: vars.fieldBorder }} value={draft.title} onChange={(e) => set({ title: e.target.value, ...(isNew && !idTouched && !busy ? { id: slugify(e.target.value) } : {}) })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="f-id" className={labelCls} style={{ color: vars.g600 }}>Entry id (permanent web address)</label>
              <input id="f-id" data-testid="input-id" className={fieldCls} style={{ borderColor: vars.fieldBorder, background: isNew ? "white" : vars.g100 }} value={draft.id} disabled={!isNew || busy} onChange={(e) => { setIdTouched(true); set({ id: e.target.value }); }} aria-describedby="f-id-help" />
              <p id="f-id-help" className="text-[12px] mt-1" style={{ color: vars.g500 }}>{isNew ? "Lowercase words joined by hyphens. It cannot change after the first save." : "The id is fixed once created."}</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="f-desc" className={labelCls} style={{ color: vars.g600 }}>Description</label>
              <textarea id="f-desc" data-testid="input-description" rows={2} className={fieldCls} style={{ borderColor: vars.fieldBorder }} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
            </div>
            <div>
              <label htmlFor="f-type" className={labelCls} style={{ color: vars.g600 }}>Type</label>
              <select id="f-type" data-testid="select-type" className={fieldCls} style={{ borderColor: vars.fieldBorder }} value={draft.type} onChange={(e) => set({ type: e.target.value as HowtoType })}>
                {HOWTO_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="f-read" className={labelCls} style={{ color: vars.g600 }}>Read time</label>
                <input id="f-read" data-testid="input-readtime" className={fieldCls} style={{ borderColor: vars.fieldBorder }} value={draft.readTime} onChange={(e) => set({ readTime: e.target.value })} />
              </div>
              <div>
                <label htmlFor="f-order" className={labelCls} style={{ color: vars.g600 }}>Display order</label>
                <input id="f-order" data-testid="input-order" type="number" step={1} className={fieldCls} style={{ borderColor: vars.fieldBorder }} value={draft.displayOrder} onChange={(e) => set({ displayOrder: e.target.value })} />
              </div>
            </div>
          </section>

          <section aria-label="Entry body" className="grid gap-4">
            <h2 className="aio-type-section-title">Guide content</h2>
            <HowtoDocumentEditor body={draft.body} onChange={(body) => set({ body })} />
          </section>
        </div>
      )}

    </div>
  );
}
