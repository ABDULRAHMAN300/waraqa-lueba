/* ورقة ولعبة — يجعل التطبيق يعمل بلا إنترنت بعد أول فتح.
   عند أي تحديث: ارفع VERSION هنا وارفع ?v= في index.html إلى الرقم نفسه. */
const VERSION = 2;
const CACHE = "waraqa-v" + VERSION;
const CORE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  `styles.css?v=${VERSION}`,
  `js/core.js?v=${VERSION}`,
  `js/ai.js?v=${VERSION}`,
  `js/games.js?v=${VERSION}`,
  `js/app.js?v=${VERSION}`,
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-64.png",
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("waraqa-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // الصفحة نفسها: من الشبكة أولاً لتصل التحديثات، ومن الذاكرة عند انقطاع الإنترنت
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("index.html", copy));
          return res;
        })
        .catch(() => caches.match("index.html"))
    );
    return;
  }

  // ملفات التطبيق: أسماؤها تحمل رقم الإصدار، فالذاكرة أولاً آمنة وسريعة
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  // خط Cairo: من الذاكرة إن وُجد، ويُحدَّث في الخلفية
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req)
            .then((res) => {
              if (res.ok || res.type === "opaque") c.put(req, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || net;
        })
      )
    );
  }
  // غير ذلك (مثل Claude API) يمر مباشرة دون حفظ
});
