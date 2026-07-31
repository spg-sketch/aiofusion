import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Radial gradient background */}
      <motion.div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at center, rgb(var(--color-teal))/20 0%, rgb(var(--color-navy)) 60%)'
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      />

      {/* Logo - smaller, top position */}
      <motion.div
        className="absolute top-[15vh] left-0 right-0 flex justify-center"
        initial={{ opacity: 0, y: -30 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -30 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/logo-color.png`}
          alt="AIO Fusion"
          className="w-[28vw] h-auto"
        />
      </motion.div>

      {/* Main CTA */}
      <div className="relative z-10 text-center">
        <motion.h2
          className="font-display text-[6vw] leading-[1.08] mb-[3vh] text-white"
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.9, y: 30 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          Take control of your
          <br />
          <span className="gradient-text">AI visibility today</span>
        </motion.h2>

        <motion.p
          className="text-[2.2vw] font-body font-light text-white/80 mb-[4vh]"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          Know how ChatGPT and Claude see your brand
        </motion.p>

        {/* URL display */}
        <motion.div
          className="inline-block"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
          transition={{ 
            duration: 0.7, 
            ease: [0.34, 1.56, 0.64, 1],
            delay: 0.2
          }}
        >
          <div className="relative group">
            {/* Background glow */}
            <div className="absolute -inset-2 bg-gradient-to-r from-[rgb(var(--color-coral))] via-[rgb(var(--color-teal))] to-[rgb(var(--color-coral))] rounded-2xl blur-xl opacity-40" />
            
            {/* URL container */}
            <div className="relative bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-md border border-white/20 rounded-2xl px-[3vw] py-[1.5vh]">
              <span className="text-[2.5vw] font-body font-semibold tracking-wide text-white">
                aiofusion.ai
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Animated circles background */}
      <motion.div
        className="absolute top-[20%] left-[12%] w-[18vw] h-[18vw] rounded-full bg-[rgb(var(--color-coral))]/10 border border-[rgb(var(--color-coral))]/20"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="absolute bottom-[18%] right-[10%] w-[22vw] h-[22vw] rounded-full bg-[rgb(var(--color-teal))]/10 border border-[rgb(var(--color-teal))]/20"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
      />

      {/* Pulsing accent orbs */}
      <motion.div
        className="absolute top-[25%] right-[20%] w-[12vw] h-[12vw] rounded-full bg-[rgb(var(--color-gold))]"
        style={{ filter: 'blur(60px)' }}
        animate={{
          opacity: [0.1, 0.25, 0.1],
          scale: [1, 1.15, 1]
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      {/* Exit animation prep - scale down everything slightly near end */}
      <motion.div
        className="absolute inset-0 bg-[rgb(var(--color-navy))]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.5, delay: 2.3 }}
      />
    </div>
  );
}
