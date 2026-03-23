import "./csm-runner.css";

const DISPLAY_WIDTH = 1280;
const DISPLAY_HEIGHT = 720;
const LOW_PERF_DEVICE =
  /Raspberry Pi/i.test(navigator.userAgent) ||
  ((navigator.deviceMemory || 8) <= 4 && (navigator.hardwareConcurrency || 8) <= 4);
const INTERNAL_WIDTH = LOW_PERF_DEVICE ? 480 : 640;
const INTERNAL_HEIGHT = Math.round((INTERNAL_WIDTH * 9) / 16);
const DPR = Math.max(1, Math.min(LOW_PERF_DEVICE ? 1 : 2, window.devicePixelRatio || 1));
const STEP_MS = 1000 / 30;
const SLOT_BASE = 14_001_034;
const FORK_INTERVAL = 40;
const GAMEPAD_DEADZONE = 0.45;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

const MODES = {
  vanilla: {
    key: "vanilla",
    label: "Vanilla Staking",
    bond: "32 ETH",
    apr: "2.75%",
    hint: "Space / Up / click / tap flap.",
    highScoreKey: "csm-runner-high-score-vanilla",
    leaderboardKey: "csm-runner-leaderboard-vanilla",
    banner: "BLOCK PROPOSED",
  },
  csm: {
    key: "csm",
    label: "CSM ICS Mode",
    bond: "1.5 ETH",
    apr: "5.87%",
    hint: "Space / Up jump.",
    highScoreKey: "csm-runner-high-score-csm",
    leaderboardKey: "csm-runner-leaderboard-csm",
    banner: "PROPOSAL INCLUDED",
  },
};

const PHASES = [
  { short: "Merge", skyTop: "#112638", skyBottom: "#081018", line: "#476275", floor: "#dfe8ef", proposal: "#f4e5c2" },
  { short: "Pectra", skyTop: "#15342f", skyBottom: "#08110f", line: "#4c7464", floor: "#e5eee7", proposal: "#f4e5c2" },
  { short: "Fusaka", skyTop: "#2b2231", skyBottom: "#0a0d13", line: "#705b70", floor: "#eee7ec", proposal: "#f4e5c2" },
  { short: "Glamsterdam", skyTop: "#352a1d", skyBottom: "#100c09", line: "#896a4e", floor: "#f1e8da", proposal: "#f4e5c2" },
];

const app = document.querySelector("#app");
app.innerHTML = `
  <main class="runner-shell">
    <section class="runner-frame">
      <div class="runner-topbar">
        <div class="runner-brand"><span class="runner-brand-mark"></span><span>Staking Modes</span></div>
      </div>
      <section class="runner-stage">
        <canvas class="runner-canvas" width="${DISPLAY_WIDTH}" height="${DISPLAY_HEIGHT}" aria-label="Staking game"></canvas>
        <div class="hud">
          <div class="hud-row">
            <div class="hud-chip"><span class="hud-label">Mode</span><span class="hud-value" data-hud="mode">Vanilla Staking</span></div>
            <div class="hud-chip"><span class="hud-label">Bond</span><span class="hud-value" data-hud="bond">32 ETH</span></div>
            <div class="hud-chip"><span class="hud-label">APR</span><span class="hud-value" data-hud="apr">2.75%</span></div>
            <div class="hud-chip"><span class="hud-label">Fork</span><span class="hud-value" data-hud="fork">Merge</span></div>
            <div class="hud-chip"><span class="hud-label">Slot</span><span class="hud-value" data-hud="slot">14,001,034</span></div>
            <div class="hud-chip"><span class="hud-label">Best</span><span class="hud-value" data-hud="high-score">14,001,034</span></div>
          </div>
        </div>
        <div class="phase-banner" data-phase-banner>
          <div class="phase-title" data-phase-title>Merge</div>
        </div>
        <div class="event-banner" data-event-banner></div>
        <div class="overlay" data-overlay>
          <div class="overlay-card overlay-card--wide" data-overlay-card></div>
        </div>
      </section>
      <div class="runner-footer">
        <div class="runner-hint" data-hint>Space / Up / click / tap flap.</div>
      </div>
    </section>
  </main>
`;

