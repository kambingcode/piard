"use client";

import { Plus, Trash, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SaveIndicator, useAutosave } from "@/features/plans";
import { roadmapCopy } from "../copy";
import {
  FEATURE_STATUSES,
  type FeatureStatus,
  MAX_PHASE,
  NAME_MAX_LENGTH,
  type RoadmapFeature,
  type RoadmapSubFeature,
  SUMMARY_MAX_LENGTH,
} from "../schemas";
import type { RoadmapController } from "./use-roadmap";

const copy = roadmapCopy.panel;

type FeatureDraft = {
  name: string;
  summary: string;
  phase: number;
  status: FeatureStatus;
};

function FeatureFields({
  feature,
  controller,
}: {
  feature: RoadmapFeature;
  controller: RoadmapController;
}) {
  const ids = useId();
  const [draft, setDraft] = useState<FeatureDraft>({
    name: feature.name,
    summary: feature.summary,
    phase: feature.phase ?? 1,
    status: feature.status,
  });
  const { status, schedule } = useAutosave<FeatureDraft>((value) =>
    controller.patchFeature(feature.id, value),
  );
  const nameMissing = draft.name.trim() === "";

  function change(patch: Partial<FeatureDraft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    // Nama kosong tidak dikirim (server menolaknya); pengguna diberi tahu di bawah kolom.
    if (next.name.trim() !== "") schedule({ ...next, name: next.name.trim() });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={`${ids}-name`}>{copy.name}</Label>
          <SaveIndicator status={status} />
        </div>
        <Input
          id={`${ids}-name`}
          value={draft.name}
          maxLength={NAME_MAX_LENGTH}
          aria-invalid={nameMissing}
          aria-describedby={nameMissing ? `${ids}-name-error` : undefined}
          onChange={(event) => change({ name: event.target.value })}
        />
        {nameMissing ? (
          <p id={`${ids}-name-error`} className="text-sm text-negative">
            {copy.nameRequired}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-summary`}>{copy.summary}</Label>
        <Textarea
          id={`${ids}-summary`}
          className="min-h-24"
          value={draft.summary}
          maxLength={SUMMARY_MAX_LENGTH}
          onChange={(event) => change({ summary: event.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-phase`}>{copy.phase}</Label>
          <Select
            id={`${ids}-phase`}
            value={draft.phase}
            onChange={(event) => change({ phase: Number(event.target.value) })}
          >
            {Array.from({ length: MAX_PHASE }, (_, i) => i + 1).map((phase) => (
              <option key={phase} value={phase}>
                {roadmapCopy.graph.phase(phase)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-status`}>{copy.status}</Label>
          <Select
            id={`${ids}-status`}
            value={draft.status}
            onChange={(event) => change({ status: event.target.value as FeatureStatus })}
          >
            {FEATURE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {roadmapCopy.status[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{copy.source[feature.source]}</p>
    </div>
  );
}

type SubDraft = { name: string; summary: string };

function SubFeatureRow({
  sub,
  controller,
}: {
  sub: RoadmapSubFeature;
  controller: RoadmapController;
}) {
  const ids = useId();
  const [draft, setDraft] = useState<SubDraft>({ name: sub.name, summary: sub.summary });
  const { status, schedule } = useAutosave<SubDraft>((value) =>
    controller.patchSubFeature(sub.id, value),
  );
  const nameMissing = draft.name.trim() === "";

  function change(patch: Partial<SubDraft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (next.name.trim() !== "") schedule({ ...next, name: next.name.trim() });
  }

  return (
    <li className="space-y-2 rounded-control bg-muted p-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label={copy.subName}
          className="bg-card"
          value={draft.name}
          maxLength={NAME_MAX_LENGTH}
          aria-invalid={nameMissing}
          aria-describedby={nameMissing ? `${ids}-error` : undefined}
          onChange={(event) => change({ name: event.target.value })}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={copy.deleteSub(sub.name)}
          onClick={() => controller.remove("subfeatures", sub)}
        >
          <Trash aria-hidden />
        </Button>
      </div>
      {nameMissing ? (
        <p id={`${ids}-error`} className="text-sm text-negative">
          {copy.nameRequired}
        </p>
      ) : null}
      <Textarea
        aria-label={copy.subSummary}
        className="min-h-16 bg-card"
        value={draft.summary}
        maxLength={SUMMARY_MAX_LENGTH}
        onChange={(event) => change({ summary: event.target.value })}
      />
      <SaveIndicator status={status} />
    </li>
  );
}

/**
 * Panel detail fitur (lembar kanan): ubah nama, ringkasan, fase, status, dan sub-fitur.
 * Semua tersimpan otomatis; hapus memakai Undo. `key` pada isian mengikuti id agar ganti fitur
 * tidak membawa draf fitur sebelumnya.
 */
export function FeaturePanel({
  feature,
  subFeatures,
  controller,
  onClose,
}: {
  feature: RoadmapFeature | undefined;
  subFeatures: RoadmapSubFeature[];
  controller: RoadmapController;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Dialog.Root open={feature !== undefined} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-[min(440px,100vw)] flex-col bg-background shadow-xl"
        >
          {feature ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                <Dialog.Title className="text-base font-semibold">
                  {copy.title}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={copy.close}
                  >
                    <X aria-hidden />
                  </Button>
                </Dialog.Close>
              </div>
              <div className="flex-1 space-y-8 overflow-y-auto px-5 py-5">
                <FeatureFields
                  key={feature.id}
                  feature={feature}
                  controller={controller}
                />

                <section aria-labelledby="sub-features-title">
                  <h3 id="sub-features-title" className="text-sm font-semibold">
                    {copy.subFeatures}
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {subFeatures.map((sub) => (
                      <SubFeatureRow key={sub.id} sub={sub} controller={controller} />
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3"
                    disabled={adding}
                    onClick={async () => {
                      setAdding(true);
                      await controller.addSubFeature(feature.id);
                      setAdding(false);
                    }}
                  >
                    <Plus aria-hidden />
                    {copy.addSub}
                  </Button>
                </section>
              </div>
              <div className="border-t border-border px-5 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-negative"
                  onClick={() => {
                    controller.remove("features", feature);
                    onClose();
                  }}
                >
                  <Trash aria-hidden />
                  {copy.deleteFeature}
                </Button>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
