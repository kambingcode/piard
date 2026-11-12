# Fitur task

Task per fitur roadmap: daftar, CRUD, status massal, reset, dan kanban (doc 07 R10). Halaman kanban:
`/plans/:id/kanban`. Task dibuat oleh job fitur `specs`; fitur ini hanya menyimpan dan mengubahnya.

**API:** `tasks/list?planId=[&featureId=]` (urut fitur lalu posisi), `tasks/create` (fitur utama saja,
bukan sub-fitur; posisi di akhir), `tasks/:id` (PATCH judul/deskripsi/prompt/status, DELETE),
`tasks/bulk-status {planId, ids, status}` (id plan lain diabaikan), `tasks/reset {planId}` (semua ke
`todo`, isi tidak berubah). Semua memeriksa kepemilikan lewat plan.

**Status:** `todo | doing | review | done` (`review` dari jembatan agen M8, ADR 0017). Agen hanya
lewat `claimForAgent` (todo→doing atomik, satu `doing` per token) dan `moveForAgent` (doing→review/todo,
hanya task miliknya); `moveOwnedIf` untuk tinjauan pengguna. Perubahan status oleh pengguna (PATCH,
massal, reset) melepas klaim agen (`agentTokenId`, `claimedAt`).

**Kanban:** empat kolom (Todo, Dikerjakan, Review, Selesai); slot `KanbanSlots` diisi `agent-bridge`. Pindah lewat seret dan lepas HTML5, atau menu
status di tiap kartu (papan ketik dan ponsel). Kotak centang memilih banyak kartu untuk status massal.
Perubahan optimistis; bila server menolak, papan dimuat ulang dari server. Salin prompt satu klik.

**Untuk fitur lain:** `replaceForFeature` (job mengganti task satu fitur dalam satu transaksi; fitur yang
sudah dihapus dilewati) dan `clearPlan` (buat ulang semua); keduanya mempertahankan task `doing`/`review`. Task ikut terhapus bila fiturnya dihapus.
