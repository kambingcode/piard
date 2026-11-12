import { publicRoute } from "@/server/http/route";

/** Pemeriksaan hidup: dipakai e2e dan monitor sederhana. Contoh pemakaian helper route. */
export const GET = publicRoute({}, async () => ({ status: "ok" as const }));
