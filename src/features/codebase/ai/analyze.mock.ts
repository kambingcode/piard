/**
 * Keluaran palsu `LLM_MODE=mock` untuk job `codebase-analyze` (M7-11). Deterministik dan hanya memakai
 * nama yang benar-benar ada di repo (jalur dari pemindai), sehingga e2e dan eval bisa memeriksa bahwa
 * tidak ada nama karangan.
 */
import type { Chunk } from "../scan/pack";
import type { CodebaseLanguage, DetectedStack, DocSlug } from "../schemas";
import type { PageOutput, ProfileOutput, SummaryOutput } from "./analyze.schema";

const MAX_MODULES = 8;

/** Folder tingkat atas (atau `src/<x>`) beserta berkasnya, urut jumlah berkas lalu nama. */
function topAreas(paths: readonly string[]): { name: string; files: string[] }[] {
  const areas = new Map<string, string[]>();
  for (const path of paths) {
    const parts = path.split("/");
    if (parts.length < 2) continue;
    const name =
      parts[0] === "src" && parts.length > 2 ? `src/${parts[1]}` : (parts[0] ?? "");
    areas.set(name, [...(areas.get(name) ?? []), path]);
  }
  return [...areas.entries()]
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => b.files.length - a.files.length || (a.name < b.name ? -1 : 1))
    .slice(0, MAX_MODULES);
}

const t = (language: CodebaseLanguage, id: string, en: string) =>
  language === "id" ? id : en;

export function mockProfile(
  name: string,
  language: CodebaseLanguage,
  paths: readonly string[],
  stack: DetectedStack,
): ProfileOutput {
  const tech = [stack.frontend, stack.backend, stack.database].filter(Boolean).join(", ");
  const entries = paths.filter((p) =>
    /(^|\/)(main|index|app|server)\.[a-z]+$|^(src\/)?app\/(page|layout)\.tsx$/.test(p),
  );
  return {
    purpose: t(
      language,
      `${name} adalah proyek dengan ${paths.length} berkas teks${tech ? ` berbasis ${tech}` : ""}.`,
      `${name} is a project with ${paths.length} text files${tech ? ` built on ${tech}` : ""}.`,
    ),
    architecture: t(
      language,
      "Kode dikelompokkan per folder tingkat atas; lihat modul di bawah.",
      "Code is grouped by top-level folder; see the modules below.",
    ),
    entryPoints: entries.slice(0, 5),
    modules: topAreas(paths).map((area) => ({
      name: area.name,
      paths: [area.name],
      purpose: t(language, `${area.files.length} berkas`, `${area.files.length} files`),
    })),
  };
}

export function mockSummary(language: CodebaseLanguage, chunk: Chunk): SummaryOutput {
  const lines = chunk.files.slice(0, 40).map((f) => `- \`${f.path}\``);
  return {
    summary: [
      `## ${t(language, "Modul", "Modules")}`,
      ...lines,
      chunk.files.length > 40
        ? t(
            language,
            `- … dan ${chunk.files.length - 40} berkas lain`,
            `- … and ${chunk.files.length - 40} more files`,
          )
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** Id node mermaid yang aman: huruf/angka saja, diawali huruf. */
const nodeId = (index: number) => `M${index + 1}`;
/** Label mermaid tanpa karakter yang merusak sintaks. */
const label = (text: string) => text.replace(/["[\](){}<>|#;`]/g, " ").trim() || "modul";

export function mockPage(
  slug: DocSlug,
  name: string,
  language: CodebaseLanguage,
  profile: ProfileOutput,
  paths: readonly string[],
  stack: DetectedStack,
): PageOutput {
  const modules = profile.modules;
  const moduleList =
    modules.map((m) => `- \`${m.paths[0] ?? m.name}\`: ${m.purpose}`).join("\n") ||
    t(language, "- (tidak ada folder)", "- (no folders)");
  const pages: Record<DocSlug, () => string> = {
    ringkasan: () => profile.purpose,
    teknologi: () =>
      [
        `- ${t(language, "Bahasa", "Languages")}: ${stack.languages.join(", ") || "-"}`,
        stack.frontend ? `- Frontend: ${stack.frontend}` : "",
        stack.backend ? `- Backend: ${stack.backend}` : "",
        stack.database ? `- Database: ${stack.database}` : "",
        stack.deployment ? `- Deployment: ${stack.deployment}` : "",
        stack.tools.length > 0
          ? `- ${t(language, "Alat", "Tools")}: ${stack.tools.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    "struktur-folder": () => `\`\`\`text\n${paths.slice(0, 40).join("\n")}\n\`\`\``,
    arsitektur: () => {
      const nodes = modules.map((m, i) => `  ${nodeId(i)}["${label(m.name)}"]`);
      const edges = modules.slice(1).map((_, i) => `  ${nodeId(0)} --> ${nodeId(i + 1)}`);
      const body =
        nodes.length > 0 ? [...nodes, ...edges].join("\n") : `  A["${label(name)}"]`;
      return `${profile.architecture}\n\n\`\`\`mermaid\nflowchart TD\n${body}\n\`\`\``;
    },
    modul: () => moduleList,
    data: () =>
      t(
        language,
        `Model data belum dianalisis dalam mode contoh. Database: ${stack.database ?? "tidak terdeteksi"}.`,
        `Data model not analysed in mock mode. Database: ${stack.database ?? "not detected"}.`,
      ),
    api: () =>
      t(
        language,
        "Rute belum dianalisis dalam mode contoh.",
        "Routes not analysed in mock mode.",
      ),
    "alur-utama": () =>
      t(
        language,
        `Alur dimulai dari: ${profile.entryPoints.map((p) => `\`${p}\``).join(", ") || "-"}.`,
        `Flows start at: ${profile.entryPoints.map((p) => `\`${p}\``).join(", ") || "-"}.`,
      ),
    menjalankan: () =>
      t(
        language,
        "Lihat README dan manifes untuk perintah instal dan menjalankan.",
        "See the README and manifests for install and run commands.",
      ),
    catatan: () =>
      t(
        language,
        "Dokumentasi ini dibuat dalam mode contoh (LLM_MODE=mock).",
        "This documentation was generated in mock mode (LLM_MODE=mock).",
      ),
  };
  return { content: pages[slug]() };
}
