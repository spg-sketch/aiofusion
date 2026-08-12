import { useEffect, useState } from "react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/apiHelpers";

const ink = vars.navy;
const accent = vars.accent;

// Billing details (billing email + VAT number), stored on the account's
// company row. Invoices go to the billing email regardless of who the owner
// is; the VAT number appears on invoices. Editable by owner, admin, and
// billing members - the parent component gates rendering by membership role.
export function BillingDetailsCard() {
  const [billingEmail, setBillingEmail] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/platform/billing-details`, { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as { billingEmail?: string; vatNumber?: string };
        if (cancelled) return;
        setBillingEmail(json.billingEmail ?? "");
        setVatNumber(json.vatNumber ?? "");
      } catch {
        /* card still renders; saving will surface errors */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase()}/api/platform/billing-details`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingEmail, vatNumber }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ kind: "error", text: json.error ?? "Could not save billing details." });
        return;
      }
      setMessage({ kind: "ok", text: "Billing details saved." });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
      <h2 className="text-[16px] font-bold mb-1" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Billing details</h2>
      <p className="text-[13px] mb-4" style={{ color: vars.g500 }}>
        Invoices are sent to the billing email below. If you have a VAT number, it will appear on your invoices.
      </p>
      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6">
          <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>
            Billing email <span className="normal-case font-normal tracking-normal" style={{ color: vars.g400 }}>(optional)</span>
          </label>
          <input
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            placeholder="e.g. accounts@acme.com"
            disabled={!loaded}
            className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2 disabled:opacity-50"
            style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
          />
        </div>
        <div className="md:col-span-6">
          <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>
            VAT number <span className="normal-case font-normal tracking-normal" style={{ color: vars.g400 }}>(optional)</span>
          </label>
          <input
            type="text"
            value={vatNumber}
            onChange={(e) => setVatNumber(e.target.value)}
            placeholder="e.g. GB123456789"
            disabled={!loaded}
            className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2 disabled:opacity-50"
            style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent }}
          />
        </div>
        <div className="md:col-span-12 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !loaded}
            className="px-5 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: accent }}
          >
            {saving ? "Saving..." : "Save billing details"}
          </button>
          {message && (
            <span className="text-[13px]" style={{ color: message.kind === "ok" ? "#166534" : "#991B1B" }}>
              {message.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
