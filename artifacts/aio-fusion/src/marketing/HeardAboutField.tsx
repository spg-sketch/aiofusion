import { ContactHeardAboutSource } from "@workspace/api-client-react";
import { useId } from "react";
import { vars } from "./vars";

export const heardAboutOptions = Object.values(ContactHeardAboutSource);
export const hasHeardAboutDetail = (value: string) =>
  value === "AI assistant - other" || value === "Other";

export default function HeardAboutField({
  id, value, detail, onChange, onDetailChange,
}: {
  id: string;
  value: string;
  detail: string;
  onChange: (value: string) => void;
  onDetailChange: (value: string) => void;
}) {
  const fieldId = `${id}-${useId()}`;
  const controlClass = "w-full min-w-0 rounded-xl border px-4 py-3 text-[16px] sm:text-[14px] outline-none focus:ring-2 focus:ring-[#A52F60] bg-white";
  const controlStyle = { borderColor: vars.fieldBorder, color: "#102B36" };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-[13px] font-semibold" style={{ color: "#102B36" }}>
        How did you hear about us?
      </label>
      <select id={fieldId} value={value} className={controlClass} style={controlStyle}
        aria-describedby={`${fieldId}-hint`}
        onChange={(event) => { onChange(event.target.value); onDetailChange(""); }}>
        <option value="">Please select (optional)</option>
        {heardAboutOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <p id={`${fieldId}-hint`} className="text-[12px]" style={{ color: vars.g600 }}>Optional</p>
      {hasHeardAboutDetail(value) && <>
        <label htmlFor={`${fieldId}-detail`} className="text-[13px] font-semibold mt-2" style={{ color: "#102B36" }}>
          {value === "AI assistant - other" ? "Which AI assistant?" : "Please specify"}
        </label>
        <input id={`${fieldId}-detail`} type="text" value={detail} maxLength={300}
          className={controlClass} style={controlStyle}
          onChange={(event) => onDetailChange(event.target.value)} />
      </>}
    </div>
  );
}