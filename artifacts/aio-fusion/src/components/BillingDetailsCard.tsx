import { useEffect, useState } from "react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/apiHelpers";

const ink = vars.navy;
const accent = vars.accent;

type AddressFields = {
  company: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  country: string;
};

const EMPTY_ADDRESS: AddressFields = { company: "", line1: "", line2: "", city: "", postcode: "", country: "" };

// Kept exported for legacy-address regression tests and old stored records.
export function composeAddress(a: AddressFields): string {
  return [a.company, a.line1, a.line2, a.city, a.postcode, a.country]
    .map((v) => v.trim())
    .filter(Boolean)
    .join("\n");
}

export function splitAddress(text: string): AddressFields {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { ...EMPTY_ADDRESS };
  const a = { ...EMPTY_ADDRESS, company: lines[0] ?? "", line1: lines[1] ?? "" };
  const rest = lines.slice(2);
  if (rest.length >= 4) {
    a.line2 = rest[0] ?? "";
    a.city = rest[1] ?? "";
    a.postcode = rest[2] ?? "";
    a.country = rest.slice(3).join(", ");
  } else {
    a.city = rest[0] ?? "";
    a.postcode = rest[1] ?? "";
    a.country = rest[2] ?? "";
  }
  return a;
}

type CompanyBillingForm = {
  companyName: string;
  billingEmail: string;
  keyAccountHolderEmail: string;
  addressLine1: string;
  addressLine2: string;
  townCity: string;
  postcode: string;
  country: string;
  vatNumber: string;
};

type CompanyBillingResponse = CompanyBillingForm & {
  legacyBillingAddress?: string;
};

type FieldKey = keyof CompanyBillingForm;
type FieldErrors = Partial<Record<FieldKey, string>>;

const EMPTY_FORM: CompanyBillingForm = {
  companyName: "",
  billingEmail: "",
  keyAccountHolderEmail: "",
  addressLine1: "",
  addressLine2: "",
  townCity: "",
  postcode: "",
  country: "",
  vatNumber: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK"
).split(" ");
const countryDisplayNames = new Intl.DisplayNames(["en-GB"], { type: "region" });
const COUNTRY_OPTIONS = ISO_COUNTRY_CODES
  .map((code) => ({ code, label: countryDisplayNames.of(code) ?? code }))
  .sort((a, b) => a.label.localeCompare(b.label, "en-GB"));
const COUNTRY_ALIASES: Record<string, string> = {
  uk: "GB",
  "great britain": "GB",
  britain: "GB",
  "united states of america": "US",
  usa: "US",
};

function countryKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normaliseCountryCode(value: string): string {
  const key = countryKey(value);
  return COUNTRY_ALIASES[key]
    ?? COUNTRY_OPTIONS.find((option) => option.code.toLowerCase() === key || countryKey(option.label) === key)?.code
    ?? "";
}

function validate(form: CompanyBillingForm): FieldErrors {
  const errors: FieldErrors = {};
  const required: FieldKey[] = [
    "companyName", "billingEmail", "keyAccountHolderEmail", "addressLine1", "townCity", "postcode", "country",
  ];
  for (const key of required) {
    if (!form[key].trim()) errors[key] = "This field is required.";
  }
  if (form.billingEmail && !EMAIL_RE.test(form.billingEmail.trim())) {
    errors.billingEmail = "Enter a valid billing email address.";
  }
  if (form.keyAccountHolderEmail && !EMAIL_RE.test(form.keyAccountHolderEmail.trim())) {
    errors.keyAccountHolderEmail = "Enter a valid key account holder email address.";
  }
  return errors;
}

