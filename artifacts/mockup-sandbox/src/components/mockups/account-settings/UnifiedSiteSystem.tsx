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
  { label: "Overview", icon: BarChart3 },
  { label: "Visibility audits", icon: Search },
  { label: "Content library", icon: FileText },
  { label: "Comms planner", icon: LayoutGrid },
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

function Shell({ children, active = "Project Hub", onHub, onAccount }: { children: ReactNode; active?: string; onHub?: () => void; onAccount?: () => void }) {
  return <div className="app-shell"><aside className="app-sidebar"><button className="sidebar-brand" onClick={onHub}><span className="brand-mark">A</span><span>AIO <b>Fusion</b></span></button><div className="workspace-chip"><span className="mini-avatar rose">SG</span><span><small>WORKSPACE</small><b>Vibe Studio</b></span><ChevronDown size={14} /></div><div className="sidebar-label">Workspace</div><button className={active === "Project Hub" ? "side-link selected" : "side-link"} onClick={onHub}><LayoutGrid size={16} />Project Hub</button>{nav.map(({ label, icon: Icon }) => <button key={label} className={active === label ? "side-link selected" : "side-link"}><Icon size={16} />{label}</button>)}<div className="sidebar-spacer" /><button className="side-link" onClick={onAccount}><Settings2 size={16} />My account</button><div className="signed-in"><span className="mini-avatar">SG</span><span><b>Spencer Gallagher</b><small>Agency owner</small></span></div></aside><section className="app-main">{children}</section></div>;
}

function ProjectHub({ onOpen, onNew, onAccount }: { onOpen: () => void; onNew: () => void; onAccount: () => void }) {
  return <Shell onHub={() => {}} onAccount={onAccount}><div className="app-header"><div><div className="eyebrow teal">WORKSPACE OVERVIEW</div><h1>Project Hub</h1><p>Choose a project to continue your authority work.</p></div><button className="button button-pink" onClick={onNew}><Plus size={16} /> New project</button></div><div className="hub-summary"><div><span className="summary-kicker">ACTIVE PROJECTS</span><strong>03</strong><span>Across Vibe Studio</span></div><div><span className="summary-kicker">AVERAGE AUTHORITY</span><strong>76<span className="summary-unit">/100</span></strong><span className="positive">+8.4% this quarter</span></div><div className="summary-note"><ShieldCheck size={21} /><span><b>Your workspaces are in good standing.</b><br />Last platform sync 14 minutes ago.</span></div></div><div className="section-heading"><div><span className="eyebrow">YOUR PROJECTS</span><h2>Active client work</h2></div><button className="text-button" onClick={() => onNew()}>View archive <ArrowRight size={14} /></button></div><div className="project-grid">{projects.map((p) => <button className="project-card" key={p.name} onClick={onOpen}><div className={`project-logo ${p.tone}`}>{p.initials}</div><div className="project-card-body"><div className="project-card-top"><span className="project-type">{p.type}</span><ChevronRight size={16} /></div><h3>{p.name}</h3><div className="score-row"><div className="score-ring" style={{ "--score": `${p.score * 3.6}deg` } as CSSProperties}><b>{p.score}</b></div><span><small>AUTHORITY INDEX</small><em className="positive">Healthy signal</em></span></div><div className="project-foot">{p.activity}<span>Open project <ArrowRight size={13} /></span></div></div></button>)}</div></Shell>;
}

function Workspace({ onBack, onNotify }: { onBack: () => void; onNotify: (message: string) => void }) {
  return <Shell active="Overview" onHub={onBack} onAccount={() => onNotify("Account settings opened")}><div className="workspace-header"><button className="back-link" onClick={onBack}>← Project Hub</button><div className="workspace-title"><div className="project-logo rose">NR</div><div><div className="eyebrow pink">NORTHSTAR ROBOTICS · ACTIVE PROJECT</div><h1>Authority overview</h1><p>A clear read on how Northstar Robotics is understood across AI search.</p></div></div><button className="button button-ink" onClick={() => onNotify("Audit queued for Northstar Robotics")}><Search size={15} /> Run visibility audit</button></div><div className="workspace-grid"><div className="metric-feature"><div><span className="eyebrow">EARNED MEDIA VISIBILITY</span><h2>78<span>/100</span></h2><p>Strong authority signal, with room to grow in robotics procurement.</p></div><div className="metric-bars"><span style={{ height: "58%" }} /><span style={{ height: "72%" }} /><span style={{ height: "66%" }} /><span style={{ height: "84%" }} /><span style={{ height: "78%" }} /><span style={{ height: "92%" }} /></div><div className="metric-foot">Last audit 14 June 2026 <span className="positive">↑ 8 points since March</span></div></div><div className="work-card"><div className="card-head"><div><span className="eyebrow teal">PROJECT SET-UP</span><h3>Business foundations</h3></div><CircleCheck className="positive" size={20} /></div><div className="progress"><span style={{ width: "82%" }} /></div><strong>82% complete</strong><p>Messaging, spokespeople and priority audiences are ready.</p><button className="text-button" onClick={() => onNotify("Project set-up opened")}>Review foundations <ArrowRight size={14} /></button></div><div className="work-card wide"><div className="card-head"><div><span className="eyebrow gold">RECENT ACTIVITY</span><h3>Work in motion</h3></div><button className="icon-button" onClick={() => onNotify("Activity filters opened")}><ChevronDown size={16} /></button></div>{["Q3 robotics procurement briefing", "Founder perspective: automation and trust", "Website visibility audit"].map((item, i) => <div className="activity-row" key={item}><span className={`activity-dot ${i === 0 ? "pink-dot" : i === 1 ? "teal-dot" : "gold-dot"}`} /><span><b>{item}</b><small>{i === 0 ? "Draft · Edited 2 hours ago" : i === 1 ? "Final · Published 12 June" : "Score 78 · 14 June"}</small></span><ArrowRight size={14} /></div>)}</div></div></Shell>;
}

