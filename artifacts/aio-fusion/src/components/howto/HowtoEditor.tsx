import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useCreateAdminHowto, useUpdateAdminHowto, useDeleteAdminHowto } from "@workspace/api-client-react";
import { AlertCircle, ArrowDown, ArrowUp, Check, Image as ImageIcon, Loader2, Plus, Trash2 } from "lucide-react";
import { vars } from "../../marketing/vars";
import { MediaLibraryModal } from "../MediaLibraryModal";
import { RichRunsEditor } from "./RichRunsEditor";
import { BodyView } from "./HowtoBlocks";
import { HOWTO_TYPES, buildPayload, draftFromEntry, emptyDraft, errorMessage, slugify, validateDraft } from "../../lib/howto";
import type { HowtoBlock, HowtoDraft, HowtoEntry, HowtoStatus, HowtoType } from "../../lib/howto";

export type EditorControl = { save: () => Promise<{ ok: boolean; error?: string }> };
export type EditorState = { dirty: boolean; busy: boolean };

type Props = {
  entry: HowtoEntry | null;
  onPersisted: (entry: HowtoEntry) => void;
  onDeleted: (id: string) => void;
  onStateChange: (state: EditorState) => void;
  controlRef: MutableRefObject<EditorControl | null>;
};

const NEW_BLOCKS: Array<{ label: string; make: () => HowtoBlock }> = [
  { label: "Heading", make: () => ({ type: "heading", runs: [{ text: "" }] }) },
  { label: "Paragraph", make: () => ({ type: "paragraph", runs: [{ text: "" }] }) },
  { label: "List", make: () => ({ type: "list", items: [""] }) },
  { label: "Numbered step", make: () => ({ type: "step", number: 1, title: "", runs: [{ text: "" }] }) },
  { label: "Tip", make: () => ({ type: "tip", runs: [{ text: "" }] }) },
  { label: "Image", make: () => ({ type: "image", mediaId: "", altText: "" }) },
  { label: "Video link", make: () => ({ type: "video", url: "https://" }) },
];

const fieldCls = "w-full rounded-lg border px-3 py-2.5 text-[14px] bg-white";
const labelCls = "block text-[12px] font-semibold mb-1.5";
let keySeq = 0;
const newKey = () => `b${++keySeq}`;

