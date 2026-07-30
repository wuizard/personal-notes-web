/**
 * The privacy policy, as structured content rather than prose in a component.
 *
 * It lives here and not in messages/*.json for two reasons: it is far longer
 * than any UI string, and a legal document has to be reviewed as a whole
 * rather than as scattered keys.
 *
 * EVERY CLAIM HERE IS CHECKED AGAINST THE CODE. If you change what the app
 * collects, stores, or sends, change this in the same commit — a privacy
 * policy that has drifted from the implementation is worse than none, because
 * people rely on it. The specific things it currently asserts:
 *
 *   - free/anonymous use sends nothing anywhere (features/storage/*)
 *   - EXIF is stripped from images locally (features/image/pipeline.ts)
 *   - capture phrases never leave the device (features/note/repo/suggestions.ts)
 *   - ads load only for free, online users (shared/ads/use-ads-enabled.ts)
 *   - synced note content is encrypted at rest with a key WE hold
 *     (notes-maker-api internal/platform/crypto) — not end-to-end
 *   - trash purges after 30 days and that purge reaches the server
 *     (note-repo purgeExpiredTrash → storage/purge-queue → sync push)
 */

export interface PolicySection {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: { headers: string[]; rows: string[][] };
}

export interface PrivacyPolicy {
  title: string;
  updated: string;
  summaryHeading: string;
  summary: string[];
  sections: PolicySection[];
}

/** ISO date, rendered per-locale by the page. */
export const PRIVACY_UPDATED = "2026-07-30";

/**
 * The hosting provider and country for the server that holds synced notes.
 *
 * TODO(owner): fill both in. GDPR Art. 13(1)(f) expects users to be told
 * where their data goes, and "a VPS somewhere" does not satisfy that. This is
 * one string in one place precisely so it is a one-line fix.
 */
export const HOSTING_DISCLOSURE = {
  en: "a virtual private server rented from a commercial hosting provider",
  id: "server privat virtual yang disewa dari penyedia hosting komersial",
};

const CONTACT_EMAIL = "wwcolaborationprojects@gmail.com";

