"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StepList } from "@/components/patterns/step-list";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/api-client";
import type { Step } from "@/lib/steps";
import { questionsCopy } from "../copy";

/**
 * Dipakai saat plan belum punya pertanyaan: memanggil AI (idempoten di server) lalu memuat ulang
 * halaman. Dijaga agar tidak memanggil dua kali pada StrictMode.
 */
export function GenerateQuestions({ planId }: { planId: string }) {
  const copy = questionsCopy;
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // `attempt` hanya memicu ulang efek saat "Coba lagi"; setiap percobaan dijalankan sekali.
    void attempt;
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      const result = await postJson("/api/plan/questions", { planId });
      if (cancelled) return;
      if (result.ok) router.refresh();
      else {
        setError(result.error.error);
        started.current = false;
      }
    })();
    return () => {
      cancelled = true;
      started.current = false;
    };
  }, [planId, router, attempt]);

  if (error) {
    return (
      <section aria-labelledby="questions-failed">
        <h2 id="questions-failed" className="text-xl font-semibold tracking-tight">
          {copy.failed.title}
        </h2>
        <p
          role="alert"
          className="mt-3 rounded-control bg-negative-soft px-3.5 py-2.5 text-sm text-negative"
        >
          {error}
        </p>
        <Button
          className="mt-5"
          variant="secondary"
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          {copy.failed.retry}
        </Button>
      </section>
    );
  }

  const steps: Step[] = [
    { id: "read", label: copy.generating.steps[0], status: "done" },
    { id: "write", label: copy.generating.steps[1], status: "running" },
  ];
  return (
    <section aria-labelledby="questions-generating" aria-busy="true">
      <h2
        id="questions-generating"
        className="flex items-center gap-2 text-xl font-semibold tracking-tight"
      >
        <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden />
        {copy.generating.title}
      </h2>
      <StepList steps={steps} className="mt-4" />
      <p className="mt-2 text-sm text-muted-foreground">{copy.generating.hint}</p>
    </section>
  );
}
