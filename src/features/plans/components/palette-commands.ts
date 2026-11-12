import { plansCopy } from "../copy";

const copy = plansCopy.palette;
const ROADMAP_STEP = 4;
const RECENT_PLANS = 5;

export type PaletteGroup = keyof typeof copy.groups;

export type PaletteCommand = {
  id: string;
  label: string;
  group: PaletteGroup;
  /** Kata tambahan untuk pencarian (tidak tampil). */
  keywords: string;
  action: { kind: "navigate"; href: string } | { kind: "download"; url: string };
};

type PlanRef = { id: string; title: string };

/** Semua perintah untuk keadaan saat ini; plan yang sedang dibuka mendapat bagian dan ekspornya. */
export function paletteCommands({
  current,
  plans,
}: {
  current: (PlanRef & { step: number }) | null;
  plans: PlanRef[];
}): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  if (current && current.step >= ROADMAP_STEP) {
    const id = encodeURIComponent(current.id);
    const views: [string, string, string][] = [
      ["roadmap", `/plans/${current.id}?step=${ROADMAP_STEP}`, "roadmap fitur graf"],
      ["prd", `/plans/${current.id}/prd`, "dokumen chat revisi"],
      ["tasks", `/plans/${current.id}/tasks`, "spesifikasi prompt"],
      ["kanban", `/plans/${current.id}/kanban`, "papan status task"],
      ["usage", `/plans/${current.id}/usage`, "biaya token pemakaian"],
    ];
    for (const [view, href, keywords] of views) {
      commands.push({
        id: `view-${view}`,
        label: copy.views[view as keyof typeof copy.views],
        group: "current",
        keywords: `${keywords} ${current.title}`,
        action: { kind: "navigate", href },
      });
    }
    commands.push(
      {
        id: "export-md",
        label: copy.exportMd,
        group: "current",
        keywords: "ekspor markdown unduh download prd",
        action: { kind: "download", url: `/api/plan/export?planId=${id}&format=md` },
      },
      {
        id: "export-zip",
        label: copy.exportZip,
        group: "current",
        keywords: "ekspor zip unduh download fitur task",
        action: { kind: "download", url: `/api/plan/export?planId=${id}&format=zip` },
      },
    );
  }
  commands.push(
    {
      id: "new-plan",
      label: copy.newPlan,
      group: "go",
      keywords: "buat ide baru mulai",
      action: { kind: "navigate", href: "/plan" },
    },
    {
      id: "all-plans",
      label: copy.allPlans,
      group: "go",
      keywords: "daftar riwayat semua",
      action: { kind: "navigate", href: "/plans" },
    },
    {
      id: "settings",
      label: copy.settings,
      group: "go",
      keywords: "pengaturan model batas biaya kunci",
      action: { kind: "navigate", href: "/settings" },
    },
  );
  for (const plan of plans) {
    if (plan.id === current?.id) continue;
    commands.push({
      id: `plan-${plan.id}`,
      label: plan.title,
      group: "plans",
      keywords: "plan buka",
      action: { kind: "navigate", href: `/plans/${plan.id}` },
    });
  }
  return commands;
}

/** Huruf kecil tanpa aksen, agar "pengaturan" cocok dengan "Pengaturan" dan "e" dengan "é". */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Perintah yang cocok dengan setiap kata pada `query` (label atau kata kunci). Tanpa kueri, daftar plan
 * dipangkas ke beberapa yang terakhir diubah agar perintah lain tetap terlihat.
 */
export function searchCommands(
  commands: PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    let shown = 0;
    return commands.filter(
      (command) => command.group !== "plans" || shown++ < RECENT_PLANS,
    );
  }
  return commands.filter((command) => {
    const haystack = normalize(`${command.label} ${command.keywords}`);
    return words.every((word) => haystack.includes(word));
  });
}
