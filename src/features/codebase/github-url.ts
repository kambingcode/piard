/**
 * Parser URL repo GitHub (M7-06). Fungsi murni, dipakai server (sebelum mengunduh) dan klien (validasi
 * form). Hasilnya hanya pemilik, nama repo, dan segmen setelah `/tree/`; host yang diunduh selalu tetap
 * (`api.github.com`/`codeload.github.com`), jadi masukan tidak pernah menentukan alamat yang dihubungi.
 */

/** Aturan nama pengguna/organisasi GitHub: alfanumerik dan tanda hubung, maks. 39 karakter. */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const SSH = /^git@github\.com:(.+)$/i;
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
// biome-ignore lint/suspicious/noControlCharactersInRegex: karakter kontrol memang yang ditolak.
const CONTROL = /[\u0000-\u001f\u007f]/;
/** Cabang bersarang + subfolder; lebih dalam dari ini hampir pasti bukan URL yang diketik tangan. */
const MAX_TREE_SEGMENTS = 30;

export type GithubUrl = {
  owner: string;
  repo: string;
  /** Segmen setelah `/tree/` (cabang lalu subfolder; batasnya ditentukan server lewat API GitHub). */
  tree: string[];
};

export type GithubUrlProblem =
  | "empty"
  | "not_github"
  | "credentials"
  | "invalid_repo"
  | "unsupported_path";

export type GithubUrlResult =
  | { ok: true; value: GithubUrl }
  | { ok: false; problem: GithubUrlProblem };

const fail = (problem: GithubUrlProblem): GithubUrlResult => ({ ok: false, problem });

/**
 * Menerima `github.com/<pemilik>/<repo>`, dengan atau tanpa skema/`www.`/`.git`/garis miring akhir,
 * `.../tree/<cabang>[/<subfolder>]`, dan `git@github.com:<pemilik>/<repo>.git`. Kredensial di URL, port,
 * host lain, dan jalur selain `/tree/` ditolak.
 */
export function parseGithubUrl(input: string): GithubUrlResult {
  const raw = input.trim();
  if (raw === "") return fail("empty");
  if (CONTROL.test(raw) || /\s/.test(raw)) return fail("not_github");

  let pathname: string;
  const ssh = SSH.exec(raw);
  if (ssh?.[1]) {
    pathname = ssh[1];
  } else {
    let url: URL;
    try {
      url = new URL(SCHEME.test(raw) ? raw : `https://${raw}`);
    } catch {
      return fail("not_github");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return fail("not_github");
    if (url.username || url.password) return fail("credentials");
    if (!GITHUB_HOSTS.has(url.hostname.toLowerCase()) || url.port !== "") {
      return fail("not_github");
    }
    pathname = url.pathname;
  }

  let segments: string[];
  try {
    segments = pathname
      .split("/")
      .filter((s) => s !== "")
      .map((s) => decodeURIComponent(s));
  } catch {
    return fail("invalid_repo");
  }
  const [owner, repoSegment, ...rest] = segments;
  const repo = repoSegment?.replace(/\.git$/i, "");
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo) || /^\.+$/.test(repo)) {
    return fail("invalid_repo");
  }

  if (rest.length === 0) return { ok: true, value: { owner, repo, tree: [] } };
  const [kind, ...tree] = rest;
  if (kind !== "tree" || tree.length === 0 || tree.length > MAX_TREE_SEGMENTS) {
    return fail("unsupported_path");
  }
  if (tree.some((s) => s === "." || s === ".." || CONTROL.test(s))) {
    return fail("unsupported_path");
  }
  return { ok: true, value: { owner, repo, tree } };
}

/** URL kanonis untuk ditampilkan dan disimpan (`source_ref`): tanpa kredensial, query, atau fragmen. */
export function githubDisplayUrl(
  owner: string,
  repo: string,
  ref?: string | null,
  subfolder?: string | null,
): string {
  const base = `https://github.com/${owner}/${repo}`;
  if (!ref) return base;
  return `${base}/tree/${ref}${subfolder ? `/${subfolder}` : ""}`;
}
