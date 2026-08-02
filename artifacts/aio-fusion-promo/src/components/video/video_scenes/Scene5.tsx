import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 5 — Authority / proof: left text, no overlapping image
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

      <div className="relative z-10 h-full flex flex-col justify-center pl-[9vw] pr-[14vw]">
        <motion.p
          className="font-body text-[1vw] font-semibold tracking-[0.22em] uppercase text-[rgb(var(--color-teal))] mb-[2.5vh]"
          initial={{ opacity: 0, x: -16 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Proof, not promises
        </motion.p>

        <motion.h2
          className="font-display leading-[1.1] text-white mb-[4.5vh]"
          style={{ fontSize: "clamp(2rem, 4.5vw, 5.5rem)" }}
          initial={{ opacity: 0, y: 24 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Measure your
          <br />
          <span className="text-[rgb(var(--color-teal))]">AI authority</span>
        </motion.h2>

        <motion.div
          className="flex flex-col gap-[2.5vh]"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
        >
          {stats.map((s, i) => (
            <motion.div
              key={i}
              className="flex items-baseline gap-[1.5vw]"
              initial={{ opacity: 0, x: -12 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: i * 0.13 }}
            >
              <span
                className="font-display text-[rgb(var(--color-teal))]"
                style={{ fontSize: "clamp(1.4rem, 2.6vw, 3.2rem)" }}
              >
                {s.value}
              </span>
              <span className="font-body text-[1.4vw] font-light text-white/60">{s.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