const canvas = document.querySelector(".runner-canvas");
const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true }) || canvas.getContext("2d");
canvas.width = Math.round(INTERNAL_WIDTH * DPR);
canvas.height = Math.round(INTERNAL_HEIGHT * DPR);
canvas.style.width = `${DISPLAY_WIDTH}px`;
canvas.style.height = `${DISPLAY_HEIGHT}px`;
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

const overlay = document.querySelector("[data-overlay]");
const overlayCard = document.querySelector("[data-overlay-card]");
const phaseBanner = document.querySelector("[data-phase-banner]");
const phaseTitle = document.querySelector("[data-phase-title]");
const eventBanner = document.querySelector("[data-event-banner]");
const hintEl = document.querySelector("[data-hint]");

const hud = {
  mode: document.querySelector('[data-hud="mode"]'),
  bond: document.querySelector('[data-hud="bond"]'),
  apr: document.querySelector('[data-hud="apr"]'),
  fork: document.querySelector('[data-hud="fork"]'),
  slot: document.querySelector('[data-hud="slot"]'),
  highScore: document.querySelector('[data-hud="high-score"]'),
};

const sprite = buildDappnodeSprite();
const storage = createStorage();
const audio = createAudio();

const overlayState = {
  view: "title",
  selectedIndex: 0,
};

const leaderboardState = {
  mode: null,
  score: 0,
  letters: ["A", "A", "A", "A", "A"],
  index: 0,
};

const game = {
  screen: "title",
  activeMode: "vanilla",
  lastFrameAt: 0,
  accumulator: 0,
  gamepadButtons: {},
  gamepadAxis: { horizontal: 0, vertical: 0 },
  hudState: { mode: "", bond: "", apr: "", fork: "", slot: "", highScore: "" },
  phaseIndex: 0,
  slotsCleared: 0,
  nextProposalAt: 12,
  bestBeforeRun: 0,
  pendingLeaderboardEntry: false,
  eventHideTimer: 0,
  backgroundCanvas: buildBackgroundCanvas("vanilla", 0),
  modeInstance: null,
  bannerText: "",
};

showTitle();
updateHud();
requestAnimationFrame(frame);

window.addEventListener("keydown", (event) => {
  if (game.screen === "gameover" && game.pendingLeaderboardEntry) {
    if (event.code === "ArrowLeft") {
      event.preventDefault();
      moveLeaderboardLetterIndex(-1);
    } else if (event.code === "ArrowRight") {
      event.preventDefault();
      moveLeaderboardLetterIndex(1);
    } else if (event.code === "ArrowUp") {
      event.preventDefault();
      cycleLeaderboardLetter(1);
    } else if (event.code === "ArrowDown") {
      event.preventDefault();
      cycleLeaderboardLetter(-1);
    } else if (event.code === "Enter" || event.code === "Space") {
      event.preventDefault();
      saveLeaderboardInitials();
    }
    return;
  }

  if (["Space", "ArrowUp", "Enter"].includes(event.code)) {
    event.preventDefault();
  }

  if (game.screen === "playing") {
    if (event.code === "Space" || event.code === "ArrowUp") {
      game.modeInstance?.primaryAction();
      audio.primary(game.activeMode);
    }
    return;
  }

  if (overlayState.view === "title") {
    if (event.code === "ArrowLeft") {
      overlayState.selectedIndex = 0;
      showTitle();
    } else if (event.code === "ArrowRight") {
      overlayState.selectedIndex = 1;
      showTitle();
    } else if (event.code === "Enter" || event.code === "Space") {
      startSelectedMode(overlayState.selectedIndex === 0 ? "vanilla" : "csm");
    }
    return;
  }

  if (overlayState.view === "gameover") {
    if (event.code === "ArrowLeft") {
      overlayState.selectedIndex = 0;
      showGameOver();
    } else if (event.code === "ArrowRight") {
      overlayState.selectedIndex = 1;
      showGameOver();
    } else if (event.code === "Enter" || event.code === "Space") {
      if (overlayState.selectedIndex === 0) {
        startSelectedMode(game.activeMode);
      } else {
        showTitleScreen();
      }
    }
  }
});

