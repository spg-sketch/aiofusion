import { ArrowLeft, BookOpen } from "lucide-react";
import { vars } from "./vars";
import type { Article, ArticleSection } from "./articles-data";

function SectionBlock({ section }: { section: ArticleSection }) {
  if (section.type === "heading") {
    return (
      <h2
        className="text-[22px] font-semibold mt-10 mb-3 leading-snug"
        style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}
      >
        {section.text}
      </h2>
    );
  }
  if (section.type === "subheading") {
    return (
      <h3
        className="text-[17px] font-semibold mt-7 mb-2 leading-snug"
        style={{ color: vars.navy }}
      >
        {section.text}
      </h3>
    );
  }
  if (section.type === "paragraph") {
    return (
      <p
        className="text-[16px] font-light leading-[1.85] mb-5"
        style={{ color: vars.g600 }}
      >
        {section.text}
      </p>
    );
  }
  if (section.type === "pullquote") {
    return (
      <blockquote
        className="my-8 pl-6 py-4 border-l-4 rounded-r-xl"
        style={{ borderColor: vars.accent, background: `${vars.accent}08` }}
      >
        <p
          className="text-[18px] font-medium leading-[1.65] italic"
          style={{ color: vars.navy }}
        >
          "{section.text}"
        </p>
      </blockquote>
    );
  }
  if (section.type === "stat") {
    return (
      <div
        className="my-7 px-5 py-4 rounded-2xl border"
        style={{ background: `${vars.gold}0F`, borderColor: `${vars.gold}40` }}
      >
        <p
          className="text-[15px] font-semibold leading-[1.6]"
          style={{ color: vars.navy }}
        >
          📊 {section.text}
        </p>
      </div>
    );
  }
  if (section.type === "list" && section.items) {
    return (
      <ul className="my-5 space-y-3 pl-0">
        {section.items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: vars.accent }}
            />
            <span
              className="text-[15px] font-light leading-[1.75]"
              style={{ color: vars.g600 }}
            >
              {item}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

export default function ArticleDetailView({
  article,
  onBack,
  coverImg,
}: {
  article: Article;
  onBack: () => void;
  coverImg: string;
}) {
  const cream = "#FBF6EC";

  return (
    <div
      className="min-h-screen font-['Inter',sans-serif]"
      style={{ background: cream }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-8 pb-20">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 mb-8 text-[13px] font-semibold uppercase tracking-[0.12em] transition-opacity hover:opacity-70"
          style={{ color: vars.accent }}
        >
          <ArrowLeft size={14} /> Back to Insights
        </button>

        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.18em] mb-4"
          style={{ background: `${vars.accent}18`, color: vars.accent }}
        >
          <BookOpen size={10} /> {article.tag}
        </div>

        <h1
          className="text-3xl sm:text-4xl font-semibold mb-4 leading-[1.2]"
          style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}
        >
          {article.title}
        </h1>

        <p
          className="text-[17px] font-light leading-[1.75] mb-8"
          style={{ color: vars.g500 }}
        >
          {article.excerpt}
        </p>

        <div
          className="w-full rounded-2xl overflow-hidden mb-10"
          style={{
            aspectRatio: "16/9",
            background: vars.navy,
            boxShadow: "0 8px 32px rgba(10,22,40,0.12)",
          }}
        >
          <img
            src={coverImg}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="article-body">
          {article.sections.map((section, i) => (
            <SectionBlock key={i} section={section} />
          ))}
        </div>

        <div
          className="mt-14 pt-8 border-t flex items-center justify-between"
          style={{ borderColor: vars.g200 }}
        >
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-[13px] font-semibold transition-opacity hover:opacity-70"
            style={{ color: vars.accent }}
          >
            <ArrowLeft size={14} /> Back to Insights
          </button>
        </div>
      </div>
    </div>
  );
}
