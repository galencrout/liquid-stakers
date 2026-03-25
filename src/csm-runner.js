import "./csm-runner.css";

const WIDTH = 1280;
const HEIGHT = 720;
const LOW_PERF_DEVICE =
  /Raspberry Pi/i.test(navigator.userAgent) ||
  ((navigator.deviceMemory || 8) <= 4 && (navigator.hardwareConcurrency || 8) <= 4);
const RENDER_SCALE = LOW_PERF_DEVICE ? 0.65 : 1;
const DPR = Math.max(1, Math.min(LOW_PERF_DEVICE ? 1 : 2, window.devicePixelRatio || 1));
const SLOT_BASE = 14_001_034;
const FORK_INTERVAL = 40;
const GAMEPAD_DEADZONE = 0.45;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const EFFECTS_ENABLED = !LOW_PERF_DEVICE && !REDUCED_MOTION;
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const HOME_URL = "./index.html";
const HIGH_SCORE_KEY = "csm-runner-high-score";
const LEADERBOARD_KEY = "csm-runner-leaderboard";
const PROPOSAL_ART = [
  "██████  ██       ██████   ██████ ██   ██",
  "██   ██ ██      ██    ██ ██      ██  ██ ",
  "██████  ██      ██    ██ ██      █████  ",
  "██   ██ ██      ██    ██ ██      ██  ██ ",
  "██████  ███████  ██████   ██████ ██   ██",
  "",
  "██████  ██████   ██████  ██████   ██████  ███████ ███████ ██████  ██",
  "██   ██ ██   ██ ██    ██ ██   ██ ██    ██ ██      ██      ██   ██ ██",
  "██████  ██████  ██    ██ ██████  ██    ██ ███████ █████   ██   ██ ██",
  "██      ██   ██ ██    ██ ██      ██    ██      ██ ██      ██   ██   ",
  "██      ██   ██  ██████  ██       ██████  ███████ ███████ ██████  ██",
  "",
  "!!!!",
];
const BROADCAST_FLASH_DURATION_MS = 1000;
const INPUT_COOLDOWN_MS = 350;
const MODES = {
  vanilla: {
    key: "vanilla",
    label: "Vanilla Staking",
    bond: "32 ETH",
    apr: "2.75%",
    hint: "Space / Up / click / tap flap.",
  },
  csm: {
    key: "csm",
    label: "CSM ICS Mode",
    bond: "1.5 ETH",
    apr: "5.87%",
    hint: "Space / Up jump.",
  },
};

const PHASES = [
  {
    short: "Merge",
    sky: ["#112638", "#081018"],
    accent: "#9dc8df",
    line: "#476275",
    panel: "rgba(157, 200, 223, 0.2)",
    floor: "#dfe8ef",
  },
  {
    short: "Shapella",
    sky: ["#1a2c43", "#091019"],
    accent: "#a9c7f0",
    line: "#506986",
    panel: "rgba(169, 199, 240, 0.2)",
    floor: "#e5ecf5",
  },
  {
    short: "Dencun",
    sky: ["#173137", "#081115"],
    accent: "#9cd9d2",
    line: "#4f7973",
    panel: "rgba(156, 217, 210, 0.2)",
    floor: "#e3efed",
  },
  {
    short: "Pectra",
    sky: ["#15342f", "#08110f"],
    accent: "#a9d7bf",
    line: "#4c7464",
    panel: "rgba(169, 215, 191, 0.2)",
    floor: "#e5eee7",
  },
  {
    short: "Fusaka",
    sky: ["#2b2231", "#0a0d13"],
    accent: "#d8bfd1",
    line: "#705b70",
    panel: "rgba(216, 191, 209, 0.2)",
    floor: "#eee7ec",
  },
  {
    short: "Glamsterdam",
    sky: ["#352a1d", "#100c09"],
    accent: "#edc998",
    line: "#896a4e",
    panel: "rgba(237, 201, 152, 0.2)",
    floor: "#f1e8da",
  },
  {
    short: "Hegota",
    sky: ["#2b1f25", "#0b0c11"],
    accent: "#f0bdd6",
    line: "#8a5f74",
    panel: "rgba(240, 189, 214, 0.2)",
    floor: "#f3e7ee",
  },
];

const FLAPPY = {
  playerX: 230,
  playerWidth: 96,
  playerHeight: 76,
  startSpeed: 230,
  maxSpeed: 300,
  speedStep: 12,
  gravity: 1080,
  flapVelocity: -365,
  pipeWidth: 116,
  gapHeight: 198,
  pipeSpacing: 280,
  spawnX: WIDTH + 120,
};

const RUNNER = {
  groundY: 580,
  playerX: 220,
  playerWidth: 104,
  playerHeight: 90,
  startSpeed: 420,
  maxSpeed: 520,
  speedStep: 14,
  gravity: 2400,
  jumpVelocity: -920,
  obstacleSpacing: 360,
  spawnX: WIDTH + 120,
  obstacleVariants: [
    { width: 44, height: 52 },
    { width: 58, height: 60 },
    { width: 72, height: 68 },
  ],
};

