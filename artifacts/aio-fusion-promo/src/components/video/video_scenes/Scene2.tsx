import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 2 — AI assistants showcase: split layout, text left
export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1300),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#071422] via-[#0a1628] to-[rgb(var(--color-navy))]" />

      {/* Teal glow right */}
      <motion.div
        className="absolute top-[10%] right-[-8%] w-[45vw] h-[45vw] rounded-full bg-[rgb(var(--color-teal))]"
        style={{ filter: "blur(140px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 1.5 }}
      />

      {/* Left text */}
      <div className="relative z-10 h-full flex flex-col justify-center pl-[9vw] max-w-[52vw]">
        <motion.p
          className="font-body text-[1.1vw] font-semibold tracking-[0.2em] uppercase text-[rgb(var(--color-teal))] mb-[2.5vh]"
          initial={{ opacity: 0, x: -16 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          The new search
        </motion.p>

        <motion.h2
          className="font-display text-[5vw] leading-[1.1] text-white mb-[3vh]"
          initial={{ opacity: 0, y: 28 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          ChatGPT & Claude
          <br />
          <span className="text-[rgb(var(--color-teal))]">answer without you</span>
        </motion.h2>

        <motion.p
          className="font-body text-[1.85vw] font-light leading-[1.65] text-white/65"
          initial={{ opacity: 0, y: 16 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          Your competitors appear in AI answers.
          <br />
          Your brand is invisible.
        </motion.p>
      </div>

      {/* Right: AI chat image */}
      <motion.div
        className="absolute right-[5vw] top-[12vh] w-[40vw]"
        initial={{ opacity: 0, x: 60 }}
        animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/ai-chat.png`}
          alt="AI chat interface"
          className="w-full h-auto drop-shadow-2xl rounded-2xl"
        />
        {/* Subtle shimmer overlay */}
        <motion.div
          className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[rgb(var(--color-teal))]/10 via-transparent to-transparent"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Horizontal accent line */}
      <motion.div
        className="absolute bottom-[30%] left-[9vw] right-[48vw] h-px bg-gradient-to-r from-[rgb(var(--color-teal))]/60 to-transparent"
        initial={{ scaleX: 0, originX: 0 }}
        animate={phase >= 3 ? { scaleX: 1 } : {}}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}
