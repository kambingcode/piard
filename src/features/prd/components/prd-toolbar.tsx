"use client";

import { useId } from "react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { prdCopy } from "../copy";
import type { PrdVersion } from "../schemas";

const copy = prdCopy.toolbar;

export type PrdMode = "preview" | "edit";

/** Pratinjau | Edit sebagai radio (satu pilihan, bisa dipakai papan ketik). */
export function ModeToggle({
  mode,
  disabled,
  onChange,
}: {
  mode: PrdMode;
  disabled: boolean;
  onChange: (mode: PrdMode) => void;
}) {
  return (
    <fieldset className="flex rounded-full bg-muted p-1" disabled={disabled}>
      <legend className="sr-only">{copy.modeLabel}</legend>
      {(["preview", "edit"] as const).map((value) => (
        <label
          key={value}
          className={cn(
            "flex min-h-9 cursor-pointer items-center rounded-full px-3 text-sm transition-colors duration-150 md:min-h-0 md:py-1",
            "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
            "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
            mode === value
              ? "bg-card font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          <input
            type="radio"
            name="prd-mode"
            className="sr-only"
            checked={mode === value}
            onChange={() => onChange(value)}
          />
          {copy[value]}
        </label>
      ))}
    </fieldset>
  );
}

/** Pemilih versi; versi terbaru ditandai. */
export function VersionSelect({
  versions,
  current,
  disabled,
  onChange,
}: {
  versions: PrdVersion[];
  current: number;
  disabled: boolean;
  onChange: (version: number) => void;
}) {
  const latest = versions[0]?.version ?? current;
  const id = useId();
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <label htmlFor={id}>{copy.versionLabel}</label>
      <Select
        id={id}
        className="w-auto min-w-36"
        value={current}
        disabled={disabled || versions.length < 2}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {(versions.length > 0 ? versions : [{ version: current }]).map((v) => (
          <option key={v.version} value={v.version}>
            {copy.versionOption(v.version, v.version === latest)}
          </option>
        ))}
      </Select>
    </div>
  );
}