canvas.addEventListener("pointerdown", () => {
  if (game.screen !== "playing") {
    startSelectedMode(overlayState.selectedIndex === 0 ? "vanilla" : "csm");
    return;
  }
  game.modeInstance?.primaryAction();
  audio.primary(game.activeMode);
});

overlay.addEventListener("pointerdown", (event) => {
  const action = event.target instanceof Element ? event.target.closest("[data-overlay-action]") : null;
  if (!action) return;
  const actionName = action.getAttribute("data-overlay-action");
  const mode = action.getAttribute("data-mode");

  if (actionName === "mode-select") {
    showTitleScreen();
    return;
  }
  if (actionName === "skip-score") {
    game.pendingLeaderboardEntry = false;
    showGameOver();
    return;
  }
  if (actionName === "save-score") {
    saveLeaderboardInitials();
    return;
  }
  if (mode && MODES[mode]) {
    startSelectedMode(mode);
    return;
  }
  if (actionName === "restart") {
    startSelectedMode(game.activeMode);
  }
});

async function startSelectedMode(modeKey) {
  game.activeMode = modeKey;
  game.screen = "loading";
  overlay.classList.add("is-hidden");

  const module = modeKey === "vanilla"
    ? await import("./csm-runner/vanilla-mode.js")
    : await import("./csm-runner/csm-mode.js");

  const createMode = modeKey === "vanilla" ? module.createVanillaMode : module.createCsmMode;

  game.modeInstance = createMode({
    width: INTERNAL_WIDTH,
    height: INTERNAL_HEIGHT,
    lowPerf: LOW_PERF_DEVICE,
    sprite,
    getSpawnType: takeSpawnType,
    onCleared: handleCleared,
    onFail: failGame,
  });

  game.screen = "playing";
  game.phaseIndex = 0;
  game.slotsCleared = 0;
  game.nextProposalAt = 10 + ((Math.random() * 6) | 0);
  game.bestBeforeRun = getHighScore(modeKey);
  game.pendingLeaderboardEntry = false;
  leaderboardState.mode = null;
  leaderboardState.score = 0;
  leaderboardState.letters = ["A", "A", "A", "A", "A"];
  leaderboardState.index = 0;
  overlayState.view = "playing";
  game.backgroundCanvas = buildBackgroundCanvas(modeKey, 0);
  game.bannerText = "";
  hideEventBanner();
  game.modeInstance.reset(0);
  showPhase(PHASES[0]);
  audio.start();
  updateHud();
}

function frame(timestamp) {
  const last = game.lastFrameAt || timestamp;
  const delta = Math.min(100, timestamp - last);
  game.lastFrameAt = timestamp;
  game.accumulator += delta;

  pollGamepad();

  while (game.screen === "playing" && game.accumulator >= STEP_MS) {
    update(STEP_MS / 1000);
    game.accumulator -= STEP_MS;
  }

  render();
  requestAnimationFrame(frame);
}

function update(dt) {
  const nextPhase = Math.min(PHASES.length - 1, Math.floor(game.slotsCleared / FORK_INTERVAL));
  if (nextPhase !== game.phaseIndex) {
    game.phaseIndex = nextPhase;
    game.backgroundCanvas = buildBackgroundCanvas(game.activeMode, game.phaseIndex);
    game.modeInstance?.setPhase(nextPhase);
    showPhase(PHASES[nextPhase]);
    showEventBanner(`${PHASES[nextPhase].short.toUpperCase()} HARDFORK!`, 1000);
    updateHud();
  }
  game.modeInstance?.update(dt);
}

