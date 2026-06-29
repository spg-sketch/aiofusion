import { useState, useRef } from "react";
import { Plus, ArrowRight, Upload, Image as ImageIcon } from "lucide-react";
import { vars } from "../marketing/vars";

const ink = "#0a1628";
const accent = "#C8497A";

export function CreateProjectModal({ onCancel, onCreate }: { onCancel: () => void; onCreate: (name: string, logo?: string) => void }) {
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const canSubmit = name.trim().length > 0;
  const submit = () => { if (canSubmit) onCreate(name.trim(), logo ?? undefined); };
  const pickLogo = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/svg+xml,image/webp";
    input.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === "string") setLogo(reader.result); };
      reader.readAsDataURL(file);
    };
    input.click();
  };
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-['Inter',sans-serif]"
      style={{ background: "rgba(16,43,54,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl p-7 sm:p-8"
        style={{ background: "white", border: `1px solid ${vars.g200}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.22em] mb-4"
          style={{ background: "#FBE3ED", border: `1px solid ${accent}40`, color: accent }}
        >
          <Plus size={12} /> New Project
        </div>
        <h2 className="text-2xl mb-2" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
          Name your project
        </h2>
        <p className="text-[14px] font-light mb-5 leading-relaxed" style={{ color: vars.g500 }}>
          This is the brand, product or campaign you want to optimise. You can refine the rest of the details during set-up.
        </p>
        <label className="block text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: vars.g500 }}>
          Project name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="e.g. Acme Robotics"
          className="w-full rounded-xl px-4 py-3 text-[15px] outline-none"
          style={{ border: `1px solid ${vars.g200}`, color: ink }}
        />
        <label className="block text-[11px] font-bold uppercase tracking-[0.15em] mt-5 mb-2" style={{ color: vars.g500 }}>
          Logo <span className="font-medium normal-case tracking-normal" style={{ color: vars.g400 }}>(optional)</span>
        </label>
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
            style={{ background: logo ? "white" : "#FBE3ED", border: `1px solid ${vars.g200}` }}
          >
            {logo ? (
              <img src={logo} alt="Project logo" className="w-full h-full object-contain p-1" />
            ) : (
              <ImageIcon size={20} style={{ color: accent }} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={pickLogo}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold transition-colors"
              style={{ background: "white", border: `1px solid ${vars.g200}`, color: ink }}
            >
              <Upload size={13} /> {logo ? "Change logo" : "Upload logo"}
            </button>
            {logo && (
              <button
                onClick={() => setLogo(null)}
                className="text-[12px] font-medium hover:underline"
                style={{ color: vars.g500 }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-7">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.15em] transition-colors"
            style={{ color: vars.g500 }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.15em] text-white transition-all"
            style={{ background: accent, opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? "pointer" : "not-allowed" }}
          >
            <ArrowRight size={14} /> Create &amp; set up
          </button>
        </div>
      </div>
    </div>
  );
}
