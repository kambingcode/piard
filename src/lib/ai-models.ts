/** Tugas AI yang masing-masing bisa memakai model berbeda (doc 07 bagian 8). */
export const AI_TASKS = [
  "questions",
  "roadmap",
  "prd",
  "spec",
  "tasks",
  "chat",
  "codebase",
] as const;
export type AiTask = (typeof AI_TASKS)[number];

/**
 * Model ID API Anthropic (mis. `claude-haiku-5-5`) dipanggil langsung ke Anthropic; ID OpenRouter
 * selalu berbentuk `vendor/model`, jadi awalan `claude-` tanpa garis miring tidak ambigu.
 */
export function isAnthropicModel(modelId: string): boolean {
  return modelId.startsWith("claude-") && !modelId.includes("/");
}

/** Peta lengkap per tugas. `Object.fromEntries` kehilangan tipe kunci, makanya di-cast (AI_TASKS lengkap). */
export function mapTasks<T>(pick: (task: AiTask) => T): Record<AiTask, T> {
  return Object.fromEntries(AI_TASKS.map((task) => [task, pick(task)])) as Record<
    AiTask,
    T
  >;
}
