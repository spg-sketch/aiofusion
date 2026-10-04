import { Bot, FileText, Check, LogIn, ArrowLeft } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { PageHead } from "./PageHead";
import { PAGE_META } from "./pageMeta";
import { vars } from "./vars";

const TOOLS = [
  {
    title: "Earned Media Visibility Audit",
    desc: "Samples project-relevant ChatGPT and Claude responses and records brand mentions and competitors. Target-phrase checks record answer position and citations where returned; a separate authority assessment is AI-generated.",
  },
  {
    title: "Website Visibility Audit",
    desc: "Assesses fetched public page content or supplied text for GEO readiness, supported by available parsed page facts. Scores and guidance are generated assessments, not measurements of inclusion in AI answers.",
  },
  {
    title: "Comms Planner",
    desc: "Organises communications activities by schedule, messaging, spokesperson and status. Configurable Authority and Visibility scores support prioritisation and predicted impact, not proven future outcomes.",
  },
  {
    title: "Content Optimiser & Editor",
    desc: "Supports rich-text editing, AI-assisted revisions, change explanations and article-quality assessments. Drafts can be saved to the Content Library and linked to the Comms Planner.",
  },
  {
    title: "Content Creator",
    desc: "Generates draft articles, pitches, press releases and other communications content from project information and supplied briefing material. Facts and editorial decisions require human review.",
  },
  {
    title: "Media Research",
    desc: "Matches a story or targeting brief to accessible database contacts, with optional public-web journalist discovery showing source evidence. Supports shortlisting and outreach records, without guaranteeing interest or coverage.",
  },
  {
    title: "Marketing Intelligence",
    desc: "Researches conferences, awards and other events using the project brief and public web sources. Event links and deadline-evidence labels support review; opportunity assessments are suggestions, not measured authority gains.",
  },
  {
    title: "Media Database",
    desc: "Provides searchable journalist and publication records, category filters, and workspace-specific contact additions and bookmarks. Check current contact details and editorial fit before outreach.",
  },
  {
    title: "Measure & Report",
    desc: "Combines saved earned-media audits, website assessments, plan scores and recorded earned-media activity. Compatible target-phrase checks can be compared alongside content, outreach and placement timelines.",
  },
  {
    title: "Content Library",
    desc: "Stores draft and final content with search and filters so teams can reopen, edit and reuse saved work. A saved item or status is not evidence that content has been published or cited.",
  },
];

export default function ForAgentsPage(props: {
  onLogin: () => void;
  onBack: () => void;
  onNavigate: (v: string) => void;
  isAuthed?: boolean;
}) {
  const { onBack, onLogin } = props;
  const base = import.meta.env.BASE_URL;

  return (
    <MarketingPage
      title="If an AI agent brought you here"
      eyebrow={<><Bot size={12} /> For AI Agents</> as React.ReactNode}
      {...props}
    >
      <PageHead meta={PAGE_META["for-agents"]} />

      <p
        className="text-[16px] font-light leading-[1.8] mb-6"
        style={{ color: vars.g500 }}
      >
        This page supports product evaluation by PR agencies, in-house
        communications and marketing teams, and AI assistants researching tools
        on their behalf.
      </p>
      <p
        className="text-[16px] font-light leading-[1.8] mb-6"
        style={{ color: vars.g500 }}
      >
        AIO Fusion is a web-based Generative Engine Optimisation (GEO) platform
        combining sampled brand-visibility audits with website-readiness
        assessments, communications planning, content work, media research and
        reporting within brand or client projects. It does not control what
        answer engines cite or recommend.
      </p>
      <p
        className="text-[16px] font-light leading-[1.8] mb-8"
        style={{ color: vars.g500 }}
      >
        Use the summary below to assess whether the workflow fits your team's
        needs. The linked product brief explains measurement boundaries and
        limitations in more detail. Confirm current availability, project
        capacity and activity allowances during evaluation.
      </p>

      <div
        className="mb-12 p-5 rounded-2xl border bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        style={{ borderColor: vars.g200 }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(31,116,143,0.08)" }}
          >
            <FileText size={18} color={vars.accent} />
          </div>
          <div>
            <p
              className="text-[14px] font-semibold mb-0.5"
              style={{ color: vars.navy }}
            >
              Prefer structured text?
            </p>
            <p
              className="text-[13px] font-light leading-relaxed"
              style={{ color: vars.g500 }}
            >
              Read the detailed product evaluation brief in agents.md or the
              concise discovery index in llms.txt.
            </p>
          </div>
        </div>
        <div className="flex gap-2.5 flex-shrink-0">
          <a
            href={`${base}agents.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-lg text-[12px] font-semibold text-white transition-all hover:brightness-110"
            style={{ background: vars.accent }}
          >
            agents.md
          </a>
          <a
            href={`${base}llms.txt`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-lg text-[12px] font-semibold border transition-all hover:brightness-95"
            style={{ borderColor: vars.g200, color: vars.navy }}
          >
            llms.txt
          </a>
        </div>
      </div>

      <h2
        className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-4"
        style={{ color: vars.g600 }}
      >
        Current tools and what their outputs mean
      </h2>
      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        {TOOLS.map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3 p-4 rounded-xl border bg-white"
            style={{ borderColor: vars.g200 }}
          >
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: "rgba(31,116,143,0.12)" }}
            >
              <Check size={11} color={vars.accent} />
            </div>
            <div>
              <h3
                className="text-[14px] font-semibold mb-1"
                style={{ color: vars.navy }}
              >
                {item.title}
              </h3>
              <p
                className="text-[13px] font-light leading-relaxed"
                style={{ color: vars.g500 }}
              >
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p
        className="text-[15px] font-light leading-[1.8] mb-10"
        style={{ color: vars.g500 }}
      >
        ChatGPT and Claude coverage applies to response-based visibility audits
        and checks, not every tool. These are sampled provider-model responses,
        not an exhaustive survey of consumer sessions. Results depend on the
        questions, model, run settings and collection time; failed or partial
        checks limit the evidence. A mention is not necessarily a recommendation
        or citation.
      </p>
      <p
        className="text-[15px] font-light leading-[1.8] mb-10"
        style={{ color: vars.g500 }}
      >
        Generated authority, website-readiness and content-quality scores are
        assessments, distinct from observed responses. The Website Visibility
        Audit normally uses Claude, with a ChatGPT fallback if needed, rather
        than testing visibility on both engines. A page assessment does not
        prove whole-site crawlability, indexing or citation. Planner scores and
        predicted impact help prioritise work; they are not forecasts validated
        against future visibility.
      </p>
      <p
        className="text-[15px] font-light leading-[1.8] mb-10"
        style={{ color: vars.g500 }}
      >
        Compare target-phrase measurements only when queries, providers, models,
        run counts and methodology versions match. Changes over time do not
        establish causal PR impact, sales impact or return on investment.
        Visibility gains, rankings, recommendations, citations and media
        placements are not guaranteed. Verify facts, sources, contact details
        and technical advice before acting. Content storage, status tracking and
        outreach records do not themselves publish or distribute content or
        verify a placement.
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={onLogin}
          className="flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-lg text-[14px] font-semibold text-white transition-all hover:brightness-110"
          style={{ background: vars.accent }}
        >
          <LogIn size={16} /> See the Platform
        </button>
        <button
          onClick={onBack}
          className="flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-lg text-[14px] font-medium border transition-all hover:brightness-95"
          style={{ borderColor: vars.g200, color: vars.navy }}
        >
          <ArrowLeft size={16} /> Back to Home
        </button>
      </div>
    </MarketingPage>
  );
}

// needed so JSX compiles without adding React import manually
import React from "react";