export function BillingDetailsCard({ onSaved }: { onSaved?: () => void } = {}) {
  const [form, setForm] = useState<CompanyBillingForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [legacyBillingAddress, setLegacyBillingAddress] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/platform/billing-details`, { credentials: "include" });
        const json = await res.json().catch(() => ({})) as Partial<CompanyBillingResponse> & { error?: string };
        if (!res.ok) throw new Error(json.error || "Could not load company information.");
        if (!cancelled) {
          setForm({
            companyName: json.companyName ?? "",
            billingEmail: json.billingEmail ?? "",
            keyAccountHolderEmail: json.keyAccountHolderEmail ?? "",
            addressLine1: json.addressLine1 ?? "",
            addressLine2: json.addressLine2 ?? "",
            townCity: json.townCity ?? "",
            postcode: json.postcode ?? "",
            country: normaliseCountryCode(json.country ?? ""),
            vatNumber: json.vatNumber ?? "",
          });
          setLegacyBillingAddress(json.legacyBillingAddress ?? "");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not load company information." });
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function updateField(key: FieldKey, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setMessage(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors = validate(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setMessage({ kind: "error", text: "Complete the highlighted required fields." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase()}/api/platform/billing-details`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({})) as {
        error?: string;
        fieldErrors?: FieldErrors;
        record?: CompanyBillingForm;
      };
      if (!res.ok) {
        setErrors(json.fieldErrors ?? {});
        setMessage({ kind: "error", text: json.error ?? "Could not save company information." });
        return;
      }
      if (json.record) setForm({ ...EMPTY_FORM, ...json.record });
      setLegacyBillingAddress("");
      setErrors({});
      setMessage({ kind: "ok", text: "Company and billing information saved." });
      window.dispatchEvent(new Event("aio:company-billing-saved"));
      onSaved?.();
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "aio-type-body w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2 disabled:opacity-50";
  const labelClass = "aio-type-label block mb-1.5";

  function field(
    key: FieldKey,
    label: string,
    options: { type?: string; placeholder?: string; optional?: boolean; maxLength?: number; help?: string } = {},
  ) {
    const error = errors[key];
    const descriptionId = `${key}-${error ? "error" : "help"}`;
    return (
      <div className="md:col-span-6">
        <label htmlFor={key} className={labelClass} style={{ color: vars.g600 }}>
          {label}{" "}
          <span style={{ color: options.optional ? vars.g400 : accent }}>
            {options.optional ? "(optional)" : "*"}
          </span>
        </label>
        <input
          id={key}
          name={key}
          type={options.type ?? "text"}
          value={form[key]}
          onChange={(e) => updateField(key, e.target.value)}
          placeholder={options.placeholder}
          maxLength={options.maxLength ?? 120}
          required={!options.optional}
          disabled={!loaded}
          aria-invalid={!!error}
          aria-describedby={error || options.help ? descriptionId : undefined}
          className={inputClass}
          style={{ borderColor: error ? "#DC2626" : vars.g200, ["--tw-ring-color" as any]: accent }}
        />
        {(error || options.help) && (
          <p id={descriptionId} className="aio-type-meta mt-1" style={{ color: error ? "#B91C1C" : vars.g500 }}>
            {error ?? options.help}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      id="company-billing-information"
      tabIndex={-1}
      className="rounded-2xl p-6 sm:p-8 mb-6 scroll-mt-6"
      style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}
    >
      <h2 className="aio-type-card-title mb-1" style={{ color: ink }}>
        Company and billing information
      </h2>
      <p className="aio-type-body mb-5" style={{ color: vars.g500 }}>
        Required before payment. Invoices go to the billing contact. The key account holder is used for account-management communication only and does not change sign-in access.
      </p>
      <form onSubmit={handleSave} noValidate className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {legacyBillingAddress && (
          <div className="md:col-span-12 rounded-xl p-4" style={{ background: "#FEF3C7", border: "1px solid #FCD34D" }}>
            <p className="aio-type-supporting font-semibold mb-1" style={{ color: "#92400E" }}>
              Confirm your previously saved address
            </p>
            <p className="aio-type-supporting mb-2" style={{ color: "#92400E" }}>
              This older address was saved as free text. It has not been rearranged or sent to Stripe. Enter it in the structured address fields below, then save.
            </p>
            <pre className="aio-type-supporting whitespace-pre-wrap font-sans" style={{ color: ink }}>{legacyBillingAddress}</pre>
          </div>
        )}
        {field("companyName", "Company name", { placeholder: "e.g. Acme Ltd", maxLength: 128 })}
        {field("billingEmail", "Billing contact email", {
          type: "email",
          placeholder: "e.g. accounts@acme.com",
          maxLength: 255,
          help: "Invoices and payment correspondence are sent here.",
        })}
        {field("keyAccountHolderEmail", "Key account holder email", {
          type: "email",
          placeholder: "e.g. director@acme.com",
          maxLength: 255,
          help: "Used for account-management communication, not invoices or sign-in.",
        })}
        {field("vatNumber", "VAT number", {
          placeholder: "e.g. GB123456789",
          optional: true,
          maxLength: 64,
          help: "Only add this if your business is VAT registered.",
        })}
        <div className="md:col-span-12 mt-1">
          <span className="aio-type-eyebrow" style={{ color: ink }}>Company address</span>
        </div>
        {field("addressLine1", "Address line 1", { placeholder: "e.g. 1 High Street" })}
        {field("addressLine2", "Address line 2", { placeholder: "e.g. Suite 4", optional: true })}
        {field("townCity", "Town / city", { placeholder: "e.g. London" })}
        {field("postcode", "Postcode", { placeholder: "e.g. SW1A 1AA", maxLength: 32 })}
        <div className="md:col-span-6">
          <label htmlFor="country" className={labelClass} style={{ color: vars.g600 }}>
            Country <span style={{ color: accent }}>*</span>
          </label>
          <select
            id="country"
            name="country"
            value={form.country}
            onChange={(e) => updateField("country", e.target.value)}
            required
            disabled={!loaded}
            aria-invalid={!!errors.country}
            aria-describedby={errors.country ? "country-error" : undefined}
            className={inputClass}
            style={{ borderColor: errors.country ? "#DC2626" : vars.g200, ["--tw-ring-color" as any]: accent }}
          >
            <option value="">Select a country</option>
            {COUNTRY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
          {errors.country && (
            <p id="country-error" className="text-[11px] mt-1" style={{ color: "#B91C1C" }}>
              {errors.country}
            </p>
          )}
        </div>
        <div className="md:col-span-12 flex flex-wrap items-center gap-3 mt-1">
          <button
            type="submit"
            disabled={saving || !loaded}
            className="aio-button aio-button--primary billing-details-save rounded-full uppercase tracking-[0.12em]"
            style={{ background: accent }}
          >
            {saving ? "Saving..." : "Save company information"}
          </button>
          {message && (
              <span role="status" className="aio-type-supporting" style={{ color: message.kind === "ok" ? "#166534" : "#991B1B" }}>
              {message.text}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}