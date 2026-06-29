import { vars } from "../marketing/vars";
import { ArrowLeft, Archive } from "lucide-react";
function ArchivedProjectsPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: vars.g50 }}>
      <header className="border-b px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between" style={{ background: "white", borderColor: vars.g200 }}>
        <div className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-16 sm:h-24" />
        </div>
        <button onClick={onBack} className="text-[14px] font-medium flex items-center gap-1.5 hover:underline" style={{ color: vars.teal }}>
          <ArrowLeft size={16} /> Back to platform home
        </button>
      </header>
      <div className="px-4 sm:px-10 py-8 sm:py-12 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] mb-3" style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}>
            <Archive size={12} /> Archived Projects
          </div>
          <h1 className="text-3xl sm:text-4xl tracking-tight" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
            Past projects
          </h1>
          <p className="text-[15px] font-light mt-2 max-w-2xl" style={{ color: vars.g500 }}>
            Projects that have been completed or paused are stored here for reference. Open a project to revisit its intake, content, plan and reports.
          </p>
        </div>
        <div className="rounded-2xl border p-12 text-center" style={{ background: "white", borderColor: vars.g200 }}>
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(79, 143, 255, 0.1)", color: vars.teal }}>
            <Archive size={28} />
          </div>
          <h3 className="text-[16px] font-bold mb-2" style={{ color: vars.navy }}>No archived projects yet</h3>
          <p className="text-[14px] font-light max-w-md mx-auto" style={{ color: vars.g500 }}>
            Once you complete or pause a project from the Project Hub it will appear here, with full intake, content and report history preserved.
          </p>
        </div>
      </div>
    </div>
  );
}

export { ArchivedProjectsPage };