export const privacyPolicyEn: PrivacyPolicy = {
  title: "Privacy Policy",
  updated: PRIVACY_UPDATED,
  summaryHeading: "The short version",
  summary: [
    "If you use Notes Maker without an account, nothing you write ever reaches us. Your notes, checklists, images, and reminders are stored by your own browser, on your own device. There is no server involved, so there is nothing for us to read, lose, or hand over.",
    "If you create an account, we learn your email address. If you subscribe, your notes are copied to our server so they can appear on your other devices — encrypted, but with a key we hold, which means it is not end-to-end encryption and we could technically read them.",
    "Free accounts see ads from Google, which sets its own cookies. That is the one part of this app where a third party watches you, and it is the price of the free tier.",
  ],
  sections: [
    {
      id: "who-we-are",
      heading: "Who we are",
      paragraphs: [
        "Notes Maker (quickchecklist.app) is built and operated by an individual developer based in Indonesia. There is no company behind it — it is one person, which is worth saying plainly because it tells you what to expect from the support and response times below.",
        `For anything in this policy — access, correction, deletion, complaints — write to ${CONTACT_EMAIL}. Please allow up to 30 days for a substantive reply.`,
      ],
    },
    {
      id: "without-account",
      heading: "If you use the app without an account",
      paragraphs: [
        "This is the default, and it is the design the whole app is built around. In this mode we do not collect your notes at all, because there is no mechanism by which we could.",
      ],
      bullets: [
        "Your notes, checklists, colours, attachments, and reminders are written to your browser's own storage (IndexedDB) and never transmitted anywhere.",
        "Photos you attach are processed entirely inside your browser. Location data and other camera metadata (EXIF) are stripped before the image is saved, so a photo you attach does not carry where it was taken — even locally.",
        "The phrases behind quick-capture suggestions are counted on your device and stay there. You can clear that history at any time in Settings.",
        "Because there is no server copy, we cannot recover your notes if you clear your browser data or lose the device. Exporting a backup from Settings is the only recovery path, and we would rather say so than let you find out later.",
      ],
    },
    {
      id: "with-account",
      heading: "If you create an account",
      paragraphs: [
        "Signing in is optional and unlocks subscriptions and, on a paid plan, sync. Accounts are handled by Google Firebase Authentication; we never see or store your password, and we never receive it even momentarily.",
        "What we store on our own server for an account:",
      ],
      bullets: [
        "Your Firebase user ID, which is how we recognise you.",
        "Your email address, used to identify your account and to match a payment to it.",
        "Your display name, if your sign-in method supplies one.",
        "Your subscription status and the identifiers our payment provider uses for you.",
      ],
    },
    {
      id: "with-subscription",
      heading: "If you subscribe (sync)",
      paragraphs: [
        "A paid subscription copies your notes to our server so they can reach your other devices. This is the only circumstance in which your notes leave your device.",
        "Note content — the title, the body, the checklist items, and the text used for searching — is encrypted before it is written to our database. Some information is deliberately not encrypted, because the server needs to be able to sort, filter, and merge on it: the note's colour, whether it is pinned or archived, its labels, its reminder schedule, when it was created and last changed, and a short history of which fields changed in recent revisions.",
        "Read the security section below before assuming what \"encrypted\" means here. It is important, and it is the thing most easily misunderstood.",
      ],
    },
    {
      id: "advertising",
      heading: "Advertising",
      paragraphs: [
        "Free accounts see ads supplied by Google AdSense while online. Premium accounts see none, and the ad code is not loaded at all for them.",
        "When ads load, Google receives your IP address and sets its own cookies or similar identifiers, and may use them to personalise what you are shown. Google acts as an independent controller of that data — we do not receive it, and we cannot delete it on your behalf. You can review and change what Google does at myadcenter.google.com and adssettings.google.com.",
        "Ads are never placed inside a note, and never interrupt you with a full-screen unit. We do not send Google anything you write.",
      ],
    },
    {
      id: "processors",
      heading: "Who else handles your data",
      paragraphs: [
        "We use as few outside services as the product allows. These are all of them:",
      ],
      table: {
        headers: ["Service", "What it handles", "When"],
        rows: [
          [
            "Google Firebase Authentication",
            "Your email, display name, sign-in times, IP address, and device information",
            "Only if you create an account",
          ],
          [
            "Polar",
            "Payment processing as merchant of record — card details go to them, never to us. We receive your email and subscription status.",
            "Only if you subscribe",
          ],
          [
            "Google AdSense",
            "IP address, cookies and advertising identifiers",
            "Free accounts, while online",
          ],
          [
            "Cloudflare",
            "Sits in front of the website; sees IP addresses and request metadata for security and delivery",
            "Every visit to the website",
          ],
          [
            "Our own server",
            "Account records, and synced notes for subscribers",
            "Accounts and subscriptions only",
          ],
        ],
      },
    },
    {
      id: "analytics",
      heading: "Analytics",
      paragraphs: [
        "We do not currently run any analytics — no Google Analytics, no tracking pixels, no session recording. If that changes we will update this policy and say so here before switching anything on.",
      ],
    },
    {
      id: "legal-bases",
      heading: "Why we are allowed to process this",
      paragraphs: [
        "If you are in the UK or the European Economic Area, the UK GDPR and GDPR require us to name a legal basis for each purpose:",
      ],
      bullets: [
        "Performance of a contract — running your account, syncing your notes, and taking payment. Without this we cannot provide the service you paid for.",
        "Legitimate interests — keeping the service secure, preventing abuse, and fixing faults. We keep this to the minimum that actually serves those ends.",
        "Consent — advertising personalisation and anything you volunteer by writing to us. You can withdraw consent at any time, and doing so does not affect processing that already happened.",
        "Legal obligation — retaining payment records where tax or accounting law requires it.",
      ],
    },
    {
      id: "retention",
      heading: "How long we keep things",
      bullets: [
        "Notes you delete go to Trash and are removed permanently 30 days later. That deletion also reaches our server the next time you open the app — so if you stop using the app entirely, a deleted note may remain on our server until you return or ask us to delete your account.",
        "Choosing \"Delete forever\" removes the note's content from our server as soon as your device can reach it. A record that the note existed and was deleted remains, so your other devices learn about the deletion.",
        "Account records are kept while your account exists, and deleted within 30 days of you asking us to close it.",
        "Payment records are kept as long as tax and accounting rules require, which is longer than the account itself.",
        "Data held by Google and Polar is kept under their own policies, not ours.",
      ],
    },
    {
      id: "rights",
      heading: "Your rights",
      paragraphs: [
        "Under Indonesia's Personal Data Protection Law (Law No. 27 of 2022) and, where they apply to you, the GDPR and UK GDPR, you can ask us to:",
      ],
      bullets: [
        "Tell you what we hold about you, and give you a copy.",
        "Correct anything that is wrong.",
        "Delete your data and close your account.",
        "Export your data in a portable format. You do not need to ask us for this one — Settings → Backup exports everything on your device as a file, at any time, without an account.",
        "Restrict or object to particular processing, including advertising.",
        "Withdraw consent you previously gave.",
      ],
    },
    {
      id: "security",
      heading: "Security, stated precisely",
      paragraphs: [
        "Traffic between your device and our server is encrypted in transit. Synced note content is also encrypted where it is stored, using AES-256-GCM.",
        "This is not end-to-end encryption, and we will not describe it as such. We hold the decryption key on our server, which means we are technically capable of reading your synced notes. We do not, and nothing in the app is built to — but you are entitled to know the difference between \"they cannot read it\" and \"they say they do not\", and this is the second one.",
        "If you want the first one, do not subscribe to sync: notes on a free account never leave your device, which is a stronger guarantee than any promise we could make about our own server.",
        "We never see your password — Firebase handles sign-in — and we never see your card details, which go directly to our payment provider.",
        "No system is perfectly secure. If a breach affects your personal data we will notify you and the relevant authority as the law requires.",
      ],
    },
    {
      id: "transfers",
      heading: "Where your data goes",
      paragraphs: [
        `Our own server is ${HOSTING_DISCLOSURE.en}. Google, Polar, and Cloudflare operate internationally and process data in countries that may differ from your own, including the United States. Where the GDPR applies, those providers rely on their own approved transfer mechanisms, such as the European Commission's standard contractual clauses.`,
      ],
    },
    {
      id: "children",
      heading: "Children",
      paragraphs: [
        "Notes Maker is not directed at children under 13, and we do not knowingly collect their personal data. If you believe a child has given us personal data, write to us and we will delete it.",
      ],
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      paragraphs: [
        "If we change how the app handles your data, we will update this page and change the date at the top. For changes that materially affect you — a new category of data, a new third party, a new purpose — we will tell you in the app rather than relying on you to re-read this page.",
      ],
    },
    {
      id: "contact",
      heading: "Contact and complaints",
      paragraphs: [
        `Write to ${CONTACT_EMAIL} for anything in this policy.`,
        "If you are in the EEA or UK and are not satisfied with our response, you have the right to complain to your national data protection authority. If you are in Indonesia, you may raise the matter with the authority designated under Law No. 27 of 2022.",
      ],
    },
  ],
};

