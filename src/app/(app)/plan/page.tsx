import type { Metadata } from "next";
import { requireUser } from "@/features/auth/server";
import { ExistingFlow } from "@/features/codebase";
import { getCodebaseService } from "@/features/codebase/server";
import { IdeaForm, PlanLanding } from "@/features/plans";
import { getPlansService } from "@/features/plans/server";

export const metadata: Metadata = { title: "Plan baru" };

const NEW_FLOW = "new";
const EXISTING_FLOW = "existing";

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { flow, codebase: codebaseId } = await searchParams;
  if (flow === NEW_FLOW) {
    if (typeof codebaseId !== "string") return <IdeaForm />;
    // Plan fitur baru untuk proyek eksisting (M7-18); proyek orang lain/terhapus = form biasa.
    const user = await requireUser();
    const codebase = getCodebaseService().find(user.id, codebaseId);
    return codebase ? (
      <IdeaForm
        codebase={{ id: codebase.id, name: codebase.name, language: codebase.language }}
      />
    ) : (
      <IdeaForm />
    );
  }
  if (flow === EXISTING_FLOW) {
    await requireUser();
    const { bytes } = getCodebaseService().uploadLimit();
    return <ExistingFlow maxUploadMb={Math.round(bytes / (1024 * 1024))} />;
  }

  const user = await requireUser();
  const [latest] = getPlansService().listPlans(user.id);
  return <PlanLanding latest={latest} />;
}
