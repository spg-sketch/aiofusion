import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 3 — The solution: centred layout
export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1250),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const bullets = [
    "Track mentions across ChatGPT & Claude",
    "Analyse earned-media authority",
    "Optimise content for AI visibility",
  ];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-bl from-[#06101e] via-[#0a1628] to-[rgb(var(--color-navy))]" />

      <motion.div
        className="absolute bottom-[-10%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-[rgb(var(--color-gold))]"
        style={{ filter: "blur(160px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.09 }}
        transition={{ duration: 1.8 }}
      />

      {/* Centred content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-[8vw] text-center">
        <motion.p
          className="font-body text-[1.1vw] font-semibold tracking-[0.2em] uppercase text-[rgb(var(--color-gold))] mb-[2.5vh]"
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          The solution
        </motion.p>

        <motion.h2
          className="font-display leading-[1.1] text-white mb-[4vh] max-w-[68vw]"
          style={{ fontSize: "clamp(2.2rem, 4.8vw, 6rem)" }}
          initial={{ opacity: 0, y: 24 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Win your place
          <br />
          <span style={{ color: "rgb(var(--color-gold))" }}>in AI answers</span>
        </motion.h2>

        <motion.div
          className="flex flex-col items-center gap-[1.8vh] max-w-[55vw]"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
        >
          {bullets.map((text, i) => (
            <motion.div
              key={i}
              className="flex items-center gap-[1.2vw]"
              initial={{ opacity: 0, y: 10 }}
              animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: i * 0.12 }}
            >
              <span
                className="w-[0.45vw] h-[0.45vw] rounded-full flex-shrink-0"
                style={{ background: "rgb(var(--color-gold))" }}
              />
              <p
                className="font-body font-light leading-[1.5] text-white/80"
                style={{ fontSize: "clamp(0.9rem, 1.6vw, 2rem)" }}
              >
                {text}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
