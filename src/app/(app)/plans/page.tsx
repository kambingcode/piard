import type { Metadata } from "next";
import { requireUser } from "@/features/auth/server";
import { PlanList } from "@/features/plans";
import { getPlansService } from "@/features/plans/server";

export const metadata: Metadata = { title: "Semua plan" };

export default async function PlansPage() {
  const user = await requireUser();
  return <PlanList plans={getPlansService().listPlans(user.id)} />;
}