function render() {
  ctx.drawImage(game.backgroundCanvas, 0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
  game.modeInstance?.render(ctx, PHASES[game.phaseIndex]);
}

function takeSpawnType(spawnOrdinal) {
  if (spawnOrdinal === game.nextProposalAt) {
    game.nextProposalAt += 10 + ((Math.random() * 6) | 0);
    return "proposal";
  }
  return "standard";
}

function handleCleared(isProposal) {
  game.slotsCleared += 1;
  if (isProposal) {
    showEventBanner(MODES[game.activeMode].banner, 700);
    audio.proposal();
  }
  if (game.slotsCleared > getHighScore(game.activeMode)) {
    setHighScore(game.slotsCleared);
    if (game.slotsCleared > game.bestBeforeRun) {
      game.pendingLeaderboardEntry = true;
      leaderboardState.mode = game.activeMode;
      leaderboardState.score = game.slotsCleared;
    }
  }
  updateHud();
}

function failGame() {
  if (game.screen !== "playing") return;
  game.screen = "gameover";
  audio.fail();
  showGameOver();
}

function showPhase(phase) {
  phaseTitle.textContent = phase.short;
  phaseBanner.classList.add("is-visible");
  window.clearTimeout(showPhase.timer);
  showPhase.timer = window.setTimeout(() => phaseBanner.classList.remove("is-visible"), REDUCED_MOTION ? 0 : 800);
}

function showEventBanner(text, duration) {
  game.bannerText = text;
  eventBanner.textContent = text;
  eventBanner.classList.add("is-visible");
  window.clearTimeout(game.eventHideTimer);
  game.eventHideTimer = window.setTimeout(() => hideEventBanner(), REDUCED_MOTION ? 0 : duration);
}

function hideEventBanner() {
  eventBanner.classList.remove("is-visible");
}

function showTitleScreen() {
  game.screen = "title";
  game.pendingLeaderboardEntry = false;
  showTitle();
  updateHud();
}

function showTitle() {
  overlayState.view = "title";
  overlay.classList.remove("is-hidden");
  overlayCard.innerHTML = `
    <h1 class="overlay-title">Choose Mode</h1>
    <div class="mode-grid">
      <button class="mode-card ${overlayState.selectedIndex === 0 ? "is-selected" : ""}" type="button" data-overlay-action="start" data-mode="vanilla">
        <span class="mode-card-title">Vanilla Staking</span>
        <span class="mode-card-metric">Bond: 32 ETH</span>
        <span class="mode-card-metric">APR: 2.75%</span>
        <span class="mode-card-copy">Stake 32 ETH to become a vanilla ETH staker. Earn an estimated 2.75% APR.</span>
        <span class="mode-card-subtitle">Leaderboard</span>
        ${renderLeaderboard("vanilla")}
      </button>
      <button class="mode-card ${overlayState.selectedIndex === 1 ? "is-selected" : ""}" type="button" data-overlay-action="start" data-mode="csm">
        <span class="mode-card-title">CSM ICS Mode</span>
        <span class="mode-card-metric">Bond: 1.5 ETH</span>
        <span class="mode-card-metric">APR: 5.87%</span>
        <span class="mode-card-copy">Bond 1.5 ETH to become a CSM Identified Community Staker and earn an estimated ~5.87% APR.</span>
        <span class="mode-card-subtitle">Leaderboard</span>
        ${renderLeaderboard("csm")}
      </button>
    </div>
    <div class="overlay-menu-hint">Stick or D-pad chooses. L selects Vanilla. R selects CSM. A or Start confirms.</div>
  `;
}

function showGameOver() {
  overlay.classList.remove("is-hidden");
  if (game.pendingLeaderboardEntry) {
    overlayState.view = "entry";
    overlayCard.innerHTML = `
      <div class="overlay-kicker">${MODES[game.activeMode].label}</div>
      <h2 class="overlay-title">New High Score</h2>
      <p class="overlay-copy overlay-copy--compact">Enter your five-letter ID for the leaderboard.</p>
      <div class="entry-picker" data-entry-picker>${renderLeaderboardPicker()}</div>
      <div class="entry-hint">Stick left/right selects slot. Up/down changes letter. A or Start saves. B skips.</div>
    `;
    return;
  }

  overlayState.view = "gameover";
  overlayState.selectedIndex = Math.min(overlayState.selectedIndex, 1);
  overlayCard.innerHTML = `
    <div class="overlay-kicker">${MODES[game.activeMode].label}</div>
    <h2 class="overlay-title">Restart</h2>
    <div class="overlay-scoreline">Slot ${formatSlot(SLOT_BASE + game.slotsCleared)}</div>
    ${renderLeaderboard(game.activeMode)}
    <div class="overlay-actions-row">
      <button class="overlay-button ${overlayState.selectedIndex === 0 ? "is-selected" : ""}" type="button" data-overlay-action="restart">Start Again</button>
      <button class="overlay-button overlay-button--ghost ${overlayState.selectedIndex === 1 ? "is-selected" : ""}" type="button" data-overlay-action="mode-select">Mode Select</button>
    </div>
    <div class="overlay-menu-hint">Stick or D-pad chooses. A or Start confirms. B returns to mode select.</div>
  `;
}

function renderLeaderboardPicker() {
  return leaderboardState.letters
    .map((letter, index) => `<div class="entry-slot ${leaderboardState.index === index ? "is-selected" : ""}">${letter}</div>`)
    .join("");
}

function refreshLeaderboardPicker() {
  const picker = overlayCard.querySelector("[data-entry-picker]");
  if (picker) {
    picker.innerHTML = renderLeaderboardPicker();
  }
}

function moveLeaderboardLetterIndex(direction) {
  leaderboardState.index = (leaderboardState.index + direction + leaderboardState.letters.length) % leaderboardState.letters.length;
  refreshLeaderboardPicker();
}

function cycleLeaderboardLetter(direction) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const current = leaderboardState.letters[leaderboardState.index];
  const currentIndex = Math.max(0, alphabet.indexOf(current));
  const nextIndex = (currentIndex + direction + alphabet.length) % alphabet.length;
  leaderboardState.letters[leaderboardState.index] = alphabet[nextIndex];
  refreshLeaderboardPicker();
}

