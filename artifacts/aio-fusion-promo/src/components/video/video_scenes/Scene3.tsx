import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 3 — The solution: left text only (image removed to avoid overlap)
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

      <div className="relative z-10 h-full flex flex-col justify-center pl-[9vw] pr-[14vw]">
        <motion.p
          className="font-body text-[1vw] font-semibold tracking-[0.22em] uppercase text-[rgb(var(--color-gold))] mb-[2.5vh]"
          initial={{ opacity: 0, x: -16 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          The solution
        </motion.p>

        <motion.h2
          className="font-display leading-[1.1] text-white mb-[4vh]"
          style={{ fontSize: "clamp(2rem, 4.5vw, 5.5rem)" }}
          initial={{ opacity: 0, y: 24 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Win your place
          <br />
          <span className="text-[rgb(var(--color-gold))]">in AI answers</span>
        </motion.h2>

        <motion.div
          className="flex flex-col gap-[2vh]"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
        >
          {bullets.map((text, i) => (
            <motion.div
              key={i}
              className="flex items-center gap-[1.2vw]"
              initial={{ opacity: 0, x: -12 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: i * 0.12 }}
            >
              <span className="w-[0.45vw] h-[0.45vw] rounded-full bg-[rgb(var(--color-gold))] flex-shrink-0" />
              <p className="font-body text-[1.65vw] font-light leading-[1.5] text-white/80">
                {text}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
