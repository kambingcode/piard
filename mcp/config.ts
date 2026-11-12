/**
 * Konfigurasi server MCP dari variabel lingkungan (hanya `PIARD_URL` dan `PIARD_TOKEN`). Server MCP bukan
 * bagian dari `src/`, jadi aturan "process.env hanya di env.ts" tidak berlaku; di sini pun env hanya
 * dibaca sekali oleh `server.ts` lalu diteruskan sebagai objek.
 */

export type McpConfig = {
  /** Alamat dasar Piard tanpa garis miring akhir, mis. `http://localhost:3000`. */
  baseUrl: string;
  token: string;
};

const TOKEN_PATTERN = /^ppl_[A-Za-z0-9_-]{43}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type ConfigResult = { ok: true; config: McpConfig } | { ok: false; error: string };

/**
 * Memvalidasi env dan gagal cepat dengan pesan yang bisa ditindaklanjuti. Token tidak pernah ikut di
 * pesan galat. `http://` hanya untuk mesin sendiri: token tidak boleh lewat kanal tak terenkripsi
 * (M8-14).
 */
export function readConfig(env: Record<string, string | undefined>): ConfigResult {
  const rawUrl = env.PIARD_URL?.trim();
  const token = env.PIARD_TOKEN?.trim();
  if (!rawUrl) {
    return {
      ok: false,
      error:
        "PIARD_URL kosong. Isi dengan alamat Piard, mis. PIARD_URL=http://localhost:3000.",
    };
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      ok: false,
      error: "PIARD_URL bukan URL yang valid (contoh: http://localhost:3000).",
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      error: "PIARD_URL tidak boleh berisi nama pengguna atau kata sandi.",
    };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "PIARD_URL harus berawalan http:// atau https://." };
  }
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
    return {
      ok: false,
      error:
        "PIARD_URL memakai http:// ke host lain. Token hanya boleh dikirim lewat https:// (atau http://localhost).",
    };
  }
  if (!token) {
    return {
      ok: false,
      error:
        "PIARD_TOKEN kosong. Buat token di Piard: buka Kanban plan → Hubungkan AI → Buat token.",
    };
  }
  if (!TOKEN_PATTERN.test(token)) {
    return {
      ok: false,
      error:
        "PIARD_TOKEN bukan token agen plan Piard (harus berawalan ppl_). Salin ulang dari Hubungkan AI.",
    };
  }
  const path = url.pathname.replace(/\/+$/, "");
  return { ok: true, config: { baseUrl: `${url.origin}${path}`, token } };
}