function saveLeaderboardInitials() {
  addLeaderboardEntry(leaderboardState.letters.join(""), leaderboardState.score, leaderboardState.mode || game.activeMode);
  game.pendingLeaderboardEntry = false;
  showGameOver();
}

function pollGamepad() {
  const pad = (navigator.getGamepads?.() ?? []).find((gamepad) => gamepad?.connected);
  if (!pad) {
    game.gamepadAxis.horizontal = 0;
    game.gamepadAxis.vertical = 0;
    return;
  }

  const primaryPressed =
    consumePadEdge("primary0", !!pad.buttons[0]?.pressed) ||
    consumePadEdge("primary2", !!pad.buttons[2]?.pressed) ||
    consumePadEdge("start", !!pad.buttons[9]?.pressed);
  const backPressed =
    consumePadEdge("back", !!pad.buttons[1]?.pressed) ||
    consumePadEdge("select", !!pad.buttons[8]?.pressed);
  const leftPressed = consumePadEdge("leftShoulder", !!pad.buttons[4]?.pressed);
  const rightPressed = consumePadEdge("rightShoulder", !!pad.buttons[5]?.pressed);

  const horizontalDir =
    axisDirection(pad.axes[0] ?? 0, "left", "right") ||
    (!!pad.buttons[14]?.pressed ? "left" : null) ||
    (!!pad.buttons[15]?.pressed ? "right" : null);
  const verticalDir =
    axisDirection(pad.axes[1] ?? 0, "up", "down") ||
    (!!pad.buttons[12]?.pressed ? "up" : null) ||
    (!!pad.buttons[13]?.pressed ? "down" : null);

  const horizontalState = horizontalDir ? (horizontalDir === "left" ? -1 : 1) : 0;
  const verticalState = verticalDir ? (verticalDir === "up" ? -1 : 1) : 0;
  const horizontalEdge = horizontalState !== 0 && horizontalState !== game.gamepadAxis.horizontal;
  const verticalEdge = verticalState !== 0 && verticalState !== game.gamepadAxis.vertical;
  game.gamepadAxis.horizontal = horizontalState;
  game.gamepadAxis.vertical = verticalState;

  if (game.screen === "playing") {
    if (primaryPressed) {
      game.modeInstance?.primaryAction();
      audio.primary(game.activeMode);
    }
    return;
  }

  if (game.pendingLeaderboardEntry) {
    if (horizontalEdge) moveLeaderboardLetterIndex(horizontalState);
    if (verticalEdge) cycleLeaderboardLetter(verticalState < 0 ? 1 : -1);
    if (primaryPressed) saveLeaderboardInitials();
    if (backPressed) {
      game.pendingLeaderboardEntry = false;
      showGameOver();
    }
    return;
  }

  if (overlayState.view === "title") {
    if (leftPressed) {
      overlayState.selectedIndex = 0;
      showTitle();
    } else if (rightPressed) {
      overlayState.selectedIndex = 1;
      showTitle();
    } else if (horizontalEdge) {
      overlayState.selectedIndex = (overlayState.selectedIndex + horizontalState + 2) % 2;
      showTitle();
    }
    if (primaryPressed) {
      startSelectedMode(overlayState.selectedIndex === 0 ? "vanilla" : "csm");
    }
    if (backPressed) {
      overlayState.selectedIndex = 0;
      showTitle();
    }
    return;
  }

  if (overlayState.view === "gameover") {
    if (leftPressed) {
      overlayState.selectedIndex = 0;
      showGameOver();
    } else if (rightPressed) {
      overlayState.selectedIndex = 1;
      showGameOver();
    } else if (horizontalEdge) {
      overlayState.selectedIndex = (overlayState.selectedIndex + horizontalState + 2) % 2;
      showGameOver();
    }
    if (primaryPressed) {
      if (overlayState.selectedIndex === 0) {
        startSelectedMode(game.activeMode);
      } else {
        showTitleScreen();
      }
    }
    if (backPressed) {
      showTitleScreen();
    }
  }
}

