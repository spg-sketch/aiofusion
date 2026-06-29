import { useState } from "react";
import { BookOpen, ArrowUpRight } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { vars } from "./vars";
import blogTile1 from "../assets/blog-tile-1.png";
import blogTile2 from "../assets/blog-tile-2.png";
import blogTile3 from "../assets/blog-tile-3.png";

export default function InsightsPage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean; initialFilter?: string | null; onClearFilter?: () => void }) {
  const { initialFilter, onClearFilter, ...marketingProps } = props;
  const articles = [
    { title: "The B2B Marketer's Fast Guide to Winning AI Authority in 2026", excerpt: "What is AIO? And is PR really the new SEO? Cut through the hype around AI's impact on B2B marketing.", url: "https://simpaticopraiauthorityguide.carrd.co/", tag: "Guide", img: blogTile1, accent: vars.accent, external: true },
    { title: "Why earned media beats paid in the AI era", excerpt: "How AI engines weigh third-party validation when deciding which brands to recommend.", url: "#", tag: "Article", img: blogTile2, accent: vars.coral, external: false },
    { title: "The 6 GEO signal categories every brand should track", excerpt: "A practical breakdown of the criteria AI models use to rank, surface and cite content.", url: "#", tag: "Article", img: blogTile3, accent: vars.gold, external: false },
    { title: "From SEO to AIO: a transition playbook for marketing teams", excerpt: "How to evolve your existing SEO programme into one that captures AI visibility.", url: "#", tag: "Playbook", img: blogTile1, accent: vars.green, external: false },
    { title: "How to set up your first project in AIO Fusion", excerpt: "Walk-through of Project Set-Up: company basics, spokespeople, key messages, audiences and content cadence.", url: "#", tag: "Guidance", img: blogTile2, accent: vars.accent, external: false },
    { title: "Running an Authority Report and reading the results", excerpt: "How the six GEO signal categories are scored, what each band means, and where to focus first.", url: "#", tag: "Guidance", img: blogTile3, accent: vars.accent, external: false },
    { title: "Using the Optimiser with tracked changes", excerpt: "How to review every edit the platform suggests, accept or reject changes, and export the final draft.", url: "#", tag: "Guidance", img: blogTile1, accent: vars.accent, external: false },
    { title: "Building a Media Research list that journalists will actually open", excerpt: "How the platform verifies beat contacts, what the V/P/U flags mean, and how to use the methodology tab.", url: "#", tag: "Guidance", img: blogTile2, accent: vars.accent, external: false },
  ];
  const allTags = Array.from(new Set(articles.map((a) => a.tag)));
  const [activeTag, setActiveTag] = useState<string | null>(initialFilter ?? null);
  const visible = activeTag ? articles.filter((a) => a.tag === activeTag) : articles;
  const isGuidance = activeTag === "Guidance";
  return (
    <MarketingPage title={isGuidance ? "Guidance" : "Insights"} eyebrow={<><BookOpen size={12} /> {isGuidance ? "How-to library" : "Library"}</> as any} {...marketingProps}>
      <p className="text-[16px] font-light leading-[1.8] mb-6" style={{ color: vars.g500 }}>
        {isGuidance
          ? "How-to articles and videos for using the AIO Fusion platform - set-up, Authority Reports, Optimiser, Media Research and more."
          : "Practical thinking on AI visibility, GEO, and the future of PR and marketing. Filter to Guidance for platform how-to content."}
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <button
          onClick={() => { setActiveTag(null); onClearFilter?.(); }}
          className="text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full transition-colors"
          style={{ background: activeTag === null ? vars.navy : "transparent", color: activeTag === null ? "white" : vars.g500, border: `1px solid ${activeTag === null ? vars.navy : vars.g200}` }}
        >
          All
        </button>
        {allTags.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTag(t)}
            className="text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full transition-colors"
            style={{ background: activeTag === t ? vars.navy : "transparent", color: activeTag === t ? "white" : vars.g500, border: `1px solid ${activeTag === t ? vars.navy : vars.g200}` }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-6">
        {visible.map((a) => (
          <a
            key={a.title}
            href={a.url}
            {...(a.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="group block rounded-2xl overflow-hidden bg-white transition-all hover:shadow-xl hover:-translate-y-1"
            style={{ border: `1px solid ${vars.g200}` }}
          >
            <div className="aspect-[16/10] overflow-hidden" style={{ background: vars.navy }}>
              <img src={a.img} alt="" aria-hidden="true" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="p-6">
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.16em] mb-3 px-2 py-0.5 rounded" style={{ background: `${a.accent}18`, color: a.accent }}>{a.tag}</span>
              <h3 className="text-[18px] font-semibold mb-2 leading-snug" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{a.title}</h3>
              <p className="text-[13px] font-light leading-[1.7]" style={{ color: vars.g500 }}>{a.excerpt}</p>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold mt-4" style={{ color: a.accent }}>Read <ArrowUpRight size={12} /></span>
            </div>
          </a>
        ))}
      </div>
    </MarketingPage>
  );
}
