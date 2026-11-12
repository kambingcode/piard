"use client";

import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Step } from "@/lib/steps";
import { showUndoToast } from "./confirm-undo";
import { EmptyState } from "./empty-state";
import { StepList } from "./step-list";
import { StreamingText } from "./streaming-text";

const SWATCHES = [
  ["background", "bg-background"],
  ["card", "bg-card"],
  ["muted", "bg-muted"],
  ["active", "bg-active"],
  ["primary", "bg-primary"],
  ["accent", "bg-accent"],
  ["positive", "bg-positive"],
  ["negative", "bg-negative"],
  ["warning", "bg-warning"],
] as const;

const SAMPLE_STEPS: Step[] = [
  { id: "read", label: "Membaca PRD", status: "done" },
  { id: "features", label: "Menyusun fitur dan sub-fitur", status: "done" },
  {
    id: "specs",
    label: "Menyusun spesifikasi dan task",
    status: "running",
    detail: "3/7 fitur",
  },
  { id: "export", label: "Menyiapkan ekspor", status: "pending" },
];

const FAILED_STEPS: Step[] = [
  { id: "read", label: "Membaca PRD", status: "done" },
  { id: "specs", label: "Menyusun spesifikasi", status: "failed", detail: "2/7 fitur" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Semua komponen dasar dan pola dalam satu panel; ditampilkan di tema terang dan gelap. */
export function PatternGallery({ theme }: { theme: "light" | "dark" }) {
  return (
    <div
      data-theme={theme}
      className="space-y-8 rounded-card border border-border bg-background p-6 text-foreground"
    >
      <h2 className="text-xl font-semibold tracking-tight">
        Tema {theme === "light" ? "terang" : "gelap"}
      </h2>

      <Section title="Warna">
        <ul className="grid grid-cols-3 gap-2">
          {SWATCHES.map(([name, className]) => (
            <li key={name} className="flex items-center gap-2 text-xs">
              <span className={`size-5 rounded-chip border border-border ${className}`} />
              {name}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tombol">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Buat rencana</Button>
          <Button variant="secondary">Batal</Button>
          <Button variant="ghost">Lewati</Button>
          <Button variant="link">Pelajari</Button>
          <Button variant="destructive">Hapus</Button>
          <Button disabled>Nonaktif</Button>
        </div>
      </Section>

      <Section title="Kolom isian">
        <div className="max-w-xs space-y-2">
          <Label htmlFor={`demo-${theme}`}>Judul proyek</Label>
          <Input id={`demo-${theme}`} placeholder="Booking klinik" />
          <Label htmlFor={`demo-err-${theme}`}>Email</Label>
          <Input id={`demo-err-${theme}`} defaultValue="bukan-email" aria-invalid />
          <p className="text-sm text-negative">Format email belum benar.</p>
        </div>
      </Section>

      <Section title="StepList">
        <StepList steps={SAMPLE_STEPS} />
        <StepList steps={FAILED_STEPS} />
      </Section>

      <Section title="EmptyState">
        <EmptyState
          icon={FileText}
          title="Belum ada plan"
          description="Plan yang Anda buat muncul di sini."
          action={<Button variant="secondary">Mulai dengan ide</Button>}
        />
      </Section>

      <Section title="StreamingText">
        <StreamingText
          text={"## Ringkasan\n\nPiard mengubah ide menjadi PRD yang"}
          streaming
        />
        <StreamingText text="Teks yang sudah selesai dialirkan." streaming={false} />
      </Section>

      <Section title="ConfirmUndo">
        <Button
          variant="secondary"
          onClick={() =>
            showUndoToast({
              message: 'Fitur "Booking Dokter" dihapus.',
              onCommit: () => undefined,
            })
          }
        >
          Hapus contoh fitur
        </Button>
      </Section>
    </div>
  );
}
