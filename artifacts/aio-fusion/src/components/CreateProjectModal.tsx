import { useState, useRef, useEffect } from "react";
import { Plus, ArrowRight, Upload, Image as ImageIcon } from "lucide-react";
import { vars } from "../marketing/vars";
import type { PackageCapacity } from "../lib/billingAllowance";

const ink = "#0a1628";
const accent = "#C8497A";

export function CreateProjectModal({ onCancel, onCreate, initialName, forClientName, error, packageCapacity }: {
  onCancel: () => void;
  onCreate: (name: string, logo?: string) => void | Promise<void | { ok?: boolean }>;
  /** Pre-fills the project name (e.g. the client's company name when starting from a hub placeholder card). */
  initialName?: string;
  /** When set, the modal notes the project will be created under this client's account. */
  forClientName?: string;
  /** Persistence failures keep the dialog open and explain why retry is needed. */
  error?: string | null;
  /** Server-calculated capacity shown as guidance; the save endpoint remains authoritative. */
  packageCapacity?: PackageCapacity | null;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [logo, setLogo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const canSubmit = name.trim().length > 0 && !submitting;
  submittingRef.current = submitting;
  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    firstFocusRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onCancel]);
  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await onCreate(name.trim(), logo ?? undefined);
      // Existing Project Hub callers return void and have always expected the
      // modal to close. Onboarding returns { ok: false } when retry is needed.
      if (!result || result.ok !== false) onCancel();
    } finally {
      setSubmitting(false);
    }
  };
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
      onClick={() => { if (!submittingRef.current) onCancel(); }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
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
        <h2 id="create-project-title" className="text-2xl mb-2" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>
          Name your project
        </h2>
        <p className="text-[14px] font-light mb-5 leading-relaxed" style={{ color: vars.g500 }}>
          This is the brand, product or campaign you want to optimise. You can refine the rest of the details during set-up.
        </p>
        {forClientName && (
          <p className="text-[13px] font-medium mb-5 px-4 py-3 rounded-xl" style={{ background: "#FBE3ED", color: accent }}>
            This project will be created in the Client Project for <strong>{forClientName}</strong>.
          </p>
        )}
        {packageCapacity && (
          <div className="text-[13px] leading-relaxed mb-5 px-4 py-3 rounded-xl" data-testid="create-project-capacity" style={{ background: vars.g50, color: vars.g600, border: `1px solid ${vars.g200}` }}>
            <p>
              <strong style={{ color: ink }}>{packageCapacity.included}</strong> included ·{" "}
              <strong style={{ color: ink }}>{packageCapacity.purchased}</strong> purchased ·{" "}
              <strong style={{ color: ink }}>{packageCapacity.reserved}</strong> reserved ·{" "}
              <strong style={{ color: ink }}>{packageCapacity.used}</strong> used ·{" "}
              <strong style={{ color: ink }}>{packageCapacity.remaining === null ? "Unlimited" : Math.max(0, packageCapacity.remaining)}</strong> remaining ·{" "}
              <strong style={{ color: ink }}>{packageCapacity.allowance === null ? "Unlimited" : packageCapacity.allowance}</strong> allowance
            </p>
            <p className="mt-1">{packageCapacity.overLimit ? "Over package limit. Existing hubs remain readable." : "Within package allowance."}</p>
            {packageCapacity.kind === "agency" && (
              <p className="mt-1">Each managed client can have one project. Creating its first project uses the package that client already reserves.</p>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-[13px] leading-relaxed mb-4 px-4 py-3 rounded-xl" style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" }}>
            {error}
          </p>
        )}
        <label htmlFor="create-project-name" className="block text-[11px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: vars.g500 }}>
          Project name
        </label>
        <input
          ref={firstFocusRef}
          id="create-project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="e.g. Acme Robotics"
          className="w-full rounded-xl px-4 py-3 text-[15px] outline-none"
          style={{ border: `1px solid ${vars.g200}`, color: ink }}
        />
        <span id="create-project-logo-label" className="block text-[11px] font-bold uppercase tracking-[0.15em] mt-5 mb-2" style={{ color: vars.g500 }}>
          Logo <span className="font-medium normal-case tracking-normal" style={{ color: vars.g400 }}>(optional)</span>
        </span>
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
              type="button"
              aria-labelledby="create-project-logo-label"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-semibold transition-colors"
              style={{ background: "white", border: `1px solid ${vars.g200}`, color: ink }}
            >
              <Upload size={13} /> {logo ? "Change logo" : "Upload logo"}
            </button>
            {logo && (
              <button
                onClick={() => setLogo(null)}
                type="button"
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
            type="button"
            className="px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.15em] transition-colors"
            style={{ color: vars.g500 }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            type="button"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold uppercase tracking-[0.15em] text-white transition-all"
            style={{ background: accent, opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? "pointer" : "not-allowed" }}
          >
            <ArrowRight size={14} /> {submitting ? "Creating..." : "Create & set up"}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">{submitting ? "Creating project…" : ""}</p>
      </div>
    </div>
  );
}
