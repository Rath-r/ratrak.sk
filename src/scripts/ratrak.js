// src/scripts/ratrak.js

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const defaultConfig = {
  ids: {
    btn: "ratrakBtn",
    drawer: "ratrakDrawer",
    backdrop: "ratrakBackdrop",
    bubble: "ratrakBubble",
    bubbleText: "ratrakBubbleText",
    sprite: "ratrakSprite",
  },

  // provide via initRatrak({ sprites })
  sprites: {},

  // provide via initRatrak({ quotes })
  quotes: [],

  bubble: {
    durationMs: 2400,
    cooldownMs: [30_000, 90_000],
    greetChance: 0.5,
    greetText: "> terrain stable",
    greetDurationMs: 1800,
  },

  talk: {
    idleEveryMs: 12_000,
    prob: { idle: 0.22, scroll: 0.1, click: 0.7, open: 0.75 },
  },

  spritePulse: {
    moveMs: 650, // ✅ more readable
    workMs: 550,
    blinkMs: [300, 600],
    afterToggleHoldMs: 700,
  },

  idleBlink: {
    checkEveryMs: 3500,
    cooldownMs: [20_000, 60_000],
    chance: 0.45,
  },

  // ✅ NEW: super subtle idle glow (uses blink state visuals)
  idleGlow: {
    checkEveryMs: 10_000,
    cooldownMs: [120_000, 240_000], // 2–4 min
    chance: 0.35,
    pulseMs: 900,
  },

  shortcuts: {
    enabled: true,
    map: { a: "#about", p: "#projects", t: "#teaching", l: "#logbook" },
  },

  drawerWidthPx: 360,
};

