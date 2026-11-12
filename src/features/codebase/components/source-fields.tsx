"use client";

import { FileArchive } from "lucide-react";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";
import { codebaseCopy } from "../copy";
import { type GithubUrlProblem, parseGithubUrl } from "../github-url";
import { formatBytes } from "./codebase-api";

const copy = codebaseCopy.ui;

/** Pemilih berkas ZIP: input native (papan ketik, pembaca layar) yang juga menerima seret-lepas. */
export function ZipField({
  file,
  onChange,
  error,
  maxUploadMb,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string | null;
  maxUploadMb: number;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{copy.zip.label}</Label>
      {/* Input asli di depan sebagai `peer` agar kotak di bawahnya mendapat cincin fokus papan ketik. */}
      <input
        id={id}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="peer sr-only"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onChange(event.dataTransfer.files[0] ?? null);
        }}
        className={cn(
          "flex min-h-24 cursor-pointer items-center gap-4 rounded-card border border-dashed px-5 py-4 transition-colors",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
          dragging
            ? "border-accent bg-muted"
            : "border-control-border bg-card hover:bg-muted",
          error && "border-negative",
        )}
      >
        <FileArchive className="size-6 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 text-sm">
          <span className="block truncate font-medium">
            {file ? copy.zip.chosen(file.name, formatBytes(file.size)) : copy.zip.choose}
          </span>
          <span id={hintId} className="mt-0.5 block text-muted-foreground">
            {copy.zip.hint} {copy.zip.limit(maxUploadMb)}
          </span>
        </span>
      </label>
      {error ? (
        <p id={errorId} className="text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Pesan untuk URL GitHub yang tidak lolos parser klien (sama dengan pesan server). */
export function githubUrlError(url: string): string | null {
  const parsed = parseGithubUrl(url);
  return parsed.ok
    ? null
    : codebaseCopy.github.url[parsed.problem satisfies GithubUrlProblem];
}

/** URL repo dan token opsional (repo privat), dengan galat di bawah kolomnya. */
export function GithubFields({
  url,
  token,
  onUrl,
  onToken,
  urlError,
  tokenError,
}: {
  url: string;
  token: string;
  onUrl: (value: string) => void;
  onToken: (value: string) => void;
  urlError?: string | null;
  tokenError?: string | null;
}) {
  const id = useId();
  const [showToken, setShowToken] = useState(token !== "");
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${id}-url`}>{copy.github.url}</Label>
        <Input
          id={`${id}-url`}
          value={url}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={copy.github.urlPlaceholder}
          aria-invalid={urlError ? true : undefined}
          aria-describedby={
            urlError ? `${id}-url-error ${id}-url-hint` : `${id}-url-hint`
          }
          onChange={(event) => onUrl(event.target.value)}
        />
        {urlError ? (
          <p id={`${id}-url-error`} className="text-sm text-negative">
            {urlError}
          </p>
        ) : null}
        <p id={`${id}-url-hint`} className="text-xs text-muted-foreground">
          {copy.github.urlHint}
        </p>
      </div>

      {showToken ? (
        <div className="space-y-2">
          <Label htmlFor={`${id}-token`}>{copy.github.token}</Label>
          <Input
            id={`${id}-token`}
            type="password"
            value={token}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={tokenError ? true : undefined}
            aria-describedby={
              tokenError ? `${id}-token-error ${id}-token-hint` : `${id}-token-hint`
            }
            onChange={(event) => onToken(event.target.value)}
          />
          {tokenError ? (
            <p id={`${id}-token-error`} className="text-sm text-negative">
              {tokenError}
            </p>
          ) : null}
          <p id={`${id}-token-hint`} className="text-xs text-muted-foreground">
            {copy.github.tokenHint}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowToken(true)}
          className="cursor-pointer rounded-chip text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {copy.github.privateToggle}
        </button>
      )}
    </div>
  );
}
