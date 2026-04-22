import { useEffect, useState } from "react";

interface AnimatedLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  animated?: boolean;
  className?: string;
}

const sizeMap = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-16 h-16 text-lg",
  xl: "w-24 h-24 text-2xl",
};

export default function AnimatedLogo({
  size = "md",
  animated = true,
  className = "",
}: AnimatedLogoProps) {
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (!animated) return;
    const interval = setInterval(() => {
      setIsPulsing((prev) => !prev);
    }, 2000);
    return () => clearInterval(interval);
  }, [animated]);

  return (
    <div className={`relative flex items-center justify-center rounded-xl font-bold bg-gradient-to-br from-[#00D4A8] to-[#38BDF8] text-[#0B0F1A] shadow-[0_4px_16px_rgba(0,212,168,0.4)] transition-all duration-500 ${sizeMap[size]} ${className} ${isPulsing && animated ? 'scale-105 shadow-[0_0_30px_rgba(0,212,168,0.3)]' : ''}`}>
      AA
      {/* Glow effect */}
      <div className="absolute inset-0 rounded-xl bg-[#00D4A8]/20 blur-xl -z-10 animate-pulse" />
    </div>
  );
}
