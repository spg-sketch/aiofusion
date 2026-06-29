import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/apiHelpers";

export function CategoryPickerModal({
  all, selected, projectSet = [], onClose, onSave,
}: {
  all: string[]; selected: string[]; projectSet?: string[];
  onClose: () => void; onSave: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(selected);
  const [search, setSearch] = useState("");
  const [customCategories, setCustomCategories] = useState<{ id: number; name: string }[]>([]);
  const [newCatInput, setNewCatInput] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  useEffect(() => {
    fetch(`${apiBase()}/api/store/media-categories`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.custom) setCustomCategories(d.custom); })
      .catch(() => {});
  }, []);

  const allCustomNames = customCategories.map((c) => c.name);
  const combined = Array.from(new Set([...all, ...allCustomNames])).sort((a, b) => a.localeCompare(b));
  const filtered = combined.filter((c) => !search || c.toLowerCase().includes(search.toLowerCase()));

  const addCustomCategory = async () => {
    const name = newCatInput.trim();
    if (!name || addingCat) return;
    setAddingCat(true);
    try {
      const resp = await fetch(`${apiBase()}/api/store/media-categories`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (resp.ok) {
        const d = await resp.json();
        setCustomCategories((prev) => [...prev, { id: d.category.id, name }]);
        setDraft((prev) => Array.from(new Set([...prev, name])));
        setNewCatInput("");
      }
    } catch {}
    setAddingCat(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
          <h2 className="text-[16px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Trade media categories (alpha)</h2>
          <button onClick={onClose} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
        </div>
        <div className="px-6 py-3 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: vars.g100 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter categories..." className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
          {projectSet.length > 0 && (
            <button onClick={() => setDraft(Array.from(new Set([...draft, ...projectSet])))} className="text-[12px] font-semibold px-3 py-2 rounded-lg" style={{ background: "rgba(31,116,143,0.08)", color: vars.accent }}>
              + Use Project Set-Up ({projectSet.length})
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {filtered.map((cat) => {
              const on = draft.includes(cat);
              const isCustom = allCustomNames.includes(cat) && !all.includes(cat);
              return (
                <button key={cat} onClick={() => setDraft(on ? draft.filter((c) => c !== cat) : [...draft, cat])} className="text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors" style={{ background: on ? "rgba(31,116,143,0.08)" : "transparent" }}>
                  <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0" style={{ borderColor: on ? vars.accent : vars.g300, background: on ? vars.accent : "transparent" }}>
                    {on && <Check size={11} color="white" />}
                  </div>
                  <span className="text-[12px]" style={{ color: vars.navy }}>{cat}</span>
                  {isCustom && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ml-auto" style={{ background: "rgba(201,160,78,0.15)", color: "#7A5E25" }}>Custom</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="px-6 py-3 border-t" style={{ borderColor: vars.g100 }}>
          <div className="flex items-center gap-2">
            <input
              value={newCatInput}
              onChange={(e) => setNewCatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addCustomCategory(); } }}
              placeholder="Add a custom category..."
              className="flex-1 px-3 py-2 rounded-lg border text-[12px]"
              style={{ borderColor: vars.g200 }}
            />
            <button
              onClick={() => void addCustomCategory()}
              disabled={!newCatInput.trim() || addingCat}
              className="px-3 py-2 rounded-lg text-[12px] font-semibold text-white"
              style={{ background: vars.accent, opacity: newCatInput.trim() && !addingCat ? 1 : 0.45 }}
            >
              {addingCat ? "Adding..." : "+ Add"}
            </button>
          </div>
        </div>
        <div className="px-6 py-3 border-t flex justify-between gap-2" style={{ borderColor: vars.g200 }}>
          <button onClick={() => setDraft([])} className="text-[12px] font-semibold px-3 py-2 rounded-lg" style={{ color: vars.g500 }}>Clear all</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-[13px] font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
            <button onClick={() => onSave(draft)} className="text-[13px] font-semibold px-4 py-2 rounded-lg text-white" style={{ background: vars.accent }}>Done ({draft.length})</button>
          </div>
        </div>
      </div>
    </div>
  );
}
