import beehiveLogoPng from "../assets/beehive-logo.png";

interface BeeHiveLogoProps {
  size?: number;
  className?: string;
}

export function BeeHiveLogo({ size = 28, className }: BeeHiveLogoProps) {
  return (
    <img
      aria-hidden
      className={className}
      src={beehiveLogoPng}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: "contain" }}
      draggable={false}
    />
  );
}
