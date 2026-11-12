import type { Plan } from "./schemas";

const TITLE_MAX_CHARS = 60;

/** Judul tampilan: judul hasil AI bila ada, kalau belum, awal ide (dipangkas di batas kata). */
export function planTitle(plan: Pick<Plan, "title" | "idea">): string {
  if (plan.title) return plan.title;
  const idea = plan.idea.replace(/\s+/g, " ").trim();
  if (idea.length <= TITLE_MAX_CHARS) return idea;
  const cut = idea.slice(0, TITLE_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > TITLE_MAX_CHARS / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
