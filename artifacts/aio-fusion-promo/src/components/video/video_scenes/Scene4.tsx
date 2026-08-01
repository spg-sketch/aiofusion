import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 4 — Features rapid-fire: left header + 2x2 grid
const features = [
  { label: "LLM Visibility Checks", detail: "See exactly how you appear in ChatGPT & Claude" },
  { label: "Competitor Analysis", detail: "Know who's winning the AI conversation in your sector" },
  { label: "Authority Scoring", detail: "Measure your brand's earned-media authority" },
  { label: "Content Optimisation", detail: "AI-ready content that gets you mentioned" },
];

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 650),
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

      {/* Left-aligned layout */}
      <div className="relative z-10 h-full flex flex-col justify-center pl-[9vw] pr-[8vw]">
        {/* Header */}
        <motion.p
          className="font-body text-[1.1vw] font-semibold tracking-[0.2em] uppercase text-[rgb(var(--color-coral))] mb-[1.5vh]"
          initial={{ opacity: 0, x: -16 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          The platform
        </motion.p>

        <motion.h2
          className="font-display text-[4.8vw] leading-[1.08] text-white mb-[4vh]"
          initial={{ opacity: 0, y: 24 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Everything you need to
          <br />
          <em className="not-italic" style={{
            background: "linear-gradient(120deg, rgb(var(--color-coral)), rgb(var(--color-teal)))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            dominate AI search
          </em>
        </motion.h2>

        {/* 2×2 grid */}
        <motion.div
          className="grid grid-cols-2 gap-[1.8vw]"
          initial={{ opacity: 0, y: 28 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {features.map((f, i) => (
            <motion.div
              key={i}
              className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-[1.5vw]"
              initial={{ opacity: 0, y: 20 }}
              animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.1 }}
            >
              <p className="font-body text-[1.55vw] font-semibold text-white mb-[0.6vh]">
                {f.label}
              </p>
              <p className="font-body text-[1.2vw] font-light text-white/55 leading-[1.5]">
                {f.detail}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
