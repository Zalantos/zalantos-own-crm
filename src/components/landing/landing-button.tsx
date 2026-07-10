import Link from "next/link";
import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "@/lib/utils";

type LandingButtonProps = {
  children: React.ReactNode;
  href: string;
  variant?: "primary" | "secondary";
  size?: "default" | "large";
  className?: string;
  onClick?: () => void;
};

export function LandingButton({
  children,
  href,
  variant = "primary",
  size = "default",
  className,
  onClick,
}: LandingButtonProps) {
  return (
    <BaseButton
      nativeButton={false}
      render={<Link href={href} />}
      className={cn(
        "inline-flex items-center justify-center rounded-full border text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#2d6cdf]/35 active:translate-y-px",
        size === "large" ? "h-12 px-6" : "h-10 px-5",
        variant === "primary"
          ? "border-[#2d6cdf] bg-[#2d6cdf] text-white hover:bg-[#2359bd]"
          : "border-black/12 bg-transparent text-[#171717] hover:border-black/25 hover:bg-black/[0.03]",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </BaseButton>
  );
}
