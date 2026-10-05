export function focusBillingSection(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView({
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
  const missingField = Array.from(
    section.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[required], select[required]"),
  ).find((field) => !field.disabled && !field.validity.valid);
  (missingField ?? section).focus({ preventScroll: true });
}

export function BillingInformationPrompt({ id }: { id?: string } = {}) {
  return (
    <div id={id} role="status" className="aio-type-supporting my-3 px-4 py-4 rounded-lg border" style={{ color: "#92400E", background: "#FEF3C7", borderColor: "#FCD34D" }}>
      <p className="font-semibold mb-1">Company details required before payment</p>
      <p>
        Payment is disabled until your company details have been completed and saved.
        {" "}Fill in all required fields marked * in <strong>Company and billing information</strong>,
        then select <strong>Save company information</strong>. You can then return here to continue to Stripe.
      </p>
      <button
        type="button"
        className="aio-button aio-button--outline aio-button--compact mt-2"
        onClick={() => focusBillingSection("company-billing-information")}
      >
        Update company details
      </button>
    </div>
  );
}