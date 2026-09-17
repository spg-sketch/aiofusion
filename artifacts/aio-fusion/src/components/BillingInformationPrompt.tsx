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

export function BillingInformationPrompt() {
  return (
    <div className="aio-type-supporting my-3 px-3 py-3 rounded-lg" style={{ color: "#92400E", background: "#FEF3C7" }}>
      <p>
        Complete and save your company address in <strong>Company and billing information</strong> to enable payment.
        {" "}Check that any other required fields marked * are filled in too.
      </p>
      <button
        type="button"
        className="aio-button aio-button--outline aio-button--compact mt-2"
        onClick={() => focusBillingSection("company-billing-information")}
      >
        Complete company address
      </button>
    </div>
  );
}