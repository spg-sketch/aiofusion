import { useState, useMemo, useEffect } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { loadArchive, saveArchive, useContentStore, type ArchiveItem } from "../lib/contentStore";
import { getSpokespeople } from "../IntakeForm";
function ReleaseGatewayPage() {
  const contentVersion = useContentStore();
  const [archive, setArchive] = useState<ArchiveItem[]>(() => loadArchive());
  useEffect(() => { setArchive(loadArchive()); }, [contentVersion]);
  const finals = archive.filter((i) => i.status === "Final");
  const wires = [
    { name: "PR Newswire", desc: "Global newswire distribution.", color: "#4f8fff" },
    { name: "Business Wire", desc: "Berkshire Hathaway global distribution.", color: "#2896b9" },
    { name: "GlobeNewswire", desc: "Multi-region disclosure & PR distribution.", color: "#0a1628" },
    { name: "Newsfile", desc: "Cost-effective US/CA distribution.", color: "#3D9B6B" },
    { name: "ACCESS Newswire", desc: "Issuer & PR newswire.", color: "#6366F1" },
    { name: "EIN Presswire", desc: "Industry & vertical wire.", color: "#D4922A" },
    { name: "PRWeb (Cision)", desc: "SEO-focused press release distribution.", color: "#C94A3E" },
  ];

  const handleRelease = (item: ArchiveItem, channel: string) => {
    const updated = archive.map((a) => a.id === item.id ? { ...a, releasedAt: new Date().toISOString(), releaseChannel: channel } : a);
    setArchive(updated);
    saveArchive(updated);
    alert(`"${item.title}" queued for release via ${channel}. (Live API integration coming soon.)`);
  };

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl mb-2" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>Release Gateway</h1>
        <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.85)" }}>Send approved content out through connected media tools or download it for manual distribution, all from one controlled step. A clean, consistent release process gets your content live properly so it starts earning AI citations sooner.</p>
      </div>

      <section className="mb-10">
        <h2 className="text-[18px] font-semibold mb-4" style={{ color: vars.navy }}>Approved & ready to release</h2>
        {finals.length === 0 ? (
          <div className="bg-white border rounded-2xl p-10 text-center" style={{ borderColor: vars.g200 }}>
            <Send size={28} color={vars.g400} className="mx-auto mb-3" />
            <p className="text-[14px] font-medium" style={{ color: vars.navy }}>No approved content yet</p>
            <p className="text-[13px] font-light mt-1" style={{ color: vars.g500 }}>Approve a draft in the Content Optimiser to send it here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {finals.map((item) => (
              <div key={item.id} className="bg-white border rounded-xl p-5" style={{ borderColor: vars.g200 }}>
                <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                  <div>
                    <h3 className="text-[15px] font-semibold" style={{ color: vars.navy }}>{item.title}</h3>
                    <p className="text-[12px] font-light mt-0.5" style={{ color: vars.g500 }}>{item.contentType}{item.spokesperson ? ` · ${item.spokesperson}` : ""}</p>
                    {item.releasedAt && (
                      <p className="text-[11px] font-semibold mt-1" style={{ color: vars.green }}>Released via {item.releaseChannel} on {new Date(item.releasedAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        const blob = new Blob([`${item.title}\n\n${item.body}`], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url; a.download = `${item.title}.txt`; a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border bg-white"
                      style={{ borderColor: vars.g200, color: vars.navy }}
                    >
                      <Download size={12} /> Download
                    </button>
                    <a
                      href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://aiofusion.ai")}&summary=${encodeURIComponent(item.title)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white"
                      style={{ background: "#0A66C2" }}
                    >
                      <Send size={12} /> LinkedIn
                    </a>
                  </div>
                </div>
                <div className="border-t pt-3 mt-2" style={{ borderColor: vars.g100 }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] mb-2" style={{ color: vars.g400 }}>Send to wire</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {wires.map((w) => (
                      <button
                        key={w.name}
                        onClick={() => handleRelease(item, w.name)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold text-white hover:brightness-110 transition-all"
                        style={{ background: w.color }}
                        title={w.desc}
                      >
                        <Radio size={11} /> {w.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[18px] font-semibold mb-4" style={{ color: vars.navy }}>Wire connectors</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {wires.map((w) => (
            <div key={w.name} className="bg-white border rounded-xl p-4" style={{ borderColor: vars.g200 }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: w.color }}>
                  <Radio size={16} color="white" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: vars.navy }}>{w.name}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: vars.g400 }}>API · Coming soon</p>
                </div>
              </div>
              <p className="text-[12px] font-light leading-relaxed" style={{ color: vars.g500 }}>{w.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export { ReleaseGatewayPage };
