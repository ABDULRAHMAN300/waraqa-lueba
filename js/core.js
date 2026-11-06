/* ورقة ولعبة — أدوات مشتركة: تنسيق الصيغ، الخلط، قراءة صيغة الكتابة وتحويلها */
(function () {
  "use strict";

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // الأرقام الغربية فقط: نحوّل الأرقام العربية الهندية والفارسية إلى 0-9
  const normDigits = (s) =>
    String(s ?? "")
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/٫/g, ".");

  // تنسيق الصيغ الكيميائية داخل النص العربي:
  // كل مقطع لاتيني يُعزل باتجاه LTR، والأرقام بعد الرموز تصبح سفلية، و^ للشحنة العلوية.
  const TOK = "[A-Za-z0-9()\\[\\]^.\\/]*[A-Za-z][A-Za-z0-9()\\[\\]^.\\/+\\-−]*";
  // المقطع يشمل المعادلة كاملة: 2H2 + O2 → 2H2O أو C = 12
  const NUM = "\\d+(?:\\.\\d+)?";
  const RUN = new RegExp(TOK + "(?:\\s*(?:\\+|→|->|⇌|=)\\s*(?:" + TOK + "|" + NUM + "(?![A-Za-z])))*", "g");

  function chem(t) {
    let s = esc(t.replace(/->/g, "→"));
    s = s.replace(/\^(\d*[+\-−]?)/g, (_, c) => "<sup>" + c.replace("-", "−") + "</sup>");
    s = s.replace(/([A-Za-z)\]])(\d+)/g, (_, a, d) => a + "<sub>" + d + "</sub>");
    return s;
  }

  function fmt(text) {
    const str = String(text ?? "");
    let out = "";
    let last = 0;
    for (const m of str.matchAll(RUN)) {
      out += esc(str.slice(last, m.index));
      out += '<bdi dir="ltr">' + chem(m[0]) + "</bdi>";
      last = m.index + m[0].length;
    }
    return out + esc(str.slice(last));
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const chunk = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  const ICONS = {
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
    sound: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
    mute: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
    full: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
    flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 3.6-1.2 1 1 0 0 1 1.4.8V14a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
  };
  const icon = (name, size = 22) =>
    `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

  /* ---------- صيغة الكتابة ----------
     # عنوان الدرس
     س: سؤال اختيار من متعدد   ثم أسطر الخيارات: * للصحيح و - لغيره
     ص: عبارة صحيحة            خ: عبارة خاطئة
     مصطلح: المصطلح = التعريف
     تصنيف: اسم المجموعة = عنصر، عنصر، عنصر
     ترتيب: العنوان            ثم خطوات مرقمة 1. 2. 3.
     حساب: السؤال؟ = 18 g/mol
  */
  const emptyModel = () => ({ title: "", mcq: [], tf: [], pairs: [], groups: [], sequences: [], numeric: [] });

  function parse(text) {
    const model = emptyModel();
    const warnings = [];
    const lines = normDigits(text).replace(/\r/g, "").split("\n");
    let cur = null;

    const close = () => {
      if (!cur) return;
      if (cur.kind === "mcq") {
        const o = cur.obj;
        if (o.options.length < 2) warnings.push({ line: cur.line, msg: "سؤال الاختيار يحتاج خيارين على الأقل" });
        else if (o.answer < 0) warnings.push({ line: cur.line, msg: "ضع علامة * قبل الخيار الصحيح" });
        else model.mcq.push(o);
      } else if (cur.kind === "seq") {
        if (cur.obj.steps.length < 2) warnings.push({ line: cur.line, msg: "الترتيب يحتاج خطوتين على الأقل" });
        else model.sequences.push(cur.obj);
      }
      cur = null;
    };

    lines.forEach((raw, i) => {
      const n = i + 1;
      // ردود المساعدات الذكية قد تضيف مربع كود أو خطاً عريضاً أو ترقيماً قبل السؤال
      if (/^\s*```/.test(raw)) return;
      const line = raw
        .trim()
        .replace(/\*\*/g, "")
        .replace(/^\d+\s*[.)\-–]\s*(?=(?:س|ص|صح|خ|خطأ|مصطلح|تصنيف|ترتيب|حساب)\s*[:：])/, "")
        .trim();
      let m;
      if (!line) return close();
      if (line.startsWith("#")) {
        close();
        model.title = line.replace(/^#+\s*/, "");
        return;
      }
      if ((m = line.match(/^س\s*[:：]\s*(.+)$/))) {
        close();
        cur = { kind: "mcq", line: n, obj: { q: m[1], options: [], answer: -1 } };
        return;
      }
      if (cur && cur.kind === "mcq" && (m = line.match(/^([*\-–•])\s*(.+)$/))) {
        if (m[1] === "*") {
          if (cur.obj.answer >= 0) warnings.push({ line: n, msg: "أكثر من خيار صحيح، اعتمدنا الأول" });
          else cur.obj.answer = cur.obj.options.length;
        }
        cur.obj.options.push(m[2]);
        return;
      }
      if (cur && cur.kind === "seq" && (m = line.match(/^(\d+)\s*[.)\-–:]\s*(.+)$/))) {
        cur.obj.steps.push(m[2]);
        return;
      }
      if ((m = line.match(/^(?:ص|صح)\s*[:：]\s*(.+)$/))) {
        close();
        model.tf.push({ q: m[1], answer: true });
        return;
      }
      if ((m = line.match(/^(?:خ|خطأ)\s*[:：]\s*(.+)$/))) {
        close();
        model.tf.push({ q: m[1], answer: false });
        return;
      }
      if ((m = line.match(/^مصطلح\s*[:：]\s*(.+?)\s*=\s*(.+)$/))) {
        close();
        model.pairs.push({ term: m[1], definition: m[2] });
        return;
      }
      if ((m = line.match(/^تصنيف\s*[:：]\s*(.+?)\s*=\s*(.+)$/))) {
        close();
        const items = m[2].split(/[،,؛;]/).map((s) => s.trim()).filter(Boolean);
        const g = model.groups.find((x) => x.name === m[1]);
        if (g) g.items.push(...items);
        else model.groups.push({ name: m[1], items });
        return;
      }
      if ((m = line.match(/^ترتيب\s*[:：]?\s*(.*)$/)) && /^ترتيب/.test(line)) {
        close();
        cur = { kind: "seq", line: n, obj: { title: m[1] || "رتّب الخطوات", steps: [] } };
        return;
      }
      if ((m = line.match(/^حساب\s*[:：]\s*(.+)=\s*(-?\d+(?:\.\d+)?)\s*([^=]*)$/))) {
        close();
        model.numeric.push({ q: m[1].trim(), answer: parseFloat(m[2]), unit: m[3].trim() });
        return;
      }
      warnings.push({ line: n, msg: "لم نفهم هذا السطر: " + (line.length > 40 ? line.slice(0, 40) + "…" : line) });
    });
    close();
    return { model, warnings };
  }

  const one = (s) => String(s ?? "").replace(/\s*\n\s*/g, " ").trim();

  function serialize(model) {
    const out = [];
    const block = (lines) => {
      if (lines.length) out.push(lines.join("\n"));
    };
    if (model.title) block(["# " + one(model.title)]);
    model.mcq.forEach((q) =>
      block(["س: " + one(q.q), ...q.options.map((o, k) => (k === q.answer ? "* " : "- ") + one(o))])
    );
    block(model.tf.map((q) => (q.answer ? "ص: " : "خ: ") + one(q.q)));
    // علامة = تفصل المصطلح عن تعريفه، فنستبدلها داخل المصطلح بعلامة مشابهة
    block(model.pairs.map((p) => "مصطلح: " + one(p.term).replace(/=/g, "＝") + " = " + one(p.definition)));
    block(model.groups.map((g) => "تصنيف: " + one(g.name).replace(/=/g, "＝") + " = " + g.items.map((t) => one(t).replace(/[،,؛;]/g, " ")).join("، ")));
    model.sequences.forEach((s) => block(["ترتيب: " + one(s.title), ...s.steps.map((t, k) => k + 1 + ". " + one(t))]));
    block(model.numeric.map((q) => "حساب: " + one(q.q) + " = " + q.answer + (q.unit ? " " + one(q.unit) : "")));
    return out.join("\n\n") + "\n";
  }

  const SAMPLE = `# مثال: المادة وتصنيفها

س: ما الصيغة الكيميائية للماء؟
* H2O
- H2O2
- CO2
- O2

س: أي مما يلي يُعد مخلوطاً؟
- الماء المقطر
* الهواء
- الأكسجين
- كلوريد الصوديوم

س: عدد ذرات الهيدروجين في جزيء الميثان CH4 يساوي:
- 1
- 2
* 4
- 6

س: ما وحدة قياس كمية المادة؟
* المول
- الغرام
- اللتر
- الكلفن

ص: يغلي الماء النقي عند 100 درجة سيليزية تحت ضغط جوي واحد
خ: الهواء مادة نقية
ص: الحديد عنصر فلزي
خ: كلوريد الصوديوم NaCl عنصر

مصطلح: العنصر = مادة نقية لا يمكن تحليلها إلى مواد أبسط بالطرق الكيميائية
مصطلح: المركب = مادة نقية تتكون من عنصرين أو أكثر متحدة كيميائياً بنسب ثابتة
مصطلح: المخلوط = مادتان أو أكثر ممتزجتان دون اتحاد كيميائي
مصطلح: الذرة = أصغر جزء من العنصر يحمل خواصه
مصطلح: المول = كمية المادة التي تحتوي على عدد أفوجادرو من الجسيمات

تصنيف: عناصر = الحديد، الأكسجين، النحاس، الكربون
تصنيف: مركبات = الماء، ثاني أكسيد الكربون، كلوريد الصوديوم
تصنيف: مخاليط = الهواء، ماء البحر، الدم

ترتيب: خطوات التقطير البسيط
1. وضع المخلوط في دورق التقطير
2. تسخين المخلوط حتى الغليان
3. تكثف البخار في المكثف
4. جمع السائل المقطر في الدورق المستقبل

حساب: الكتلة المولية للماء H2O علماً بأن H = 1 و O = 16؟ = 18 g/mol
حساب: عدد مولات 36 g من الماء H2O؟ = 2 mol
حساب: الكتلة المولية لثاني أكسيد الكربون CO2 علماً بأن C = 12 و O = 16؟ = 44 g/mol
`;

  const HELP = `
<table class="help">
  <tbody>
    <tr><th>عنوان الدرس</th><td><code># العنوان</code></td></tr>
    <tr><th>اختيار من متعدد</th><td><code>س: السؤال</code> ثم الخيارات في أسطر تبدأ بـ <code>-</code>، وضع <code>*</code> قبل الخيار الصحيح</td></tr>
    <tr><th>صح وخطأ</th><td><code>ص: عبارة صحيحة</code> أو <code>خ: عبارة خاطئة</code></td></tr>
    <tr><th>مصطلح وتعريف</th><td><code>مصطلح: المصطلح = التعريف</code></td></tr>
    <tr><th>تصنيف</th><td><code>تصنيف: اسم المجموعة = عنصر، عنصر، عنصر</code></td></tr>
    <tr><th>ترتيب خطوات</th><td><code>ترتيب: العنوان</code> ثم الخطوات مرقمة <code>1.</code> <code>2.</code> <code>3.</code></td></tr>
    <tr><th>مسألة حسابية</th><td><code>حساب: السؤال؟ = 18 g/mol</code></td></tr>
  </tbody>
</table>
<p class="muted small">اكتب الصيغ بالحروف اللاتينية والأرقام العادية مثل H2O وتظهر في اللعبة H₂O. للشحنة استخدم ^ مثل SO4^2-.</p>`;

  // طلب جاهز يلصقه المعلم في أي مساعد ذكاء اصطناعي مع صورة الورقة، فيرد بصيغة الكتابة نفسها
  const CONVERT_PROMPT = `حوّل ورقة العمل المرفقة إلى أسئلة لتطبيق «ورقة ولعبة».
اكتب الناتج بالصيغة التالية بالضبط، داخل مربع كود واحد، دون أي شرح قبله أو بعده.

الصيغة:
# عنوان الدرس
س: سؤال اختيار من متعدد
* الخيار الصحيح
- خيار خاطئ
- خيار خاطئ
- خيار خاطئ

ص: عبارة صحيحة
خ: عبارة خاطئة

مصطلح: المصطلح = تعريفه

تصنيف: اسم المجموعة الأولى = عنصر، عنصر، عنصر
تصنيف: اسم المجموعة الثانية = عنصر، عنصر، عنصر

ترتيب: عنوان الخطوات
1. الخطوة الأولى
2. الخطوة الثانية
3. الخطوة الثالثة

حساب: نص المسألة؟ = 18 g/mol

القواعد:
- استخدم نص الورقة نفسه، واحذف الترقيم والتعليمات مثل «اختر الإجابة الصحيحة».
- إذا لم تكن الإجابة الصحيحة ظاهرة في الورقة فاستنتجها بدقة، لأن المعلم سيراجعها.
- حوّل «أكمل الفراغ» إلى اختيار من متعدد: الكلمة الناقصة هي الخيار الصحيح، مع 3 خيارات خاطئة معقولة من الدرس نفسه.
- «اكتب المصطلح العلمي» و«عرّف» تصبح «مصطلح».
- الأرقام بالأرقام العادية 0-9، والصيغ الكيميائية بالحروف اللاتينية مثل H2O و CO2، والشحنة بعلامة ^ مثل SO4^2-.
- تجاهل ما لا يناسب أي نوع، مثل الأسئلة المقالية والرسم.`;

  /* ---------- رابط المشاركة: الأسئلة كلها داخل الرابط نفسه، فلا حاجة لخادم ---------- */
  const b64url = (bytes) => {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const unb64url = (s) => {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  };
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

  async function encodeShare(text) {
    const bytes = new TextEncoder().encode(text);
    if (window.CompressionStream) {
      try {
        return "#z=" + b64url(await pipe(bytes, new CompressionStream("deflate-raw")));
      } catch (_) {}
    }
    return "#q=" + b64url(bytes);
  }

  async function decodeShare(hash) {
    const m = /^#([qz])=([A-Za-z0-9_-]+)$/.exec(hash || "");
    if (!m) return null;
    try {
      let bytes = unb64url(m[2]);
      if (m[1] === "z") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
      return new TextDecoder().decode(bytes);
    } catch (_) {
      return null;
    }
  }

  // التخزين المحلي قد يكون محجوباً داخل صفحات Claude، فكل استخدام له محمي
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (_) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (_) {}
    },
    remove(k) {
      try {
        localStorage.removeItem(k);
      } catch (_) {}
    },
  };

  // نافذة تأكيد داخل الصفحة، لأن confirm() محجوب داخل صفحات Claude
  // الأزرار تُنهي النافذة مباشرة، لأن حدث close يتأخر أحياناً
  function ask(message, okLabel = "نعم", cancelLabel = "إلغاء") {
    return new Promise((resolve) => {
      const d = document.createElement("dialog");
      d.className = "ask";
      d.innerHTML = `<p>${esc(message)}</p><div class="actions"><button type="button" class="btn primary" data-v="1">${esc(okLabel)}</button><button type="button" class="btn" data-v="0">${esc(cancelLabel)}</button></div>`;
      let settled = false;
      const finish = (yes) => {
        if (settled) return;
        settled = true;
        if (d.open) d.close();
        d.remove();
        resolve(yes);
      };
      d.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-v]");
        if (b) finish(b.dataset.v === "1");
      });
      d.addEventListener("cancel", (e) => {
        e.preventDefault();
        finish(false);
      });
      d.addEventListener("close", () => finish(false));
      document.body.appendChild(d);
      d.showModal();
      d.querySelector('[data-v="0"]').focus();
    });
  }

  // تغيير العنوان (#) قد يُرفض في بعض الإطارات، فلا نسمح له بإيقاف الصفحة
  const nav = (method, hash) => {
    try {
      history[method](null, "", hash);
    } catch (_) {
      try {
        location.hash = hash;
      } catch (__) {}
    }
  };

  window.Core = { esc, fmt, shuffle, chunk, icon, normDigits, parse, serialize, emptyModel, SAMPLE, HELP, CONVERT_PROMPT, encodeShare, decodeShare, store, ask, nav };
})();