function Account({ section, setSection, onBack, onNotify }: { section: string; setSection: (s: string) => void; onBack: () => void; onNotify: (message: string) => void }) {
  const sections = [{ label: "Profile & workspace", icon: UserRound }, { label: "Sign-in & security", icon: ShieldCheck }, { label: "Billing details", icon: FileText }, { label: "Team members", icon: Users }];
  return <Shell active="My account" onHub={onBack} onAccount={() => {}}><div className="account-header"><div><div className="eyebrow pink">MY ACCOUNT</div><h1>Account settings</h1><p>The details behind your AIO Fusion workspace.</p></div><button className="button button-outline" onClick={onBack}>Back to platform <ArrowRight size={15} /></button></div><div className="account-layout"><aside className="account-nav"><span className="sidebar-label">Settings</span>{sections.map(({ label, icon: Icon }) => <button key={label} onClick={() => setSection(label)} className={section === label ? "account-nav-link active" : "account-nav-link"}><Icon size={16} />{label}<ChevronRight size={14} /></button>)}</aside><div className="account-content">{section === "Profile & workspace" && <><div className="account-card"><div className="card-head"><div><span className="eyebrow teal">WORKSPACE PROFILE</span><h2>Vibe Studio</h2></div><button className="button button-small button-outline" onClick={() => onNotify("Workspace details are ready to edit")}>Edit details</button></div><div className="profile-grid"><div><label>Workspace name</label><strong>Vibe Studio</strong></div><div><label>Website</label><strong>vibestudio.agency</strong></div><div><label>Account type</label><strong>Agency / Partner</strong></div><div><label>Plan</label><strong>Professional <span className="status-pill">ACTIVE</span></strong></div></div></div><div className="account-card"><div className="card-head"><div><span className="eyebrow pink">YOUR PROFILE</span><h2>Spencer Gallagher</h2><p>spencer@vibestudio.agency</p></div><div className="profile-avatar">SG</div></div><div className="profile-grid"><div><label>Role</label><strong>Account owner</strong></div><div><label>Member since</label><strong>September 2024</strong></div></div></div></>}{section === "Sign-in & security" && <div className="account-card"><div className="eyebrow teal">SECURITY</div><h2>Sign-in & security</h2><p className="card-copy">Keep your workspace access protected with a strong password and two-step verification.</p>{["Password", "Two-step verification", "Connected accounts"].map((item, i) => <div className="security-row" key={item}><div><b>{item}</b><small>{i === 0 ? "Last changed 42 days ago" : i === 1 ? "Authenticator app enabled" : "Microsoft account connected"}</small></div><button className="text-button" onClick={() => onNotify(`${item} settings opened`)}>{i === 1 ? "Manage" : "Update"} <ArrowRight size={14} /></button></div>)}</div>}{section === "Billing details" && <div className="account-card"><div className="eyebrow gold">BILLING</div><h2>Billing details</h2><p className="card-copy">Your Professional plan renews on 03 September 2026.</p><div className="billing-banner"><strong>Professional</strong><span>£149 / month · 3 active projects</span><button className="button button-small button-ink" onClick={() => onNotify("Billing portal opened")}>Manage plan</button></div></div>}{section === "Team members" && <div className="account-card"><div className="card-head"><div><div className="eyebrow teal">TEAM</div><h2>Team members</h2></div><button className="button button-small button-pink" onClick={() => onNotify("Invite form opened")}><Plus size={14} /> Invite member</button></div>{["Spencer Gallagher", "Maya Patel", "Jon Bell"].map((name, i) => <div className="team-row" key={name}><span className={`mini-avatar ${i === 1 ? "teal" : i === 2 ? "gold" : "rose"}`}>{name.split(" ").map(n => n[0]).join("")}</span><span><b>{name}</b><small>{i === 0 ? "Owner · spencer@vibestudio.agency" : i === 1 ? "Editor · maya@vibestudio.agency" : "Viewer · jon@vibestudio.agency"}</small></span><span className="member-status">{i === 0 ? "Owner" : "Active"}</span></div>)}</div>}</div></div></Shell>;
}