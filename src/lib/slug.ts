/** Panjang slug maksimum untuk nama berkas ekspor (doc 04: 60 karakter). */
export const SLUG_MAX_LENGTH = 60;

/**
 * Slug nama berkas ekspor (doc 04): huruf kecil, aksen dilepas, selain huruf/angka menjadi `-`,
 * tanpa `-` di awal/akhir, maksimum 60 karakter. Teks tanpa huruf/angka menghasilkan `fallback`.
 */
export function slugify(text: string, fallback = "plan"): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}
