"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { codebaseCopy } from "../copy";
import type { Codebase } from "../schemas";
import { GithubFields, ZipField } from "./source-fields";
import {
  checkSource,
  type SourceDraft,
  type SourceProblem,
  sendSource,
} from "./source-submit";

const copy = codebaseCopy.ui.flow;

/**
 * Mengirim sumber ZIP/GitHub untuk proyek yang sudah ada: sumber pertama, atau sumber baru untuk
 * analisis ulang (M7-16). Setelah diterima, halaman dimuat ulang dan menampilkan perkiraan biaya.
 */
export function SourcePanel({
  codebase,
  maxUploadMb,
}: {
  codebase: Pick<Codebase, "id" | "source" | "sourceRef">;
  maxUploadMb: number;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  // URL GitHub sebelumnya diisikan agar analisis ulang cukup satu klik.
  const [url, setUrl] = useState(
    codebase.source === "github" ? (codebase.sourceRef ?? "") : "",
  );
  const [token, setToken] = useState("");
  const [problem, setProblem] = useState<SourceProblem | null>(null);
  const [busy, setBusy] = useState(false);
  if (codebase.source === "agent") return null;
  const kind = codebase.source;

  const draft: SourceDraft = kind === "zip" ? { kind, file } : { kind, url, token };
  const error = (field: SourceProblem["field"]) =>
    problem?.field === field ? problem.message : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const local = checkSource(draft, maxUploadMb);
    setProblem(local);
    if (local) return;
    setBusy(true);
    const failed = await sendSource(codebase.id, draft);
    setBusy(false);
    if (failed) {
      setProblem(failed);
      return;
    }
    toast.success(codebaseCopy.status.source_ready);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {kind === "zip" ? (
        <ZipField
          file={file}
          onChange={(next) => {
            setFile(next);
            setProblem(null);
          }}
          error={error("file")}
          maxUploadMb={maxUploadMb}
        />
      ) : (
        <GithubFields
          url={url}
          token={token}
          onUrl={setUrl}
          onToken={setToken}
          urlError={error("url")}
          tokenError={error("token")}
        />
      )}
      {problem?.field === "form" ? (
        <p role="alert" className="text-sm text-negative">
          {problem.message}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} aria-busy={busy}>
        {busy ? copy.working[kind] : copy.submit[kind]}
      </Button>
    </form>
  );
}
