"use client";

import { Button } from "@/components/ui/button";

/** Galat tak terduga di halaman: pesan jelas dan satu tindakan berikutnya. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">
        Ada yang tidak beres
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Halaman ini gagal dimuat. Data Anda aman; coba muat ulang.
      </p>
      <Button type="button" onClick={reset}>
        Coba lagi
      </Button>
    </main>
  );
}
