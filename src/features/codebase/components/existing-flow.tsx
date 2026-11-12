"use client";

import { ArrowLeft, FileArchive, GitBranch, TerminalSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { codebaseCopy } from "../copy";
import {
  CODEBASE_LANGUAGES,
  CODEBASE_SOURCES,
  type CodebaseLanguage,
  type CodebaseSource,
  NAME_MAX_LENGTH,
} from "../schemas";
import { codebaseApi, codebaseHref } from "./codebase-api";
import { GithubFields, ZipField } from "./source-fields";
import {
  checkSource,
  type SourceDraft,
  type SourceProblem,
  sendSource,
} from "./source-submit";

const copy = codebaseCopy.ui.flow;
const ICONS = { agent: TerminalSquare, zip: FileArchive, github: GitBranch } as const;

/**
 * Alur "Proyek eksisting" (M7-09): nama, bahasa dokumentasi, dan satu sumber (prompt agen, ZIP, atau
 * URL GitHub). Codebase dibuat sekali; bila pengiriman sumber gagal, mencoba lagi memakai codebase
 * yang sama (tidak menumpuk proyek kosong). Setelah berhasil, pindah ke halaman proyek.
 */
export function ExistingFlow({ maxUploadMb }: { maxUploadMb: number }) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<CodebaseLanguage>("id");
  const [source, setSource] = useState<CodebaseSource>("agent");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [problem, setProblem] = useState<SourceProblem | null>(null);
  const [busy, setBusy] = useState(false);
  /** Codebase yang sudah dibuat percobaan sebelumnya, per sumber. */
  const created = useRef<{ id: string; source: CodebaseSource } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const draft: SourceDraft =
    source === "zip"
      ? { kind: "zip", file }
      : source === "github"
        ? { kind: "github", url, token }
        : { kind: "agent" };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    const local = checkSource(draft, maxUploadMb);
    setNameError(trimmed ? null : copy.nameRequired);
    setProblem(local);
    if (!trimmed) {
      nameRef.current?.focus();
      return;
    }
    if (local) return;

    setBusy(true);
    let codebaseId = created.current?.source === source ? created.current.id : null;
    if (!codebaseId) {
      const result = await codebaseApi.create({ name: trimmed, source, language });
      if (!result.ok) {
        setBusy(false);
        const field = result.error.issues?.[0]?.path;
        if (field === "name") setNameError(result.error.error);
        else setProblem({ field: "form", message: result.error.error });
        return;
      }
      codebaseId = result.data.codebase.id;
      created.current = { id: codebaseId, source };
    }
    const failed = await sendSource(codebaseId, draft);
    if (failed) {
      setBusy(false);
      setProblem(failed);
      return;
    }
    router.push(codebaseHref(codebaseId));
  }

  const fieldError = (field: SourceProblem["field"]) =>
    problem?.field === field ? problem.message : null;

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <Link
        href={copy.backHref}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-chip text-sm text-muted-foreground hover:text-foreground md:min-h-0"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {copy.back}
      </Link>
      <h1 className="mt-4 text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance">
        {copy.title}
      </h1>
      <p className="mt-3 max-w-[56ch] text-base text-muted-foreground">{copy.subtitle}</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <div className="space-y-2">
            <Label htmlFor={`${id}-name`}>{copy.name}</Label>
            <Input
              ref={nameRef}
              id={`${id}-name`}
              value={name}
              maxLength={NAME_MAX_LENGTH}
              placeholder={copy.namePlaceholder}
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${id}-name-error` : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {nameError ? (
              <p id={`${id}-name-error`} className="text-sm text-negative">
                {nameError}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-language`}>{copy.language}</Label>
            <Select
              id={`${id}-language`}
              value={language}
              onChange={(event) => setLanguage(event.target.value as CodebaseLanguage)}
            >
              {CODEBASE_LANGUAGES.map((value) => (
                <option key={value} value={value}>
                  {copy.languages[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">{copy.sourceLegend}</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {CODEBASE_SOURCES.map((value) => {
              const Icon = ICONS[value];
              return (
                <Choice
                  key={value}
                  type="radio"
                  name={`${id}-source`}
                  checked={source === value}
                  onChange={() => {
                    setSource(value);
                    setProblem(null);
                  }}
                  className="h-full rounded-card p-4"
                >
                  <Icon className="size-5 text-muted-foreground" aria-hidden />
                  <span className="mt-3 block text-sm font-semibold">
                    {copy.sources[value].title}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {copy.sources[value].body.replace("{mb}", String(maxUploadMb))}
                  </span>
                </Choice>
              );
            })}
          </div>
        </fieldset>

        {source === "zip" ? (
          <ZipField
            file={file}
            onChange={(next) => {
              setFile(next);
              setProblem(null);
            }}
            error={fieldError("file")}
            maxUploadMb={maxUploadMb}
          />
        ) : source === "github" ? (
          <GithubFields
            url={url}
            token={token}
            onUrl={setUrl}
            onToken={setToken}
            urlError={fieldError("url")}
            tokenError={fieldError("token")}
          />
        ) : (
          <p className="rounded-card bg-muted px-5 py-4 text-sm">{copy.agentNext}</p>
        )}

        {problem?.field === "form" ? (
          <p role="alert" className="text-sm text-negative">
            {problem.message}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? copy.working[source] : copy.submit[source]}
          </Button>
        </div>
      </form>
    </div>
  );
}
