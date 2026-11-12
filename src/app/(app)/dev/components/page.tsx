import type { Metadata } from "next";
import { PatternGallery } from "@/components/patterns/pattern-gallery";

export const metadata: Metadata = { title: "Uji komponen" };

/** Halaman pengembang: semua pola desain di tema terang dan gelap sekaligus. */
export default function ComponentsPage() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Uji komponen</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <PatternGallery theme="light" />
        <PatternGallery theme="dark" />
      </div>
    </div>
  );
}
