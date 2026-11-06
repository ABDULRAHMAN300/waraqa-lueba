/* ورقة ولعبة — الألعاب الخمس */
(function () {
  "use strict";
  const { fmt, esc, shuffle, chunk, icon, normDigits } = Core;

  /* ---------- الصوت ---------- */
  const Sound = {
    on: Core.store.get("la3ebha.sound") !== "off",
    ctx: null,
    tone(freq, dur, at = 0, type = "sine", vol = 0.12) {
      if (!this.on) return;
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === "suspended") this.ctx.resume();
        const t = this.ctx.currentTime + at;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.ctx.destination);
        o.start(t);
        o.stop(t + dur + 0.05);
      } catch (_) {}
    },
    ok() {
      this.tone(660, 0.14);
      this.tone(990, 0.2, 0.1);
    },
    bad() {
      this.tone(200, 0.28, 0, "triangle", 0.14);
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, i * 0.12));
    },
    toggle() {
      this.on = !this.on;
      Core.store.set("la3ebha.sound", this.on ? "on" : "off");
    },
  };

  const TEAM = [
    { name: "الأزرق", cls: "blue" },
    { name: "الأحمر", cls: "red" },
  ];

  const optButtons = (opts) => opts.map((o, k) => `<button class="opt" data-k="${k}"><span class="key">${k + 1}</span><span>${fmt(o.t)}</span></button>`).join("");

  const mcqItems = (model) => [
    ...model.mcq.map((q) => ({ kind: "mcq", q: q.q, opts: shuffle(q.options.map((t, k) => ({ t, ok: k === q.answer }))) })),
    ...model.tf.map((q) => ({ kind: "mcq", tf: true, q: q.q, opts: [{ t: "صح", ok: q.answer }, { t: "خطأ", ok: !q.answer }] })),
  ];

  /* ---------- 1) سباق الفريقين ---------- */
  function race(ctx) {
    const { st, body } = ctx;
    const qs = shuffle(mcqItems(ctx.model)).slice(0, 12);
    let i = 0;
    let locked = false;

    function show() {
      if (i >= qs.length) return ctx.finish();
      const q = qs[i];
      locked = false;
      ctx.setTurn(i % 2);
      body.innerHTML = `
        <div class="stage">
          <div class="meta"><span>السؤال ${i + 1} من ${qs.length}</span>${ctx.banner()}</div>
          ${st.timer ? ctx.timerHTML() : ""}
          <div class="q-text">${fmt(q.q)}</div>
          <div class="opts ${q.tf ? "tf" : ""}">${optButtons(q.opts)}</div>
          <p class="note" aria-live="polite"></p>
          <div class="g-actions"><button class="btn primary" data-act="next" hidden>${i + 1 < qs.length ? "السؤال التالي" : "النتيجة"}</button></div>
        </div>`;
      if (st.timer) ctx.startTimer(20, () => answer(-1));
    }

    function answer(k) {
      if (locked) return;
      locked = true;
      ctx.stopTimer();
      const q = qs[i];
      const btns = body.querySelectorAll(".opt");
      btns.forEach((b, j) => {
        b.disabled = true;
        if (q.opts[j].ok) b.classList.add("ok");
      });
      if (k >= 0 && q.opts[k].ok) ctx.hit();
      else {
        if (k >= 0) btns[k].classList.add("bad");
        ctx.miss();
        if (k < 0) ctx.note("انتهى الوقت");
      }
      body.querySelector('[data-act="next"]').hidden = false;
    }

    ctx.onClick = (el) => {
      if (el.matches(".opt")) answer(+el.dataset.k);
      else if (el.dataset.act === "next") {
        i++;
        show();
      }
    };
    ctx.onKey = (key) => {
      const b = body.querySelectorAll(".opt")[+key - 1];
      if (b && !b.disabled) answer(+key - 1);
    };
    show();
  }

  /* ---------- 2) توصيل ---------- */
  function match(ctx) {
    const { st, body } = ctx;
    const rounds = chunk(shuffle(ctx.model.pairs), 5);
    if (rounds.length > 1 && rounds[rounds.length - 1].length < 3) rounds[rounds.length - 2].push(...rounds.pop());
    let r = 0;
    let sel = null;
    let left = 0;

    function show() {
      if (r >= rounds.length) return ctx.finish();
      const set = rounds[r];
      left = set.length;
      sel = null;
      const terms = shuffle(set.map((p, k) => ({ k, t: p.term })));
      const defs = shuffle(set.map((p, k) => ({ k, t: p.definition })));
      body.innerHTML = `
        <div class="stage wide">
          <div class="meta"><span>${rounds.length > 1 ? `الجولة ${r + 1} من ${rounds.length}` : "صِل كل مصطلح بتعريفه"}</span>${ctx.banner()}</div>
          <div class="match">
            <div class="col terms">${terms.map((x) => `<button class="card term" data-side="t" data-k="${x.k}">${fmt(x.t)}</button>`).join("")}</div>
            <div class="col defs">${defs.map((x) => `<button class="card def" data-side="d" data-k="${x.k}">${fmt(x.t)}</button>`).join("")}</div>
          </div>
          <div class="g-actions"><button class="btn primary" data-act="next" hidden>${r + 1 < rounds.length ? "الجولة التالية" : "النتيجة"}</button></div>
        </div>`;
    }

    ctx.onClick = (el) => {
      if (el.dataset.act === "next") {
        r++;
        return show();
      }
      if (!el.matches(".card") || el.disabled) return;
      if (sel === el) {
        el.classList.remove("sel");
        sel = null;
        return;
      }
      if (!sel || sel.dataset.side === el.dataset.side) {
        if (sel) sel.classList.remove("sel");
        sel = el;
        el.classList.add("sel");
        return;
      }
      const a = sel;
      sel = null;
      a.classList.remove("sel");
      if (a.dataset.k === el.dataset.k) {
        const mark = st.teams ? "by-" + TEAM[st.turn].cls : "ok";
        [a, el].forEach((x) => {
          x.classList.add("done", mark);
          x.disabled = true;
        });
        ctx.hit();
        left--;
      } else {
        [a, el].forEach((x) => ctx.shake(x));
        ctx.miss();
      }
      ctx.pass();
      if (left === 0) body.querySelector('[data-act="next"]').hidden = false;
    };
    show();
  }

  /* ---------- 3) تصنيف ---------- */
  function sort(ctx) {
    const { body } = ctx;
    const groups = ctx.model.groups.filter((g) => g.items.length).slice(0, 4);
    const deck = shuffle(groups.flatMap((g, gi) => g.items.map((t) => ({ t, gi })))).slice(0, 18);
    const placed = groups.map(() => []);
    let i = 0;
    let busy = false;

    body.innerHTML = `
      <div class="stage wide">
        <div class="meta"><span class="progress"></span>${ctx.banner()}</div>
        <div class="deck"><div class="big-card" aria-live="polite"></div></div>
        <div class="baskets cols-${groups.length}">
          ${groups.map((g, gi) => `<button class="basket" data-g="${gi}"><span class="b-name">${fmt(g.name)}</span><span class="b-items"></span></button>`).join("")}
        </div>
      </div>`;
    const cardEl = body.querySelector(".big-card");
    const prog = body.querySelector(".progress");

    function paint() {
      if (i >= deck.length) return ctx.finish();
      prog.textContent = `البطاقة ${i + 1} من ${deck.length}`;
      cardEl.innerHTML = fmt(deck[i].t);
      cardEl.classList.remove("enter");
      void cardEl.offsetWidth;
      cardEl.classList.add("enter");
      body.querySelectorAll(".basket").forEach((b, gi) => {
        b.querySelector(".b-items").innerHTML = placed[gi].map((x) => `<span class="chip ${x.cls}">${fmt(x.t)}</span>`).join("");
      });
    }

    ctx.onClick = (el) => {
      const b = el.closest(".basket");
      if (!b || busy || i >= deck.length) return;
      busy = true;
      const gi = +b.dataset.g;
      const item = deck[i];
      if (gi === item.gi) {
        ctx.hit();
        ctx.flash(b, "ok");
        placed[gi].push({ t: item.t, cls: "" });
      } else {
        ctx.miss();
        ctx.flash(b, "bad");
        ctx.flash(body.querySelector(`.basket[data-g="${item.gi}"]`), "ok");
        placed[item.gi].push({ t: item.t, cls: "fixed" });
      }
      ctx.pass();
      ctx.later(() => {
        i++;
        busy = false;
        paint();
      }, 900);
    };
    paint();
  }

  /* ---------- 4) رتّب الخطوات ---------- */
  function order(ctx) {
    const { body } = ctx;
    const seqs = shuffle(ctx.model.sequences.filter((s) => s.steps.length >= 3)).slice(0, 6);
    let s = 0;
    let pool = [];
    let picked = [];
    let marks = null;

    const shuffleOff = (arr) => {
      let out = shuffle(arr);
      for (let n = 0; n < 10 && out.every((x, j) => x.k === j); n++) out = shuffle(arr);
      return out;
    };

    function show() {
      if (s >= seqs.length) return ctx.finish();
      ctx.setTurn(s % 2);
      pool = shuffleOff(seqs[s].steps.map((t, k) => ({ t, k })));
      picked = [];
      marks = null;
      render();
    }

    function render() {
      const seq = seqs[s];
      const n = seq.steps.length;
      const slot = (j) => {
        const x = picked[j];
        if (!x) return `<li><div class="slot empty"><span class="n">${j + 1}</span></div></li>`;
        const cls = marks ? (marks[j] ? "ok" : "bad") : "";
        return `<li><button class="slot filled ${cls}" data-pick="${j}" ${marks ? "disabled" : ""}><span class="n">${j + 1}</span><span>${fmt(x.t)}</span></button></li>`;
      };
      const allRight = marks && marks.every(Boolean);
      body.innerHTML = `
        <div class="stage">
          <div class="meta"><span>${seqs.length > 1 ? `التسلسل ${s + 1} من ${seqs.length}` : "اضغط الخطوات بالترتيب الصحيح"}</span>${ctx.banner()}</div>
          <div class="q-text sm">${fmt(seq.title)}</div>
          <ol class="slots">${Array.from({ length: n }, (_, j) => slot(j)).join("")}</ol>
          ${pool.length ? `<div class="pool">${pool.map((x, j) => `<button class="card step" data-pool="${j}">${fmt(x.t)}</button>`).join("")}</div>` : ""}
          <div class="g-actions">
            ${
              marks
                ? `${allRight ? "" : `<button class="btn" data-act="reveal">أظهر الترتيب الصحيح</button>`}<button class="btn primary" data-act="next">${s + 1 < seqs.length ? "التسلسل التالي" : "النتيجة"}</button>`
                : `<button class="btn" data-act="reset" ${picked.length ? "" : "disabled"}>إعادة</button><button class="btn primary" data-act="check" ${pool.length ? "disabled" : ""}>تحقق</button>`
            }
          </div>
        </div>`;
    }

    ctx.onClick = (el) => {
      const act = el.dataset.act;
      if (el.dataset.pool !== undefined && !marks) {
        picked.push(pool.splice(+el.dataset.pool, 1)[0]);
        return render();
      }
      if (el.dataset.pick !== undefined && !marks) {
        pool.push(picked.splice(+el.dataset.pick, 1)[0]);
        return render();
      }
      if (act === "reset") {
        pool = pool.concat(picked);
        picked = [];
        return render();
      }
      if (act === "check") {
        marks = picked.map((x, j) => x.k === j);
        if (marks.every(Boolean)) ctx.hit();
        else ctx.miss();
        return render();
      }
      if (act === "reveal") {
        picked = seqs[s].steps.map((t, k) => ({ t, k }));
        marks = picked.map(() => true);
        return render();
      }
      if (act === "next") {
        s++;
        show();
      }
    };
    show();
  }

  /* ---------- 5) افتح الخزنة ---------- */
  function safe(ctx) {
    const { st, body } = ctx;
    const num = shuffle(ctx.model.numeric).map((q) => ({ kind: "num", q: q.q, answer: q.answer, unit: q.unit }));
    const mc = shuffle(mcqItems(ctx.model));
    let qs = [...num.slice(0, 2), ...mc].slice(0, 5);
    if (qs.length < 5) qs = qs.concat(num.slice(2, 2 + 5 - qs.length));
    qs = shuffle(qs);
    const digits = qs.map(() => Math.floor(Math.random() * 10));
    const open = qs.map(() => false);
    let i = 0;
    let tries = 0;
    let done = false;

    const locksHTML = () =>
      `<div class="locks">${qs
        .map(
          (_, j) =>
            `<div class="lock ${open[j] ? "open" : ""} ${j === i && !open[j] ? "current" : ""}">${icon(open[j] ? "unlock" : "lock", 26)}<span class="digit">${open[j] ? digits[j] : "?"}</span></div>`
        )
        .join("")}</div>`;

    function show() {
      if (i >= qs.length) return end();
      const q = qs[i];
      tries = 0;
      done = false;
      ctx.setTurn(i % 2);
      body.innerHTML = `
        <div class="stage">
          ${locksHTML()}
          <div class="meta"><span>القفل ${i + 1} من ${qs.length}</span>${ctx.banner()}</div>
          <div class="q-text">${fmt(q.q)}</div>
          ${
            q.kind === "num"
              ? `<form class="num-form" data-form="num" novalidate>
                   <input class="num-in" type="text" inputmode="decimal" dir="ltr" autocomplete="off" aria-label="الإجابة" placeholder="الإجابة…">
                   ${q.unit ? `<span class="unit">${fmt(q.unit)}</span>` : ""}
                   <button class="btn primary" type="submit">تحقق</button>
                 </form>`
              : `<div class="opts ${q.tf ? "tf" : ""}">${optButtons(q.opts)}</div>`
          }
          <p class="note" aria-live="polite"></p>
          <div class="g-actions"><button class="btn primary" data-act="next" hidden>${i + 1 < qs.length ? "القفل التالي" : "افتح الخزنة"}</button></div>
        </div>`;
    }

    function attempt(correct, el) {
      if (done) return;
      if (correct) {
        ctx.hit();
        if (el) el.classList.add("ok");
        return settle(true);
      }
      ctx.miss();
      tries++;
      if (el) {
        el.classList.add("bad");
        if (el.matches(".opt")) el.disabled = true;
        else ctx.shake(el);
      }
      if (tries >= 2) return settle(false);
      if (st.teams) {
        ctx.pass();
        ctx.note(`الدور للفريق ${TEAM[st.turn].name} على السؤال نفسه`);
      } else ctx.note("حاول مرة أخرى");
    }

    function settle(won) {
      done = true;
      open[i] = true;
      const q = qs[i];
      if (q.kind === "num") {
        const inp = body.querySelector(".num-in");
        inp.disabled = true;
        body.querySelector(".num-form .btn").disabled = true;
        ctx.note(won ? "إجابة صحيحة" : `الإجابة الصحيحة: ${q.answer}${q.unit ? " " + q.unit : ""}`);
      } else {
        body.querySelectorAll(".opt").forEach((b, j) => {
          b.disabled = true;
          if (q.opts[j].ok) b.classList.add("ok");
        });
        ctx.note(won ? "" : "لم يُجب أحد إجابة صحيحة، والقفل يُفتح دون نقاط");
      }
      body.querySelector(".locks").outerHTML = locksHTML();
      body.querySelector('[data-act="next"]').hidden = false;
    }

    function end() {
      ctx.finish(`<div class="vault">${icon("unlock", 40)}<p>فُتحت الخزنة. الرمز:</p><div class="code" dir="ltr">${digits.join(" ")}</div></div>`);
    }

    ctx.onClick = (el) => {
      if (el.matches(".opt")) attempt(qs[i].opts[+el.dataset.k].ok, el);
      else if (el.dataset.act === "next") {
        i++;
        show();
      }
    };
    ctx.onSubmit = (form) => {
      if (done) return;
      const inp = form.querySelector(".num-in");
      const v = parseFloat(normDigits(inp.value).replace(",", ".").replace(/[^\d.\-]/g, ""));
      if (!Number.isFinite(v)) return ctx.note("اكتب رقماً");
      const ans = qs[i].answer;
      attempt(Math.abs(v - ans) <= Math.max(0.01, Math.abs(ans) * 0.01), inp);
      if (!done) inp.select();
    };
    ctx.onKey = (key) => {
      const b = body.querySelectorAll(".opt")[+key - 1];
      if (b && !b.disabled) b.click();
    };
    show();
  }

  /* ---------- قائمة الألعاب ---------- */
  const DEFS = [
    { id: "race", name: "سباق الفريقين", icon: "flag", desc: "أسئلة اختيار وصح وخطأ بالتناوب", count: (m) => m.mcq.length + m.tf.length, min: 3, need: "تحتاج 3 أسئلة اختيار أو صح وخطأ", unit: "سؤال", run: race },
    { id: "match", name: "توصيل", icon: "link", desc: "صِل كل مصطلح بتعريفه", count: (m) => m.pairs.length, min: 3, need: "تحتاج 3 مصطلحات", unit: "مصطلح", run: match },
    {
      id: "sort",
      name: "تصنيف",
      icon: "grid",
      desc: "ضع كل بطاقة في مجموعتها",
      count: (m) => {
        const g = m.groups.filter((x) => x.items.length);
        return g.length >= 2 ? g.slice(0, 4).reduce((a, x) => a + x.items.length, 0) : 0;
      },
      min: 4,
      need: "تحتاج مجموعتين و4 بطاقات",
      unit: "بطاقة",
      run: sort,
    },
    { id: "order", name: "رتّب الخطوات", icon: "list", desc: "رتّب الخطوات بالتسلسل الصحيح", count: (m) => m.sequences.filter((s) => s.steps.length >= 3).length, min: 1, need: "تحتاج تسلسلاً من 3 خطوات", unit: "تسلسل", run: order },
    { id: "safe", name: "افتح الخزنة", icon: "lock", desc: "كل إجابة صحيحة تفتح قفلاً، وتشمل المسائل الحسابية", count: (m) => m.mcq.length + m.tf.length + m.numeric.length, min: 3, need: "تحتاج 3 أسئلة", unit: "سؤال", run: safe },
  ];

  /* ---------- إطار اللعبة ---------- */
  let current = null;

  function start(id, model, opts, hooks) {
    const def = DEFS.find((d) => d.id === id);
    const root = document.getElementById("game");
    if (current) current.close(true, true);

    const st = { teams: !!opts.teams, timer: !!opts.timer, scores: [0, 0], turn: 0, correct: 0, tries: 0, timers: new Set(), tick: null, over: false };
    const canFull = !!(document.fullscreenEnabled && root.requestFullscreen);
    root.innerHTML = `
      <div class="g-top">
        <button class="icon-btn" data-act="exit" aria-label="إنهاء اللعبة">${icon("x")}</button>
        <div class="g-name">${esc(def.name)}</div>
        <div class="g-score" aria-live="polite"></div>
        <button class="icon-btn" data-act="sound"></button>
        ${canFull ? `<button class="icon-btn" data-act="full" aria-label="ملء الشاشة">${icon("full")}</button>` : ""}
      </div>
      <div class="g-body"></div>`;
    root.hidden = false;
    document.body.classList.add("playing");
    root.scrollTop = 0;
    const body = root.querySelector(".g-body");
    const scoreEl = root.querySelector(".g-score");
    const soundBtn = root.querySelector('[data-act="sound"]');
    const paintSound = () => {
      soundBtn.innerHTML = icon(Sound.on ? "sound" : "mute");
      soundBtn.setAttribute("aria-label", Sound.on ? "كتم الصوت" : "تشغيل الصوت");
    };
    paintSound();

    const ctx = {
      model,
      st,
      body,
      onClick: null,
      onSubmit: null,
      onKey: null,
      later(fn, ms) {
        const t = setTimeout(() => {
          st.timers.delete(t);
          if (!st.over) fn();
        }, ms);
        st.timers.add(t);
      },
      paintScore() {
        scoreEl.innerHTML = st.teams
          ? TEAM.map((t, k) => `<span class="team ${t.cls} ${k === st.turn ? "active" : ""}"><b>${t.name}</b><span class="num">${st.scores[k]}</span></span>`).join("")
          : `<span class="solo">صحيحة <span class="num">${st.correct}</span> من ${st.tries}</span>`;
      },
      banner() {
        return st.teams ? `<span class="turn ${TEAM[st.turn].cls}">دور الفريق ${TEAM[st.turn].name}</span>` : "";
      },
      updateBanner() {
        const b = body.querySelector(".turn");
        if (b) b.outerHTML = this.banner();
      },
      setTurn(k) {
        st.turn = k;
        this.paintScore();
      },
      pass() {
        if (!st.teams) return;
        st.turn = 1 - st.turn;
        this.paintScore();
        this.updateBanner();
      },
      hit() {
        st.tries++;
        st.correct++;
        if (st.teams) st.scores[st.turn]++;
        Sound.ok();
        this.paintScore();
      },
      miss() {
        st.tries++;
        Sound.bad();
        this.paintScore();
      },
      note(msg) {
        const n = body.querySelector(".note");
        if (n) n.textContent = msg;
      },
      shake(el) {
        el.classList.remove("shake");
        void el.offsetWidth;
        el.classList.add("shake", "bad");
        setTimeout(() => el.classList.remove("shake", "bad"), 650);
      },
      flash(el, kind) {
        if (!el) return;
        el.classList.add("flash-" + kind);
        setTimeout(() => el.classList.remove("flash-" + kind), 850);
      },
      timerHTML() {
        return `<div class="timer" role="timer"><div class="bar"><span></span></div><b class="secs"></b></div>`;
      },
      startTimer(seconds, onEnd) {
        clearInterval(st.tick);
        const box = body.querySelector(".timer");
        const bar = box.querySelector(".bar > span");
        const secs = box.querySelector(".secs");
        const t0 = performance.now();
        const total = seconds * 1000;
        const step = () => {
          const left = Math.max(0, total - (performance.now() - t0));
          bar.style.transform = `scaleX(${left / total})`;
          secs.textContent = Math.ceil(left / 1000);
          box.classList.toggle("low", left <= 5000);
          if (left <= 0) {
            clearInterval(st.tick);
            if (!st.over) onEnd();
          }
        };
        step();
        st.tick = setInterval(step, 100);
      },
      stopTimer() {
        clearInterval(st.tick);
      },
      finish(extra = "") {
        this.stopTimer();
        st.timers.forEach(clearTimeout);
        st.timers.clear();
        st.over = true;
        Sound.win();
        let head;
        let line;
        if (st.teams) {
          const [a, b] = st.scores;
          head = a > b ? "فاز الفريق الأزرق" : b > a ? "فاز الفريق الأحمر" : "تعادل";
          line = `<div class="final">${TEAM.map((t, k) => `<span class="team ${t.cls} active"><b>${t.name}</b><span class="num">${st.scores[k]}</span></span>`).join("")}</div>`;
        } else {
          head = "انتهت اللعبة";
          line = `<p class="final-solo">إجابات صحيحة: <b>${st.correct}</b> من ${st.tries}</p>`;
        }
        body.innerHTML = `
          <div class="stage result">
            ${extra}
            <h2>${head}</h2>
            ${line}
            <div class="g-actions"><button class="btn" data-act="other">لعبة أخرى</button><button class="btn primary" data-act="again">العب مجدداً</button></div>
          </div>`;
      },
    };

    const session = {
      close(silent, keepFull) {
        ctx.stopTimer();
        st.timers.forEach(clearTimeout);
        st.over = true;
        root.onclick = root.onsubmit = null;
        root.hidden = true;
        root.innerHTML = "";
        document.body.classList.remove("playing");
        if (!keepFull && document.fullscreenElement) document.exitFullscreen().catch(() => {});
        current = null;
        if (!silent && hooks && hooks.onExit) hooks.onExit();
      },
      asking: false,
      async exit() {
        if (session.asking) return;
        if (!st.over && st.tries > 0) {
          session.asking = true;
          const ok = await Core.ask("إنهاء اللعبة؟ ستضيع النقاط الحالية.", "إنهاء", "متابعة اللعب");
          session.asking = false;
          if (!ok || current !== session) return;
        }
        session.close(false);
      },
      key(k) {
        if (ctx.onKey && /^[1-4]$/.test(k)) ctx.onKey(k);
      },
    };
    current = session;

    root.onclick = (e) => {
      const el = e.target.closest("button");
      if (!el || !root.contains(el) || el.disabled) return;
      const act = el.dataset.act;
      if (act === "exit") return session.exit();
      if (act === "sound") {
        Sound.toggle();
        return paintSound();
      }
      if (act === "full") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else root.requestFullscreen().catch(() => {});
        return;
      }
      if (act === "again") return start(id, model, opts, hooks);
      if (act === "other") return session.close(false);
      if (ctx.onClick) ctx.onClick(el);
    };
    root.onsubmit = (e) => {
      e.preventDefault();
      if (ctx.onSubmit) ctx.onSubmit(e.target);
    };

    ctx.paintScore();
    def.run(ctx);
  }

  document.addEventListener("keydown", (e) => {
    if (!current) return;
    if (e.key === "Escape" && !document.fullscreenElement) current.exit();
    else if (!(e.target instanceof HTMLInputElement)) current.key(e.key);
  });

  window.Games = {
    DEFS,
    start,
    Sound,
    isOpen: () => !!current,
    close: () => current && current.close(true),
  };
})();
