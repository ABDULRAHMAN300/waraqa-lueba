/* ورقة ولعبة — الشاشات والتنقل */
(function () {
  "use strict";
  const { parse, serialize, SAMPLE, HELP, icon, fmt, esc } = Core;

  const K = { text: "la3ebha.text", key: "la3ebha.apikey", prefs: "la3ebha.prefs", usage: "la3ebha.usage", last: "la3ebha.lastcost" };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const readJSON = (k, fallback) => {
    try {
      return Object.assign({}, fallback, JSON.parse(Core.store.get(k) || "{}"));
    } catch (_) {
      return Object.assign({}, fallback);
    }
  };

  const state = {
    text: Core.store.get(K.text) || "",
    parsed: null,
    prefs: readJSON(K.prefs, { teams: true, timer: false }),
    abort: null,
    tick: null,
  };

  // صيغ العدّ بالعربية: واحد، اثنان، 3-10، 11 فأكثر
  const COUNT = {
    race: ["سؤال واحد", "سؤالان", "أسئلة", "سؤالاً"],
    match: ["مصطلح واحد", "مصطلحان", "مصطلحات", "مصطلحاً"],
    sort: ["بطاقة واحدة", "بطاقتان", "بطاقات", "بطاقة"],
    order: ["تسلسل واحد", "تسلسلان", "تسلسلات", "تسلسلاً"],
    safe: ["سؤال واحد", "سؤالان", "أسئلة", "سؤالاً"],
    notes: ["ملاحظة واحدة", "ملاحظتان", "ملاحظات", "ملاحظة"],
    pages: ["صفحة واحدة", "صفحتان", "صفحات", "صفحة"],
  };

  // داخل صفحة Claude يقرأ الملف حساب المستخدم في Claude، وخارجها مفتاح API
  const CLAUDE_MODE = AI.mode() === "claude";
  const countText = (n, f) => (n === 1 ? f[0] : n === 2 ? f[1] : n <= 10 ? `${n} ${f[2]}` : `${n} ${f[3]}`);

  /* ---------- عداد التكلفة ---------- */
  const KWD_PER_USD = 0.307; // سعر صرف تقريبي
  const nf = new Intl.NumberFormat("en-US");
  const money = (usd) => (usd < 1 ? `${(usd * 100).toFixed(1)} سنت` : `${usd.toFixed(2)} دولار`);
  const kwd = (usd) => `${(usd * KWD_PER_USD).toFixed(3)} د.ك`;
  const dateText = (t) => {
    const d = new Date(t);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };
  const readUsage = () => readJSON(K.usage, { count: 0, usd: 0, unknown: 0, inTok: 0, outTok: 0, since: 0 });

  function recordCost(cost) {
    if (!cost) return;
    const u = readUsage();
    u.count++;
    if (cost.usd == null) u.unknown++;
    else u.usd += cost.usd;
    u.inTok += cost.inTok;
    u.outTok += cost.outTok;
    if (!u.since) u.since = cost.at || Date.now();
    Core.store.set(K.usage, JSON.stringify(u));
  }

  function setLastCost(cost) {
    if (cost) Core.store.set(K.last, JSON.stringify(cost));
    else Core.store.remove(K.last);
  }

  function paintCost() {
    let c = null;
    try {
      c = JSON.parse(Core.store.get(K.last) || "null");
    } catch (_) {}
    const box = $("#cost");
    box.hidden = !c;
    if (!c) return;
    const head = c.usd == null ? `تكلفة القراءة غير معروفة للنموذج <bdi dir="ltr">${esc(c.model)}</bdi>` : `تكلفة قراءة هذه الورقة: ${money(c.usd)} <span class="muted">(${kwd(c.usd)} تقريباً)</span>`;
    box.innerHTML = `<b>${head}</b><span class="muted small">أُرسل ${nf.format(c.inTok)} توكن، وكتب Claude ${nf.format(c.outTok)} توكن${c.fallback ? "، وأكمل القراءة نموذج بديل" : ""}</span>`;
  }

  function paintUsage() {
    const u = readUsage();
    const body = $("#usage-body");
    $("#usage-reset").hidden = !u.count;
    if (!u.count) {
      body.innerHTML = `<p class="muted small">لم تُقرأ أي ورقة بعد.</p>`;
      return;
    }
    const priced = u.count - u.unknown;
    body.innerHTML = `
      <div class="usage-grid">
        <div><b>${nf.format(u.count)}</b><span>ورقة مقروءة</span></div>
        <div><b>${money(u.usd)}</b><span>المجموع (${kwd(u.usd)})</span></div>
        <div><b>${priced ? money(u.usd / priced) : "—"}</b><span>متوسط الورقة</span></div>
      </div>
      <p class="muted small">منذ ${dateText(u.since)}. التكلفة محسوبة من الاستهلاك الفعلي وأسعار Anthropic المعلنة${u.unknown ? `، عدا ${nf.format(u.unknown)} بنموذج سعره غير معروف` : ""}.</p>`;
  }

  /* ---------- رسائل قصيرة ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  /* ---------- التنقل ---------- */
  const SCREENS = ["input", "review", "pick"];

  function go(name, push = true) {
    if (name === "play") name = "pick";
    if (!SCREENS.includes(name)) name = "input";
    if (name !== "input" && !state.text.trim()) name = "input";
    SCREENS.forEach((s) => ($("#screen-" + s).hidden = s !== name));
    const idx = SCREENS.indexOf(name);
    $$(".steps li").forEach((li, k) => {
      li.classList.toggle("current", k === idx);
      li.classList.toggle("done", k < idx);
      if (k === idx) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
    if (name === "input") enterInput();
    if (name === "review") enterReview();
    if (name === "pick") enterPick();
    const hash = "#" + name;
    if (push && location.hash !== hash) Core.nav("pushState", hash);
    else if (!push) Core.nav("replaceState", hash);
    window.scrollTo(0, 0);
  }
  // زر الرجوع في الجوال يغلق اللعبة أولاً
  window.addEventListener("popstate", () => {
    if (Games.isOpen()) Games.close();
    go((location.hash || "#input").slice(1), false);
  });

  function play(id) {
    savePrefs();
    Core.nav("pushState", "#play");
    Games.start(id, state.parsed.model, state.prefs, {
      onExit: () => {
        if (location.hash === "#play") history.back();
      },
    });
  }

  function setText(text) {
    state.text = text;
    Core.store.set(K.text, text);
    state.parsed = parse(text);
  }

  /* ---------- 1) الإدخال ---------- */
  function enterInput() {
    const hasKey = !!Core.store.get(K.key);
    $("#key-hint").innerHTML = CLAUDE_MODE
      ? `يقرأ Claude الملف من حسابك في Claude ضمن حدود اشتراكك، دون أي تكلفة إضافية. في أول مرة يطلب إذنك.`
      : hasKey
      ? `يقرأ Claude الملف بمفتاحك المحفوظ. <button class="link" data-open="settings">تغيير المفتاح</button>`
      : `قراءة الملفات تحتاج مفتاح Claude API. <button class="link" data-open="settings">أضف المفتاح</button> أو استخدم «لصق نص».`;
    const resume = $("#resume");
    if (state.text.trim()) {
      const title = parse(state.text).model.title;
      resume.innerHTML = `<span class="muted">آخر أسئلة عملت عليها</span><b>${title ? fmt(title) : "بلا عنوان"}</b><span class="resume-go">متابعة</span>`;
      resume.hidden = false;
    } else resume.hidden = true;
  }

  // التبويب الأول يرفع الملف مباشرة إذا كان هناك Claude أو مفتاح API، وإلا يشرح الطريقة المجانية عبر أي مساعد ذكي
  const canUpload = () => CLAUDE_MODE || !!Core.store.get(K.key);

  function selectTab(which) {
    const first = which === "file";
    const upload = canUpload();
    const tab = $("#tab-file");
    tab.textContent = upload ? "رفع ملف" : "صورة أو PDF";
    tab.setAttribute("aria-controls", upload ? "panel-file" : "panel-assist");
    tab.setAttribute("aria-selected", String(first));
    $("#tab-text").setAttribute("aria-selected", String(!first));
    $("#panel-file").hidden = !(first && upload);
    $("#panel-assist").hidden = !(first && !upload);
    $("#panel-text").hidden = first;
    if (!first) $("#paste").focus({ preventScroll: true });
  }
  const refreshTabs = () => selectTab($("#tab-text").getAttribute("aria-selected") === "true" ? "text" : "file");

  function setBusy(on, name) {
    $("#drop").hidden = on;
    $("#ai-status").hidden = !on;
    $("#tab-text").disabled = on;
    $("#sample").disabled = on;
    clearInterval(state.tick);
    if (on) {
      $("#ai-file").textContent = name;
      const t0 = Date.now();
      const paint = () => {
        const s = Math.floor((Date.now() - t0) / 1000);
        $("#ai-time").textContent = `Claude يقرأ الورقة ويستخرج الأسئلة… ${s} ث`;
      };
      paint();
      state.tick = setInterval(paint, 1000);
    }
  }

  function showError(msg) {
    const box = $("#ai-error");
    box.textContent = msg;
    box.hidden = !msg;
  }

  async function handleFile(file) {
    if (!file) return;
    showError("");
    const key = Core.store.get(K.key);
    if (!CLAUDE_MODE && !key) {
      toast("أضف مفتاح Claude API أولاً");
      openSettings();
      return;
    }
    setBusy(true, file.name);
    const ctrl = new AbortController();
    state.abort = ctrl;
    try {
      const { data, cost, skipped } = await AI.extract(file, key, { signal: ctrl.signal });
      recordCost(cost);
      setLastCost(cost);
      setText(serialize(data));
      go("review");
      toast(skipped ? `قُرئت أول الصفحات فقط، وتُركت ${countText(skipped, COUNT.pages)}. ارفع الباقي في ملف آخر.` : "راجع الأسئلة قبل اللعب");
    } catch (e) {
      recordCost(e.cost); // ردّ وصل ودُفع ثمنه لكن بلا أسئلة صالحة
      if (e.code !== "aborted") showError(AI.message(e));
      if (e.detail) console.warn("ورقة ولعبة:", e.code, e.detail);
    } finally {
      setBusy(false);
      state.abort = null;
      $("#file").value = "";
    }
  }

  /* ---------- 2) المراجعة ---------- */
  function enterReview() {
    const ed = $("#editor");
    if (ed.value !== state.text) ed.value = state.text;
    refreshSummary();
    paintCost();
  }

  function refreshSummary() {
    state.parsed = parse(state.text);
    const m = state.parsed.model;
    $("#review-title").innerHTML = m.title ? fmt(m.title) : "راجع الأسئلة";
    const stats = [
      ["اختيار من متعدد", m.mcq.length],
      ["صح وخطأ", m.tf.length],
      ["مصطلحات", m.pairs.length],
      ["مجموعات تصنيف", m.groups.length],
      ["تسلسلات", m.sequences.length],
      ["مسائل حسابية", m.numeric.length],
    ];
    $("#summary").innerHTML = stats.map(([label, n]) => `<div class="stat ${n ? "" : "zero"}"><b>${n}</b><span>${label}</span></div>`).join("");

    const w = state.parsed.warnings;
    const box = $("#warnings");
    box.hidden = !w.length;
    box.innerHTML = w.length
      ? `<p><b>${countText(w.length, COUNT.notes)}</b></p><ul>${w
          .slice(0, 8)
          .map((x) => `<li><button class="link ln" data-line="${x.line}">السطر ${x.line}</button> ${esc(x.msg)}</li>`)
          .join("")}</ul>`
      : "";
    $("#to-pick").disabled = !Games.DEFS.some((d) => d.count(m) >= d.min);
  }

  function selectLine(n) {
    const ed = $("#editor");
    const lines = ed.value.split("\n");
    let start = 0;
    for (let i = 0; i < n - 1 && i < lines.length; i++) start += lines[i].length + 1;
    const end = start + (lines[n - 1] || "").length;
    ed.focus();
    ed.setSelectionRange(start, end);
    const lh = parseFloat(getComputedStyle(ed).lineHeight) || 24;
    ed.scrollTop = Math.max(0, (n - 3) * lh);
  }

  /* ---------- 3) اختيار اللعبة ---------- */
  function enterPick() {
    if (!state.parsed) state.parsed = parse(state.text);
    const m = state.parsed.model;
    $("#opt-teams").checked = state.prefs.teams;
    $("#opt-timer").checked = state.prefs.timer;
    // روابط المشاركة تحمل الأسئلة في العنوان، وصفحات Claude لا تسمح بذلك
    $("#share-box").hidden = CLAUDE_MODE;
    $("#share-link").hidden = true;
    $("#games").innerHTML = Games.DEFS.map((d) => {
      const n = d.count(m);
      const ok = n >= d.min;
      return `<button class="game-card" data-game="${d.id}" ${ok ? "" : "disabled"}>
          <span class="gc-icon">${icon(d.icon, 26)}</span>
          <span class="gc-text"><b>${d.name}</b><span>${d.desc}</span></span>
          <span class="gc-meta">${ok ? countText(n, COUNT[d.id]) : d.need}</span>
        </button>`;
    }).join("");
  }

  function savePrefs() {
    state.prefs.teams = $("#opt-teams").checked;
    state.prefs.timer = $("#opt-timer").checked;
    Core.store.set(K.prefs, JSON.stringify(state.prefs));
  }

  /* ---------- الإعدادات ---------- */
  function openSettings() {
    $("#api-key").value = Core.store.get(K.key) || "";
    paintUsage();
    $("#settings").showModal();
  }

  /* ---------- ربط الأحداث ---------- */
  function bind() {
    $("#open-settings").innerHTML = icon("settings");
    // الإعدادات تخص مفتاح API وتكلفته فقط، ولا حاجة لها مع حساب Claude
    if (CLAUDE_MODE) $("#open-settings").hidden = true;
    $$("[data-go]").forEach((b) => (b.innerHTML = icon("back")));
    $("#drop-icon").innerHTML = icon("upload", 32);
    $$(".help-slot").forEach((s) => (s.innerHTML = HELP));

    document.addEventListener("click", (e) => {
      const el = e.target.closest("button, [data-open]");
      if (!el) return;
      if (el.dataset.open === "settings") return openSettings();
      if (el.dataset.go) return go(el.dataset.go);
      if (el.dataset.line) return selectLine(+el.dataset.line);
      const card = el.closest(".game-card");
      if (card && !card.disabled) play(card.dataset.game);
    });

    $("#open-settings").addEventListener("click", openSettings);
    $("#tab-file").addEventListener("click", () => selectTab("file"));
    $("#tab-text").addEventListener("click", () => selectTab("text"));
    $("#resume").addEventListener("click", () => go("review"));

    $("#file").addEventListener("change", (e) => handleFile(e.target.files[0]));
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((ev) =>
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add("over");
      })
    );
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      handleFile(e.dataTransfer.files[0]);
    });
    $("#ai-cancel").addEventListener("click", () => state.abort && state.abort.abort());

    $("#paste-go").addEventListener("click", () => {
      const text = $("#paste").value;
      if (!text.trim()) {
        toast("الصق الأسئلة أولاً");
        return $("#paste").focus();
      }
      setLastCost(null);
      setText(text);
      go("review");
    });
    $("#sample").addEventListener("click", () => {
      setLastCost(null);
      setText(SAMPLE);
      go("review");
    });

    let deb = null;
    $("#editor").addEventListener("input", (e) => {
      clearTimeout(deb);
      deb = setTimeout(() => {
        setText(e.target.value);
        refreshSummary();
      }, 250);
    });
    $("#to-pick").addEventListener("click", () => {
      setText($("#editor").value);
      go("pick");
    });

    $("#opt-teams").addEventListener("change", savePrefs);
    $("#opt-timer").addEventListener("change", savePrefs);

    $("#settings-form").addEventListener("submit", (e) => {
      if (e.submitter && e.submitter.value === "save") {
        const v = $("#api-key").value.trim();
        if (v) Core.store.set(K.key, v);
        else Core.store.remove(K.key);
        toast(v ? "حُفظ المفتاح" : "حُذف المفتاح");
        enterInput();
        refreshTabs();
      }
    });
    $("#usage-reset").addEventListener("click", async () => {
      if (!(await Core.ask("تصفير عداد الاستهلاك؟", "تصفير", "إلغاء"))) return;
      Core.store.remove(K.usage);
      paintUsage();
      toast("صُفّر العداد");
    });
    $("#key-clear").addEventListener("click", () => {
      Core.store.remove(K.key);
      $("#api-key").value = "";
      toast("حُذف المفتاح");
      enterInput();
      refreshTabs();
    });

    $("#copy-prompt").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(Core.CONVERT_PROMPT);
        toast("نُسخ الطلب. الصقه في المساعد مع صورة الورقة");
      } catch (_) {
        const box = $("#prompt-text");
        box.value = Core.CONVERT_PROMPT;
        box.hidden = false;
        box.focus();
        box.select();
        toast("انسخ الطلب من المربع");
      }
    });
    $("#to-paste").addEventListener("click", () => selectTab("text"));

    $("#share").addEventListener("click", async () => {
      const url = location.href.split("#")[0] + (await Core.encodeShare(state.text));
      const title = state.parsed && state.parsed.model.title;
      if (navigator.share) {
        try {
          await navigator.share({ title: "ورقة ولعبة", text: title ? `ألعاب «${title}» من ورقة ولعبة` : "ألعاب من ورقة ولعبة", url });
          return;
        } catch (e) {
          if (e && e.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        toast("نُسخ الرابط. الصقه في قروب المعلمين");
      } catch (_) {
        const box = $("#share-link");
        box.value = url;
        box.hidden = false;
        box.focus();
        box.select();
        toast("انسخ الرابط من المربع");
      }
    });
  }

  async function start() {
    bind();
    selectTab("file");
    // رابط مشاركة: الأسئلة داخل العنوان، فتُفتح الألعاب مباشرة
    const shared = await Core.decodeShare(location.hash);
    if (shared && shared.trim()) {
      setLastCost(null);
      setText(shared);
      go("pick", false);
      const t = state.parsed.model.title;
      toast(t ? `وصلتك أسئلة: ${t}` : "وصلتك أسئلة جاهزة للعب");
    } else {
      if (/^#[qz]=/.test(location.hash)) toast("رابط المشاركة غير صالح");
      go((location.hash || "#input").slice(1), false);
    }
    // يعمل التطبيق بلا إنترنت بعد أول فتح (على الموقع المنشور فقط، لا داخل Claude)
    if ("serviceWorker" in navigator && location.protocol === "https:" && !CLAUDE_MODE) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  start();
})();
