import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Scene 5 — Authority visualisation: left text + right image
export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const stats = [
    { value: "2 LLMs", label: "tracked in every audit" },
    { value: "21-day", label: "visibility cycle" },
    { value: "Real data", label: "no estimates, no guesses" },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#060f1c] via-[#091525] to-[rgb(var(--color-navy))]" />

      <motion.div
        className="absolute bottom-[-10%] left-[-5%] w-[50vw] h-[50vw] rounded-full bg-[rgb(var(--color-teal))]"
        style={{ filter: "blur(160px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.09 }}
        transition={{ duration: 1.8 }}
      />

      {/* Left text */}
      <div className="relative z-10 h-full flex flex-col justify-center pl-[9vw] max-w-[50vw]">
        <motion.p
          className="font-body text-[1.1vw] font-semibold tracking-[0.2em] uppercase text-[rgb(var(--color-teal))] mb-[2.5vh]"
          initial={{ opacity: 0, x: -16 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          Proof, not promises
        </motion.p>

        <motion.h2
          className="font-display text-[4.8vw] leading-[1.1] text-white mb-[4vh]"
          initial={{ opacity: 0, y: 28 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        >
          Measure your
          <br />
          <span className="text-[rgb(var(--color-teal))]">AI authority</span>
        </motion.h2>

        {/* Stats */}
        <motion.div
          className="flex flex-col gap-[2vh]"
          initial={{ opacity: 0, y: 16 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        >
          {stats.map((s, i) => (
            <motion.div
              key={i}
              className="flex items-baseline gap-[1.2vw]"
              initial={{ opacity: 0, x: -12 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.12 }}
            >
              <span className="font-display text-[2.8vw] text-[rgb(var(--color-teal))]">{s.value}</span>
              <span className="font-body text-[1.5vw] font-light text-white/60">{s.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Right: authority viz image */}
      <motion.div
        className="absolute right-[4vw] top-[8vh] w-[43vw]"
        initial={{ opacity: 0, x: 50 }}
        animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/authority-viz.png`}
          alt="Authority visualisation"
          className="w-full h-auto drop-shadow-2xl rounded-2xl"
        />
      </motion.div>
    </div>
  );
}
