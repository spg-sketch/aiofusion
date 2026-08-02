import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 2 — The new search: text only, no image overlap
export function Scene2() {
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
      <div className="absolute inset-0 bg-gradient-to-br from-[#071422] via-[#0a1628] to-[rgb(var(--color-navy))]" />

      <motion.div
        className="absolute top-[-5%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-[rgb(var(--color-teal))]"
        style={{ filter: "blur(160px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.1 }}
        transition={{ duration: 1.5 }}
      />

      {/* Full-width left-aligned block — no image competing for space */}
      <div className="relative z-10 h-full flex flex-col justify-center pl-[9vw] pr-[12vw]">
        <motion.p
          className="font-body text-[1vw] font-semibold tracking-[0.22em] uppercase text-[rgb(var(--color-teal))] mb-[2.5vh]"
          initial={{ opacity: 0, x: -16 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          The new search
        </motion.p>

        {/* Two-line headline that fits without wrapping per word */}
        <motion.h2
          className="font-display leading-[1.1] text-white mb-[3.5vh]"
          style={{ fontSize: "clamp(2rem, 4.2vw, 5rem)" }}
          initial={{ opacity: 0, y: 24 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          ChatGPT & Claude
          <br />
          <span className="text-[rgb(var(--color-teal))]">answer without you</span>
        </motion.h2>

        <motion.p
          className="font-body text-[1.7vw] font-light leading-[1.7] text-white/65 mb-[2vh]"
          initial={{ opacity: 0, y: 16 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          Your competitors appear in AI answers.
          <br />
          Your brand is invisible.
        </motion.p>

        {/* Accent line */}
        <motion.div
          className="h-px bg-gradient-to-r from-[rgb(var(--color-teal))]/60 to-transparent mt-[2vh]"
          style={{ width: "40vw" }}
          initial={{ scaleX: 0, originX: 0 }}
          animate={phase >= 3 ? { scaleX: 1 } : {}}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}
