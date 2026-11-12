/** Isi berkas .md satu halaman dokumentasi: judul lalu isi (dipakai unduhan satu halaman dan ZIP). */
export function docFile(title: string, content: string): string {
  return `# ${title}\n\n${content.trim()}\n`;
}

/** Nama berkas unduhan satu halaman, mis. `toko-daring-arsitektur.md`. */
export function docFileName(projectSlug: string, slug: string): string {
  return `${projectSlug}-${slug}.md`;
}
