import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 5 — Authority / proof: centred stats layout
export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 750),
      setTimeout(() => setPhase(3), 1350),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const stats = [
    { value: "2 LLMs", label: "audited on every run" },
    { value: "21-day", label: "visibility lock cycle" },
    { value: "Real data", label: "no estimates, no guesses" },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#060f1c] via-[#091525] to-[rgb(var(--color-navy))]" />

      <motion.div
        className="absolute bottom-[-10%] left-[-5%] w-[55vw] h-[55vw] rounded-full bg-[rgb(var(--color-teal))]"
        style={{ filter: "blur(180px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.09 }}
        transition={{ duration: 1.8 }}
      />

      {/* Centred content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-[8vw] text-center">
        <motion.p
          className="font-body text-[1.1vw] font-semibold tracking-[0.2em] uppercase text-[rgb(var(--color-teal))] mb-[2.5vh]"
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Proof, not promises
        </motion.p>

        <motion.h2
          className="font-display leading-[1.1] text-white mb-[5vh] max-w-[65vw]"
          style={{ fontSize: "clamp(2.2rem, 4.8vw, 6rem)" }}
          initial={{ opacity: 0, y: 24 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Measure your
          <br />
          <span style={{ color: "rgb(var(--color-teal))" }}>AI authority</span>
        </motion.h2>

        {/* Stat row — horizontally spaced */}
        <motion.div
          className="flex items-start justify-center gap-[5vw] max-w-[75vw]"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
        >
          {stats.map((s, i) => (
            <motion.div
              key={i}
              className="flex flex-col items-center gap-[0.6vh]"
              initial={{ opacity: 0, y: 14 }}
              animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: i * 0.13 }}
            >
              <span
                className="font-display"
                style={{ fontSize: "clamp(1.5rem, 2.8vw, 3.5rem)", color: "rgb(var(--color-teal))" }}
              >
                {s.value}
              </span>
              <span
                className="font-body font-light text-white/60"
                style={{ fontSize: "clamp(0.75rem, 1.2vw, 1.5rem)" }}
              >
                {s.label}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