function consumePadEdge(name, isDown) {
  const wasDown = !!game.gamepadButtons[name];
  game.gamepadButtons[name] = isDown;
  return isDown && !wasDown;
}

function axisDirection(value, negative, positive) {
  if (value <= -GAMEPAD_DEADZONE) return negative;
  if (value >= GAMEPAD_DEADZONE) return positive;
  return null;
}

function updateHud() {
  const mode = MODES[game.activeMode];
  const nextState = {
    mode: mode.label,
    bond: mode.bond,
    apr: mode.apr,
    fork: PHASES[game.phaseIndex].short,
    slot: formatSlot(SLOT_BASE + game.slotsCleared),
    highScore: formatSlot(SLOT_BASE + getHighScore(game.activeMode)),
  };
  if (game.hudState.mode !== nextState.mode) hud.mode.textContent = nextState.mode;
  if (game.hudState.bond !== nextState.bond) hud.bond.textContent = nextState.bond;
  if (game.hudState.apr !== nextState.apr) hud.apr.textContent = nextState.apr;
  if (game.hudState.fork !== nextState.fork) hud.fork.textContent = nextState.fork;
  if (game.hudState.slot !== nextState.slot) hud.slot.textContent = nextState.slot;
  if (game.hudState.highScore !== nextState.highScore) hud.highScore.textContent = nextState.highScore;
  if (hintEl.textContent !== mode.hint) hintEl.textContent = mode.hint;
  game.hudState = nextState;
}

function buildBackgroundCanvas(modeKey, phaseIndex) {
  const background = document.createElement("canvas");
  background.width = INTERNAL_WIDTH;
  background.height = INTERNAL_HEIGHT;
  const backgroundCtx = background.getContext("2d", { alpha: false }) || background.getContext("2d");
  const phase = PHASES[phaseIndex];

  const sky = backgroundCtx.createLinearGradient(0, 0, 0, INTERNAL_HEIGHT);
  sky.addColorStop(0, phase.skyTop);
  sky.addColorStop(1, phase.skyBottom);
  backgroundCtx.fillStyle = sky;
  backgroundCtx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

  backgroundCtx.strokeStyle = phase.line;
  backgroundCtx.lineWidth = 1;
  if (modeKey === "vanilla") {
    for (let index = 0; index < 4; index += 1) {
      const y = Math.round(INTERNAL_HEIGHT * 0.28 + index * INTERNAL_HEIGHT * 0.14);
      backgroundCtx.beginPath();
      backgroundCtx.moveTo(0, y);
      backgroundCtx.lineTo(INTERNAL_WIDTH, y);
      backgroundCtx.stroke();
    }
    backgroundCtx.strokeStyle = phase.floor;
    backgroundCtx.beginPath();
    backgroundCtx.moveTo(0, INTERNAL_HEIGHT - Math.round(INTERNAL_HEIGHT * 0.14));
    backgroundCtx.lineTo(INTERNAL_WIDTH, INTERNAL_HEIGHT - Math.round(INTERNAL_HEIGHT * 0.14));
    backgroundCtx.stroke();
  } else {
    for (let index = 0; index < 4; index += 1) {
      const y = Math.round(INTERNAL_HEIGHT * 0.36 + index * INTERNAL_HEIGHT * 0.12);
      backgroundCtx.beginPath();
      backgroundCtx.moveTo(0, y);
      backgroundCtx.lineTo(INTERNAL_WIDTH, y);
      backgroundCtx.stroke();
    }
    backgroundCtx.strokeStyle = phase.floor;
    backgroundCtx.beginPath();
    backgroundCtx.moveTo(0, INTERNAL_HEIGHT - Math.round(INTERNAL_HEIGHT * 0.16));
    backgroundCtx.lineTo(INTERNAL_WIDTH, INTERNAL_HEIGHT - Math.round(INTERNAL_HEIGHT * 0.16));
    backgroundCtx.stroke();
  }

  return background;
}

