import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  FileText,
  Globe2,
  LayoutGrid,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import "./UnifiedSiteSystem.css";

type Surface = "site" | "hub" | "workspace" | "account";

const projects = [
  { name: "Northstar Robotics", type: "Technology", score: 78, activity: "Updated 2h ago", initials: "NR", tone: "rose" },
  { name: "Meridian Health", type: "Healthcare", score: 64, activity: "Updated yesterday", initials: "MH", tone: "teal" },
  { name: "Fieldwork Capital", type: "Financial services", score: 86, activity: "Updated 4 days ago", initials: "FC", tone: "gold" },
];

const nav = [
  { label: "Dashboard", icon: BarChart3 },
  { label: "Earned Media Visibility Audit", icon: Search },
  { label: "Website Visibility Audit", icon: Globe2 },
  { label: "Comms Planner", icon: LayoutGrid },
  { label: "Content Creator", icon: Sparkles },
  { label: "Content Optimiser & Editor", icon: FileText },
  { label: "Content Library", icon: FileText },
];

export default function UnifiedSiteSystem() {
  const [surface, setSurface] = useState<Surface>("hub");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [accountSection, setAccountSection] = useState("Profile & workspace");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  return (
    <div className="aio-system">
      <header className="system-topbar">
        <button className="brand-lockup" onClick={() => setSurface("site")} aria-label="AIO Fusion home">
          <span className="brand-mark">A</span>
          <span className="brand-name">AIO <b>Fusion</b></span>
        </button>
        <div className="surface-switcher" role="tablist" aria-label="Preview surface">
          {([
            ["site", "Public site"],
            ["hub", "Project Hub"],
            ["workspace", "Workspace"],
            ["account", "My account"],
          ] as [Surface, string][]).map(([id, label]) => (
            <button key={id} className={surface === id ? "surface-tab active" : "surface-tab"} onClick={() => setSurface(id)} role="tab" aria-selected={surface === id}>
              {label}
            </button>
          ))}
        </div>
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle preview navigation">
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div className="top-actions">
          <button className="quiet-action" onClick={() => notify("Help centre opened")}>Help</button>
          <button className="avatar" onClick={() => setSurface("account")}>SG</button>
        </div>
      </header>
      {menuOpen && <div className="mobile-surfaces">{(["site", "hub", "workspace", "account"] as Surface[]).map((id) => <button key={id} onClick={() => { setSurface(id); setMenuOpen(false); }}>{id === "site" ? "Public site" : id === "hub" ? "Project Hub" : id === "workspace" ? "Workspace" : "My account"}</button>)}</div>}

      {surface === "site" && <PublicSite onLogin={() => setSurface("hub")} onDemo={() => notify("Demo request noted")} />}
      {surface === "hub" && <ProjectHub onOpen={() => setSurface("workspace")} onNew={() => notify("Project set-up started")} onAccount={() => setSurface("account")} />}
      {surface === "workspace" && <Workspace onBack={() => setSurface("hub")} onNotify={notify} />}
      {surface === "account" && <Account section={accountSection} setSection={setAccountSection} onBack={() => setSurface("hub")} onNotify={notify} />}
      {toast && <div className="toast"><CircleCheck size={16} />{toast}</div>}
    </div>
  );
}

function PublicSite({ onLogin, onDemo }: { onLogin: () => void; onDemo: () => void }) {
  return <main className="public-page">
    <section className="public-hero">
      <div className="hero-copy">
        <div className="eyebrow"><Sparkles size={13} /> GENERATIVE ENGINE OPTIMISATION</div>
        <h1>Make your brand<br /><em>easy to cite.</em></h1>
        <p className="hero-lede">AIO Fusion gives PR and marketing teams a clear view of how AI systems understand their authority — and the tools to improve it.</p>
        <div className="hero-buttons"><button className="button button-ink" onClick={onDemo}>Book a platform demo <ArrowRight size={15} /></button><button className="text-button" onClick={onLogin}>Explore the platform <ArrowRight size={15} /></button></div>
      </div>
      <div className="hero-orbit" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><span>AI</span><small>AUTHORITY</small></div><span className="orbit-label label-a">Earned media</span><span className="orbit-label label-b">Website signals</span><span className="orbit-label label-c">Content output</span></div>
    </section>
    <section className="public-proof"><div><span className="eyebrow pink">ONE SYSTEM, EVERY SIGNAL</span><h2>From first mention<br />to lasting authority.</h2></div><p>Diagnose visibility, shape a practical strategy, and keep every piece of communications work aligned to the story you want AI to recognise.</p><div className="proof-line"><span>Built for teams who care about the detail.</span><b>PR · GEO · MARKETING</b></div></section>
  </main>;
}

