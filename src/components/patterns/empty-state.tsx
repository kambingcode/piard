import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Tombol/tautan aksi berikutnya. Satu aksi utama saja. */
  action?: ReactNode;
  /** Tingkat judul agar urutan heading halaman tetap berurutan. */
  headingLevel?: 2 | 3;
  className?: string;
};

/**
 * Bingkai kosong yang tetap memberi arah: apa yang kosong dan apa langkah berikutnya.
 * Bingkai putus-putus 1px (bukan ilustrasi) sesuai aturan state kosong di doc 08.
 */
export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  headingLevel = 3,
  className,
}: EmptyStateProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-card border border-dashed border-control-border px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? <Icon className="size-5 text-muted-foreground" aria-hidden /> : null}
      <div className="max-w-sm space-y-1">
        <Heading className="text-base font-semibold">{title}</Heading>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
