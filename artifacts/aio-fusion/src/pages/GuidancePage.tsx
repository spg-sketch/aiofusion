import { ArrowLeft, BookOpen } from "lucide-react";
import { vars } from "../marketing/vars";

export function GuidancePage({ onBack }: { onBack: () => void }) {
  const articles = [
    { title: "Getting started with AIO Fusion", desc: "A walk-through of the platform, from intake to measurement.", type: "Article" },
    { title: "Running an AIO Diagnostic", desc: "How to interpret the diagnostic score and pick the first fixes.", type: "Article" },
    { title: "Building a comms plan that scores", desc: "Turning the Comms Planner into AI authority impact.", type: "Article" },
    { title: "Optimising content for AI citation", desc: "Tracked-changes editing for press releases, articles and case studies.", type: "Video" },
    { title: "Measuring AI authority growth", desc: "Reading the cycle history and the released-coverage metrics.", type: "Video" },
    { title: "Working with multiple projects", desc: "Project Hub, archived projects and switching between them.", type: "Article" },
  ];
  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: vars.g50 }}>
      <header className="border-b px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between" style={{ background: "white", borderColor: vars.g200 }}>
        <div className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-16 sm:h-24" />
        </div>
        <button onClick={onBack} className="text-[12px] font-medium flex items-center gap-1.5 hover:underline" style={{ color: vars.g500 }}>
          <ArrowLeft size={14} /> Back to platform home
        </button>
      </header>
      <div className="px-4 sm:px-10 py-8 sm:py-12 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] mb-3" style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}>
            <BookOpen size={12} /> Guidance
          </div>
          <h1 className="text-3xl sm:text-4xl tracking-tight" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
            How-to articles and videos
          </h1>
          <p className="text-[15px] font-light mt-2 max-w-2xl" style={{ color: vars.g500 }}>
            Short guides to get the most out of AIO Fusion. Articles and videos will be added as the platform grows.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {articles.map((a) => (
            <div key={a.title} className="rounded-2xl border p-5 transition-all hover:shadow-md" style={{ background: "white", borderColor: vars.g200 }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded" style={{ background: vars.lightBg, color: vars.accent }}>{a.type}</span>
                <span className="text-[11px] font-light italic" style={{ color: vars.g400 }}>Coming soon</span>
              </div>
              <h3 className="text-[15px] font-bold mb-1" style={{ color: vars.navy }}>{a.title}</h3>
              <p className="text-[13px] font-light leading-relaxed" style={{ color: vars.g500 }}>{a.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
