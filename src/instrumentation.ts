/**
 * Dijalankan Next.js sekali saat server mulai (sebelum menerima permintaan).
 * Ini composition root: tempat fitur menyerahkan job handler-nya ke infrastruktur.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { bootServer } = await import("@/server/boot");
  const { roadmapJobHandlers } = await import("@/features/roadmap/server");
  const { prdJobHandlers } = await import("@/features/prd/server");
  const { specsJobHandlers } = await import("@/features/specs/server");
  const { revisionJobHandlers } = await import("@/features/revision/server");
  const { codebaseJobHandlers, getCodebaseService } = await import(
    "@/features/codebase/server"
  );
  bootServer({
    jobHandlers: {
      ...roadmapJobHandlers,
      ...prdJobHandlers,
      ...specsJobHandlers,
      ...revisionJobHandlers,
      ...codebaseJobHandlers,
    },
    startupTasks: {
      // Sumber sementara proyek eksisting yang lebih tua dari 24 jam (ADR 0016).
      sweepCodebaseSources: () => getCodebaseService().sweepSources(),
    },
  });
}