export function HowtoEditor({ entry, onPersisted, onDeleted, onStateChange, controlRef }: Props) {
  const initial = entry ? draftFromEntry(entry) : emptyDraft();
  const [draft, setDraft] = useState<HowtoDraft>(initial);
  const [keys, setKeys] = useState<string[]>(() => initial.body.map(newKey));
  const [persistedId, setPersistedId] = useState<string | null>(entry?.id ?? null);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [idTouched, setIdTouched] = useState(!!entry);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [pending, setPending] = useState<null | "save" | "publish" | "unpublish" | "delete">(null);
  const [saveError, setSaveError] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<number | null>(null);

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
  const setBody = (body: HowtoBlock[]) => set({ body });
  const updateBlock = (i: number, b: HowtoBlock) => setBody(draft.body.map((x, j) => (j === i ? b : x)));

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

  const move = (i: number, d: 1 | -1) => {
    const j = i + d;
    if (j < 0 || j >= draft.body.length) return;
    const body = [...draft.body]; [body[i], body[j]] = [body[j], body[i]];
    const k = [...keys]; [k[i], k[j]] = [k[j], k[i]];
    setKeys(k); setBody(body);
  };
  const remove = (i: number) => { setKeys(keys.filter((_, j) => j !== i)); setBody(draft.body.filter((_, j) => j !== i)); };
  const add = (make: () => HowtoBlock) => { setKeys([...keys, newKey()]); setBody([...draft.body, make()]); };

  let stepCounter = 0;
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
            <h2 className="aio-type-section-title">Body</h2>
            {draft.body.length === 0 && (
              <div className="rounded-2xl border border-dashed px-6 py-10 text-center text-[13px]" style={{ borderColor: vars.g300, color: vars.g500 }}>No content yet. Add a block below to start writing.</div>
            )}
            {draft.body.map((b, i) => {
              if (b.type === "step") stepCounter += 1;
              const title = b.type === "step" ? `Step ${stepCounter}` : b.type === "list" ? "List" : b.type === "image" ? "Image" : b.type === "video" ? "Video link" : b.type[0].toUpperCase() + b.type.slice(1);
              return (
                <div key={keys[i]} className="rounded-2xl border p-4 sm:p-5" style={{ background: "white", borderColor: vars.g200 }} data-testid={`block-editor-${i}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="aio-type-eyebrow" style={{ color: vars.accent }}>{title}</span>
                    <div className="flex gap-1">
                      <button className="aio-button aio-button--text aio-button--compact" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move block ${i + 1} up`}><ArrowUp size={14} /></button>
                      <button className="aio-button aio-button--text aio-button--compact" onClick={() => move(i, 1)} disabled={i === draft.body.length - 1} aria-label={`Move block ${i + 1} down`}><ArrowDown size={14} /></button>
                      <button className="aio-button aio-button--text aio-button--compact" onClick={() => remove(i)} aria-label={`Remove block ${i + 1}`} style={{ color: "#b91c1c" }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {(b.type === "heading" || b.type === "paragraph" || b.type === "tip") && (
                    <RichRunsEditor runs={b.runs} label={`${title} text`} testId={`rich-${i}`} placeholder={`Write the ${b.type}`} onChange={(runs) => updateBlock(i, { ...b, runs })} />
                  )}
                  {b.type === "step" && (
                    <div className="grid gap-3">
                      <div>
                        <label htmlFor={`step-title-${i}`} className={labelCls} style={{ color: vars.g600 }}>Step title</label>
                        <input id={`step-title-${i}`} data-testid={`step-title-${i}`} className={fieldCls} style={{ borderColor: vars.fieldBorder }} value={b.title} onChange={(e) => updateBlock(i, { ...b, title: e.target.value })} />
                      </div>
                      <RichRunsEditor runs={b.runs} label={`Step ${stepCounter} text`} testId={`rich-${i}`} placeholder="Describe the step" onChange={(runs) => updateBlock(i, { ...b, runs })} />
                    </div>
                  )}
                  {b.type === "list" && (
                    <div className="grid gap-2">
                      {b.items.map((it, k) => (
                        <div key={k} className="flex gap-2">
                          <input aria-label={`List item ${k + 1}`} className={fieldCls} style={{ borderColor: vars.fieldBorder }} value={it} onChange={(e) => updateBlock(i, { ...b, items: b.items.map((x, y) => (y === k ? e.target.value : x)) })} />
                          <button className="aio-button aio-button--text aio-button--compact" aria-label={`Remove list item ${k + 1}`} onClick={() => updateBlock(i, { ...b, items: b.items.filter((_, y) => y !== k) })}><Trash2 size={14} /></button>
                        </div>
                      ))}
                      <button className="aio-button aio-button--outline aio-button--compact w-fit" onClick={() => updateBlock(i, { ...b, items: [...b.items, ""] })}><Plus size={14} /> Add item</button>
                    </div>
                  )}
                  {b.type === "image" && (
                    <div className="grid gap-3">
                      {b.mediaId && b.url ? <img src={b.url} alt={b.altText} className="max-h-56 rounded-lg border object-contain" style={{ borderColor: vars.g200 }} /> : null}
                      <button className="aio-button aio-button--outline aio-button--compact w-fit" onClick={() => setMediaTarget(i)} data-testid={`choose-image-${i}`}><ImageIcon size={14} /> {b.mediaId ? "Change image" : "Choose image"}</button>
                      <div>
                        <label htmlFor={`alt-${i}`} className={labelCls} style={{ color: vars.g600 }}>Alt text (describe the image for screen readers)</label>
                        <input id={`alt-${i}`} data-testid={`alt-${i}`} className={fieldCls} style={{ borderColor: vars.fieldBorder }} value={b.altText} onChange={(e) => updateBlock(i, { ...b, altText: e.target.value })} />
                      </div>
                      <div>
                        <label htmlFor={`cap-${i}`} className={labelCls} style={{ color: vars.g600 }}>Caption (optional)</label>
                        <input id={`cap-${i}`} className={fieldCls} style={{ borderColor: vars.fieldBorder }} value={b.caption ?? ""} onChange={(e) => updateBlock(i, { ...b, caption: e.target.value })} />
                      </div>
                    </div>
                  )}
                  {b.type === "video" && (
                    <div className="grid gap-3">
                      <div>
                        <label htmlFor={`vurl-${i}`} className={labelCls} style={{ color: vars.g600 }}>Video link (https only)</label>
                        <input id={`vurl-${i}`} data-testid={`video-url-${i}`} className={fieldCls} style={{ borderColor: vars.fieldBorder }} value={b.url} onChange={(e) => updateBlock(i, { ...b, url: e.target.value })} />
                      </div>
                      <div>
                        <label htmlFor={`vcap-${i}`} className={labelCls} style={{ color: vars.g600 }}>Link text (optional)</label>
                        <input id={`vcap-${i}`} className={fieldCls} style={{ borderColor: vars.fieldBorder }} value={b.caption ?? ""} onChange={(e) => updateBlock(i, { ...b, caption: e.target.value })} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Add a block">
              {NEW_BLOCKS.map((nb) => (
                <button key={nb.label} className="aio-button aio-button--outline aio-button--compact" onClick={() => add(nb.make)} data-testid={`add-${nb.label.toLowerCase().replace(/\s+/g, "-")}`}><Plus size={14} /> {nb.label}</button>
              ))}
            </div>
          </section>
        </div>
      )}

      {mediaTarget !== null && (
        <MediaLibraryModal
          onClose={() => setMediaTarget(null)}
          onSelect={(m) => {
            const b = draft.body[mediaTarget];
            if (b?.type === "image") updateBlock(mediaTarget, { ...b, mediaId: m.id, url: m.publicUrl, altText: b.altText || m.altText || "" });
            setMediaTarget(null);
          }}
        />
      )}
    </div>
  );
}
