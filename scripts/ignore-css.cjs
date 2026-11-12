// Prapemuat untuk skrip CLI yang mengimpor route handler: fitur roadmap mengimpor CSS React Flow, yang
// hanya dipahami bundler. Di Node polos, impor `.css` cukup menjadi modul kosong.
require.extensions[".css"] = () => undefined;
