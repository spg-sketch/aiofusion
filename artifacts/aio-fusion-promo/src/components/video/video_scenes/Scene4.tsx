import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 4 — The platform: header top-left, 2×2 grid below
const features = [
  { label: "LLM Visibility Checks", detail: "See exactly how you appear in ChatGPT & Claude" },
  { label: "Competitor Analysis", detail: "Know who's winning the AI conversation" },
  { label: "Authority Scoring", detail: "Measure your brand's earned-media authority" },
  { label: "Content Optimisation", detail: "AI-ready content that gets you mentioned" },
];

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07121f] to-[rgb(var(--color-navy))]" />

      <motion.div
        className="absolute top-[-5%] right-[-5%] w-[40vw] h-[40vw] rounded-full bg-[rgb(var(--color-coral))]"
        style={{ filter: "blur(160px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.08 }}
        transition={{ duration: 1.5 }}
      />

      {/* Tight layout: eyebrow + headline on top, grid below — all inside safe inset */}
      <div className="relative z-10 h-full flex flex-col justify-center px-[9vw] py-[5vh]">
        {/* Eyebrow */}
        <motion.p
          className="font-body text-[1vw] font-semibold tracking-[0.22em] uppercase text-[rgb(var(--color-coral))] mb-[1.5vh]"
          initial={{ opacity: 0, x: -14 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          The platform
        </motion.p>

        {/* Headline — smaller so it fits on two lines */}
        <motion.h2
          className="font-display leading-[1.08] text-white mb-[3vh]"
          style={{ fontSize: "clamp(1.8rem, 3.8vw, 4.8rem)" }}
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
        >
          Everything you need to{" "}
          <em
            className="not-italic"
            style={{
              background: "linear-gradient(120deg, rgb(var(--color-coral)), rgb(var(--color-teal)))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            dominate AI search
          </em>
        </motion.h2>

        {/* 2×2 grid — reduced padding so cards don't clip */}
        <motion.div
          className="grid grid-cols-2 gap-[1.4vw]"
          initial={{ opacity: 0, y: 22 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          {features.map((f, i) => (
            <motion.div
              key={i}
              className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-[1.8vw] py-[1.4vh]"
              initial={{ opacity: 0, y: 16 }}
              animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: i * 0.09 }}
            >
              <p className="font-body text-[1.4vw] font-semibold text-white mb-[0.5vh]">
                {f.label}
              </p>
              <p className="font-body text-[1.1vw] font-light text-white/55 leading-[1.5]">
                {f.detail}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