function mergeDeep(base, override) {
  const out = { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = mergeDeep(base[k] || {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function initRatrak(userConfig = {}) {
  const cfg = mergeDeep(defaultConfig, userConfig);

  // --- DOM ---
  const btn = document.getElementById(cfg.ids.btn);
  const drawer = document.getElementById(cfg.ids.drawer);
  const backdrop = document.getElementById(cfg.ids.backdrop);
  const bubble = document.getElementById(cfg.ids.bubble);
  const bubbleText = document.getElementById(cfg.ids.bubbleText);
  const spriteEl = document.getElementById(cfg.ids.sprite);

  if (!btn || !drawer || !backdrop || !bubble || !bubbleText || !spriteEl) {
    console.warn("[ratrak] missing DOM nodes, not initializing");
    return { destroy() {} };
  }

  const isMobile = () => window.matchMedia("(max-width: 640px)").matches;

  // --- Drawer ---
  function setDrawerOpen(open) {
    drawer.dataset.open = String(open);
    backdrop.dataset.open = String(open);
    drawer.setAttribute("aria-hidden", String(!open));
    backdrop.setAttribute("aria-hidden", String(!open));
    btn.setAttribute(
      "aria-label",
      open ? "Close Ratrak menu" : "Open Ratrak menu",
    );

    // Shift ratrak left on desktop so it stays visible next to drawer
    const shift = open && !isMobile();
    btn.dataset.shift = String(shift);

    // Optional: if you use it in CSS somewhere
    // btn.dataset.active = String(open);
    btn.dataset.active = String(open && !isMobile());
  }

  // --- Sprite controller ---
  const Ratrak = (() => {
    let state = "idle";
    let holdTimer = null;

    let lastIdleBlinkAt = 0;
    let idleBlinkTimer = null;

    function apply(stateName) {
      const src = cfg.sprites?.[stateName];
      if (!src) return;

      state = stateName;
      spriteEl.src = src;

      // ✅ expose state to CSS
      btn.dataset.state = stateName;
    }

    function setState(stateName, opts = {}) {
      const { holdMs = 0, revertTo = "idle" } = opts;
      apply(stateName);

      window.clearTimeout(holdTimer);
      if (holdMs > 0 && stateName !== revertTo) {
        holdTimer = window.setTimeout(() => apply(revertTo), holdMs);
      }
    }

    function pulse(stateName, ms = 450) {
      setState(stateName, { holdMs: ms, revertTo: "idle" });
    }

    function startIdleBlinkLoop() {
      if (idleBlinkTimer) return;

      idleBlinkTimer = window.setInterval(() => {
        const drawerOpen = drawer.dataset.open === "true";
        if (drawerOpen) return;
        if (state !== "idle") return;

        const now = Date.now();
        const [cMin, cMax] = cfg.idleBlink.cooldownMs;
        const cooldown = randInt(cMin, cMax);
        if (now - lastIdleBlinkAt < cooldown) return;

        if (!chance(cfg.idleBlink.chance)) return;

        lastIdleBlinkAt = now;
        const [bMin, bMax] = cfg.spritePulse.blinkMs;
        pulse("blink", randInt(bMin, bMax));
      }, cfg.idleBlink.checkEveryMs);
    }

    function stopIdleBlinkLoop() {
      window.clearInterval(idleBlinkTimer);
      idleBlinkTimer = null;
    }

    return {
      setState,
      pulse,
      startIdleBlinkLoop,
      stopIdleBlinkLoop,
      getState: () => state,
    };
  })();

  // --- Bubble ---
  let bubbleTimer = null;
  let lastShownAt = 0;

  function canShowBubble() {
    const now = Date.now();
    const [minMs, maxMs] = cfg.bubble.cooldownMs;
    const cooldown = randInt(minMs, maxMs);
    return now - lastShownAt > cooldown;
  }

  function showBubble(text, ms = cfg.bubble.durationMs) {
    lastShownAt = Date.now();
    bubbleText.textContent = text;

    const [bMin, bMax] = cfg.spritePulse.blinkMs;
    Ratrak.pulse(
      "blink",
      drawer.dataset.open === "true" ? 300 : randInt(bMin, bMax),
    );

    bubble.dataset.show = "true";
    bubble.setAttribute("aria-hidden", "false");

    window.clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => {
      bubble.dataset.show = "false";
      bubble.setAttribute("aria-hidden", "true");
      bubbleTimer = null;
    }, ms);
  }

  function maybeSay(reason = "idle") {
    // On mobile, keep it quiet while drawer is open
    if (isMobile() && drawer.dataset.open === "true") return;

    if (!canShowBubble()) return;

    const p = cfg.talk.prob[reason] ?? 0;
    if (!chance(p)) return;

    if (!cfg.quotes || cfg.quotes.length === 0) return;
    showBubble(pick(cfg.quotes));
  }

  function toggleDrawer() {
    const open = drawer.dataset.open === "true";
    setDrawerOpen(!open);

    Ratrak.setState(!open ? "work" : "idle", {
      holdMs: cfg.spritePulse.afterToggleHoldMs,
    });

    if (!open) maybeSay("open");
  }

  // --- Handlers (for cleanup) ---
  const onBtnClick = () => {
    Ratrak.pulse("work", cfg.spritePulse.workMs);
    maybeSay("click");
    toggleDrawer();
  };

  const onBackdropClick = () => {
    setDrawerOpen(false);
    Ratrak.setState("idle");
  };

  const onKeyDown = (e) => {
    const open = drawer.dataset.open === "true";

    if (e.key === "Escape") {
      setDrawerOpen(false);
      Ratrak.setState("idle");
      return;
    }

    if (!open || !cfg.shortcuts.enabled) return;

    const key = e.key.toLowerCase();
    const hash = cfg.shortcuts.map[key];
    if (hash) location.hash = hash;
  };

  let scrollLock = null;
  const onScroll = () => {
    if (scrollLock) return;
    scrollLock = window.setTimeout(() => (scrollLock = null), 650);

    if (drawer.dataset.open !== "true") {
      Ratrak.pulse("move", cfg.spritePulse.moveMs);
    }
    maybeSay("scroll");
  };

  // --- Start: listeners ---
  btn.addEventListener("click", onBtnClick);
  backdrop.addEventListener("click", onBackdropClick);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("scroll", onScroll);

  const talkTimer = window.setInterval(
    () => maybeSay("idle"),
    cfg.talk.idleEveryMs,
  );

  // --- Init state ---
  setDrawerOpen(false);
  Ratrak.setState("idle");
  btn.dataset.state = "idle"; // explicit default
  Ratrak.startIdleBlinkLoop();

  // --- NEW: idle micro-glow loop (uses blink state visuals) ---
  let lastIdleGlowAt = 0;
  const idleGlowTimer = window.setInterval(() => {
    const drawerOpen = drawer.dataset.open === "true";
    if (drawerOpen) return;
    if (Ratrak.getState() !== "idle") return;

    const now = Date.now();
    const [cMin, cMax] = cfg.idleGlow.cooldownMs;
    const cooldown = randInt(cMin, cMax);
    if (now - lastIdleGlowAt < cooldown) return;

    if (!chance(cfg.idleGlow.chance)) return;

    lastIdleGlowAt = now;
    Ratrak.pulse("blink", cfg.idleGlow.pulseMs);
  }, cfg.idleGlow.checkEveryMs);

  const onLoad = () => {
    if (chance(cfg.bubble.greetChance))
      showBubble(cfg.bubble.greetText, cfg.bubble.greetDurationMs);
  };
  window.addEventListener("load", onLoad, { once: true });

  return {
    destroy() {
      btn.removeEventListener("click", onBtnClick);
      backdrop.removeEventListener("click", onBackdropClick);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("load", onLoad);

      window.clearInterval(talkTimer);
      window.clearInterval(idleGlowTimer);
      Ratrak.stopIdleBlinkLoop();
    },
  };
}