function Shell({ children, active = "Project Hub", onHub, onAccount, onNavigate, projectNav = false }: { children: ReactNode; active?: string; onHub?: () => void; onAccount?: () => void; onNavigate?: (page: string) => void; projectNav?: boolean }) {
  const groups = [
    { title: "Project Set-Up", tone: "orange", items: [{ label: "Project Set-Up", icon: FileText }] },
    { title: "Visibility Audits", tone: "blue", items: [{ label: "Earned Media Visibility Audit", icon: Search }, { label: "Website Visibility Audit", icon: Globe2 }] },
    { title: "Content Management", tone: "gold", items: [{ label: "Comms Planner", icon: LayoutGrid }, { label: "Content Creator", icon: Sparkles }, { label: "Content Optimiser & Editor", icon: FileText }, { label: "Content Library", icon: FileText }] },
    { title: "Media Management", tone: "green", items: [{ label: "Media Research", icon: Users }, { label: "Media Database", icon: LayoutGrid }] },
    { title: "Marketing Intelligence", tone: "purple", items: [{ label: "Marketing Intelligence", icon: BarChart3 }] },
    { title: "Reporting", tone: "stone", items: [{ label: "Measure & Report", icon: BarChart3 }] },
  ];
  return <div className={`app-shell ${projectNav ? "project-shell" : ""}`}><aside className="app-sidebar">{projectNav ? <><button className="sidebar-brand" onClick={onHub}><span className="brand-mark">A</span><span>AIO <b>Fusion</b></span></button><div className="project-switch"><span className="project-logo rose">VS</span><b>Vibe Studio</b></div><button className="hub-return" onClick={onHub}>← Project Hub</button><button className="support-link" onClick={() => onNavigate?.("support")}><Sparkles size={13} /> Ask GEOrge - Support</button><button className="dashboard-link" onClick={() => onNavigate?.("Dashboard")}><BarChart3 size={14} /> Dashboard</button>{groups.map((group) => <div className={`nav-group ${group.tone}`} key={group.title}><span>{group.title}</span>{group.items.map(({ label, icon: Icon }) => <button key={label} className={active === label ? "group-link active" : "group-link"} onClick={() => onNavigate?.(label)}><Icon size={13} /><b>{label}</b><small>{label === "Project Set-Up" ? "Capture business profile and messaging" : label === "Earned Media Visibility Audit" ? "Score AI brand mentions" : label === "Website Visibility Audit" ? "Score your site for AI citation" : label === "Comms Planner" ? "Plan and score the PR / marketing schedule" : "Manage your communications workflow"}</small></button>)}</div>)}</> : <><button className="sidebar-brand" onClick={onHub}><span className="brand-mark">A</span><span>AIO <b>Fusion</b></span></button><div className="workspace-chip"><span className="mini-avatar rose">SG</span><span><small>WORKSPACE</small><b>Vibe Studio</b></span><ChevronDown size={14} /></div><div className="sidebar-label">Workspace</div><button className={active === "Project Hub" ? "side-link selected" : "side-link"} onClick={onHub}><LayoutGrid size={16} />Project Hub</button>{nav.map(({ label, icon: Icon }) => <button key={label} className={active === label ? "side-link selected" : "side-link"}><Icon size={16} />{label}</button>)}</>}<div className="sidebar-spacer" /><button className="side-link" onClick={onAccount}><Settings2 size={16} />My account</button><div className="signed-in"><span className="mini-avatar">SG</span><span><b>Spencer Gallagher</b><small>Agency owner</small></span></div></aside><section className="app-main">{children}</section></div>;
}

