export function Logo({ tone = "color", className = "" }: { tone?: "color" | "white"; className?: string }) {
  const src = tone === "white" ? "/images/wellness-tech-logo-white.svg" : "/images/wellness-tech-logo.svg";
  return <img src={src} alt="Wellness Tech Distribution" className={`logo ${className}`.trim()} />;
}
