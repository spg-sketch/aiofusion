import { useState } from "react";
import { vars } from "../../marketing/vars";
import { isHttps } from "../../lib/howto";
import type { HowtoBlock, InlineRun } from "../../lib/howto";
import { ExternalLink } from "lucide-react";

export function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((r, i) => {
        let node: React.ReactNode = r.text;
        if (r.bold) node = <strong style={{ color: vars.navy, fontWeight: 600 }}>{node}</strong>;
        if (r.italic) node = <em>{node}</em>;
        if (r.href && isHttps(r.href)) {
          node = (
            <a href={r.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: vars.accent }}>
              {node}
            </a>
          );
        }
        return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{node}</span>;
      })}
    </>
  );
}

const body = "text-[14px] leading-[1.8]";

function BodyImage({ block }: { block: Extract<HowtoBlock, { type: "image" }> }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const unavailable = !block.url?.trim() || state === "failed";
  return (
    <figure className="my-5" data-testid="block-image">
      {!unavailable && (
        <img
          src={block.url}
          alt={block.altText}
          className={`w-full h-auto rounded-xl border${state === "loading" ? " hidden" : ""}`}
          style={{ borderColor: vars.g200 }}
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
        />
      )}
      {state !== "loaded" || unavailable ? (
        <div className="rounded-xl border px-4 py-8 text-center text-[12px]" style={{ borderColor: vars.g200, color: vars.g500 }}>
          <p>{unavailable ? "Image preview unavailable" : "Loading image…"}</p>
          {block.altText && <p className="mt-2">{block.altText}</p>}
        </div>
      ) : null}
      {block.caption && <figcaption className="text-[12px] mt-2 text-center" style={{ color: vars.g500 }}>{block.caption}</figcaption>}
    </figure>
  );
}

export function BlockView({ block }: { block: HowtoBlock }) {
  switch (block.type) {
    case "heading":
      return <h2 className="aio-type-card-title mt-7 mb-2 first:mt-0" data-testid="block-heading">{<Runs runs={block.runs} />}</h2>;
    case "paragraph":
      return <p className={`${body} mb-4`} style={{ color: vars.g600 }} data-testid="block-paragraph"><Runs runs={block.runs} /></p>;
    case "step":
      return (
        <div className="flex gap-3 mb-5" data-testid="block-step">
          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white mt-0.5" style={{ background: vars.accent }} aria-label={`Step ${block.number}`}>
            {block.number}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold mb-1" style={{ color: vars.navy }}>{block.title}</p>
            <p className={body} style={{ color: vars.g600 }}><Runs runs={block.runs} /></p>
          </div>
        </div>
      );
    case "tip":
      return (
        <div className="rounded-xl px-4 py-3 my-5" style={{ background: "rgba(165,47,96,0.06)", borderLeft: `3px solid ${vars.accent}` }} data-testid="block-tip">
          <p className="text-[12px] font-bold mb-0.5" style={{ color: vars.accent }}>Tip</p>
          <p className="text-[13px] leading-[1.7]" style={{ color: vars.g600 }}><Runs runs={block.runs} /></p>
        </div>
      );
    case "list":
      return (
        <ul className={`${body} mb-4 pl-5 list-disc`} style={{ color: vars.g600 }} data-testid="block-list">
          {block.items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      );
    case "image":
      return <BodyImage key={`${block.mediaId}:${block.url ?? ""}`} block={block} />;
    case "video":
      return (
        <div className="my-5 rounded-xl border px-4 py-3" style={{ borderColor: vars.g200, background: vars.g100 }} data-testid="block-video">
          {isHttps(block.url) ? (
            <a href={block.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[13px] font-semibold underline underline-offset-2" style={{ color: vars.accent }}>
              <ExternalLink size={14} /> {block.caption || "Watch the video"}
            </a>
          ) : (
            <span className="text-[13px]" style={{ color: vars.g500 }}>Video link unavailable</span>
          )}
        </div>
      );
  }
}

export function BodyView({ body: blocks }: { body: HowtoBlock[] }) {
  return <div>{blocks.map((b, i) => <BlockView key={i} block={b} />)}</div>;
}
