import { Search, FileEdit, Calendar, LineChart, Archive, Sparkles } from "lucide-react";

/** Public, data-free view of the real platform's workflow and module names. */
export default function PlatformPreview({ variant = "audit" }: { variant?: "audit" | "workflow" }) {
  return <figure className="overflow-hidden rounded-2xl border border-[#1A647B]/25 bg-white shadow-[0_24px_60px_-20px_rgba(16,43,54,.3)]" aria-label={variant === "audit" ? "AIO Fusion platform audit view illustration" : "AIO Fusion platform workflow illustration"}>
    <div className="flex items-center justify-between px-4 py-3 bg-[#1A647B] text-white">
      <span className="font-bold tracking-wide text-sm">AIO Fusion <span className="text-[#F4B4CD]">/</span> Platform</span>
      <span className="text-[10px] uppercase tracking-wider text-white/80">Preview · No customer data</span>
    </div>
    <div className="grid grid-cols-[72px_1fr] sm:grid-cols-[110px_1fr] min-h-[280px] sm:min-h-[350px]">
      <div className="bg-[#102B36] text-white/80 p-3 flex flex-col gap-5 text-[10px]">
        {[[Search, "Audit"], [Calendar, "Planner"], [FileEdit, "Optimiser"], [Archive, "Library"], [LineChart, "Reports"]].map(([Icon, label], i) => {
          const IconComponent = Icon as typeof Search;
          return <div key={label as string} className={`flex items-center gap-2 ${i === (variant === "audit" ? 0 : 2) ? "text-[#F4B4CD]" : ""}`}><IconComponent size={16} /><span className="hidden sm:inline">{label as string}</span></div>;
        })}
      </div>
      <div className="p-4 sm:p-6">
        <div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#A33860] mb-2">{variant === "audit" ? "AI Visibility Audit" : "Content Optimiser"}</div>
        <h3 className="text-lg sm:text-2xl text-[#102B36] mb-4" style={{ fontFamily: "'Alice', Georgia, serif" }}>{variant === "audit" ? "Understand your AI presence" : "From first draft to stronger content"}</h3>
        {variant === "audit" ? <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            {[["Earned media", "#1A647B"], ["Website content", "#C8497A"], ["AI visibility", "#B48C3B"]].map(([label, color]) =>
              <div key={label} className="rounded-lg border p-2 sm:p-3" style={{ borderColor: color }}><span className="block h-1.5 w-12 rounded-full mb-4" style={{ background: color }} /><span className="text-[10px] sm:text-xs font-semibold text-[#102B36]">{label}</span></div>)}
          </div>
          <div className="rounded-lg bg-[#F3F7F8] p-3 sm:p-4">
            <p className="text-[11px] font-bold text-[#102B36] mb-3">Visibility across ChatGPT and Claude</p>
            <div className="flex items-end gap-2 h-16">{[35, 58, 45, 75, 60, 88, 70, 95].map((height, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${height}%`, background: i % 3 === 0 ? "#C8497A" : "#1A647B" }} />)}</div>
          </div>
        </> : <>
          <div className="rounded-lg border border-[#d6e4e8] p-3 sm:p-4 mb-3 text-xs text-[#102B36]">
            <span className="inline-flex items-center gap-1 text-[#A33860] font-bold text-[10px] uppercase tracking-wider mb-3"><Sparkles size={12} /> Editorial workflow</span>
            <div className="h-2 bg-[#e6eff1] rounded w-11/12 mb-3" /><div className="h-2 bg-[#e6eff1] rounded w-full mb-3" /><div className="h-2 bg-[#e6eff1] rounded w-8/12" />
          </div>
          <div className="grid grid-cols-2 gap-3">{["Review suggestions", "Track changes"].map((text, i) => <div key={text} className="rounded-lg p-3 text-[11px] font-semibold" style={{ background: i ? "#FBE3ED" : "#e8f3f5", color: "#102B36" }}>{text}</div>)}</div>
        </>}
      </div>
    </div>
    <figcaption className="sr-only">Illustrative, data-free view using AIO Fusion's actual platform modules; not a live customer report.</figcaption>
  </figure>;
}