function ProjectHub({ onOpen, onNew, onAccount }: { onOpen: () => void; onNew: () => void; onAccount: () => void }) {
  return <Shell onHub={() => {}} onAccount={onAccount}><div className="app-header"><div><div className="eyebrow teal">AGENCY PROJECTS</div><h1>Agency Project Hub</h1><p>Select a client project to manage AI optimisation, ongoing PR and marketing output.</p></div><button className="button button-pink" onClick={onNew}><Plus size={16} /> Create project</button></div><div className="hub-actions"><button className="hub-action primary" onClick={onNew}><Plus size={19} /><span><small>START A NEW PIECE OF WORK</small><b>Create Project</b><em>Walk through Project Set-Up.</em></span><ArrowRight size={16} /></button><button className="hub-action" onClick={() => onNew()}><FileText size={19} /><span><small>PAST WORK</small><b>Archived Projects</b><em>Searchable history of completed work.</em></span><ArrowRight size={16} /></button><button className="hub-action" onClick={() => onAccount()}><ShieldCheck size={19} /><span><small>HOW-TO LIBRARY</small><b>Guidance</b><em>Articles &amp; videos on using the platform.</em></span><ArrowRight size={16} /></button></div><div className="section-heading"><div><span className="eyebrow">MY CLIENT PROJECTS</span><h2>Current projects</h2></div><button className="text-button" onClick={() => onNew()}>Archived Projects <ArrowRight size={14} /></button></div><div className="project-grid">{projects.map((p) => <button className="project-card" key={p.name} onClick={onOpen}><div className={`project-logo ${p.tone}`}>{p.initials}</div><div className="project-card-body"><div className="project-card-top"><span className="project-type">{p.type}</span><ChevronRight size={16} /></div><h3>{p.name}</h3><div className="project-card-meta"><span>Earned Media Audit Score</span><strong>{p.score}</strong></div><div className="project-foot">{p.activity}<span>Enter <ArrowRight size={13} /></span></div></div></button>)}</div></Shell>;
}

function Dashboard({ onNotify }: { onNotify: (message: string) => void }) {
  return <div className="dashboard-page"><div className="workspace-title"><div><div className="eyebrow pink">AUTHORITY DASHBOARD</div><h1>Vibe Studio</h1><p>Your AI authority performance at a glance.</p></div></div><div className="dashboard-grid"><div className="dashboard-card setup-card"><div className="card-head"><div><span className="eyebrow teal">PROJECT SET-UP</span><h3>Project Set-Up</h3></div><span className="completion">0%</span></div><div className="setup-progress"><strong>0 <small>of 6</small></strong><div>{["Business Fundamentals", "GEO Priority", "Spokespeople", "AI Presence", "Content Audit", "Goals & Strategy"].map((label) => <span key={label}><i />{label}</span>)}</div></div><button className="text-button" onClick={() => onNotify("Project Set-Up opened")}>Open Project Set-Up <ArrowRight size={13} /></button></div>{[["EARNED MEDIA VISIBILITY AUDIT", "Run the Earned Media Visibility Audit to see your AI mention score."], ["WEBSITE VISIBILITY AUDIT", "Run the Website Visibility Audit to score your site for AI citation."]].map(([title, copy]) => <div className="dashboard-card empty-audit" key={title}><span className="eyebrow">{title}</span><div className="empty-audit-copy"><Search size={24} /><p>No audit run yet</p><small>{copy}</small></div><button className="text-button" onClick={() => onNotify(`${title} opened`)}>Run {title[0] + title.slice(1).toLowerCase()} <ArrowRight size={13} /></button></div>)}</div><div className="dashboard-stats">{[["TOTAL ARTICLES", "0", FileText, "Open Content Library"], ["IN PLANNER", "0", LayoutGrid, "Open Comms Planner"], ["IN DRAFT", "0", FileText, "Open Content Library"], ["FINAL / READY", "0", CircleCheck, "Open Content Library"]].map(([label, value, Icon, cta]) => <div className="dashboard-stat" key={String(label)}><span className="eyebrow">{label}</span><div><Icon size={20} /><strong>{value}</strong></div><button className="text-button" onClick={() => onNotify(String(cta))}>{cta} <ArrowRight size={12} /></button></div>)}</div></div>;
}

