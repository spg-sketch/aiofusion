import { useState } from "react";
import { vars } from "../marketing/vars";
import { ArrowLeft, BookOpen, ChevronDown, ChevronUp, FileText, Play } from "lucide-react";

type Article = {
  id: string;
  title: string;
  desc: string;
  type: "Article" | "Guide" | "Video";
  readTime: string;
  content: React.ReactNode;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-[13px] font-bold mb-2" style={{ color: vars.navy }}>{title}</p>
      <div className="text-[13px] font-light leading-[1.8]" style={{ color: vars.g600 }}>{children}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white mt-0.5" style={{ background: vars.accent }}>{n}</div>
      <div>
        <p className="text-[13px] font-semibold mb-1" style={{ color: vars.navy }}>{title}</p>
        <div className="text-[13px] font-light leading-[1.8]" style={{ color: vars.g600 }}>{children}</div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3 mt-4" style={{ background: "rgba(31,116,143,0.06)", borderLeft: `3px solid ${vars.accent}` }}>
      <p className="text-[12px] font-semibold mb-0.5" style={{ color: vars.accent }}>Tip</p>
      <p className="text-[12px] font-light leading-[1.7]" style={{ color: vars.g600 }}>{children}</p>
    </div>
  );
}

const ARTICLES: Article[] = [
  {
    id: "getting-started",
    title: "Getting started with AIO Fusion",
    desc: "A walk-through of the platform, from intake to measurement.",
    type: "Guide",
    readTime: "5 min read",
    content: (
      <div>
        <Section title="What AIO Fusion does">
          AIO Fusion helps PR and marketing teams make their clients visible to AI answer engines - ChatGPT, Claude, and others. Instead of optimising for search ranking alone, you optimise for the signals that large language models use to decide whether to mention, recommend, or cite a brand.
        </Section>
        <Section title="The four steps">
          <Step n={1} title="Set up your project">
            Every client or brand gets its own project. Start by clicking <strong>Create Project</strong> in the Project Hub, then complete the Project Set-Up form (Section 1-7). Fill in company details, key messages, spokespeople, target audiences, and the content cadence you plan to run. The more complete the Set-Up, the better your audit and content results will be.
          </Step>
          <Step n={2} title="Run your first LLM Check">
            Go to <strong>LLM Check / Earned Media</strong> from the sidebar. This audit sends your brand name and sector to ChatGPT and Claude simultaneously and records whether and how they mention you, who they list as competitors, and what they say. Run it before any optimisation work so you have a clean baseline.
          </Step>
          <Step n={3} title="Use the content and optimisation tools">
            Once you have a baseline, use <strong>Content Creator</strong> to draft new press releases, articles, and case studies optimised for AI citation, and <strong>Content Optimiser</strong> to rewrite existing material with tracked changes that show exactly what was altered and why. Use <strong>Media Research</strong> to build targeted journalist lists.
          </Step>
          <Step n={4} title="Measure your progress">
            Re-run the LLM Check after a programme of work - typically after 4-6 weeks of consistent content activity. Compare the before and after results to show clients concrete movement in AI visibility, share of voice, and competitive positioning.
          </Step>
        </Section>
        <Tip>Complete as much of Project Set-Up as possible before running any audits or generating content. Sections 1-3 are the minimum; sections 4-7 add depth that significantly improves output quality.</Tip>
      </div>
    ),
  },
  {
    id: "aio-diagnostic",
    title: "Running an AIO Diagnostic",
    desc: "How to interpret the diagnostic score and pick the first fixes.",
    type: "Guide",
    readTime: "4 min read",
    content: (
      <div>
        <Section title="What the diagnostic measures">
          The AIO Diagnostic (Technical GEO) analyses a website's structure and content against the six signals that AI crawlers use to assess authority and trustworthiness: content structure, factual clarity, entity signals, link authority, schema markup, and crawl accessibility. Each signal gets a band score: Strong, Good, Needs work, or Weak.
        </Section>
        <Section title="Running the diagnostic">
          <Step n={1} title="Enter the website URL">
            From the sidebar, go to <strong>Technical GEO / Website Audit</strong>. Enter the full URL of the site you want to assess (including https://) and click Run Diagnostic. The audit takes 30-60 seconds.
          </Step>
          <Step n={2} title="Read the overall score">
            The top of the report shows a composite score out of 100 and an overall band. Use this as the headline metric for client reporting. A score below 50 means significant structural work is needed before content investment will have full impact.
          </Step>
          <Step n={3} title="Work through the six signals">
            Each signal section shows the band, a one-sentence summary, and a list of specific findings. Focus on <strong>Needs work</strong> and <strong>Weak</strong> bands first - these have the highest impact-to-effort ratio.
          </Step>
          <Step n={4} title="Share with the developer">
            The export button at the top of the report produces a clean HTML file you can send directly to a web developer. It contains the full findings in plain language with no jargon.
          </Step>
        </Section>
        <Section title="What the bands mean">
          <strong>Strong (80-100):</strong> This signal is working in your favour. Maintain it.<br />
          <strong>Good (60-79):</strong> Solid, with room for incremental improvement.<br />
          <strong>Needs work (40-59):</strong> This signal is neutral or slightly negative. Address within 4-6 weeks.<br />
          <strong>Weak (0-39):</strong> This signal is actively reducing AI visibility. Prioritise immediately.
        </Section>
        <Tip>Re-run the diagnostic 6-8 weeks after the developer has implemented the recommended changes. A before-and-after comparison is one of the clearest deliverables you can show a client.</Tip>
      </div>
    ),
  },
  {
    id: "comms-planner",
    title: "Building a comms plan that scores",
    desc: "Turning the Comms Planner into AI authority impact.",
    type: "Article",
    readTime: "4 min read",
    content: (
      <div>
        <Section title="What the Comms Planner does">
          The Comms Planner helps you build a structured content calendar that maps press releases, articles, and commentary to the key messages you defined in Project Set-Up. Rather than planning by channel alone, it plans by narrative authority - ensuring each piece of output reinforces the same consistent signals that AI models look for.
        </Section>
        <Section title="Creating a plan">
          <Step n={1} title="Open Comms Planner from the sidebar">
            Select your project first, then click <strong>Comms Planner</strong>. You will see the current month's calendar view and a list of any existing planned items.
          </Step>
          <Step n={2} title="Add a new content item">
            Click <strong>Add item</strong> and select the content type (press release, article, commentary, case study, etc.), the planned publication date, the target publication or outlet, and the key message it should reinforce from your Project Set-Up.
          </Step>
          <Step n={3} title="Link to content output">
            Once a piece is drafted in Content Creator, you can link it back to the planner item. This closes the loop between plan and output and lets you track what was actually delivered against what was planned.
          </Step>
          <Step n={4} title="Review cadence">
            AI models weight recency and consistency. A plan with one press release per month, consistently delivered, will outperform irregular bursts over time. Use the planner to hold the cadence.
          </Step>
        </Section>
        <Tip>Align your comms plan with the same narrative threads as your Project Set-Up key messages. Inconsistency across outputs is one of the main reasons brands score poorly on entity clarity in audits.</Tip>
      </div>
    ),
  },
  {
    id: "content-optimiser",
    title: "Optimising content for AI citation",
    desc: "Tracked-changes editing for press releases, articles, and case studies.",
    type: "Guide",
    readTime: "5 min read",
    content: (
      <div>
        <Section title="What the Content Optimiser does">
          The Content Optimiser takes a piece of existing content - a press release, article, blog post, or case study - and rewrites it to improve its chances of being cited by AI answer engines, while preserving the author's original voice and argument. Changes are shown as tracked edits so you can see exactly what was altered and accept or reject each change before publishing.
        </Section>
        <Section title="Running an optimisation">
          <Step n={1} title="Paste your content">
            From the sidebar, go to <strong>Content Optimiser</strong>. Paste the full text of the content piece you want to optimise. Include the headline and any subheadings.
          </Step>
          <Step n={2} title="Select content type">
            Choose the content type from the dropdown (press release, article, case study, etc.). This adjusts the optimisation approach - a press release is treated differently from a long-form article.
          </Step>
          <Step n={3} title="Add any specific guidance">
            If there are particular claims to preserve, a specific brand voice guide, or sections to avoid changing, add these in the guidance field. The optimiser will work within those constraints.
          </Step>
          <Step n={4} title="Review tracked changes">
            The output shows the revised text with additions highlighted in green and removals in red. Each significant change includes a brief rationale. Review each change and use the accept/reject controls.
          </Step>
          <Step n={5} title="Copy and publish">
            Once you are satisfied with the accepted changes, copy the clean version and publish via your normal channel.
          </Step>
        </Section>
        <Section title="What the optimiser changes">
          The main areas of intervention are: entity clarity (making the subject and its relationships unmistakable), factual precision (replacing vague language with specific data points), structural signalling (adding or improving subheadings so models can parse the content hierarchy), and citation anchoring (ensuring claims are attributed to named sources where relevant).
        </Section>
        <Tip>Optimise existing high-performing content first - a press release that already got good coverage is worth making AI-friendly because it may already exist in model training data.</Tip>
      </div>
    ),
  },
  {
    id: "measuring-growth",
    title: "Measuring AI authority growth",
    desc: "Reading the cycle history and released-coverage metrics.",
    type: "Article",
    readTime: "3 min read",
    content: (
      <div>
        <Section title="The LLM Check as your measurement tool">
          The LLM Check / Earned Media Audit is the primary measurement instrument in AIO Fusion. Each run is timestamped and saved to your project's audit history. Running it at regular intervals - before a programme starts, and every 4-6 weeks thereafter - gives you a longitudinal dataset that shows genuine movement in AI visibility.
        </Section>
        <Section title="What to look for between runs">
          <Step n={1} title="Overall mentions">
            Are both ChatGPT and Claude mentioning the brand? At the start of a programme, clients with low authority are often absent entirely. Appearing, even briefly, is a measurable first step.
          </Step>
          <Step n={2} title="Share of voice">
            The report shows which competitors are mentioned alongside your client and how often. A rising share of voice - your client mentioned more frequently relative to competitors - is a strong indicator of improving authority.
          </Step>
          <Step n={3} title="Sentiment and framing">
            Beyond presence, look at how the brand is described. Are the descriptions becoming more precise, more positive, or more aligned with your key messages? This reflects whether the content programme is shaping model understanding.
          </Step>
          <Step n={4} title="Consistency across models">
            If ChatGPT mentions the brand but Claude does not (or vice versa), there is still work to do. Consistent presence across both models is the target.
          </Step>
        </Section>
        <Section title="Reporting to clients">
          Export the LLM Check report using the HTML export button. The report includes all probe results, competitor data, and the AI commentary in a clean, client-ready format. Run a baseline export before starting any work and save it - it is the most important proof point for demonstrating ROI at the end of a programme.
        </Section>
        <Tip>Save every audit run - do not overwrite old ones. The saved audit history in your project sidebar is your evidence trail. Clients who see a clear before-and-after are significantly more likely to renew.</Tip>
      </div>
    ),
  },
  {
    id: "multiple-projects",
    title: "Working with multiple projects",
    desc: "Project Hub, archived projects, and switching between them.",
    type: "Article",
    readTime: "3 min read",
    content: (
      <div>
        <Section title="The Project Hub">
          The Project Hub is the home screen of the platform. It lists all your active projects and gives you quick access to create a new one, browse your archived work, and open this guidance library. Each project is a self-contained workspace with its own Set-Up data, audits, content, and comms plan.
        </Section>
        <Section title="Switching between projects">
          <Step n={1} title="Select from the Hub">
            From the Project Hub, click any project card to open it. The sidebar and all tools update instantly to show data for that project only.
          </Step>
          <Step n={2} title="Use the project switcher">
            Once inside a project, you can switch to another without going back to the Hub. Click the project name at the top of the sidebar to open the switcher dropdown and select a different project.
          </Step>
          <Step n={3} title="Back to Hub">
            Click the AIO Fusion logo or the <strong>Back to Hub</strong> option in the sidebar to return to the Project Hub at any time.
          </Step>
        </Section>
        <Section title="Archiving a project">
          When a client programme ends, archive the project rather than deleting it. Archived projects are moved to the <strong>Archived Projects</strong> section of the Hub. All data - Set-Up, audits, content, and comms plan - is retained and fully searchable. If the client returns, you can restore the project and pick up exactly where you left off.
        </Section>
        <Section title="Project limits">
          Agency accounts include 2 active projects as standard. Additional projects can be added at any time - contact the team or use the billing section of your account settings. Archived projects do not count towards your active project limit.
        </Section>
        <Tip>Use clear, specific project names that include the client or brand name. When you have multiple projects it becomes much easier to navigate quickly.</Tip>
      </div>
    ),
  },
];

function GuidancePage({ onBack }: { onBack: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"All" | "Article" | "Guide" | "Video">("All");

  const filtered = filter === "All" ? ARTICLES : ARTICLES.filter((a) => a.type === filter);
  const openArticle = ARTICLES.find((a) => a.id === openId);

  if (openArticle) {
    return (
      <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: vars.g50 }}>
        <header className="border-b px-4 sm:px-10 py-4 sm:py-5 flex items-center justify-between" style={{ background: "white", borderColor: vars.g200 }}>
          <div className="flex items-center gap-3.5">
            <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-12 sm:h-16" />
          </div>
          <button onClick={() => setOpenId(null)} className="text-[12px] font-medium flex items-center gap-1.5 hover:underline" style={{ color: vars.g500 }}>
            <ArrowLeft size={14} /> Back to Guidance
          </button>
        </header>
        <div className="px-4 sm:px-10 py-8 sm:py-12 max-w-3xl mx-auto">
          <div className="mb-6">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-[0.16em] mb-3" style={{ background: vars.lightBg, color: vars.accent }}>
              {openArticle.type === "Video" ? <Play size={11} /> : <FileText size={11} />}
              {openArticle.type}
            </div>
            <h1 className="text-2xl sm:text-3xl tracking-tight mb-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
              {openArticle.title}
            </h1>
            <p className="text-[13px]" style={{ color: vars.g400 }}>{openArticle.readTime}</p>
          </div>
          <div className="rounded-2xl border p-6 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            {openArticle.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: vars.g50 }}>
      <header className="border-b px-4 sm:px-10 py-4 sm:py-5 flex items-center justify-between" style={{ background: "white", borderColor: vars.g200 }}>
        <div className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-12 sm:h-16" />
        </div>
        <button onClick={onBack} className="text-[12px] font-medium flex items-center gap-1.5 hover:underline" style={{ color: vars.g500 }}>
          <ArrowLeft size={14} /> Back to platform home
        </button>
      </header>
      <div className="px-4 sm:px-10 py-8 sm:py-12 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] mb-3" style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}>
            <BookOpen size={12} /> How-to Library
          </div>
          <h1 className="text-3xl sm:text-4xl tracking-tight" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
            Guidance
          </h1>
          <p className="text-[15px] font-light mt-2 max-w-2xl" style={{ color: vars.g500 }}>
            Step-by-step guides for getting the most out of AIO Fusion - from first set-up to client reporting.
          </p>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {(["All", "Article", "Guide", "Video"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all"
              style={{
                background: filter === f ? vars.accent : "white",
                color: filter === f ? "white" : vars.g500,
                borderColor: filter === f ? vars.accent : vars.g200,
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => setOpenId(a.id)}
              className="rounded-2xl border p-5 text-left transition-all hover:shadow-md hover:border-opacity-50 group"
              style={{ background: "white", borderColor: vars.g200 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-0.5 rounded" style={{ background: vars.lightBg, color: vars.accent }}>
                    {a.type}
                  </span>
                  <span className="text-[11px]" style={{ color: vars.g400 }}>{a.readTime}</span>
                </div>
                <ChevronDown size={14} className="transition-transform group-hover:rotate-180" style={{ color: vars.g300 }} />
              </div>
              <h3 className="text-[15px] font-bold mb-1 group-hover:underline" style={{ color: vars.navy }}>{a.title}</h3>
              <p className="text-[13px] font-light leading-relaxed" style={{ color: vars.g500 }}>{a.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export { GuidancePage };
