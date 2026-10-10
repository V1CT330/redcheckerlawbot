import logo from "@/assets/red-checker-logo.png";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "brand-mark relative block aspect-[156/174] w-14 shrink-0 overflow-hidden",
        className
      )}
    >
      <img
        src={logo}
        alt="RedBot"
        width={512}
        height={512}
        className="absolute left-0 top-0"
      />
    </span>
  );
}
