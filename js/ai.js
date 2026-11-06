/* ورقة ولعبة — استخراج الأسئلة من ملف PDF أو صورة باستخدام Claude
   المفتاح يضعه المعلم في الإعدادات ويبقى في هذا المتصفح فقط.
   الطلب يذهب مباشرة من المتصفح إلى Anthropic. */
(function () {
  "use strict";

  const MODEL = "claude-opus-5-5";
  const SDK_URL = "https://esm.sh/@anthropic-ai/sdk@1.6.0";
  const MAX_PDF_BYTES = 30 * 1024 * 1024;
  const IMAGE_MAX_SIDE = 2000;

  // الأسعار بالدولار لكل مليون توكن: [ما يُرسل، ما يكتبه النموذج]
  const PRICES = {
    "claude-opus-5-5": [4, 20],
    "claude-opus-5": [5, 25],
    "claude-opus-4-8": [5, 25],
    "claude-opus-4-7": [5, 25],
    "claude-opus-4-6": [5, 25],
    "claude-sonnet-5-5": [2, 10],
    "claude-sonnet-5": [2, 10],
    "claude-sonnet-4-6": [3, 15],
    "claude-haiku-5-5": [0.1, 0.5],
    "claude-fable-5-1": [10, 50],
    "claude-fable-5": [10, 50],
  };
  const priceOf = (model) => {
    const id = String(model || "").replace(/^anthropic\./, "");
    const key = Object.keys(PRICES)
      .sort((a, b) => b.length - a.length)
      .find((k) => id === k || id.startsWith(k + "-") || id.startsWith(k + "@"));
    return key ? PRICES[key] : null;
  };

  // التكلفة من بيانات الاستهلاك. عند تشغيل نموذج بديل تأتي كل محاولة في usage.iterations
  function costOf(res) {
    const usage = res.usage || {};
    const parts = Array.isArray(usage.iterations) && usage.iterations.length ? usage.iterations : [usage];
    let usd = 0;
    let known = true;
    let inTok = 0;
    let outTok = 0;
    parts.forEach((u) => {
      const model = u.model || (parts === usage.iterations ? (u.type === "fallback_message" ? res.model : MODEL) : res.model);
      const fresh = u.input_tokens || 0;
      const write = u.cache_creation_input_tokens || 0;
      const read = u.cache_read_input_tokens || 0;
      const out = u.output_tokens || 0;
      inTok += fresh + write + read;
      outTok += out;
      const p = priceOf(model);
      if (!p) known = false;
      else usd += (fresh * p[0] + write * p[0] * 1.25 + read * p[0] * 0.1 + out * p[1]) / 1e6;
    });
    return {
      usd: known ? usd : null,
      inTok,
      outTok,
      model: res.model || MODEL,
      fallback: parts.some((u) => u.type === "fallback_message"),
      at: Date.now(),
    };
  }

  let sdkPromise = null;
  const loadSDK = () =>
    (sdkPromise ||= import(SDK_URL).then((m) => m.default || m.Anthropic).catch((e) => {
      sdkPromise = null;
      throw e;
    }));

  const str = { type: "string" };
  const arr = (items) => ({ type: "array", items });
  const obj = (properties) => ({
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  });

  const SCHEMA = obj({
    title: str,
    mcq: arr(obj({ q: str, options: arr(str), answer: { type: "integer" } })),
    tf: arr(obj({ q: str, answer: { type: "boolean" } })),
    pairs: arr(obj({ term: str, definition: str })),
    groups: arr(obj({ name: str, items: arr(str) })),
    sequences: arr(obj({ title: str, steps: arr(str) })),
    numeric: arr(obj({ q: str, answer: { type: "number" }, unit: str })),
  });

  const SYSTEM = `You turn a teacher's worksheet into question data for classroom games. The worksheet is usually in Arabic and is often a school science sheet (chemistry, physics, biology) from the Kuwaiti or another Arab curriculum.

Use only what is on the sheet. Keep the Arabic wording of the sheet, cleaned of numbering, blanks markers and instructions such as "اختر الإجابة الصحيحة". Use Western digits 0-9 only. Write chemical formulas in Latin letters with plain digits (H2O, CO2, NaCl) and charges with ^ (SO4^2-, Na^+).

Put every item you can into exactly one of these lists:
- mcq: multiple choice. options in the sheet's order, answer = 0-based index of the correct option. Turn fill-in-the-blank items into mcq: the missing word is the correct option, plus 3 plausible wrong options from the same lesson.
- tf: true/false statements, answer = whether the statement is true. If the sheet asks to correct a false statement, keep the statement as written with answer false.
- pairs: a scientific term and its definition ("اكتب المصطلح العلمي", "عرّف", matching columns).
- groups: classification tasks. 2 to 4 groups, each with its items.
- sequences: steps or stages that must be put in order, listed in the correct order.
- numeric: calculations with one numeric answer. answer is the number, unit is the unit as written ("" if none).

When the sheet does not show the correct answer, work it out yourself and be careful: a teacher will review it before class. Skip items that cannot fit any list (essays, drawing, labelling a diagram). title = the lesson title on the sheet, or "" if there is none.`;

  class AIError extends Error {
    constructor(code, detail, cost) {
      super(code);
      this.code = code;
      this.detail = detail;
      this.cost = cost || null; // بعض الأخطاء تأتي بعد ردّ مدفوع
    }
  }

  const MESSAGES = {
    no_key: "أضف مفتاح Claude API من الإعدادات أولاً.",
    bad_key: "المفتاح غير صحيح. راجعه في الإعدادات.",
    no_access: "المفتاح لا يملك صلاحية استخدام هذا النموذج.",
    billing: "الرصيد في حساب Anthropic غير كافٍ.",
    rate: "طلبات كثيرة في وقت قصير. انتظر دقيقة وحاول مرة أخرى.",
    overloaded: "الخدمة مشغولة الآن. حاول بعد قليل.",
    network: "تعذّر الاتصال. تأكد من الإنترنت وحاول مرة أخرى.",
    sdk: "تعذّر تحميل مكتبة Claude. تأكد من الإنترنت.",
    too_big: "الملف أكبر من 30 ميغابايت. قسّمه أو صوّر الصفحات المطلوبة فقط.",
    bad_type: "نوع الملف غير مدعوم. استخدم PDF أو صورة (JPG أو PNG).",
    bad_request: "رُفض الطلب. قد يكون الملف تالفاً أو محمياً بكلمة مرور.",
    refusal: "لم يتمكن Claude من قراءة هذا الملف. جرّب لصق النص بدلاً منه.",
    too_long: "الورقة طويلة جداً. ارفع جزءاً منها في كل مرة.",
    bad_json: "وصلت النتيجة بصيغة غير متوقعة. حاول مرة أخرى.",
    empty: "لم نجد أسئلة يمكن تحويلها إلى ألعاب في هذا الملف.",
    aborted: "أُلغيت القراءة.",
    no_sample: "قراءة الملفات تعمل عند فتح الصفحة داخل Claude. استخدم «لصق نص» هنا.",
    no_images: "هذه النسخة من Claude لا تستقبل صور الأوراق. استخدم «لصق نص».",
    not_granted: "لم يُسمح للصفحة باستخدام Claude. أعد فتحها واختر «سماح» عند السؤال.",
    limit: "وصلت إلى حد الاستخدام في حسابك. حاول بعد تجدد الرصيد، أو استخدم «لصق نص».",
    signed_out: "انتهت جلسة الدخول. سجّل الدخول إلى Claude ثم حاول مرة أخرى.",
    bad_image: "تعذّرت قراءة الصورة. جرّب صورة أوضح بصيغة JPG أو PNG.",
    pdf_failed: "تعذّر فتح ملف PDF. صوّر الصفحات وارفع الصور بدلاً منه.",
    upstream: "انقطع الاتصال بـ Claude. حاول مرة أخرى.",
    unknown: "حدث خطأ غير متوقع. حاول مرة أخرى.",
  };

  const readDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  const b64 = (dataURL) => dataURL.slice(dataURL.indexOf(",") + 1);

  async function imageBlock(file) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close && bmp.close();
      return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64(canvas.toDataURL("image/jpeg", 0.88)) } };
    } catch (_) {
      if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) throw new AIError("bad_type");
      return { type: "image", source: { type: "base64", media_type: file.type, data: b64(await readDataURL(file)) } };
    }
  }

  async function fileBlock(file) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (isPdf) {
      if (file.size > MAX_PDF_BYTES) throw new AIError("too_big");
      return { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(await readDataURL(file)) } };
    }
    if (/^image\//.test(file.type) || /\.(jpe?g|png|gif|webp|heic)$/i.test(file.name)) return imageBlock(file);
    throw new AIError("bad_type");
  }

  // تنظيف ما يعود من النموذج قبل تحويله إلى صيغة الكتابة
  function clean(data) {
    const s = (v) => Core.normDigits(String(v ?? "")).replace(/\s+/g, " ").trim();
    const list = (v) => (Array.isArray(v) ? v : []);
    const m = Core.emptyModel();
    m.title = s(data.title);
    m.mcq = list(data.mcq)
      .map((q) => ({ q: s(q.q), options: list(q.options).map(s).filter(Boolean), answer: Number(q.answer) }))
      .filter((q) => q.q && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
    m.tf = list(data.tf).map((q) => ({ q: s(q.q), answer: !!q.answer })).filter((q) => q.q);
    m.pairs = list(data.pairs).map((p) => ({ term: s(p.term), definition: s(p.definition) })).filter((p) => p.term && p.definition);
    m.groups = list(data.groups)
      .map((g) => ({ name: s(g.name), items: list(g.items).map(s).filter(Boolean) }))
      .filter((g) => g.name && g.items.length);
    m.sequences = list(data.sequences)
      .map((q) => ({ title: s(q.title) || "رتّب الخطوات", steps: list(q.steps).map(s).filter(Boolean) }))
      .filter((q) => q.steps.length >= 2);
    m.numeric = list(data.numeric)
      .map((q) => ({ q: s(q.q), answer: Number(q.answer), unit: s(q.unit) }))
      .filter((q) => q.q && Number.isFinite(q.answer));
    // نصفا الصفحة يتداخلان، فقد يتكرر السؤال نفسه
    const uniq = (arr, key) => {
      const seen = new Set();
      return arr.filter((x) => {
        const k = key(x).replace(/\s+/g, "");
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };
    m.mcq = uniq(m.mcq, (x) => x.q);
    m.tf = uniq(m.tf, (x) => x.q);
    m.pairs = uniq(m.pairs, (x) => x.term);
    m.numeric = uniq(m.numeric, (x) => x.q);
    m.sequences = uniq(m.sequences, (x) => x.steps.join("|"));
    m.groups.forEach((g) => (g.items = [...new Set(g.items)]));
    return m;
  }

  function mapError(err, Anthropic) {
    if (err instanceof AIError) return err;
    if (err && (err.name === "AbortError" || (Anthropic && Anthropic.APIUserAbortError && err instanceof Anthropic.APIUserAbortError)))
      return new AIError("aborted");
    if (Anthropic) {
      if (err instanceof Anthropic.AuthenticationError) return new AIError("bad_key");
      if (err instanceof Anthropic.PermissionDeniedError) return new AIError("no_access");
      if (err instanceof Anthropic.RateLimitError) return new AIError("rate");
      if (err instanceof Anthropic.BadRequestError) return new AIError("bad_request", err.message);
      if (err instanceof Anthropic.APIConnectionError) return new AIError("network");
      if (err instanceof Anthropic.APIError) {
        if (err.status === 402) return new AIError("billing");
        if (err.status === 529 || err.status >= 500) return new AIError("overloaded");
        return new AIError("unknown", err.message);
      }
    }
    return new AIError("unknown", err && err.message);
  }

  /* ---------- القراءة من حساب Claude (داخل صفحة Claude، بلا مفتاح ولا تكلفة API) ---------- */
  const inClaude = () => !!(window.claude && typeof window.claude.use === "function");
  let samplePromise = null;
  const getSample = () => (samplePromise ||= Promise.resolve(window.claude.use("sample")).catch(() => null));

  const SHAPE = `Reply with only one JSON object of exactly this shape (every key present, [] when empty):
{"title": string, "mcq": [{"q": string, "options": [string], "answer": integer}], "tf": [{"q": string, "answer": boolean}], "pairs": [{"term": string, "definition": string}], "groups": [{"name": string, "items": [string]}], "sequences": [{"title": string, "steps": [string]}], "numeric": [{"q": string, "answer": number, "unit": string}]}`;

  // صور الصفحات: الصورة تُصغَّر عند Claude إلى نحو 1.2 ميغابكسل، فنقسم الصفحة نصفين إن سمح العدد ليبقى الخط العربي واضحاً
  const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));

  async function photoCanvas(file) {
    let bmp;
    try {
      bmp = await createImageBitmap(file);
    } catch (_) {
      throw new AIError("bad_type");
    }
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return c;
  }

  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  let pdfjsPromise = null;
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  // نحمّل ملف العامل أيضاً فيعمل pdf.js في الصفحة نفسها، لأن العمّال الخارجيين قد يُحجبون
  const loadPdfjs = () =>
    (pdfjsPromise ||= loadScript(PDFJS + "pdf.min.js")
      .then(() => loadScript(PDFJS + "pdf.worker.min.js"))
      .then(() => {
        if (!window.pdfjsLib) throw new Error("pdfjs");
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
        return window.pdfjsLib;
      })
      .catch((e) => {
        pdfjsPromise = null;
        throw e;
      }));

  async function pdfCanvases(file, max) {
    let lib;
    try {
      lib = await loadPdfjs();
    } catch (_) {
      throw new AIError("pdf_failed");
    }
    let doc;
    try {
      doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true }).promise;
    } catch (e) {
      throw new AIError(e && e.name === "PasswordException" ? "bad_request" : "pdf_failed");
    }
    const total = doc.numPages;
    const n = Math.min(total, max);
    const canvases = [];
    for (let p = 1; p <= n; p++) {
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(3, 2400 / Math.max(base.width, base.height)) });
      const c = document.createElement("canvas");
      c.width = Math.ceil(vp.width);
      c.height = Math.ceil(vp.height);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      // intent "print" يرسم دون انتظار إطارات الشاشة، فلا يتوقف إذا انتقل المستخدم إلى تبويب آخر
      await page.render({ canvasContext: ctx, viewport: vp, intent: "print" }).promise;
      canvases.push(c);
    }
    doc.destroy();
    return { canvases, skipped: total - n };
  }

  function halves(c) {
    const overlap = Math.round(c.height * 0.06);
    const h = Math.ceil(c.height / 2) + overlap;
    return [0, c.height - h].map((y) => {
      const part = document.createElement("canvas");
      part.width = c.width;
      part.height = h;
      part.getContext("2d").drawImage(c, 0, y, c.width, h, 0, 0, c.width, h);
      return part;
    });
  }

  const SAMPLE_ERRORS = {
    cancelled: "aborted",
    not_granted: "not_granted",
    sampling_disabled: "no_sample",
    not_declared: "no_sample",
    capability_disabled: "no_sample",
    capability_removed: "no_sample",
    images_unavailable: "no_images",
    tools_unavailable: "unknown",
    rate_limited: "limit",
    session_expired: "signed_out",
    image_rejected: "bad_image",
    refused: "refusal",
    empty_completion: "bad_json",
    invalid_json: "bad_json",
    prompt_too_large: "too_long",
  };

  async function extractWithClaude(file, { signal } = {}) {
    const sample = await getSample();
    if (!sample) throw new AIError("no_sample");
    const limits = await sample.limits().catch(() => null);
    if (!limits || !limits.images) throw new AIError("no_images");
    const max = Math.max(1, limits.images.maxCount || 1);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

    let canvases;
    let skipped = 0;
    if (isPdf) ({ canvases, skipped } = await pdfCanvases(file, max));
    else if (/^image\//.test(file.type) || /\.(jpe?g|png|gif|webp|heic)$/i.test(file.name)) canvases = [await photoCanvas(file)];
    else throw new AIError("bad_type");

    const split = canvases.length * 2 <= max;
    const parts = split ? canvases.flatMap(halves) : canvases;
    const images = await Promise.all(parts.map(toBlob));
    const note = split
      ? `\n\nThe images are the worksheet's pages in order. Each page is split into a top half and a bottom half that overlap slightly: an item cut by the split appears in both halves, so include it once.`
      : `\n\nThe images are the worksheet's pages in order.`;

    let data;
    try {
      data = await sample.json(SYSTEM + "\n\n" + SHAPE + note, { images, modelTier: "default", signal });
    } catch (e) {
      throw new AIError(SAMPLE_ERRORS[e && e.code] || "upstream", e && e.message);
    }
    const model = clean(data && typeof data === "object" ? data : {});
    const total = model.mcq.length + model.tf.length + model.pairs.length + model.groups.length + model.sequences.length + model.numeric.length;
    if (!total) throw new AIError("empty");
    return { data: model, cost: null, skipped };
  }

  async function extract(file, apiKey, opts = {}) {
    if (inClaude()) return extractWithClaude(file, opts);
    return extractWithKey(file, apiKey, opts);
  }

  async function extractWithKey(file, apiKey, { signal } = {}) {
    if (!apiKey) throw new AIError("no_key");
    let Anthropic = null;
    try {
      Anthropic = await loadSDK();
    } catch (_) {
      throw new AIError("sdk");
    }
    try {
      const block = await fileBlock(file);
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
      const res = await client.beta.messages.create(
        {
          model: MODEL,
          max_tokens: 16000,
          // إذا رفضت مصنفات الأمان الطلب (وارد مع محتوى الكيمياء) يعاد تلقائياً على نموذج بديل
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM,
          output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
          messages: [{ role: "user", content: [block, { type: "text", text: "حوّل ورقة العمل هذه إلى بيانات الألعاب." }] }],
        },
        { signal }
      );
      if (res.stop_reason === "refusal") throw new AIError("refusal");
      if (res.stop_reason === "max_tokens") throw new AIError("too_long");
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        throw new AIError("bad_json");
      }
      const model = clean(data);
      const total = model.mcq.length + model.tf.length + model.pairs.length + model.groups.length + model.sequences.length + model.numeric.length;
      if (!total) throw new AIError("empty", null, costOf(res));
      return { data: model, cost: costOf(res) };
    } catch (err) {
      throw mapError(err, Anthropic);
    }
  }

  window.AI = {
    extract,
    mode: () => (inClaude() ? "claude" : "key"),
    message: (e) => MESSAGES[(e && e.code) || "unknown"] || MESSAGES.unknown,
    MODEL,
  };
})();
