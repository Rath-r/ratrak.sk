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

  // --- gamemode ---
  let gameMode = false;

  let savedInlinePos = null;
  let gamePos = { x: 0, y: 0 };
  let heldKeys = new Set();
  let moveRaf = null;

  const SPEED = 3.2; // px per frame-ish (tuned)
  let lastBumpAt = 0;
  const BUMP_COOLDOWN_MS = 700;

  // --- Attention bob (subtle, rare) ---
  let lastBobAt = 0;
  const bobTimer = window.setInterval(() => {
    const drawerOpen = drawer.dataset.open === "true";
    if (drawerOpen) return;
    if (Ratrak.getState() !== "idle") return;

    const now = Date.now();
    const cooldown = randInt(90_000, 180_000); // 1.5–3 min
    if (now - lastBobAt < cooldown) return;

    if (!chance(0.35)) return;

    lastBobAt = now;

    btn.dataset.bob = "true";
    window.setTimeout(
      () => {
        btn.dataset.bob = "false";
      },
      randInt(2200, 4200),
    );
  }, 12_000);

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

    btn.dataset.active = String(open && !isMobile());
  }

  // --- helpers for movement ---
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function getSpriteSize() {
    const rect = btn.getBoundingClientRect();
    return { w: rect.width || 48, h: rect.height || 48 };
  }

  function applyGamePosition() {
    const { w, h } = getSpriteSize();
    const minX = 8;
    const minY = 8;
    const maxX = window.innerWidth - w - 8;
    const maxY = window.innerHeight - h - 8;

    const beforeX = gamePos.x;
    const beforeY = gamePos.y;

    gamePos.x = clamp(gamePos.x, minX, maxX);
    gamePos.y = clamp(gamePos.y, minY, maxY);

    btn.style.left = `${gamePos.x}px`;
    btn.style.top = `${gamePos.y}px`;

    // bump detection only in game mode (avoid surprises)
    if (!gameMode) return;

    // Ak sme sa pokúsili ísť mimo a clamp to zastavil → bump
    if (beforeX < minX) bump("left");
    else if (beforeX > maxX) bump("right");

    if (beforeY < minY) bump("top");
    else if (beforeY > maxY) bump("bottom");
  }

  function bump(dir) {
    const now = Date.now();
    if (now - lastBumpAt < BUMP_COOLDOWN_MS) return;
    lastBumpAt = now;

    // vizuálny feedback
    Ratrak.pulse("blink", 220);

    // mikro “odraz” (posun o pár px)
    const nudge = 10;
    if (dir === "left") gamePos.x += nudge;
    if (dir === "right") gamePos.x -= nudge;
    if (dir === "top") gamePos.y += nudge;
    if (dir === "bottom") gamePos.y -= nudge;

    applyGamePosition();

    // občasná hláška (nie vždy)
    if (chance(0.28)) {
      const lines = [
        "> bonk",
        "> edge detected",
        "> no exit this way",
        "> terrain boundary",
      ];
      showBubble(pick(lines), 1100);
    }
  }

  function enableGameMovement() {
    savedInlinePos = {
      left: btn.style.left,
      top: btn.style.top,
      right: btn.style.right,
      bottom: btn.style.bottom,
      transform: btn.style.transform,
    };

    const rect = btn.getBoundingClientRect();
    gamePos = { x: rect.left, y: rect.top };

    btn.style.right = "auto";
    btn.style.bottom = "auto";
    btn.style.transform = "none";
    btn.style.position = "fixed";

    applyGamePosition();
  }

  function disableGameMovement() {
    heldKeys.clear();

    if (moveRaf) {
      cancelAnimationFrame(moveRaf);
      moveRaf = null;
    }

    if (savedInlinePos) {
      btn.style.left = savedInlinePos.left;
      btn.style.top = savedInlinePos.top;
      btn.style.right = savedInlinePos.right;
      btn.style.bottom = savedInlinePos.bottom;
      btn.style.transform = savedInlinePos.transform;
      savedInlinePos = null;
    } else {
      btn.style.left = "";
      btn.style.top = "";
      btn.style.right = "";
      btn.style.bottom = "";
      btn.style.transform = "";
    }

    btn.dataset.dir = "left";
  }

  function startMoveLoop() {
    if (moveRaf) return;

    const step = () => {
      let dx = 0;
      let dy = 0;

      if (heldKeys.has("w") || heldKeys.has("arrowup")) dy -= SPEED;
      if (heldKeys.has("s") || heldKeys.has("arrowdown")) dy += SPEED;
      if (heldKeys.has("a") || heldKeys.has("arrowleft")) dx -= SPEED;
      if (heldKeys.has("d") || heldKeys.has("arrowright")) dx += SPEED;

      // update facing direction
      if (dx > 0) btn.dataset.dir = "right";
      else if (dx < 0) btn.dataset.dir = "left";

      if (dx !== 0 || dy !== 0) {
        gamePos.x += dx;
        gamePos.y += dy;
        applyGamePosition();
        Ratrak.pulse("move", 350);
      }

      moveRaf = requestAnimationFrame(step);
    };

    moveRaf = requestAnimationFrame(step);
  }

  // --- gamification ---
  function toggleGameMode() {
    gameMode = !gameMode;

    setDrawerOpen(false);
    Ratrak.pulse("work", 500);

    btn.dataset.mode = gameMode ? "game" : "ambient";

    if (gameMode) {
      enableGameMovement();
      showBubble("> GAME MODE enabled\n> use WASD", 2200);
      startMoveLoop();
    } else {
      disableGameMovement();
      showBubble("> GAME MODE disabled", 1600);
    }
  }

  function disableGameMode() {
    if (!gameMode) return;
    gameMode = false;
    btn.dataset.mode = "ambient";
    disableGameMovement();
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
    // If in game mode, clicking can exit game mode (nice UX)
    if (gameMode) {
      disableGameMode();
      showBubble("> GAME MODE disabled", 1400);
      return;
    }

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
      disableGameMode();
      return;
    }

    // Toggle game mode with G (works anywhere)
    if (e.key.toLowerCase() === "g") {
      toggleGameMode();
      return;
    }

    // Game mode: capture movement keys
    if (gameMode) {
      const k = e.key.toLowerCase();
      const allowed = [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ];
      if (allowed.includes(k)) {
        e.preventDefault();
        heldKeys.add(k);
      }
      return;
    }

    if (!open || !cfg.shortcuts.enabled) return;

    const key = e.key.toLowerCase();
    const hash = cfg.shortcuts.map[key];
    if (hash) location.hash = hash;
  };

  const onKeyUp = (e) => {
    if (!gameMode) return;
    const k = e.key.toLowerCase();
    heldKeys.delete(k);
  };

  const onResize = () => {
    if (!gameMode) return;
    applyGamePosition();
  };

  let scrollLock = null;
  const onScroll = () => {
    if (gameMode) return; // game mode = no ambient scroll reactions

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
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll);

  const talkTimer = window.setInterval(
    () => maybeSay("idle"),
    cfg.talk.idleEveryMs,
  );

  // --- Section awareness ---
  let currentSection = null;
  const sections = Array.from(document.querySelectorAll("[data-ratrak]"));

  function getActiveSection() {
    const mid = window.innerHeight * 0.4;

    for (const s of sections) {
      const rect = s.getBoundingClientRect();
      if (rect.top <= mid && rect.bottom >= mid) {
        return s.dataset.ratrak;
      }
    }
    return null;
  }

  const onSectionScroll = () => {
    if (gameMode) return;

    const next = getActiveSection();
    if (!next || next === currentSection) return;

    currentSection = next;

    if (drawer.dataset.open === "true") return;

    switch (next) {
      case "projects":
        Ratrak.pulse("move", 500);
        break;
      case "teaching":
        Ratrak.pulse("blink", 600);
        maybeSay("idle");
        break;
      case "logbook":
        break;
    }
  };

  window.addEventListener("scroll", onSectionScroll);

  // --- Init state ---
  setDrawerOpen(false);
  Ratrak.setState("idle");
  btn.dataset.mode = "ambient";
  btn.dataset.state = "idle";
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
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onSectionScroll);
      window.removeEventListener("load", onLoad);

      window.clearInterval(bobTimer);
      window.clearInterval(talkTimer);
      window.clearInterval(idleGlowTimer);

      disableGameMovement();
      Ratrak.stopIdleBlinkLoop();
    },
  };
}