const app = document.querySelector("#app");
app.innerHTML = `
  <main class="runner-shell">
    <section class="runner-frame">
      <div class="runner-topbar">
        <div class="runner-brand"><span class="runner-brand-mark"></span><span>Node Runners</span></div>
      </div>
      <section class="runner-stage">
        <canvas class="runner-canvas" width="${WIDTH}" height="${HEIGHT}" aria-label="Staking game"></canvas>
        <div class="phase-tint" data-phase-tint aria-hidden="true"></div>
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
        <div class="broadcast-flash" data-broadcast-flash aria-hidden="true">
          <div class="broadcast-flash__text" data-broadcast-text>BLOCK PROPOSED!!!!</div>
        </div>
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
const ctx =
  canvas.getContext("2d", { alpha: false, desynchronized: true }) ||
  canvas.getContext("2d");
canvas.width = Math.round(WIDTH * DPR * RENDER_SCALE);
canvas.height = Math.round(HEIGHT * DPR * RENDER_SCALE);
canvas.style.width = `${WIDTH}px`;
canvas.style.height = `${HEIGHT}px`;
ctx.setTransform(DPR * RENDER_SCALE, 0, 0, DPR * RENDER_SCALE, 0, 0);

const overlay = document.querySelector("[data-overlay]");
const overlayCard = document.querySelector("[data-overlay-card]");
const phaseBanner = document.querySelector("[data-phase-banner]");
const phaseTitle = document.querySelector("[data-phase-title]");
const hintEl = document.querySelector("[data-hint]");
const broadcastFlash = document.querySelector("[data-broadcast-flash]");
const broadcastText = document.querySelector("[data-broadcast-text]");
const phaseTint = document.querySelector("[data-phase-tint]");

const hud = {
  mode: document.querySelector('[data-hud="mode"]'),
  bond: document.querySelector('[data-hud="bond"]'),
  apr: document.querySelector('[data-hud="apr"]'),
  fork: document.querySelector('[data-hud="fork"]'),
  slot: document.querySelector('[data-hud="slot"]'),
  highScore: document.querySelector('[data-hud="high-score"]'),
};

const audio = createAudio();
const storage = createStorage();

const game = {
  screen: "title",
  activeMode: "vanilla",
  lastTime: 0,
  gamepadButtons: {},
  gamepadAxis: { horizontal: 0, vertical: 0 },
  phaseIndex: 0,
  slotsCleared: 0,
  nextProposalAt: 12,
  bestBeforeRun: 0,
  pendingLeaderboardEntry: false,
  flappy: {
    speed: FLAPPY.startSpeed,
    columns: [],
    player: { x: FLAPPY.playerX, y: HEIGHT * 0.5, vy: 0, tilt: 0 },
  },
  runner: {
    speed: RUNNER.startSpeed,
    obstacles: [],
    player: { x: RUNNER.playerX, y: RUNNER.groundY, vy: 0, tilt: 0, onGround: true },
  },
  particles: [],
  hudState: { mode: "", bond: "", apr: "", fork: "", slot: "", highScore: "" },
  inputCooldownUntil: performance.now() + INPUT_COOLDOWN_MS,
};

const renderCache = createRenderCache();

const leaderboardState = {
  mode: null,
  score: 0,
  letters: ["A", "A", "A", "A", "A"],
  index: 0,
};
const LEADERBOARD_SUBMIT_INDEX = leaderboardState.letters.length;

const overlayState = {
  view: "title",
  selectedIndex: 0,
};
let broadcastTimeoutId = 0;

const pauseMenuActions = ["resume", "restart", "mode-select", "game-selector"];

showTitle();
updateHud();
requestAnimationFrame(frame);

window.addEventListener("keydown", (event) => {
  if (game.screen === "gameover" && game.pendingLeaderboardEntry) {
    if (event.code === "ArrowLeft") {
      event.preventDefault();
      moveLeaderboardLetterIndex(-1);
    }
    if (event.code === "ArrowRight") {
      event.preventDefault();
      moveLeaderboardLetterIndex(1);
    }
    if (event.code === "ArrowUp") {
      event.preventDefault();
      cycleLeaderboardLetter(1);
    }
    if (event.code === "ArrowDown") {
      event.preventDefault();
      cycleLeaderboardLetter(-1);
    }
    if (event.code === "Enter") {
      event.preventDefault();
      trySubmitLeaderboardEntry();
    }
    if (event.code === "Space") {
      event.preventDefault();
      trySubmitLeaderboardEntry();
    }
    if (event.code === "Escape" || event.code === "KeyB") {
      event.preventDefault();
      trySubmitLeaderboardEntry();
    }
    return;
  }

  if (["Space", "ArrowUp", "Enter"].includes(event.code)) {
    event.preventDefault();
  }

  if (game.screen === "playing" && (event.code === "Enter" || event.code === "Escape")) {
    showPauseMenu();
    return;
  }

  if (overlayState.view === "menu") {
    if (event.code === "ArrowUp" || event.code === "ArrowLeft") {
      overlayState.selectedIndex = (overlayState.selectedIndex + pauseMenuActions.length - 1) % pauseMenuActions.length;
      showPauseMenu();
      return;
    }
    if (event.code === "ArrowDown" || event.code === "ArrowRight") {
      overlayState.selectedIndex = (overlayState.selectedIndex + 1) % pauseMenuActions.length;
      showPauseMenu();
      return;
    }
    if (event.code === "Enter" || event.code === "Space") {
      activatePauseMenuAction();
      return;
    }
    if (event.code === "Escape") {
      hideOverlay();
      game.screen = "playing";
      overlayState.view = "playing";
      return;
    }
  }

  if (overlayState.view === "entry") {
    if (event.code === "Space") {
      saveLeaderboardInitials();
      return;
    }
  }

  if (overlayState.view === "title") {
    if (event.code === "ArrowLeft") {
      overlayState.selectedIndex = (overlayState.selectedIndex + 2) % 3;
      showTitle();
      return;
    }
    if (event.code === "ArrowRight") {
      overlayState.selectedIndex = (overlayState.selectedIndex + 1) % 3;
      showTitle();
      return;
    }
    if (event.code === "Enter" || event.code === "Space") {
      activateTitleAction();
      return;
    }
  }

  if (overlayState.view === "gameover") {
    if (event.code === "ArrowLeft") {
      overlayState.selectedIndex = (overlayState.selectedIndex + 2) % 3;
      showGameOver();
      return;
    }
    if (event.code === "ArrowRight") {
      overlayState.selectedIndex = (overlayState.selectedIndex + 1) % 3;
      showGameOver();
      return;
    }
    if (event.code === "Enter" || event.code === "Space") {
      activateGameOverAction();
      return;
    }
  }
});

canvas.addEventListener("pointerdown", () => {
  if (isInputCoolingDown()) return;
  if (game.screen !== "playing") {
    startSelectedMode(game.activeMode);
    return;
  }
  primaryAction();
});

overlay.addEventListener("pointerdown", (event) => {
  const action = event.target instanceof Element ? event.target.closest("[data-overlay-action]") : null;
  if (!action) return;
  event.stopPropagation();

  const actionName = action.getAttribute("data-overlay-action");
  const mode = action.getAttribute("data-mode");

  if (actionName === "mode-select") {
    game.screen = "title";
    game.pendingLeaderboardEntry = false;
    showTitle();
    updateHud();
    return;
  }

  if (actionName === "game-selector") {
    window.location.href = HOME_URL;
    return;
  }

  if (actionName === "resume") {
    hideOverlay();
    game.screen = "playing";
    overlayState.view = "playing";
    return;
  }

  if (actionName === "save-score" || actionName === "entry-submit") {
    saveLeaderboardInitials();
    return;
  }

  if (actionName === "entry-slot") {
    leaderboardState.index = Number.parseInt(action.getAttribute("data-index") || "0", 10) || 0;
    refreshLeaderboardPicker();
    return;
  }

  if (mode && MODES[mode]) {
    overlayState.selectedIndex = mode === "vanilla" ? 0 : 1;
    startSelectedMode(mode);
    return;
  }

  startSelectedMode(game.activeMode);
});

function getConnectedGamepads() {
  const pads = navigator.getGamepads?.() ?? [];
  return [...pads].filter((pad) => pad?.connected);
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

function pollGamepad() {
  if (isInputCoolingDown()) {
    const pads = getConnectedGamepads();
    if (pads.length) {
      consumePadEdge("primary0", pads.some((pad) => !!pad.buttons[0]?.pressed));
      consumePadEdge("primary2", pads.some((pad) => !!pad.buttons[2]?.pressed));
      consumePadEdge("start", pads.some((pad) => !!pad.buttons[9]?.pressed));
      consumePadEdge("back", pads.some((pad) => !!pad.buttons[1]?.pressed));
      consumePadEdge("select", pads.some((pad) => !!pad.buttons[8]?.pressed));
      consumePadEdge("leftShoulder", pads.some((pad) => !!pad.buttons[4]?.pressed));
      consumePadEdge("rightShoulder", pads.some((pad) => !!pad.buttons[5]?.pressed));
      game.gamepadAxis.horizontal = 0;
      game.gamepadAxis.vertical = 0;
    }
    return;
  }

  const pads = getConnectedGamepads();
  if (!pads.length) {
    game.gamepadAxis.horizontal = 0;
    game.gamepadAxis.vertical = 0;
    return;
  }

  const primaryPressed =
    consumePadEdge("primary0", pads.some((pad) => !!pad.buttons[0]?.pressed)) ||
    consumePadEdge("primary2", pads.some((pad) => !!pad.buttons[2]?.pressed));
  const startPressed = consumePadEdge("start", pads.some((pad) => !!pad.buttons[9]?.pressed));
  const backPressed =
    consumePadEdge("back", pads.some((pad) => !!pad.buttons[1]?.pressed)) ||
    consumePadEdge("select", pads.some((pad) => !!pad.buttons[8]?.pressed));
  const leftPressed = consumePadEdge("leftShoulder", pads.some((pad) => !!pad.buttons[4]?.pressed));
  const rightPressed = consumePadEdge("rightShoulder", pads.some((pad) => !!pad.buttons[5]?.pressed));

  const horizontalAxis = pads.reduce((value, pad) => {
    const candidate = pad.axes[0] ?? 0;
    return Math.abs(candidate) > Math.abs(value) ? candidate : value;
  }, 0);
  const verticalAxis = pads.reduce((value, pad) => {
    const candidate = pad.axes[1] ?? 0;
    return Math.abs(candidate) > Math.abs(value) ? candidate : value;
  }, 0);

  const horizontalDir =
    axisDirection(horizontalAxis, "left", "right") ||
    (pads.some((pad) => !!pad.buttons[14]?.pressed) ? "left" : null) ||
    (pads.some((pad) => !!pad.buttons[15]?.pressed) ? "right" : null);
  const verticalDir =
    axisDirection(verticalAxis, "up", "down") ||
    (pads.some((pad) => !!pad.buttons[12]?.pressed) ? "up" : null) ||
    (pads.some((pad) => !!pad.buttons[13]?.pressed) ? "down" : null);

  const horizontalState = horizontalDir ? (horizontalDir === "left" ? -1 : 1) : 0;
  const verticalState = verticalDir ? (verticalDir === "up" ? -1 : 1) : 0;
  const horizontalEdge = horizontalState !== 0 && horizontalState !== game.gamepadAxis.horizontal;
  const verticalEdge = verticalState !== 0 && verticalState !== game.gamepadAxis.vertical;
  game.gamepadAxis.horizontal = horizontalState;
  game.gamepadAxis.vertical = verticalState;

  if (game.screen === "playing") {
    if (primaryPressed) {
      primaryAction();
    }
    if (startPressed || backPressed) {
      showPauseMenu();
    }
    return;
  }

  if (game.pendingLeaderboardEntry) {
    if (horizontalEdge) moveLeaderboardLetterIndex(horizontalState);
    if (verticalEdge) cycleLeaderboardLetter(verticalState < 0 ? 1 : -1);
    if (primaryPressed || startPressed || backPressed) trySubmitLeaderboardEntry();
    return;
  }

  if (overlayState.view === "menu") {
    if (horizontalEdge || verticalEdge || leftPressed || rightPressed) {
      const direction = verticalEdge ? verticalState : horizontalEdge ? horizontalState : leftPressed ? -1 : 1;
      overlayState.selectedIndex = (overlayState.selectedIndex + direction + pauseMenuActions.length) % pauseMenuActions.length;
      showPauseMenu();
    }
    if (primaryPressed || startPressed) {
      activatePauseMenuAction();
    }
    if (backPressed) {
      hideOverlay();
      game.screen = "playing";
      overlayState.view = "playing";
    }
    return;
  }

  if (overlayState.view === "title") {
    if (leftPressed) {
      overlayState.selectedIndex = 0;
      showTitle();
    } else if (rightPressed) {
      overlayState.selectedIndex = Math.min(2, overlayState.selectedIndex + 1);
      showTitle();
    } else if (horizontalEdge) {
      overlayState.selectedIndex = (overlayState.selectedIndex + horizontalState + 3) % 3;
      showTitle();
    }
    if (primaryPressed || startPressed) {
      activateTitleAction();
    }
    if (backPressed) {
      window.location.href = HOME_URL;
    }
    return;
  }

  if (overlayState.view === "gameover") {
    if (leftPressed) {
      overlayState.selectedIndex = 0;
      showGameOver();
    } else if (rightPressed) {
      overlayState.selectedIndex = Math.min(2, overlayState.selectedIndex + 1);
      showGameOver();
    } else if (horizontalEdge) {
      overlayState.selectedIndex = (overlayState.selectedIndex + horizontalState + 3) % 3;
      showGameOver();
    }
    if (primaryPressed || startPressed) {
      activateGameOverAction();
    }
    if (backPressed) {
      game.screen = "title";
      game.pendingLeaderboardEntry = false;
      showTitle();
      updateHud();
    }
  }
}

function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let musicTimer = 0;
  let musicStep = 0;
  let musicPlaying = false;

  const STEP_TIME = 0.17;
  const MUSIC_PATTERN = [
    { bass: 110.0, lead: 659.25, harmony: 880.0, accent: true },
    { bass: 110.0, lead: 783.99, harmony: 987.77, accent: false },
    { bass: 123.47, lead: 880.0, harmony: 1046.5, accent: true },
    { bass: 123.47, lead: 783.99, harmony: 987.77, accent: false },
    { bass: 146.83, lead: 987.77, harmony: 1174.66, accent: true },
    { bass: 146.83, lead: 1046.5, harmony: 1318.51, accent: false },
    { bass: 123.47, lead: 880.0, harmony: 1046.5, accent: true },
    { bass: 98.0, lead: 739.99, harmony: 987.77, accent: false },
    { bass: 110.0, lead: 659.25, harmony: 880.0, accent: true },
    { bass: 110.0, lead: 783.99, harmony: 1046.5, accent: false },
    { bass: 123.47, lead: 880.0, harmony: 1174.66, accent: true },
    { bass: 123.47, lead: 987.77, harmony: 1318.51, accent: false },
    { bass: 146.83, lead: 1046.5, harmony: 1396.91, accent: true },
    { bass: 146.83, lead: 987.77, harmony: 1318.51, accent: false },
    { bass: 123.47, lead: 880.0, harmony: 1046.5, accent: true },
    { bass: 82.41, lead: 739.99, harmony: 987.77, accent: false },
  ];

  function ensure() {
    if (!context) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = 1.0;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.22;
      musicGain.connect(master);
    }
    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }
    return context;
  }
  function tone(frequency, duration, type = "sine", gainValue = 0.02, detune = 0) {
    const ctxRef = ensure();
    if (!ctxRef || !master) return;
    const osc = ctxRef.createOscillator();
    const gain = ctxRef.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    gain.gain.setValueAtTime(0.0001, ctxRef.currentTime);
    gain.gain.linearRampToValueAtTime(gainValue, ctxRef.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctxRef.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctxRef.currentTime + duration);
  }
  function musicNote(frequency, when, duration, type, gainValue) {
    if (!context || !musicGain) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(gainValue, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain).connect(musicGain);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }
  function noiseHit(when, duration, gainValue, highpassFreq = 900) {
    if (!context || !musicGain) return;
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * duration)), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.setValueAtTime(highpassFreq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(gainValue, when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(gain).connect(musicGain);
    source.start(when);
    source.stop(when + duration);
  }
  function scheduleMusicBar() {
    const ctxRef = ensure();
    if (!ctxRef || !musicPlaying) return;
    const startAt = ctxRef.currentTime + 0.03;
    for (let index = 0; index < 16; index += 1) {
      const step = MUSIC_PATTERN[(musicStep + index) % MUSIC_PATTERN.length];
      const when = startAt + index * STEP_TIME;
      const bassDuration = step.accent ? 0.16 : 0.13;
      const leadDuration = step.accent ? 0.14 : 0.11;
      musicNote(step.bass, when, bassDuration, "square", 0.065);
      musicNote(step.lead, when, leadDuration, "triangle", step.accent ? 0.055 : 0.045);
      musicNote(step.harmony, when + 0.05, 0.08, "square", 0.018);
      if (index % 4 === 0) {
        noiseHit(when, 0.045, 0.02, 1200);
      } else if (index % 2 === 0) {
        noiseHit(when, 0.03, 0.012, 1800);
      }
      if (index % 2 === 1) {
        musicNote(step.lead * 2, when + 0.085, 0.055, "square", 0.02);
      }
    }
    musicStep = (musicStep + 16) % MUSIC_PATTERN.length;
    musicTimer = window.setTimeout(scheduleMusicBar, STEP_TIME * 16 * 1000);
  }
  function stopMusic() {
    musicPlaying = false;
    if (musicTimer) {
      window.clearTimeout(musicTimer);
      musicTimer = 0;
    }
  }
  function startMusic() {
    const ctxRef = ensure();
    if (!ctxRef || musicPlaying) return;
    stopMusic();
    musicPlaying = true;
    scheduleMusicBar();
  }
  return {
    start() {
      tone(240, 0.16, "triangle", 0.06);
      tone(360, 0.2, "square", 0.03);
    },
    flap() {
      tone(420, 0.12, "triangle", 0.05);
      tone(690, 0.08, "square", 0.02);
    },
    jump() {
      tone(360, 0.14, "triangle", 0.055);
      tone(540, 0.1, "square", 0.022);
    },
    proposal() {
      tone(720, 0.14, "square", 0.055);
      tone(1080, 0.12, "triangle", 0.022);
    },
    phase() {
      tone(520, 0.16, "triangle", 0.05);
      tone(780, 0.18, "square", 0.026);
    },
    fail() {
      tone(120, 0.32, "sawtooth", 0.065);
      tone(96, 0.42, "triangle", 0.032, -12);
    },
    startMusic,
    stopMusic,
  };
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

function formatSlot(value) {
  return NUMBER_FORMATTER.format(value);
}

function getModeConfig() {
  return MODES[game.activeMode];
}

function getHighScore(mode = game.activeMode) {
  return Number.parseInt(storage.get(HIGH_SCORE_KEY) || "0", 10) || 0;
}

function setHighScore(value) {
  storage.set(HIGH_SCORE_KEY, String(value));
}

function getLeaderboard(mode = game.activeMode) {
  try {
    const raw = storage.get(LEADERBOARD_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLeaderboard(entries, mode = game.activeMode) {
  storage.set(LEADERBOARD_KEY, JSON.stringify(entries));
}

function addLeaderboardEntry(id, score, mode = game.activeMode) {
  const entries = getLeaderboard();
  entries.push({
    id: id.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5).padEnd(5, "X"),
    score,
    slot: SLOT_BASE + score,
    mode,
    createdAt: Date.now(),
  });
  entries.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
  saveLeaderboard(entries.slice(0, 12));
}

function renderLeaderboard(mode) {
  const entries = getLeaderboard().slice(0, 5);
  if (!entries.length) {
    return `<div class="leaderboard-empty">No scores recorded.</div>`;
  }
  return `
    <div class="leaderboard">
      ${entries
        .map(
          (entry, index) => `
            <div class="leaderboard-row">
              <span class="leaderboard-rank">${index + 1}. ${entry.id}</span>
              <span class="leaderboard-mode">${MODES[entry.mode]?.label || entry.mode || "-"}</span>
              <span class="leaderboard-score">${formatSlot(entry.slot)}</span>
            </div>`
        )
        .join("")}
    </div>
  `;
}

function startSelectedMode(mode) {
  game.activeMode = mode;
  game.screen = "playing";
  armInputCooldown();
  game.phaseIndex = 0;
  game.slotsCleared = 0;
  game.nextProposalAt = 10 + ((Math.random() * 6) | 0);
  game.bestBeforeRun = getHighScore();
  game.pendingLeaderboardEntry = false;
  leaderboardState.mode = null;
  leaderboardState.score = 0;
  leaderboardState.letters = ["A", "A", "A", "A", "A"];
  leaderboardState.index = 0;
  overlayState.view = "playing";
  game.particles = [];
  clearBroadcastFlash();

  if (mode === "vanilla") {
    resetFlappy();
  } else {
    resetRunner();
  }

  hideOverlay();
  applyPhaseVisuals(PHASES[0]);
  showPhase(PHASES[0]);
  audio.start();
  audio.startMusic();
  updateHud(true);
}

function resetFlappy() {
  game.flappy.speed = FLAPPY.startSpeed;
  game.flappy.columns = [];
  game.flappy.player.y = HEIGHT * 0.5;
  game.flappy.player.vy = 0;
  game.flappy.player.tilt = 0;
  for (let index = 0; index < 5; index += 1) {
    spawnFlappyColumn(index * FLAPPY.pipeSpacing);
  }
}

function resetRunner() {
  game.runner.speed = RUNNER.startSpeed;
  game.runner.obstacles = [];
  game.runner.player.y = RUNNER.groundY;
  game.runner.player.vy = 0;
  game.runner.player.tilt = 0;
  game.runner.player.onGround = true;
  for (let index = 0; index < 4; index += 1) {
    spawnRunnerObstacle(index * RUNNER.obstacleSpacing);
  }
}

function primaryAction() {
  if (game.activeMode === "vanilla") {
    game.flappy.player.vy = FLAPPY.flapVelocity;
    game.flappy.player.tilt = -0.34;
    audio.flap();
    return;
  }

  const player = game.runner.player;
  if (player.onGround) {
    player.vy = RUNNER.jumpVelocity;
    player.onGround = false;
    player.tilt = -0.18;
    audio.jump();
  }
}

function showTitle() {
  audio.stopMusic();
  overlayState.view = "title";
  armInputCooldown();
  showOverlay();
  overlayCard.innerHTML = `
    <h1 class="overlay-title">Choose Game Mode</h1>
    <div class="mode-grid">
      <button class="mode-card ${overlayState.selectedIndex === 0 ? "is-selected" : ""}" type="button" data-overlay-action="start" data-mode="vanilla">
        <span class="mode-card-title">Vanilla Staking</span>
        <span class="mode-card-metric">Bond: 32 ETH</span>
        <span class="mode-card-metric">APR: 2.75%</span>
        <span class="mode-card-copy">Stake 32 ETH to become a vanilla ETH staker. Earn an estimated 2.75% APR.</span>
      </button>
      <button class="mode-card ${overlayState.selectedIndex === 1 ? "is-selected" : ""}" type="button" data-overlay-action="start" data-mode="csm">
        <span class="mode-card-title">CSM ICS Mode</span>
        <span class="mode-card-metric">Bond: 1.5 ETH</span>
        <span class="mode-card-metric">APR: 5.87%</span>
        <span class="mode-card-copy">Bond 1.5 ETH to become a CSM Identified Community Staker and earn an estimated ~5.87% APR.</span>
      </button>
    </div>
    <div class="mode-card mode-card--leaderboard">
      <span class="mode-card-subtitle">All-Time Top Runs</span>
      ${renderLeaderboard()}
    </div>
    <div class="overlay-actions-row">
      <button class="overlay-button overlay-button--ghost ${overlayState.selectedIndex === 2 ? "is-selected" : ""}" type="button" data-overlay-action="game-selector">Back To Game Select</button>
    </div>
    <div class="overlay-menu-hint">Stick or D-pad chooses. L selects Vanilla. R selects CSM. A or Start confirms.</div>
  `;
}

function showGameOver() {
  armInputCooldown();
  showOverlay();
  if (game.pendingLeaderboardEntry) {
    overlayState.view = "entry";
    overlayState.selectedIndex = 0;
    overlayCard.innerHTML = `
      <div class="overlay-kicker">${getModeConfig().label}</div>
      <h2 class="overlay-title">New High Score</h2>
      <p class="overlay-copy overlay-copy--compact">Enter your five-letter ID for the leaderboard.</p>
      <div class="entry-picker" data-entry-picker>${renderLeaderboardPicker()}</div>
      <div class="entry-hint">Stick left/right selects slot. Up/down changes letters. Move to ENTER and press any button to save.</div>
    `;
    return;
  }

  overlayState.view = "gameover";
  overlayState.selectedIndex = Math.min(overlayState.selectedIndex, 2);
  overlayCard.innerHTML = `
    <div class="overlay-kicker">${getModeConfig().label}</div>
    <h2 class="overlay-title">Restart</h2>
    <div class="overlay-scoreline">Slot ${formatSlot(SLOT_BASE + game.slotsCleared)}</div>
    ${renderLeaderboard()}
    <div class="overlay-actions-row">
      <button class="overlay-button ${overlayState.selectedIndex === 0 ? "is-selected" : ""}" type="button" data-overlay-action="restart">Start Again</button>
      <button class="overlay-button overlay-button--ghost ${overlayState.selectedIndex === 1 ? "is-selected" : ""}" type="button" data-overlay-action="mode-select">Choose Game Mode</button>
      <button class="overlay-button overlay-button--ghost ${overlayState.selectedIndex === 2 ? "is-selected" : ""}" type="button" data-overlay-action="game-selector">Back To Game Select</button>
    </div>
    <div class="overlay-menu-hint">Stick or D-pad chooses. A or Start confirms. B returns to mode select.</div>
  `;
}

function activateTitleAction() {
  if (overlayState.selectedIndex === 0) {
    startSelectedMode("vanilla");
    return;
  }
  if (overlayState.selectedIndex === 1) {
    startSelectedMode("csm");
    return;
  }
  window.location.href = HOME_URL;
}

function activateGameOverAction() {
  if (overlayState.selectedIndex === 0) {
    startSelectedMode(game.activeMode);
    return;
  }
  if (overlayState.selectedIndex === 1) {
    game.screen = "title";
    game.pendingLeaderboardEntry = false;
    showTitle();
    updateHud();
    return;
  }
  window.location.href = HOME_URL;
}

function showPauseMenu() {
  overlayState.view = "menu";
  overlayState.selectedIndex = Math.min(overlayState.selectedIndex, pauseMenuActions.length - 1);
  game.screen = "paused";
  audio.stopMusic();
  armInputCooldown();
  showOverlay();
  overlayCard.innerHTML = `
    <div class="overlay-kicker">${getModeConfig().label}</div>
    <h2 class="overlay-title">Game Menu</h2>
    <div class="overlay-actions-stack">
      <button class="overlay-button ${overlayState.selectedIndex === 0 ? "is-selected" : ""}" type="button" data-overlay-action="resume">Resume</button>
      <button class="overlay-button ${overlayState.selectedIndex === 1 ? "is-selected" : ""}" type="button" data-overlay-action="restart">Restart</button>
      <button class="overlay-button ${overlayState.selectedIndex === 2 ? "is-selected" : ""}" type="button" data-overlay-action="mode-select">Choose Game Mode</button>
      <button class="overlay-button ${overlayState.selectedIndex === 3 ? "is-selected" : ""}" type="button" data-overlay-action="game-selector">Back To Game Select</button>
    </div>
    <div class="overlay-menu-hint">Joystick or D-pad navigates. A or Start confirms. B or Select resumes.</div>
  `;
}

function activatePauseMenuAction() {
  const actionName = pauseMenuActions[overlayState.selectedIndex];
  if (actionName === "resume") {
    hideOverlay();
    game.screen = "playing";
    overlayState.view = "playing";
    audio.startMusic();
    return;
  }
  if (actionName === "restart") {
    startSelectedMode(game.activeMode);
    return;
  }
  if (actionName === "mode-select") {
    game.screen = "title";
    game.pendingLeaderboardEntry = false;
    showTitle();
    updateHud();
    return;
  }
  if (actionName === "game-selector") {
    window.location.href = HOME_URL;
  }
}

function armInputCooldown() {
  game.inputCooldownUntil = performance.now() + INPUT_COOLDOWN_MS;
}

function isInputCoolingDown() {
  return performance.now() < game.inputCooldownUntil;
}

function renderLeaderboardPicker() {
  const letters = leaderboardState.letters
    .map(
      (letter, index) =>
        `<button class="entry-slot ${leaderboardState.index === index ? "is-selected" : ""}" type="button" data-overlay-action="entry-slot" data-index="${index}">${letter}</button>`
    )
    .join("");
  const submit = `<button class="entry-slot entry-slot--submit ${leaderboardState.index === LEADERBOARD_SUBMIT_INDEX ? "is-selected" : ""}" type="button" data-overlay-action="entry-submit" data-index="${LEADERBOARD_SUBMIT_INDEX}">ENTER</button>`;
  return `${letters}${submit}`;
}

function refreshLeaderboardPicker() {
  const picker = overlayCard.querySelector("[data-entry-picker]");
  if (picker) {
    picker.innerHTML = renderLeaderboardPicker();
  }
}

function moveLeaderboardLetterIndex(direction) {
  const total = leaderboardState.letters.length + 1;
  leaderboardState.index = (leaderboardState.index + direction + total) % total;
  refreshLeaderboardPicker();
}

function cycleLeaderboardLetter(direction) {
  if (leaderboardState.index >= leaderboardState.letters.length) return;
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

function trySubmitLeaderboardEntry() {
  if (leaderboardState.index === LEADERBOARD_SUBMIT_INDEX) {
    saveLeaderboardInitials();
  }
}

function showPhase(phase) {
  applyPhaseVisuals(phase);
  phaseTitle.textContent = phase.short;
  phaseBanner.classList.add("is-visible");
  if (!REDUCED_MOTION) {
    window.clearTimeout(showPhase.timer);
    showPhase.timer = window.setTimeout(() => phaseBanner.classList.remove("is-visible"), 1200);
  }
}

function applyPhaseVisuals(phase) {
  if (!phaseTint) return;
  phaseTint.style.setProperty("--phase-tint-top", phase.sky[0]);
  phaseTint.style.setProperty("--phase-tint-bottom", phase.sky[1]);
  phaseTint.style.setProperty("--phase-tint-accent", phase.accent);
}

function hideOverlay() {
  overlay.classList.add("is-hidden");
}

function showOverlay() {
  overlay.classList.remove("is-hidden");
}

function updateHud() {
  const mode = getModeConfig();
  const nextState = {
    mode: mode.label,
    bond: mode.bond,
    apr: mode.apr,
    fork: PHASES[game.phaseIndex].short,
    slot: formatSlot(SLOT_BASE + game.slotsCleared),
    highScore: formatSlot(SLOT_BASE + getHighScore()),
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

function frame(timestamp) {
  const last = game.lastTime || timestamp;
  const delta = Math.min(0.032, (timestamp - last) / 1000);
  game.lastTime = timestamp;
  pollGamepad();

  if (game.screen === "playing") {
    update(delta);
  }

  render();
  requestAnimationFrame(frame);
}

function update(delta) {
  const nextPhase = Math.min(PHASES.length - 1, Math.floor(game.slotsCleared / FORK_INTERVAL));
  if (nextPhase !== game.phaseIndex) {
    game.phaseIndex = nextPhase;
    if (game.activeMode === "vanilla") {
      game.flappy.speed = Math.min(FLAPPY.maxSpeed, FLAPPY.startSpeed + game.phaseIndex * FLAPPY.speedStep);
    } else {
      game.runner.speed = Math.min(RUNNER.maxSpeed, RUNNER.startSpeed + game.phaseIndex * RUNNER.speedStep);
    }
    showPhase(PHASES[game.phaseIndex]);
    triggerBroadcast(`${PHASES[game.phaseIndex].short.toUpperCase()} HARDFORK!`, "hardfork");
    audio.phase();
    updateHud();
  }

  if (game.activeMode === "vanilla") {
    updateFlappy(delta);
  } else {
    updateRunner(delta);
  }
  updateParticles(delta);
}

function updateFlappy(delta) {
  const player = game.flappy.player;
  player.vy += FLAPPY.gravity * delta;
  player.y += player.vy * delta;
  player.tilt = Math.min(0.44, player.tilt + delta * 0.95);

  if (player.y < 64) {
    player.y = 64;
    player.vy = 0;
  }
  if (player.y + FLAPPY.playerHeight * 0.5 > HEIGHT - 92) {
    failGame();
    return;
  }

  const playerRect = {
    x: FLAPPY.playerX - FLAPPY.playerWidth * 0.42,
    y: player.y - FLAPPY.playerHeight * 0.42,
    width: FLAPPY.playerWidth * 0.84,
    height: FLAPPY.playerHeight * 0.84,
  };

  for (const column of game.flappy.columns) {
    column.x -= game.flappy.speed * delta;
    column.topRect.x = column.x;
    column.bottomRect.x = column.x;

    if (!column.scored && column.x + FLAPPY.pipeWidth < FLAPPY.playerX - FLAPPY.playerWidth * 0.5) {
      column.scored = true;
      onSlotCleared(column.type === "proposal");
    }

    if (rectsOverlap(playerRect, column.topRect) || rectsOverlap(playerRect, column.bottomRect)) {
      failGame();
      return;
    }
  }

  while (game.flappy.columns.length && game.flappy.columns[0].x + FLAPPY.pipeWidth <= -120) {
    game.flappy.columns.shift();
  }
  const lastColumn = game.flappy.columns[game.flappy.columns.length - 1];
  if (!lastColumn || lastColumn.x < FLAPPY.spawnX - FLAPPY.pipeSpacing) {
    spawnFlappyColumn();
  }
}

function updateRunner(delta) {
  const player = game.runner.player;
  player.vy += RUNNER.gravity * delta;
  player.y += player.vy * delta;
  player.tilt = Math.min(0.32, player.tilt + delta * 0.7);

  if (player.y >= RUNNER.groundY) {
    player.y = RUNNER.groundY;
    player.vy = 0;
    player.onGround = true;
    player.tilt = 0;
  }

  const playerRect = {
    x: RUNNER.playerX - RUNNER.playerWidth * 0.4,
    y: player.y - RUNNER.playerHeight + 10,
    width: RUNNER.playerWidth * 0.8,
    height: RUNNER.playerHeight - 12,
  };

  for (const obstacle of game.runner.obstacles) {
    obstacle.x -= game.runner.speed * delta;
    obstacle.hitbox.x = obstacle.x;
    if (!obstacle.scored && obstacle.x + obstacle.width < RUNNER.playerX - 40) {
      obstacle.scored = true;
      onSlotCleared(obstacle.type === "proposal");
    }
    if (rectsOverlap(playerRect, obstacle.hitbox)) {
      failGame();
      return;
    }
  }

  while (game.runner.obstacles.length && game.runner.obstacles[0].x + game.runner.obstacles[0].width <= -120) {
    game.runner.obstacles.shift();
  }
  const lastObstacle = game.runner.obstacles[game.runner.obstacles.length - 1];
  if (!lastObstacle || lastObstacle.x < RUNNER.spawnX - RUNNER.obstacleSpacing) {
    spawnRunnerObstacle();
  }
}

function onSlotCleared(proposal) {
  game.slotsCleared += 1;
  if (proposal) {
    audio.proposal();
    triggerBroadcast("BLOCK PROPOSED!!!!", "proposal");
  }
  if (game.slotsCleared > getHighScore()) {
    setHighScore(game.slotsCleared);
    if (game.slotsCleared > game.bestBeforeRun) {
      game.pendingLeaderboardEntry = true;
      leaderboardState.mode = game.activeMode;
      leaderboardState.score = game.slotsCleared;
    }
  }
  updateHud();
}

function updateParticles(delta) {
  let writeIndex = 0;
  for (let index = 0; index < game.particles.length; index += 1) {
    const particle = game.particles[index];
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta;
    if (particle.life > 0) {
      game.particles[writeIndex] = particle;
      writeIndex += 1;
    }
  }
  game.particles.length = writeIndex;
}

function spawnFlappyColumn(offset = 0) {
  const count = game.flappy.columns.length + game.slotsCleared;
  const isProposal = count > 0 && count === game.nextProposalAt;
  const gapCenter = 220 + Math.random() * 230;
  const topHeight = gapCenter - FLAPPY.gapHeight * 0.5;
  const bottomY = gapCenter + FLAPPY.gapHeight * 0.5;
  game.flappy.columns.push({
    type: isProposal ? "proposal" : "standard",
    x: FLAPPY.spawnX + offset,
    topHeight,
    bottomY,
    scored: false,
    topRect: { x: FLAPPY.spawnX + offset, y: 0, width: FLAPPY.pipeWidth, height: topHeight },
    bottomRect: { x: FLAPPY.spawnX + offset, y: bottomY, width: FLAPPY.pipeWidth, height: HEIGHT - bottomY - 54 },
  });
  if (isProposal) {
    game.nextProposalAt += 10 + ((Math.random() * 6) | 0);
  }
}

function spawnRunnerObstacle(offset = 0) {
  const count = game.runner.obstacles.length + game.slotsCleared;
  const isProposal = count > 0 && count === game.nextProposalAt;
  const variant = RUNNER.obstacleVariants[(Math.random() * RUNNER.obstacleVariants.length) | 0];
  const width = isProposal ? 84 : variant.width;
  const height = isProposal ? 74 : variant.height;
  const y = RUNNER.groundY - height;
  game.runner.obstacles.push({
    type: isProposal ? "proposal" : "standard",
    x: RUNNER.spawnX + offset,
    y,
    width,
    height,
    scored: false,
    hitbox: { x: RUNNER.spawnX + offset, y: y + 6, width, height: height - 6 },
  });
  if (isProposal) {
    game.nextProposalAt += 10 + ((Math.random() * 6) | 0);
  }
}

function failGame() {
  audio.stopMusic();
  game.screen = "gameover";
  const phase = PHASES[game.phaseIndex];
  const burstX = game.activeMode === "vanilla" ? game.flappy.player.x : game.runner.player.x;
  const burstY = game.activeMode === "vanilla" ? game.flappy.player.y : game.runner.player.y - 30;
  burst(burstX, burstY, 14, phase.accent);
  audio.fail();
  showGameOver();
}

function burst(x, y, count, color) {
  for (let index = 0; index < count; index += 1) {
    game.particles.push({
      x,
      y,
      vx: -90 + Math.random() * 180,
      vy: -80 + Math.random() * 160,
      life: 0.3 + Math.random() * 0.2,
      color,
    });
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function render() {
  const phase = PHASES[game.phaseIndex];
  const backgroundKey = `${game.activeMode}-${game.phaseIndex}`;
  ctx.drawImage(renderCache.backgrounds[backgroundKey], 0, 0, WIDTH, HEIGHT);

  if (game.activeMode === "vanilla") {
    drawFlappyLanes(phase);
    drawFlappyColumns(phase);
    drawFlappyPlayer(phase);
  } else {
    drawRunnerLanes(phase);
    drawRunnerObstacles(phase);
    drawRunnerPlayer(phase);
  }
  drawParticles();
}

function drawFlappyLanes(phase) {
  ctx.save();
  ctx.strokeStyle = phase.line;
  ctx.lineWidth = 2;
  for (let index = 0; index < 5; index += 1) {
    const y = 126 + index * 92;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  ctx.strokeStyle = phase.floor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, HEIGHT - 56);
  ctx.lineTo(WIDTH, HEIGHT - 56);
  ctx.stroke();
  ctx.restore();
}

function drawFlappyColumns(phase) {
  for (const column of game.flappy.columns) {
    const fill = column.type === "proposal" ? "rgba(244, 229, 194, 0.98)" : phase.floor;
    ctx.fillStyle = fill;
    roundRect(ctx, column.x, 0, FLAPPY.pipeWidth, column.topHeight, 16);
    ctx.fill();
    roundRect(ctx, column.x, column.bottomY, FLAPPY.pipeWidth, HEIGHT - column.bottomY - 54, 16);
    ctx.fill();
    ctx.fillStyle = "rgba(11, 18, 24, 0.55)";
    ctx.fillRect(column.x - 10, column.topHeight - 18, FLAPPY.pipeWidth + 20, 16);
    ctx.fillRect(column.x - 10, column.bottomY, FLAPPY.pipeWidth + 20, 16);
  }
}

function drawFlappyPlayer(phase) {
  const player = game.flappy.player;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.tilt);
  drawValidatorUnit(ctx, phase, {
    width: FLAPPY.playerWidth,
    height: FLAPPY.playerHeight,
    cableLift: 6,
    detailScale: 1,
  });
  ctx.restore();
}

function drawRunnerLanes(phase) {
  ctx.save();
  ctx.strokeStyle = phase.line;
  ctx.lineWidth = 2;
  for (let index = 0; index < 4; index += 1) {
    const y = 180 + index * 88;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  ctx.strokeStyle = phase.floor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, RUNNER.groundY + 4);
  ctx.lineTo(WIDTH, RUNNER.groundY + 4);
  ctx.stroke();
  ctx.restore();
}

function drawRunnerObstacles(phase) {
  for (const obstacle of game.runner.obstacles) {
    const fill = obstacle.type === "proposal" ? "rgba(244, 229, 194, 0.98)" : phase.floor;
    ctx.fillStyle = fill;
    roundRect(ctx, obstacle.x, obstacle.y, obstacle.width, obstacle.height, 10);
    ctx.fill();
  }
}

function drawRunnerPlayer(phase) {
  const player = game.runner.player;
  ctx.save();
  ctx.translate(player.x, player.y - RUNNER.playerHeight * 0.5);
  ctx.rotate(player.tilt);
  drawValidatorUnit(ctx, phase, {
    width: RUNNER.playerWidth,
    height: RUNNER.playerHeight,
    cableLift: 10,
    detailScale: 1.06,
  });
  ctx.restore();
}

function drawParticles() {
  if (!EFFECTS_ENABLED) {
    return;
  }
  for (const particle of game.particles) {
    ctx.globalAlpha = Math.max(0, particle.life * 2);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawValidatorUnit(context, phase, config) {
  const { width, height, cableLift, detailScale } = config;
  const bodyHeight = height * 0.48;
  const topHeight = height * 0.34;
  const frontY = height * 0.08;
  const left = -width * 0.5;
  const topLeftX = left + width * 0.1;
  const topRightX = left + width * 0.82;
  const lidTopY = -height * 0.42;
  const lidBottomY = lidTopY + topHeight;
  const frontBottomY = frontY + bodyHeight;

  context.lineWidth = 2;
  context.strokeStyle = "rgba(12, 17, 24, 0.75)";

  context.beginPath();
  context.moveTo(topLeftX, lidTopY);
  context.lineTo(topRightX, lidTopY);
  context.lineTo(left + width * 0.54, lidBottomY);
  context.lineTo(left - width * 0.18, lidBottomY);
  context.closePath();
  context.fillStyle = "#f3f6fa";
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(left - width * 0.18, lidBottomY);
  context.lineTo(left + width * 0.54, lidBottomY);
  context.lineTo(left + width * 0.54, frontY);
  context.lineTo(left - width * 0.18, frontY);
  context.closePath();
  context.fillStyle = "#1d2432";
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(left + width * 0.54, lidBottomY);
  context.lineTo(topRightX, lidTopY);
  context.lineTo(topRightX, frontY - topHeight * 0.12);
  context.lineTo(left + width * 0.54, frontY);
  context.closePath();
  context.fillStyle = "#242c3b";
  context.fill();
  context.stroke();

  context.strokeStyle = "rgba(255, 255, 255, 0.45)";
  context.beginPath();
  context.moveTo(topLeftX + 4, lidBottomY - 2);
  context.lineTo(left + width * 0.5, lidBottomY - 2);
  context.stroke();

  context.fillStyle = "#10151d";
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      context.beginPath();
      context.arc(left - width * 0.04 + col * 7 * detailScale, frontY + 10 + row * 7 * detailScale, 1.8 * detailScale, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.fillStyle = "#f8fbff";
  context.fillRect(left + width * 0.2, frontY + 18 * detailScale, 16 * detailScale, 14 * detailScale);
  context.fillRect(left + width * 0.42, frontY + 18 * detailScale, 16 * detailScale, 14 * detailScale);
  context.fillStyle = "#141b23";
  context.fillRect(left + width * 0.23, frontY + 21 * detailScale, 10 * detailScale, 8 * detailScale);
  context.fillRect(left + width * 0.45, frontY + 21 * detailScale, 10 * detailScale, 8 * detailScale);

  context.fillStyle = "#7dd8ae";
  context.fillRect(left + width * 0.12, frontY + 22 * detailScale, 6 * detailScale, 14 * detailScale);
  context.fillStyle = "#b4ff66";
  context.fillRect(left + width * 0.12, frontY + 40 * detailScale, 6 * detailScale, 4 * detailScale);
  context.fillStyle = "#f3b54d";
  context.fillRect(left + width * 0.64, frontY + 16 * detailScale, 10 * detailScale, 10 * detailScale);

  context.strokeStyle = "rgba(12, 17, 24, 0.8)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(left + width * 0.5, frontY + 26 * detailScale);
  context.bezierCurveTo(left + width * 0.74, frontY + 50, left + width * 0.84, frontBottomY + cableLift, left + width * 0.64, frontBottomY + cableLift);
  context.stroke();
  context.beginPath();
  context.moveTo(left - width * 0.08, frontBottomY - 6);
  context.bezierCurveTo(left - width * 0.24, frontBottomY + 10, left - width * 0.32, frontBottomY + 18, left - width * 0.16, frontBottomY + cableLift + 8);
  context.stroke();

  context.fillStyle = "#111722";
  context.fillRect(left + width * 0.6, frontBottomY + cableLift - 3, 10, 6);
  context.fillRect(left - width * 0.2, frontBottomY + cableLift + 5, 10, 6);

  context.fillStyle = "rgba(12, 17, 24, 0.78)";
  context.font = `${Math.max(8, Math.round(10 * detailScale))}px "IBM Plex Sans", sans-serif`;
  context.textAlign = "center";
  context.fillText("ETH VALIDATOR", left + width * 0.24, lidTopY + topHeight * 0.5);

  context.strokeStyle = phase.accent;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(left + width * 0.18, lidTopY + 12);
  context.lineTo(left + width * 0.3, lidTopY + 22);
  context.lineTo(left + width * 0.36, lidTopY + 16);
  context.lineTo(left + width * 0.5, lidTopY + 26);
  context.lineTo(left + width * 0.42, lidTopY + 36);
  context.lineTo(left + width * 0.24, lidTopY + 30);
  context.closePath();
  context.stroke();
}

function createRenderCache() {
  const backgrounds = {};
  for (let phaseIndex = 0; phaseIndex < PHASES.length; phaseIndex += 1) {
    const phase = PHASES[phaseIndex];
    backgrounds[`vanilla-${phaseIndex}`] = buildBackgroundCanvas(phase, "vanilla");
    backgrounds[`csm-${phaseIndex}`] = buildBackgroundCanvas(phase, "csm");
  }
  return {
    backgrounds,
  };
}

function buildBackgroundCanvas(phase, mode) {
  const background = document.createElement("canvas");
  background.width = WIDTH;
  background.height = HEIGHT;
  const backgroundCtx = background.getContext("2d", { alpha: false }) || background.getContext("2d");

  const sky = backgroundCtx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, phase.sky[0]);
  sky.addColorStop(1, phase.sky[1]);
  backgroundCtx.fillStyle = sky;
  backgroundCtx.fillRect(0, 0, WIDTH, HEIGHT);

  backgroundCtx.strokeStyle = phase.line;
  backgroundCtx.lineWidth = 2;
  if (mode === "vanilla") {
    for (let index = 0; index < 5; index += 1) {
      const y = 126 + index * 92;
      backgroundCtx.beginPath();
      backgroundCtx.moveTo(0, y);
      backgroundCtx.lineTo(WIDTH, y);
      backgroundCtx.stroke();
    }
    backgroundCtx.strokeStyle = phase.floor;
    backgroundCtx.lineWidth = 4;
    backgroundCtx.beginPath();
    backgroundCtx.moveTo(0, HEIGHT - 56);
    backgroundCtx.lineTo(WIDTH, HEIGHT - 56);
    backgroundCtx.stroke();
  } else {
    for (let index = 0; index < 4; index += 1) {
      const y = 180 + index * 88;
      backgroundCtx.beginPath();
      backgroundCtx.moveTo(0, y);
      backgroundCtx.lineTo(WIDTH, y);
      backgroundCtx.stroke();
    }
    backgroundCtx.strokeStyle = phase.floor;
    backgroundCtx.lineWidth = 4;
    backgroundCtx.beginPath();
    backgroundCtx.moveTo(0, RUNNER.groundY + 4);
    backgroundCtx.lineTo(WIDTH, RUNNER.groundY + 4);
    backgroundCtx.stroke();
  }

  return background;
}

function clearBroadcastFlash() {
  if (broadcastTimeoutId) {
    window.clearTimeout(broadcastTimeoutId);
    broadcastTimeoutId = 0;
  }
  broadcastFlash.classList.remove("is-visible", "is-proposal", "is-hardfork");
}

function triggerBroadcast(text, type) {
  broadcastText.textContent = text;
  broadcastFlash.classList.remove("is-visible", "is-proposal", "is-hardfork");
  void broadcastFlash.offsetWidth;
  broadcastFlash.classList.add("is-visible", type === "hardfork" ? "is-hardfork" : "is-proposal");
  if (broadcastTimeoutId) {
    window.clearTimeout(broadcastTimeoutId);
  }
  broadcastTimeoutId = window.setTimeout(() => {
    broadcastFlash.classList.remove("is-visible");
    broadcastTimeoutId = 0;
  }, BROADCAST_FLASH_DURATION_MS);
}
