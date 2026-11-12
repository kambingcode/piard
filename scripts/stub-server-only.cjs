// Prapemuat untuk skrip CLI yang mengimpor kode fitur (yang membawa komponen React):
// `server-only` melempar galat di luar bundler Next, jadi diganti modul kosong.
const path = require.resolve("server-only");
require.cache[path] = { id: path, filename: path, loaded: true, exports: {} };
