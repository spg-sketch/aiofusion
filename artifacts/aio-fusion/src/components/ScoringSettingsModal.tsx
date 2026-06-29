import { useState } from "react";
import { vars } from "../marketing/vars";
import type { ScoringConfig, PlannerStatus } from "../types";
import { DEFAULT_SCORING } from "../lib/contentStore";

export function ScoringSettingsModal({ cfg, onSave, onClose }: { cfg: ScoringConfig; onSave: (c: ScoringConfig) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ScoringConfig>(JSON.parse(JSON.stringify(cfg)));
  const [newType, setNewType] = useState("");
  const [newChannel, setNewChannel] = useState("");
  const updateWeight = (t: string, k: "vis" | "auth", v: number) => {
    setDraft({ ...draft, typeWeights: { ...draft.typeWeights, [t]: { ...draft.typeWeights[t], [k]: v } } });
  };
  const removeType = (t: string) => {
    const tw = { ...draft.typeWeights }; delete tw[t]; setDraft({ ...draft, typeWeights: tw });
  };
  const addType = () => {
    const name = newType.trim(); if (!name || draft.typeWeights[name]) return;
    setDraft({ ...draft, typeWeights: { ...draft.typeWeights, [name]: { vis: 5, auth: 5 } } });
    setNewType("");
  };
  const removeChannel = (c: string) => setDraft({ ...draft, channels: draft.channels.filter((x) => x !== c) });
  const addChannel = () => {
    const name = newChannel.trim(); if (!name || draft.channels.includes(name)) return;
    setDraft({ ...draft, channels: [...draft.channels, name] }); setNewChannel("");
  };
  const updateStatus = (s: PlannerStatus, v: number) => setDraft({ ...draft, statusMultipliers: { ...draft.statusMultipliers, [s]: v } });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: vars.navy }}>Scoring settings</h2>
            <p className="text-[11px]" style={{ color: vars.g500 }}>Tune how Visibility and Authority scores are calculated. Saved per browser.</p>
          </div>
          <button onClick={onClose} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
        </div>
        <div className="p-6 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[13px] font-semibold" style={{ color: vars.navy }}>Content type weights</h3>
              <span className="text-[11px]" style={{ color: vars.g500 }}>Each weight 0–10</span>
            </div>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: vars.g200 }}>
              <table className="w-full text-[12px]">
                <thead style={{ background: vars.g50 }}>
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: vars.g500 }}>Type</th>
                    <th className="px-3 py-2 text-left font-semibold w-24" style={{ color: vars.g500 }}>Visibility</th>
                    <th className="px-3 py-2 text-left font-semibold w-24" style={{ color: vars.g500 }}>Authority</th>
                    <th className="px-3 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(draft.typeWeights).map(([t, w]) => (
                    <tr key={t} className="border-t" style={{ borderColor: vars.g100 }}>
                      <td className="px-3 py-2" style={{ color: vars.navy }}>{t}</td>
                      <td className="px-3 py-2"><input type="number" min={0} max={10} step={0.5} value={w.vis} onChange={(e) => updateWeight(t, "vis", parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1 rounded border text-[12px]" style={{ borderColor: vars.g200 }} /></td>
                      <td className="px-3 py-2"><input type="number" min={0} max={10} step={0.5} value={w.auth} onChange={(e) => updateWeight(t, "auth", parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1 rounded border text-[12px]" style={{ borderColor: vars.g200 }} /></td>
                      <td className="px-3 py-2 text-right"><button onClick={() => removeType(t)} className="text-[11px]" style={{ color: vars.red }} title="Remove">×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-2">
              <input type="text" value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Add new content type…" className="flex-1 px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
              <button onClick={addType} className="px-3 py-2 rounded-lg text-[12px] font-semibold text-white" style={{ background: vars.accent }}>Add type</button>
            </div>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold mb-2" style={{ color: vars.navy }}>Channel multiplier (Visibility only)</h3>
            <p className="text-[11px] mb-3" style={{ color: vars.g500 }}>Visibility multiplier = base + (channels × step), capped at max.</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>Base</label>
                <input type="number" step={0.05} value={draft.channelBase} onChange={(e) => setDraft({ ...draft, channelBase: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>Step (per channel)</label>
                <input type="number" step={0.05} value={draft.channelStep} onChange={(e) => setDraft({ ...draft, channelStep: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>Max (cap)</label>
                <input type="number" step={0.05} value={draft.channelCap} onChange={(e) => setDraft({ ...draft, channelCap: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: vars.g500 }}>Channels</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {draft.channels.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border" style={{ borderColor: vars.g200, color: vars.navy }}>
                    {c}
                    <button onClick={() => removeChannel(c)} style={{ color: vars.red }}>×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newChannel} onChange={(e) => setNewChannel(e.target.value)} placeholder="Add new channel…" className="flex-1 px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
                <button onClick={addChannel} className="px-3 py-2 rounded-lg text-[12px] font-semibold text-white" style={{ background: vars.accent }}>Add channel</button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold mb-2" style={{ color: vars.navy }}>Status multipliers</h3>
            <p className="text-[11px] mb-3" style={{ color: vars.g500 }}>Discounts both Visibility and Authority by delivery confidence.</p>
            <div className="grid grid-cols-4 gap-3">
              {(Object.keys(draft.statusMultipliers) as PlannerStatus[]).map((s) => (
                <div key={s}>
                  <label className="text-[11px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: vars.g500 }}>{s}</label>
                  <input type="number" min={0} max={1} step={0.05} value={draft.statusMultipliers[s]} onChange={(e) => updateStatus(s, parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 rounded-lg border text-[12px]" style={{ borderColor: vars.g200 }} />
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="px-6 py-4 border-t flex items-center justify-between" style={{ borderColor: vars.g200 }}>
          <button onClick={() => setDraft(JSON.parse(JSON.stringify(DEFAULT_SCORING)))} className="text-[12px] font-semibold px-3 py-2 rounded-lg" style={{ color: vars.g500, background: vars.g50 }}>Reset to defaults</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-[13px] font-semibold px-4 py-2 rounded-lg border" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
            <button onClick={() => onSave(draft)} className="text-[13px] font-semibold px-4 py-2 rounded-lg text-white" style={{ background: vars.accent }}>Save settings</button>
          </div>
        </div>
      </div>
    </div>
  );
}
