import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 3 — The solution
export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 750),
      setTimeout(() => setPhase(3), 1300),
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

      {/* Gold glow */}
      <motion.div
        className="absolute bottom-[-10%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-[rgb(var(--color-gold))]"
        style={{ filter: "blur(160px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.09 }}
        transition={{ duration: 1.8 }}
      />

      {/* Left: search-analysis image */}
      <motion.div
        className="absolute left-[5vw] top-[10vh] w-[42vw]"
        initial={{ opacity: 0, x: -50 }}
        animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/search-analysis.png`}
          alt="Search analysis"
          className="w-full h-auto drop-shadow-2xl rounded-2xl"
        />
      </motion.div>

      {/* Right text */}
      <div className="relative z-10 h-full flex flex-col justify-center pl-[52vw] pr-[6vw]">
        <motion.p
          className="font-body text-[1.1vw] font-semibold tracking-[0.2em] uppercase text-[rgb(var(--color-gold))] mb-[2.5vh]"
          initial={{ opacity: 0, x: 16 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          The solution
        </motion.p>

        <motion.h2
          className="font-display text-[4.8vw] leading-[1.1] text-white mb-[3.5vh]"
          initial={{ opacity: 0, y: 28 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Win your place
          <br />
          <span className="text-[rgb(var(--color-gold))]">in AI answers</span>
        </motion.h2>

        <motion.div
          className="flex flex-col gap-[1.8vh]"
          initial={{ opacity: 0, y: 16 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          {bullets.map((text, i) => (
            <motion.div
              key={i}
              className="flex items-start gap-[0.8vw]"
              initial={{ opacity: 0, x: 12 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.13 }}
            >
              <span className="mt-[0.55vh] w-[0.5vw] h-[0.5vw] rounded-full bg-[rgb(var(--color-gold))] flex-shrink-0" />
              <p className="font-body text-[1.75vw] font-light leading-[1.5] text-white/80">
                {text}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
