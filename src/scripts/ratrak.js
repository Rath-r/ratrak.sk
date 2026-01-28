// src/scripts/ratrak.js

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Init ratrak UI (drawer + bubble + sprite states).
 * Expects these IDs in DOM:
 * - ratrakBtn, ratrakDrawer, ratrakBackdrop
 * - ratrakBubble, ratrakBubbleText
 * - ratrakSprite (img)
 */
export function initRatrak() {
  // --- DOM ---
  const btn = document.getElementById("ratrakBtn");
  const drawer = document.getElementById("ratrakDrawer");
  const backdrop = document.getElementById("ratrakBackdrop");

  const bubble = document.getElementById("ratrakBubble");
  const bubbleText = document.getElementById("ratrakBubbleText");

  const spriteEl = document.getElementById("ratrakSprite");

  if (!btn || !drawer || !backdrop || !bubble || !bubbleText || !spriteEl) {
    console.warn("[ratrak] missing DOM nodes, not initializing");
    return;
  }

  // --- Content ---
  const QUOTES = [
    "> terrain stable",
    "> grooming…",
    "> compiling snow",
    "> backend ready",
    "> tests passing",
    "> shipping…",
    "> still running",
    "> no bugs. just features.",
    "> warming up…",
    "> cache is warm",
    "> edge case detected",
    "> refactoring tracks",
    "> logging…",
    "> kids ask the best questions",
    "> beep boop",
  ];

  // --- UI: Drawer ---
  function setDrawerOpen(open) {
    drawer.dataset.open = String(open);
    backdrop.dataset.open = String(open);
    drawer.setAttribute("aria-hidden", String(!open));
    backdrop.setAttribute("aria-hidden", String(!open));
    btn.setAttribute("aria-label", open ? "Close Ratrak menu" : "Open Ratrak menu");
  }

  // --- Controller: Sprite states ---
  const Ratrak = (() => {
    const SPRITES = {
      idle: "/ratrak/idle.png",
      blink: "/ratrak/blink.png",
      move: "/ratrak/move.png",
      work: "/ratrak/work.png",
    };

    let state = "idle";
    let holdTimer = null;

    // anti-spam for idle blinks
    let lastIdleBlinkAt = 0;
    let idleLoopTimer = null;

    function apply(stateName) {
      const src = SPRITES[stateName];
      if (!src) return;
      state = stateName;
      spriteEl.src = src;
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
      if (idleLoopTimer) return;

      idleLoopTimer = window.setInterval(() => {
        const drawerOpen = drawer.dataset.open === "true";
        if (drawerOpen) return;
        if (state !== "idle") return;

        const now = Date.now();
        const cooldown = randInt(20_000, 60_000); // 20–60s
        if (now - lastIdleBlinkAt < cooldown) return;

        if (!chance(0.45)) return;

        lastIdleBlinkAt = now;
        pulse("blink", randInt(300, 600));
      }, 3500);
    }

    function stopIdleBlinkLoop() {
      window.clearInterval(idleLoopTimer);
      idleLoopTimer = null;
    }

    return { setState, pulse, startIdleBlinkLoop, stopIdleBlinkLoop, getState: () => state };
  })();

  // --- UI: Bubble ---
  let bubbleTimer = null;
  let lastShownAt = 0;

  function canShowBubble() {
    const now = Date.now();
    const cooldown = randInt(30_000, 90_000);
    return now - lastShownAt > cooldown;
  }

  function showBubble(text, ms = 2400) {
    lastShownAt = Date.now();
    bubbleText.textContent = text;

    // Visual feedback
    if (drawer.dataset.open === "true") {
      Ratrak.pulse("blink", 300);
    } else {
      Ratrak.pulse("blink", 450);
    }

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
    if (!canShowBubble()) return;

    const roll = Math.random();
    if (reason === "idle" && roll > 0.22) return;
    if (reason === "scroll" && roll > 0.10) return;
    if (reason === "click" && roll > 0.70) return;
    if (reason === "open" && roll > 0.75) return;

    showBubble(pick(QUOTES));
  }

  function toggleDrawer() {
    const open = drawer.dataset.open === "true";
    setDrawerOpen(!open);

    Ratrak.setState(!open ? "work" : "idle", { holdMs: 700 });

    if (!open) maybeSay("open");
  }

  // --- Events ---
  btn.addEventListener("click", () => {
    Ratrak.pulse("work", 550);
    maybeSay("click");
    toggleDrawer();
  });

  backdrop.addEventListener("click", () => {
    setDrawerOpen(false);
    Ratrak.setState("idle");
  });

  window.addEventListener("keydown", (e) => {
    const open = drawer.dataset.open === "true";
    if (e.key === "Escape") {
      setDrawerOpen(false);
      Ratrak.setState("idle");
    }

    if (!open) return;
    if (e.key.toLowerCase() === "a") location.hash = "#about";
    if (e.key.toLowerCase() === "p") location.hash = "#projects";
    if (e.key.toLowerCase() === "t") location.hash = "#teaching";
    if (e.key.toLowerCase() === "l") location.hash = "#logbook";
  });

  // Scroll: brief move + rare chatter
  let scrollLock = null;
  window.addEventListener("scroll", () => {
    if (scrollLock) return;
    scrollLock = window.setTimeout(() => (scrollLock = null), 650);

    if (drawer.dataset.open !== "true") {
      Ratrak.pulse("move", 350);
    }
    maybeSay("scroll");
  });

  // Idle chatter loop (separate from blink loop)
  setInterval(() => maybeSay("idle"), 12_000);

  // --- Init ---
  setDrawerOpen(false);
  Ratrak.setState("idle");
  Ratrak.startIdleBlinkLoop();

  window.addEventListener("load", () => {
    if (chance(0.5)) showBubble("> terrain stable", 1800);
  });
}