function Field({ label, hint, placeholder, tall = false }: { label: string; hint: string; placeholder: string; tall?: boolean }) {
  return <div className="intake-field"><label>{label}</label><small>{hint}</small>{tall ? <textarea placeholder={placeholder} /> : <input placeholder={placeholder} />}</div>;
}

function ProjectSetup({ onNotify }: { onNotify: (message: string) => void }) {
  return <div className="intake-page"><div className="intake-heading"><div><h1>Project Set-Up</h1><p>Capture the core information and context that informs your PR, content marketing and AI authority strategy. Your input is used across AIO Fusion.</p></div><span className="intake-status">0% COMPLETE</span></div><div className="intake-project-name"><label>Add your company website</label><input placeholder="company.com" /></div><div className="intake-track"><div><b>PR Set-Up</b><small>Business Messaging (Sections 1–3)</small><strong>0% complete</strong></div><div><b>AIO Set-Up</b><small>Business Profile (Sections 4–7)</small><strong>0% complete</strong></div></div><section className="intake-section"><div className="section-banner"><span>SECTION 1</span><h2>Earned Media: Message Framework</h2><p>Boilerplate, message hierarchy, spokespeople and trade media categories</p><button onClick={() => onNotify("Section guide opened")}>How to guide</button></div><p className="intake-intro">Earned media is one of the highest-authority signals for GEO. AI models are trained on the open web: a well-placed article in a credible outlet is more powerful than any on-site SEO tactic. The fields below feed every other module - Optimiser, Comms Planner, Content Creator, Media Research and Marketing Intelligence.</p><div className="field-heading">Core Boilerplate</div><Field label="250-word company descriptor" hint="Enter or draft the raw ingredients for a new 250-word company descriptor for press use." placeholder="Type your answer here..." tall /><div className="field-heading">Message Hierarchy</div><Field label="Primary Message" hint="Enter a Primary Message providing a short summary (no more than 10 words). And a longer version of no more than 25 words." placeholder="≤10 words - e.g. AI authority for PR" /><div className="dual-fields"><Field label="Longer version" hint="Adds proof and context." placeholder="≤25 words - the longer version" /><Field label="Additional context" hint="Optional supporting detail." placeholder="Add context" /></div><button className="add-message" onClick={() => onNotify("Additional message added")}><Plus size={13} /> Add this message</button><div className="field-heading">Evidence</div><Field label="Online evidence" hint="Cut and paste links to web pages evidencing company statistics, case studies, awards, certificates, third-party validation." placeholder="Paste your evidence links here..." tall /></section></div>;
}

function Workspace({ onBack, onNotify, initialPage = "Dashboard" }: { onBack: () => void; onNotify: (message: string) => void; initialPage?: "Dashboard" | "Project Set-Up" }) {
  const [page, setPage] = useState(initialPage);
  return <Shell active={page} onHub={onBack} onAccount={() => onNotify("Account settings opened")} onNavigate={(nextPage) => setPage(nextPage === "Project Set-Up" ? "Project Set-Up" : "Dashboard")} projectNav>{page === "Project Set-Up" ? <ProjectSetup onNotify={onNotify} /> : <Dashboard onNotify={onNotify} />}</Shell>;
}

export function UnifiedDashboardPreview() {
  const [toast, setToast] = useState("");
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };
  return <div className="aio-system"><Workspace initialPage="Dashboard" onBack={() => notify("Project Hub opened")} onNotify={notify} />{toast && <div className="toast"><CircleCheck size={16} />{toast}</div>}</div>;
}

export function UnifiedProjectSetupPreview() {
  const [toast, setToast] = useState("");
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };
  return <div className="aio-system"><Workspace initialPage="Project Set-Up" onBack={() => notify("Project Hub opened")} onNotify={notify} />{toast && <div className="toast"><CircleCheck size={16} />{toast}</div>}</div>;
}