export const privacyPolicyId: PrivacyPolicy = {
  title: "Kebijakan Privasi",
  updated: PRIVACY_UPDATED,
  summaryHeading: "Ringkasnya",
  summary: [
    "Jika Anda memakai Notes Maker tanpa akun, apa pun yang Anda tulis tidak pernah sampai ke kami. Catatan, daftar tugas, gambar, dan pengingat Anda disimpan oleh peramban Anda sendiri, di perangkat Anda sendiri. Tidak ada server yang terlibat, jadi tidak ada yang bisa kami baca, hilangkan, atau serahkan.",
    "Jika Anda membuat akun, kami mengetahui alamat email Anda. Jika Anda berlangganan, catatan Anda disalin ke server kami agar bisa muncul di perangkat lain — terenkripsi, tetapi dengan kunci yang kami pegang. Artinya ini bukan enkripsi ujung-ke-ujung, dan secara teknis kami bisa membacanya.",
    "Akun gratis melihat iklan dari Google, yang memasang cookie-nya sendiri. Itulah satu-satunya bagian aplikasi ini di mana pihak ketiga mengamati Anda, dan itu adalah harga dari tier gratis.",
  ],
  sections: [
    {
      id: "who-we-are",
      heading: "Siapa kami",
      paragraphs: [
        "Notes Maker (quickchecklist.app) dibuat dan dijalankan oleh seorang pengembang perorangan yang berbasis di Indonesia. Tidak ada perusahaan di baliknya — hanya satu orang. Ini perlu dikatakan terus terang karena menjelaskan apa yang bisa Anda harapkan dari dukungan dan waktu tanggapan di bawah ini.",
        `Untuk hal apa pun dalam kebijakan ini — akses, koreksi, penghapusan, keluhan — kirim surel ke ${CONTACT_EMAIL}. Mohon beri waktu hingga 30 hari untuk jawaban yang substantif.`,
      ],
    },
    {
      id: "without-account",
      heading: "Jika Anda memakai aplikasi tanpa akun",
      paragraphs: [
        "Ini adalah mode bawaan, dan seluruh aplikasi dirancang di sekitarnya. Dalam mode ini kami sama sekali tidak mengumpulkan catatan Anda, karena memang tidak ada mekanisme yang memungkinkannya.",
      ],
      bullets: [
        "Catatan, daftar tugas, warna, lampiran, dan pengingat Anda ditulis ke penyimpanan peramban Anda sendiri (IndexedDB) dan tidak pernah dikirim ke mana pun.",
        "Foto yang Anda lampirkan diproses sepenuhnya di dalam peramban Anda. Data lokasi dan metadata kamera lainnya (EXIF) dihapus sebelum gambar disimpan, sehingga foto yang Anda lampirkan tidak membawa informasi tempat pengambilannya — bahkan secara lokal.",
        "Frasa di balik saran tangkap-cepat dihitung di perangkat Anda dan tetap di sana. Anda bisa menghapus riwayat itu kapan saja di Pengaturan.",
        "Karena tidak ada salinan di server, kami tidak dapat memulihkan catatan Anda jika Anda menghapus data peramban atau kehilangan perangkat. Mengekspor cadangan dari Pengaturan adalah satu-satunya jalan pemulihan, dan kami lebih memilih mengatakannya sekarang daripada Anda mengetahuinya belakangan.",
      ],
    },
    {
      id: "with-account",
      heading: "Jika Anda membuat akun",
      paragraphs: [
        "Masuk bersifat opsional dan membuka langganan serta, pada paket berbayar, sinkronisasi. Akun ditangani oleh Google Firebase Authentication; kami tidak pernah melihat atau menyimpan kata sandi Anda, bahkan sesaat pun.",
        "Yang kami simpan di server kami sendiri untuk sebuah akun:",
      ],
      bullets: [
        "ID pengguna Firebase Anda, yang menjadi cara kami mengenali Anda.",
        "Alamat email Anda, untuk mengidentifikasi akun dan mencocokkan pembayaran dengannya.",
        "Nama tampilan Anda, jika metode masuk Anda menyediakannya.",
        "Status langganan Anda dan pengenal yang dipakai penyedia pembayaran kami.",
      ],
    },
    {
      id: "with-subscription",
      heading: "Jika Anda berlangganan (sinkronisasi)",
      paragraphs: [
        "Langganan berbayar menyalin catatan Anda ke server kami agar dapat menjangkau perangkat Anda yang lain. Ini satu-satunya keadaan di mana catatan Anda meninggalkan perangkat Anda.",
        "Isi catatan — judul, badan teks, butir daftar tugas, dan teks yang dipakai untuk pencarian — dienkripsi sebelum ditulis ke basis data kami. Sebagian informasi sengaja tidak dienkripsi, karena server perlu mengurutkan, menyaring, dan menggabungkannya: warna catatan, status disematkan atau diarsipkan, labelnya, jadwal pengingatnya, waktu pembuatan dan perubahan terakhir, serta riwayat singkat bidang mana yang berubah pada beberapa revisi terakhir.",
        "Baca bagian keamanan di bawah sebelum menyimpulkan arti \"terenkripsi\" di sini. Ini penting, dan paling mudah disalahpahami.",
      ],
    },
    {
      id: "advertising",
      heading: "Iklan",
      paragraphs: [
        "Akun gratis melihat iklan dari Google AdSense saat daring. Akun Premium tidak melihat iklan sama sekali, dan kode iklan tidak dimuat untuk mereka.",
        "Saat iklan dimuat, Google menerima alamat IP Anda dan memasang cookie atau pengenal serupa miliknya sendiri, serta dapat memakainya untuk mempersonalisasi apa yang Anda lihat. Google bertindak sebagai pengendali data yang independen atas data tersebut — kami tidak menerimanya, dan kami tidak dapat menghapusnya atas nama Anda. Anda dapat meninjau dan mengubah perilaku Google di myadcenter.google.com dan adssettings.google.com.",
        "Iklan tidak pernah ditempatkan di dalam catatan, dan tidak pernah mengganggu Anda dengan unit layar penuh. Kami tidak mengirimkan apa pun yang Anda tulis kepada Google.",
      ],
    },
    {
      id: "processors",
      heading: "Siapa lagi yang menangani data Anda",
      paragraphs: [
        "Kami memakai layanan luar sesedikit mungkin. Ini seluruhnya:",
      ],
      table: {
        headers: ["Layanan", "Yang ditangani", "Kapan"],
        rows: [
          [
            "Google Firebase Authentication",
            "Email, nama tampilan, waktu masuk, alamat IP, dan informasi perangkat Anda",
            "Hanya jika Anda membuat akun",
          ],
          [
            "Polar",
            "Pemrosesan pembayaran sebagai merchant of record — detail kartu masuk ke mereka, tidak pernah ke kami. Kami menerima email dan status langganan Anda.",
            "Hanya jika Anda berlangganan",
          ],
          [
            "Google AdSense",
            "Alamat IP, cookie, dan pengenal periklanan",
            "Akun gratis, saat daring",
          ],
          [
            "Cloudflare",
            "Berada di depan situs; melihat alamat IP dan metadata permintaan untuk keamanan dan pengiriman",
            "Setiap kunjungan ke situs",
          ],
          [
            "Server kami sendiri",
            "Catatan akun, dan catatan tersinkron bagi pelanggan",
            "Hanya akun dan langganan",
          ],
        ],
      },
    },
    {
      id: "analytics",
      heading: "Analitik",
      paragraphs: [
        "Saat ini kami tidak menjalankan analitik apa pun — tanpa Google Analytics, tanpa piksel pelacak, tanpa perekaman sesi. Jika itu berubah, kami akan memperbarui kebijakan ini dan menyatakannya di sini sebelum mengaktifkan apa pun.",
      ],
    },
    {
      id: "legal-bases",
      heading: "Dasar kami memproses data ini",
      paragraphs: [
        "Jika Anda berada di Inggris atau Wilayah Ekonomi Eropa, UK GDPR dan GDPR mengharuskan kami menyebutkan dasar hukum untuk setiap tujuan:",
      ],
      bullets: [
        "Pelaksanaan kontrak — menjalankan akun Anda, menyinkronkan catatan Anda, dan menerima pembayaran. Tanpa ini kami tidak dapat menyediakan layanan yang Anda bayar.",
        "Kepentingan sah — menjaga keamanan layanan, mencegah penyalahgunaan, dan memperbaiki kesalahan. Kami membatasinya seminimal mungkin.",
        "Persetujuan — personalisasi iklan dan apa pun yang Anda sampaikan sendiri kepada kami. Anda dapat menarik persetujuan kapan saja, dan penarikan itu tidak memengaruhi pemrosesan yang sudah terjadi.",
        "Kewajiban hukum — menyimpan catatan pembayaran bila diwajibkan oleh hukum pajak atau akuntansi.",
      ],
    },
    {
      id: "retention",
      heading: "Berapa lama kami menyimpannya",
      bullets: [
        "Catatan yang Anda hapus masuk ke Sampah dan dihapus permanen 30 hari kemudian. Penghapusan itu juga sampai ke server kami saat Anda berikutnya membuka aplikasi — jadi jika Anda berhenti memakai aplikasi sepenuhnya, catatan yang dihapus mungkin tetap ada di server kami sampai Anda kembali atau meminta kami menghapus akun Anda.",
        "Memilih \"Hapus permanen\" menghapus isi catatan dari server kami segera setelah perangkat Anda dapat menjangkaunya. Catatan bahwa berkas itu pernah ada dan telah dihapus tetap disimpan, agar perangkat Anda yang lain mengetahui penghapusan tersebut.",
        "Data akun disimpan selama akun Anda ada, dan dihapus dalam 30 hari setelah Anda meminta penutupannya.",
        "Catatan pembayaran disimpan selama diwajibkan aturan pajak dan akuntansi, yang lebih lama daripada akunnya sendiri.",
        "Data yang dipegang Google dan Polar disimpan menurut kebijakan mereka, bukan kebijakan kami.",
      ],
    },
    {
      id: "rights",
      heading: "Hak Anda",
      paragraphs: [
        "Berdasarkan Undang-Undang Pelindungan Data Pribadi Indonesia (UU No. 27 Tahun 2022) dan, bila berlaku bagi Anda, GDPR serta UK GDPR, Anda dapat meminta kami untuk:",
      ],
      bullets: [
        "Memberi tahu apa yang kami simpan tentang Anda, dan memberikan salinannya.",
        "Memperbaiki apa pun yang keliru.",
        "Menghapus data Anda dan menutup akun Anda.",
        "Mengekspor data Anda dalam format yang mudah dipindahkan. Untuk yang satu ini Anda tidak perlu meminta kami — Pengaturan → Cadangan mengekspor semua yang ada di perangkat Anda sebagai berkas, kapan saja, tanpa akun.",
        "Membatasi atau menolak pemrosesan tertentu, termasuk iklan.",
        "Menarik persetujuan yang sebelumnya Anda berikan.",
      ],
    },
    {
      id: "security",
      heading: "Keamanan, dinyatakan dengan tepat",
      paragraphs: [
        "Lalu lintas antara perangkat Anda dan server kami dienkripsi saat transit. Isi catatan tersinkron juga dienkripsi di tempat penyimpanannya, memakai AES-256-GCM.",
        "Ini bukan enkripsi ujung-ke-ujung, dan kami tidak akan menyebutnya demikian. Kami memegang kunci dekripsi di server kami, yang berarti kami secara teknis mampu membaca catatan tersinkron Anda. Kami tidak melakukannya, dan tidak ada bagian aplikasi yang dibangun untuk itu — tetapi Anda berhak mengetahui perbedaan antara \"mereka tidak bisa membacanya\" dan \"mereka bilang tidak membacanya\", dan ini adalah yang kedua.",
        "Jika Anda menginginkan yang pertama, jangan berlangganan sinkronisasi: catatan pada akun gratis tidak pernah meninggalkan perangkat Anda, dan itu jaminan yang lebih kuat daripada janji apa pun yang bisa kami buat tentang server kami sendiri.",
        "Kami tidak pernah melihat kata sandi Anda — Firebase yang menangani proses masuk — dan kami tidak pernah melihat detail kartu Anda, yang langsung menuju penyedia pembayaran kami.",
        "Tidak ada sistem yang sepenuhnya aman. Jika terjadi pelanggaran yang memengaruhi data pribadi Anda, kami akan memberi tahu Anda dan otoritas terkait sebagaimana diwajibkan hukum.",
      ],
    },
    {
      id: "transfers",
      heading: "Ke mana data Anda pergi",
      paragraphs: [
        `Server kami sendiri adalah ${HOSTING_DISCLOSURE.id}. Google, Polar, dan Cloudflare beroperasi secara internasional dan memproses data di negara yang mungkin berbeda dari negara Anda, termasuk Amerika Serikat. Bila GDPR berlaku, penyedia tersebut mengandalkan mekanisme transfer resmi mereka sendiri, seperti klausul kontraktual standar Komisi Eropa.`,
      ],
    },
    {
      id: "children",
      heading: "Anak-anak",
      paragraphs: [
        "Notes Maker tidak ditujukan untuk anak di bawah 13 tahun, dan kami tidak dengan sengaja mengumpulkan data pribadi mereka. Jika Anda yakin seorang anak telah memberikan data pribadi kepada kami, hubungi kami dan akan kami hapus.",
      ],
    },
    {
      id: "changes",
      heading: "Perubahan kebijakan ini",
      paragraphs: [
        "Jika kami mengubah cara aplikasi menangani data Anda, kami akan memperbarui halaman ini dan mengubah tanggal di bagian atas. Untuk perubahan yang berdampak material bagi Anda — kategori data baru, pihak ketiga baru, tujuan baru — kami akan memberi tahu Anda di dalam aplikasi, bukan mengandalkan Anda membaca ulang halaman ini.",
      ],
    },
    {
      id: "contact",
      heading: "Kontak dan keluhan",
      paragraphs: [
        `Kirim surel ke ${CONTACT_EMAIL} untuk hal apa pun dalam kebijakan ini.`,
        "Jika Anda berada di EEA atau Inggris dan tidak puas dengan tanggapan kami, Anda berhak mengadu kepada otoritas pelindungan data di negara Anda. Jika Anda berada di Indonesia, Anda dapat menyampaikan persoalan tersebut kepada otoritas yang ditunjuk berdasarkan UU No. 27 Tahun 2022.",
      ],
    },
  ],
};

export function privacyPolicyFor(locale: string): PrivacyPolicy {
  return locale === "id" ? privacyPolicyId : privacyPolicyEn;
}
