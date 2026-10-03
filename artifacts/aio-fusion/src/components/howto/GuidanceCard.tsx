import { useState } from "react";
import { ArrowRight, BookOpen, Clock, FileText, Play } from "lucide-react";
import type { HowtoEntry } from "../../lib/howto";
import { firstHowtoImage } from "../../lib/howto";
import { vars } from "../../marketing/vars";

function Preview({ entry }: { entry: HowtoEntry }) {
  const image = firstHowtoImage(entry.body);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const Icon = entry.type === "Video" ? Play : entry.type === "Article" ? FileText : BookOpen;

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden" style={{ background: "linear-gradient(135deg, #FBE3ED, #E8F2F5)" }}>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" aria-hidden="true">
        <div className="rounded-2xl bg-white/75 p-5" style={{ color: vars.accent }}><Icon size={36} strokeWidth={1.5} /></div>
        <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: vars.g500 }}>AIO Fusion {entry.type}</span>
      </div>
      {image && !failed && (
        <img
          src={image.url}
          alt={image.altText}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          data-testid={`preview-howto-${entry.id}`}
        />
      )}
    </div>
  );
}

export function GuidanceCard({ entry, single, onOpen }: { entry: HowtoEntry; single: boolean; onOpen: () => void }) {
  const action = entry.type === "Video" ? "Watch video" : entry.type === "Article" ? "Read article" : "Read guide";
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`card-howto-${entry.id}`}
      className={`group overflow-hidden rounded-2xl border text-left transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#A52F60] ${single ? "grid md:grid-cols-2" : "flex flex-col"}`}
      style={{ background: "white", borderColor: vars.g200 }}
    >
      <Preview key={firstHowtoImage(entry.body)?.url ?? "no-image"} entry={entry} />
      <div className={`flex min-w-0 flex-1 flex-col p-6 sm:p-8 ${single ? "md:justify-center" : ""}`}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: vars.coralSoft, color: vars.accent }}>{entry.type}</span>
          <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: vars.g500 }}><Clock size={13} aria-hidden="true" />{entry.readTime}</span>
        </div>
        <h2 className="aio-type-card-title mb-3 break-words group-hover:underline decoration-1 underline-offset-4" style={{ color: vars.navy }}>{entry.title}</h2>
        <p className="text-[15px] leading-relaxed mb-6 break-words" style={{ color: vars.g500 }}>{entry.description}</p>
        <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold" style={{ color: vars.accent }}>
          {action}<ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </button>
  );
}