function Account({ section, setSection, onBack, onNotify }: { section: string; setSection: (s: string) => void; onBack: () => void; onNotify: (message: string) => void }) {
  const sections = [{ label: "Profile & workspace", icon: UserRound }, { label: "Sign-in & security", icon: ShieldCheck }, { label: "Billing details", icon: FileText }, { label: "Team members", icon: Users }];
  return <Shell active="My account" onHub={onBack} onAccount={() => {}}><div className="account-header"><div><div className="eyebrow pink">MY ACCOUNT</div><h1>Account settings</h1><p>The details behind your AIO Fusion workspace.</p></div><button className="button button-outline" onClick={onBack}>Back to platform <ArrowRight size={15} /></button></div><div className="account-layout"><aside className="account-nav"><span className="sidebar-label">Settings</span>{sections.map(({ label, icon: Icon }) => <button key={label} onClick={() => setSection(label)} className={section === label ? "account-nav-link active" : "account-nav-link"}><Icon size={16} />{label}<ChevronRight size={14} /></button>)}</aside><div className="account-content">{section === "Profile & workspace" && <><div className="account-card"><div className="card-head"><div><span className="eyebrow teal">WORKSPACE PROFILE</span><h2>Vibe Studio</h2></div><button className="button button-small button-outline" onClick={() => onNotify("Workspace details are ready to edit")}>Edit details</button></div><div className="profile-grid"><div><label>Workspace name</label><strong>Vibe Studio</strong></div><div><label>Website</label><strong>vibestudio.agency</strong></div><div><label>Account type</label><strong>Agency / Partner</strong></div><div><label>Plan</label><strong>Professional <span className="status-pill">ACTIVE</span></strong></div></div></div><div className="account-card"><div className="card-head"><div><span className="eyebrow pink">YOUR PROFILE</span><h2>Spencer Gallagher</h2><p>spencer@vibestudio.agency</p></div><div className="profile-avatar">SG</div></div><div className="profile-grid"><div><label>Role</label><strong>Account owner</strong></div><div><label>Member since</label><strong>September 2024</strong></div></div></div></>}{section === "Sign-in & security" && <div className="account-card"><div className="eyebrow teal">SECURITY</div><h2>Sign-in & security</h2><p className="card-copy">Keep your workspace access protected with a strong password and two-step verification.</p>{["Password", "Two-step verification", "Connected accounts"].map((item, i) => <div className="security-row" key={item}><div><b>{item}</b><small>{i === 0 ? "Last changed 42 days ago" : i === 1 ? "Authenticator app enabled" : "Microsoft account connected"}</small></div><button className="text-button" onClick={() => onNotify(`${item} settings opened`)}>{i === 1 ? "Manage" : "Update"} <ArrowRight size={14} /></button></div>)}</div>}{section === "Billing details" && <div className="account-card"><div className="eyebrow gold">BILLING</div><h2>Billing details</h2><p className="card-copy">Your Professional plan renews on 03 September 2026.</p><div className="billing-banner"><strong>Professional</strong><span>£149 / month · 3 active projects</span><button className="button button-small button-ink" onClick={() => onNotify("Billing portal opened")}>Manage plan</button></div></div>}{section === "Team members" && <div className="account-card"><div className="card-head"><div><div className="eyebrow teal">TEAM</div><h2>Team members</h2></div><button className="button button-small button-pink" onClick={() => onNotify("Invite form opened")}><Plus size={14} /> Invite member</button></div>{["Spencer Gallagher", "Maya Patel", "Jon Bell"].map((name, i) => <div className="team-row" key={name}><span className={`mini-avatar ${i === 1 ? "teal" : i === 2 ? "gold" : "rose"}`}>{name.split(" ").map(n => n[0]).join("")}</span><span><b>{name}</b><small>{i === 0 ? "Owner · spencer@vibestudio.agency" : i === 1 ? "Editor · maya@vibestudio.agency" : "Viewer · jon@vibestudio.agency"}</small></span><span className="member-status">{i === 0 ? "Owner" : "Active"}</span></div>)}</div>}</div></div></Shell>;
}