function buildDappnodeSprite() {
  const sprite = document.createElement("canvas");
  sprite.width = 42;
  sprite.height = 36;
  const spriteCtx = sprite.getContext("2d");

  spriteCtx.fillStyle = "#0f1820";
  spriteCtx.fillRect(4, 8, 34, 22);
  spriteCtx.fillStyle = "#f4f7fa";
  spriteCtx.fillRect(4, 2, 34, 10);
  spriteCtx.fillStyle = "#7dd8ae";
  spriteCtx.fillRect(11, 16, 7, 5);
  spriteCtx.fillStyle = "#2f3d48";
  spriteCtx.fillRect(20, 16, 9, 5);
  spriteCtx.fillRect(31, 16, 6, 5);
  return sprite;
}

function formatSlot(value) {
  return NUMBER_FORMATTER.format(value);
}

function getHighScore(mode = game.activeMode) {
  return Number.parseInt(storage.get(MODES[mode].highScoreKey) || "0", 10) || 0;
}

function setHighScore(value) {
  storage.set(MODES[game.activeMode].highScoreKey, String(value));
}

function getLeaderboard(mode = game.activeMode) {
  try {
    const raw = storage.get(MODES[mode].leaderboardKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addLeaderboardEntry(id, score, mode = game.activeMode) {
  const entries = getLeaderboard(mode);
  entries.push({
    id: id.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5).padEnd(5, "X"),
    score,
    slot: SLOT_BASE + score,
    createdAt: Date.now(),
  });
  entries.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
  storage.set(MODES[mode].leaderboardKey, JSON.stringify(entries.slice(0, 12)));
}

function renderLeaderboard(mode) {
  const entries = getLeaderboard(mode).slice(0, 5);
  if (!entries.length) {
    return `<div class="leaderboard-empty">No scores recorded.</div>`;
  }
  return `
    <div class="leaderboard">
      ${entries
        .map(
          (entry, index) => `
            <div class="leaderboard-row">
              <span>${index + 1}. ${entry.id}</span>
              <span>${formatSlot(entry.slot)}</span>
            </div>`
        )
        .join("")}
    </div>
  `;
}

function createStorage() {
  return {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        return null;
      }
      return value;
    },
  };
}

function createAudio() {
  if (LOW_PERF_DEVICE) {
    return {
      start() {},
      primary() {},
      proposal() {},
      fail() {},
    };
  }

  let context = null;

  function ensure() {
    if (!context) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      context = new AudioCtor();
    }
    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }
    return context;
  }

  function tone(frequency, duration, type = "triangle", gainValue = 0.014) {
    const audioContext = ensure();
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(gainValue, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + duration);
  }

  return {
    start: () => tone(240, 0.08),
    primary: (modeKey) => tone(modeKey === "vanilla" ? 420 : 360, 0.07),
    proposal: () => tone(720, 0.08, "square", 0.012),
    fail: () => tone(120, 0.2, "sawtooth", 0.014),
  };
}
