/** Membaca badan respons NDJSON (satu JSON per baris) sebagai iterator; baris rusak dilewati. */
export async function* readNdjson(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (line.trim() === "") continue;
        try {
          yield JSON.parse(line);
        } catch {
          // Baris terpotong atau bukan JSON: abaikan, aliran berikutnya tetap dibaca.
        }
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
