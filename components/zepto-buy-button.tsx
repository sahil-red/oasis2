import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function ZeptoBuyButton({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-(--color-border) bg-(--color-bg-elevated) px-4 py-2.5 text-[15px] font-medium text-(--color-fg) transition hover:border-(--color-accent)/40 hover:bg-(--color-bg-soft)",
        className,
      )}
    >
      Buy on Zepto
      <ExternalLink className="h-4 w-4 opacity-60" aria-hidden />
    </a>
  );
}
