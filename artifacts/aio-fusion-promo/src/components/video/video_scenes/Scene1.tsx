import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 1 — The problem: brand invisible to AI
export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 250),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#06101e] to-[rgb(var(--color-navy))]" />

      {/* Glow */}
      <motion.div
        className="absolute top-[-10%] left-[-5%] w-[50vw] h-[50vw] rounded-full bg-[rgb(var(--color-coral))]"
        style={{ filter: "blur(160px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 1.5 }}
      />

      {/* Left-aligned text block */}
      <div className="relative z-10 h-full flex flex-col justify-center pl-[9vw] pr-[8vw] max-w-[70vw]">
        {/* Eyebrow */}
        <motion.p
          className="font-body text-[1.1vw] font-semibold tracking-[0.2em] uppercase text-[rgb(var(--color-coral))] mb-[2.5vh]"
          initial={{ opacity: 0, x: -16 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          The problem
        </motion.p>

        {/* Headline */}
        <motion.h1
          className="font-display text-[5.8vw] leading-[1.08] text-white mb-[3.5vh]"
          initial={{ opacity: 0, y: 28 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Where is your brand
          <br />
          <em className="not-italic" style={{
            background: "linear-gradient(120deg, rgb(var(--color-coral)), rgb(var(--color-teal)))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            in AI conversations?
          </em>
        </motion.h1>

        {/* Body */}
        <motion.p
          className="font-body text-[1.9vw] font-light leading-[1.6] text-white/65"
          initial={{ opacity: 0, y: 16 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          ChatGPT and Claude answer millions of questions
          <br />
          about your industry every day.
        </motion.p>

        {/* Kicker */}
        <motion.p
          className="font-body text-[1.6vw] font-medium text-white/90 mt-[2vh]"
          initial={{ opacity: 0, y: 12 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          Are you even mentioned?
        </motion.p>
      </div>
    </div>
  );
}
