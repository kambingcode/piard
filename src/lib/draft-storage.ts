/**
 * Draf per browser (mis. ide yang belum dikirim) di `localStorage`. Hanya kenyamanan: penyimpanan bisa
 * kosong atau ditolak (mode privat, data situs dihapus), jadi setiap akses dibungkus dan gagal diam.
 */
export function readDraft(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: string): void {
  try {
    if (value.trim() === "") window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Penyimpanan ditolak: draf hanya tidak diingat.
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Sama seperti di atas.
  }
}
