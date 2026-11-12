import type { ReactNode } from "react";
import { BrandMark } from "@/components/layout/brand-mark";

type AuthCardProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Kerangka halaman masuk/daftar: tanda produk, judul (h1), isi, dan tautan pindah. */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center gap-2.5">
        <BrandMark />
        <span className="text-lg font-semibold tracking-tight">Piard</span>
      </div>
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-8">{children}</div>
      {footer ? <p className="mt-6 text-sm text-muted-foreground">{footer}</p> : null}
    </div>
  );
}
