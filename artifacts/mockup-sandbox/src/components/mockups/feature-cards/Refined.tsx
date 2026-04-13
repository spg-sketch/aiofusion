import './_group.css';
import { FileText, FileEdit, BarChart3 } from 'lucide-react';

const vars = {
  navy: '#1A1A2E',
  accent: '#E8472A',
  teal: '#2B8C8C',
  slate: '#4A6FA5',
};

const tools = [
  {
    title: "GEO Diagnostic",
    desc: "Analyse how well your content is structured for AI visibility. Get a scored report across 6 signal categories with specific actions.",
    color: vars.accent,
    icon: FileText
  },
  {
    title: "Content Optimiser",
    desc: "Transform PR content for maximum AI citation and retrieval. Side-by-side tracked changes with semantic guidance and approval workflow.",
    color: vars.teal,
    icon: FileEdit
  },
  {
    title: "Authority Planner",
    desc: "Score your forward PR plan for predicted AI authority impact. Identify gaps and prioritise activity across 8 categories.",
    color: vars.slate,
    icon: BarChart3
  }
];

export function Refined() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 md:p-24" style={{ backgroundColor: vars.navy, color: 'white' }}>
      <div className="max-w-[1400px] w-full grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24">
        
        {/* Left Column: Heading */}
        <div className="lg:col-span-5 flex flex-col justify-start pt-4">
          <h2 className="text-5xl md:text-7xl leading-[1.1] mb-8" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
            Three tools, <br className="hidden md:block" />
            <span className="text-white/40">one AI authority strategy.</span>
          </h2>
          <p className="text-xl font-light leading-relaxed text-white/60 max-w-md">
            AIO Fusion provides a complete GEO workflow — from diagnosing how AI sees your brand, to optimising content and planning authority-building activity.
          </p>
        </div>

        {/* Right Column: Tools List */}
        <div className="lg:col-span-7 flex flex-col">
          {tools.map((tool, index) => (
            <div 
              key={tool.title} 
              className={`py-12 flex flex-col md:flex-row gap-8 items-start group ${index !== 0 ? 'border-t border-white/10' : ''}`}
            >
              <div 
                className="shrink-0 w-16 h-16 rounded-full flex items-center justify-center border transition-colors duration-500"
                style={{ borderColor: `${tool.color}40`, color: tool.color }}
              >
                <tool.icon size={28} strokeWidth={1.5} className="transition-transform duration-500 group-hover:scale-110" />
              </div>
              
              <div className="flex-1">
                <h3 className="text-3xl mb-4" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
                  {tool.title}
                </h3>
                <p className="text-lg leading-relaxed font-light text-white/60 max-w-xl">
                  {tool.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
