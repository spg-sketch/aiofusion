import { useState } from "react";
import { HelpCircle } from "lucide-react";

const NAVY = "#165265";
const ACCENT = "#1f748f";
const G200 = "#E5E5E5";
const G500 = "#6B7280";

export default function InfoTip({ text, width = 220 }: { text: string; width?: number }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-1.5 align-middle">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShow(!show);
        }}
        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
        style={{ background: show ? ACCENT : G200 }}
        aria-label="More info"
      >
        <HelpCircle size={10} color={show ? "white" : G500} />
      </button>
      {show && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg text-[11px] leading-relaxed font-normal normal-case tracking-normal whitespace-normal shadow-lg z-50"
          style={{ background: NAVY, color: "white", width, pointerEvents: "none" }}
        >
          {text}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: `5px solid ${NAVY}`,
            }}
          />
        </div>
      )}
    </span>
  );
}
