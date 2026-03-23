import "./eth-chomp.css";
import lidoHeaderPng from "./assets/optimized/lido-header.jpg";

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="shell">
    <section class="hud">
      <div class="hud-left">
        <h1>Stake-Man: ETH Chomp</h1>
        <p class="sub">Pac-man rules, staking twist.</p>
      </div>
      <div class="header-mascot" aria-hidden="true">
        <img src="${lidoHeaderPng}" alt="Lido mascot" />
      </div>
      <div class="hud-right">
        <span id="modeBadge" class="badge">MODE: SELECT DIFFICULTY</span>
        <span id="queueBadge" class="badge badge-queue">QUEUE: --</span>
        <span id="scoreBadge" class="badge">SCORE: 0.0</span>
        <span id="livesBadge" class="badge">LIVES: 3</span>
      </div>
    </section>

    <section class="stage-wrap">
      <canvas id="game" width="800" height="640"></canvas>
      <div id="overlay" class="overlay"></div>
    </section>

    <section class="controls">
      <p>Move: Arcade stick</p>
      <p>Flow: A or Start continues, L = Regular, R = Liquid, B = back</p>
      <p>In round: Start or Select opens menu, Start+Select returns to chooser</p>
    </section>
  </main>
`;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const modeBadge = document.getElementById("modeBadge");
const queueBadge = document.getElementById("queueBadge");
const scoreBadge = document.getElementById("scoreBadge");
const livesBadge = document.getElementById("livesBadge");

const TILE = 22;
const ROWS = 24;
const COLS = 31;
const OFFSET_X = (canvas.width - COLS * TILE) / 2;
const OFFSET_Y = 64;

const STEP_MS = 95;
const GHOST_STEP_MS = 120;
const POWER_MS = 6000;
const QUEUE_MIN_MS = 8000;
const QUEUE_MAX_MS = 25000;
const QUEUE_MEAN_MS = 16500;
const QUEUE_STD_MS = 3200;
const GAMEPAD_DEADZONE = 0.45;
const HOME_URL = "./index.html";
const CHOMP_SCORE = 0.3;
const GHOST_SCORE = 2;
const START_LIVES = 3;

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

const OPP = { left: "right", right: "left", up: "down", down: "up" };

const BASE_MAP = [
  "###############################",
  "#o............#............o..#",
  "#.#####.#####.#.#####.#####.###",
  "#.....#.....#.#.#.....#.....#.#",
  "#.###.#.###.#.#.#.###.#.###.#.#",
  "#...#.#...#.#...#.#...#...#...#",
  "###.#.###.#.#####.#.###.#.#####",
  "#...#.....#...#...#.....#.....#",
  "#.#######.### # ###.#######.###",
  "#.......#..G  G  ..#.......#...",
  "#.#####.#.###===###.#.#####.#.#",
  "#.#...#.#.#  ===  #.#.#...#.#.#",
  "#.#.#.#.#.#  ===  #.#.#.#.#.#.#",
  "#...#...#.#.#####.#.#...#...#.#",
  "###.#####.#...#...#.#####.###.#",
  "#...#.....### # ###.....#.....#",
  "#.###.###.....#.....###.###.#.#",
  "#.#...#.#.#########.#.#...#.#.#",
  "#.#.###.#.....#.....#.###.#.#.#",
  "#.#.....#####.#.#####.....#.#.#",
  "#.#######....P....#######.#.#.#",
  "#o.........................o..#",
  "#...#########.###.#########...#",
  "###############################",
];

const GHOST_ARCHETYPES = [
  { name: "blinky", color: "#ff6b6b", scatter: { x: COLS - 2, y: 1 } },
  { name: "pinky", color: "#f7b32b", scatter: { x: 1, y: 1 } },
  { name: "inky", color: "#4ecdc4", scatter: { x: COLS - 2, y: ROWS - 2 } },
  { name: "clyde", color: "#9b5de5", scatter: { x: 1, y: ROWS - 2 } },
];

const EXTRA_PASSAGES = [
  [6, 3],
  [24, 3],
  [12, 6],
  [18, 6],
  [9, 15],
  [21, 15],
  [7, 18],
  [23, 18],
  [29, 2],
  [28, 3],
  [29, 8],
  [19, 9],
  [27, 9],
  [20, 10],
  [28, 10],
  [8, 17],
  [22, 17],
];

const state = {
  phase: "intro",
  running: false,
  map: [],
  pellets: 0,
  score: 0,
  lives: START_LIVES,
  mode: null,
  canCollect: false,
  queueEnd: 0,
  frightenedEnd: 0,
  roundStart: 0,
  player: { x: 14, y: 20, mouth: 0 },
  playerSpawn: { x: 14, y: 20 },
  ghostHome: { x: 14, y: 9 },
  ghosts: [],
  movingDir: "left",
  nextDir: null,
  lastStep: 0,
  lastGhostStep: 0,
  muted: false,
  gamepadButtons: {},
  gamepadAxis: { horizontal: 0, vertical: 0 },
  startSelectHeld: false,
  menuIndex: 0,
  menuOptions: [],
  previousPhase: null,
};

const audio = { ctx: null, master: null, timer: null, step: 0 };

function copyMap() {
  return BASE_MAP.map((r) => r.split(""));
}

function sampleQueueDurationMs() {
  // Truncated normal for bell-curve variation with hard bounds.
  for (let i = 0; i < 8; i += 1) {
    const u1 = Math.max(1e-6, Math.random());
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const value = QUEUE_MEAN_MS + z * QUEUE_STD_MS;
    if (value >= QUEUE_MIN_MS && value <= QUEUE_MAX_MS) return value;
  }
  // Fallback if repeated samples miss bounds.
  return QUEUE_MEAN_MS;
}

function showOverlay(title, lines, footer, tone = "neutral") {
  overlay.innerHTML = `
    <div class="overlay-card tone-${tone}">
      <h2>${title}</h2>
      <div class="overlay-lines">${lines.map((l) => `<p>${l}</p>`).join("")}</div>
      <div class="overlay-footer">${footer}</div>
    </div>
  `;
  overlay.classList.add("show");
}

function hideOverlay() {
  overlay.classList.remove("show");
  overlay.innerHTML = "";
}

function showIntroScreen() {
  state.phase = "intro";
  state.running = false;
  showOverlay(
    "Stake-Man: ETH Chomp",
    [
      "Classic Pac-Man mechanics, ETH-themed pellets.",
      "Regular Staking gates collection behind the entry queue.",
      "Liquid Staking (Lido) starts collecting immediately.",
    ],
    "Press A or Start to continue",
    "neutral",
  );
  updateHUD();
}

function showDifficultyScreen() {
  state.phase = "select";
  state.running = false;
  showOverlay(
    "Select Game Mode",
    [
      "L or move left: Regular Staking - queue delay before chomping ETH.",
      "R or move right: Liquid Staking (Lido) - chomp from the outset.",
    ],
    "Press L or R to start. Press B to go back.",
    "choice",
  );
  updateHUD();
}

function showEndScreen(kind) {
  state.phase = kind;
  state.running = false;
  if (kind === "win") {
    showOverlay(
      "All ETH Chomped",
      [
        `Final score: ${state.score.toFixed(1)}`,
        "Stake-Man cleared the maze.",
      ],
      "Press A or B for game mode. Start or Select opens menu.",
      "success",
    );
  } else {
    showOverlay(
      "Liquidated by Pursuers",
      [
        `Final score: ${state.score.toFixed(1)}`,
        "Try a new run with better pathing.",
      ],
      "Press A or B for game mode. Start or Select opens menu.",
      "danger",
    );
  }
  updateHUD();
}

function openGameMenu() {
  state.previousPhase = state.phase;
  state.phase = "menu";
  state.running = false;
  state.menuOptions = state.previousPhase === "playing"
    ? [
        { label: "Resume", action: () => closeGameMenu() },
        { label: "Restart Round", action: () => startRound(state.mode ?? "regular") },
        { label: "Choose Game Mode", action: () => showDifficultyScreen() },
        { label: "Back To Game Select", action: () => { window.location.href = HOME_URL; } },
      ]
    : [
        { label: "Choose Game Mode", action: () => showDifficultyScreen() },
        { label: "Back To Game Select", action: () => { window.location.href = HOME_URL; } },
      ];
  state.menuIndex = 0;
  renderGameMenu();
}

function renderGameMenu() {
  showOverlay(
    "Game Menu",
    state.menuOptions.map((option, index) => `${index === state.menuIndex ? ">" : " "} ${option.label}`),
    "Stick: move   A/Start: choose   B: close",
    "neutral",
  );
}

function closeGameMenu() {
  state.phase = state.previousPhase || "playing";
  state.running = state.phase === "playing";
  state.previousPhase = null;
  if (state.phase === "playing") {
    hideOverlay();
    updateHUD();
  } else if (state.phase === "win" || state.phase === "gameover") {
    showEndScreen(state.phase);
  } else if (state.phase === "select") {
    showDifficultyScreen();
  } else {
    showIntroScreen();
  }
}

function moveMenu(delta) {
  if (state.phase !== "menu") return;
  state.menuIndex = (state.menuIndex + delta + state.menuOptions.length) % state.menuOptions.length;
  renderGameMenu();
}

function activateMenuChoice() {
  if (state.phase !== "menu") return;
  state.menuOptions[state.menuIndex]?.action?.();
}

function isWall(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
  const c = state.map[y][x];
  return c === "#" || c === "=";
}

function canMove(x, y, dir) {
  const d = DIRS[dir];
  return !isWall(x + d.x, y + d.y);
}

function resetBoard(resetScore = true) {
  state.map = copyMap();
  for (const [x, y] of EXTRA_PASSAGES) {
    if (state.map[y]?.[x] === "#") state.map[y][x] = ".";
  }
  state.ghosts = [];
  state.pellets = 0;

  let px = 14;
  let py = 20;
  const spawns = [];

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const c = state.map[y][x];
      if (c === "." || c === "o") state.pellets += 1;
      if (c === "P") {
        px = x;
        py = y;
        state.map[y][x] = " ";
      }
      if (c === "G") {
        spawns.push({ x, y });
        state.map[y][x] = " ";
      }
    }
  }

  while (spawns.length < 4) {
    const i = spawns.length;
    spawns.push({ x: state.ghostHome.x + (i % 2 === 0 ? -1 : 1), y: state.ghostHome.y + (i > 1 ? 1 : 0) });
  }

  state.playerSpawn = { x: px, y: py };
  state.player = { x: px, y: py, mouth: 0 };
  state.movingDir = "left";
  state.nextDir = null;

  state.ghosts = spawns.slice(0, 4).map((spawn, i) => ({
    x: spawn.x,
    y: spawn.y,
    dir: i % 2 === 0 ? "left" : "right",
    frightened: false,
    deadUntil: 0,
    personality: GHOST_ARCHETYPES[i].name,
    color: GHOST_ARCHETYPES[i].color,
    scatter: GHOST_ARCHETYPES[i].scatter,
  }));

  state.canCollect = state.mode === "liquid";
  state.queueEnd = performance.now() + (state.mode === "regular" ? sampleQueueDurationMs() : 0);
  state.frightenedEnd = 0;
  state.roundStart = performance.now();

  if (resetScore) {
    state.score = 0;
    state.lives = START_LIVES;
  }

  state.running = true;
  state.phase = "playing";
  hideOverlay();
  updateHUD();
}

function updateHUD(now = performance.now()) {
  if (state.phase === "intro" || state.phase === "select") {
    modeBadge.textContent = "MODE: SELECT DIFFICULTY";
    queueBadge.textContent = "QUEUE: --";
    queueBadge.classList.remove("is-active");
  } else {
    modeBadge.textContent = state.mode === "regular" ? "MODE: REGULAR STAKING" : "MODE: LIQUID STAKING (LIDO)";
    if (state.mode === "regular" && !state.canCollect) {
      queueBadge.textContent = `QUEUE: ${Math.max(0, Math.ceil((state.queueEnd - now) / 1000))}s`;
      queueBadge.classList.add("is-active");
    } else if (state.mode === "liquid") {
      queueBadge.textContent = "QUEUE: BYPASSED";
      queueBadge.classList.remove("is-active");
    } else {
      queueBadge.textContent = "QUEUE: 0s";
      queueBadge.classList.remove("is-active");
    }
  }

  scoreBadge.textContent = `SCORE: ${state.score.toFixed(1)}`;
  livesBadge.textContent = `LIVES: ${state.lives}`;
}

function drawEth(x, y, s, a = "#e6ebff", b = "#a7bbff") {
  const h = s / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = a;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(h * 0.65, -h * 0.06);
  ctx.lineTo(0, h * 0.28);
  ctx.lineTo(-h * 0.65, -h * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = b;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.38);
  ctx.lineTo(h * 0.65, h * 0.02);
  ctx.lineTo(0, h);
  ctx.lineTo(-h * 0.65, h * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPacPlayer(x, y, dir, mouth) {
  let angle = 0;
  if (dir === "left") angle = Math.PI;
  if (dir === "up") angle = -Math.PI / 2;
  if (dir === "down") angle = Math.PI / 2;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "#64c8ff";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 10, mouth, Math.PI * 2 - mouth);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLidoRunner(x, y, dir, now) {
  const bob = Math.sin(now / 140) * 1.1;
  const glow = 0.35 + 0.2 * (Math.sin(now / 200) * 0.5 + 0.5);

  ctx.save();
  ctx.translate(x, y + bob);

  // Soft directional glow
  ctx.fillStyle = `rgba(132, 202, 255, ${glow})`;
  ctx.beginPath();
  ctx.ellipse(-2, 0, 12, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Lido circle mark
  const ring = ctx.createRadialGradient(-2, -1, 1, -2, 0, 11.5);
  ring.addColorStop(0, "#d2efff");
  ring.addColorStop(1, "#65bff5");
  ctx.fillStyle = ring;
  ctx.strokeStyle = "#0d2f54";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-2, 1, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Lido droplet top
  ctx.fillStyle = "#9ad7fb";
  ctx.strokeStyle = "#0d2f54";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-2, -17);
  ctx.lineTo(6, -7);
  ctx.lineTo(-2, -4);
  ctx.lineTo(-10, -7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Tiny motion streak behind direction
  const streak = 0.35 + 0.25 * (Math.sin(now / 90) * 0.5 + 0.5);
  ctx.strokeStyle = `rgba(167,223,255,${streak})`;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-15, -3);
  ctx.lineTo(-22, -5);
  ctx.moveTo(-15, 2);
  ctx.lineTo(-21, 3);
  ctx.stroke();

  ctx.restore();
}

function drawBoard(now) {
  const queueLocked = state.phase === "playing" && state.mode === "regular" && !state.canCollect && state.running;
  ctx.fillStyle = "#07101f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(OFFSET_X, OFFSET_Y);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const c = state.map[y][x];
      const px = x * TILE;
      const py = y * TILE;

      if (c === "#") {
        ctx.fillStyle = "#173663";
        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      }
      if (c === "=") {
        ctx.fillStyle = "#375f8e";
        ctx.fillRect(px + 3, py + TILE / 2 - 2, TILE - 6, 4);
      }
      if (c === ".") {
        if (queueLocked) {
          const pulse = 0.55 + 0.45 * (Math.sin(now / 110) * 0.5 + 0.5);
          drawEth(
            px + TILE / 2,
            py + TILE / 2,
            7,
            `rgba(255, ${Math.round(112 + 58 * pulse)}, ${Math.round(112 + 58 * pulse)}, ${0.56 + 0.33 * pulse})`,
            `rgba(255, ${Math.round(64 + 30 * pulse)}, ${Math.round(64 + 30 * pulse)}, ${0.48 + 0.32 * pulse})`,
          );
        } else {
          drawEth(px + TILE / 2, py + TILE / 2, 7, "#d7e4ff", "#9eb4ff");
        }
      }
      if (c === "o") {
        if (queueLocked) {
          const pulse = 0.55 + 0.45 * (Math.sin(now / 100) * 0.5 + 0.5);
          drawEth(
            px + TILE / 2,
            py + TILE / 2,
            13,
            `rgba(255, ${Math.round(130 + 70 * pulse)}, ${Math.round(130 + 70 * pulse)}, ${0.62 + 0.32 * pulse})`,
            `rgba(255, ${Math.round(72 + 38 * pulse)}, ${Math.round(72 + 38 * pulse)}, ${0.56 + 0.34 * pulse})`,
          );
          ctx.strokeStyle = `rgba(255,95,95,${0.35 + 0.45 * pulse})`;
        } else {
          drawEth(px + TILE / 2, py + TILE / 2, 13, "#f2fbff", "#8cc7ff");
          ctx.strokeStyle = "rgba(125,226,255,0.55)";
        }
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2, 9 + Math.sin(now / 170) * 1.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  const p = state.player;
  const ppx = p.x * TILE + TILE / 2;
  const ppy = p.y * TILE + TILE / 2;
  const mouth = Math.abs(Math.sin(p.mouth)) * 0.75;
  if (state.mode === "liquid") {
    drawLidoRunner(ppx, ppy, state.movingDir, now);
  } else {
    drawPacPlayer(ppx, ppy, state.movingDir, mouth);
  }

  for (const g of state.ghosts) {
    if (g.deadUntil > now) continue;
    const gx = g.x * TILE + TILE / 2;
    const gy = g.y * TILE + TILE / 2;

    ctx.save();
    ctx.translate(gx, gy);
    ctx.fillStyle = g.frightened ? "#2d4dff" : g.color;
    ctx.beginPath();
    ctx.arc(0, -1, 10, Math.PI, 0);
    ctx.lineTo(10, 9);
    ctx.lineTo(6, 6);
    ctx.lineTo(2, 9);
    ctx.lineTo(-2, 6);
    ctx.lineTo(-6, 9);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-3.5, -2, 2.3, 0, Math.PI * 2);
    ctx.arc(3.5, -2, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g.frightened ? "#9fd4ff" : "#0f1d35";
    ctx.beginPath();
    ctx.arc(-3.2, -1.8, 1, 0, Math.PI * 2);
    ctx.arc(3.2, -1.8, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  if (queueLocked) {
    const wash = 0.05 + 0.06 * (Math.sin(now / 170) * 0.5 + 0.5);
    ctx.fillStyle = `rgba(180, 24, 24, ${wash})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const t = Math.max(0, (state.queueEnd - now) / 1000).toFixed(1);
    ctx.fillStyle = "rgba(3,8,18,0.76)";
    ctx.fillRect(170, 300, 460, 54);
    ctx.strokeStyle = "#4f87c9";
    ctx.strokeRect(170, 300, 460, 54);
    ctx.fillStyle = "#d8ebff";
    ctx.font = "20px Trebuchet MS, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Entry Queue Active: ${t}s`, 400, 334);
  }
}

function eatPellet() {
  if (!state.canCollect) return;
  const c = state.map[state.player.y][state.player.x];
  if (c !== "." && c !== "o") return;

  state.map[state.player.y][state.player.x] = " ";
  state.pellets -= 1;
  state.score += CHOMP_SCORE;
  blip(660, 0.03, 0.07);

  if (c === "o") {
    state.frightenedEnd = performance.now() + POWER_MS;
    for (const g of state.ghosts) g.frightened = true;
    blip(220, 0.1, 0.12, "sawtooth");
  }

  if (state.pellets <= 0) showEndScreen("win");
  updateHUD();
}

function stepPlayer() {
  if (state.nextDir && canMove(state.player.x, state.player.y, state.nextDir)) {
    state.movingDir = state.nextDir;
  }

  if (canMove(state.player.x, state.player.y, state.movingDir)) {
    const d = DIRS[state.movingDir];
    state.player.x += d.x;
    state.player.y += d.y;
    state.player.mouth += 0.8;
    eatPellet();
  }
}

function ghostLegalDirs(g) {
  const dirs = Object.keys(DIRS).filter((dir) => canMove(g.x, g.y, dir));
  if (dirs.length <= 1) return dirs;
  return dirs.filter((d) => d !== OPP[g.dir]);
}

function playerAhead(dist) {
  const d = DIRS[state.movingDir];
  return {
    x: state.player.x + d.x * dist,
    y: state.player.y + d.y * dist,
  };
}

function targetForGhost(g, now) {
  if (g.frightened && now < state.frightenedEnd) return null;

  const elapsed = now - state.roundStart;
  const scatterPhase = elapsed % 26000 < 7000;
  if (scatterPhase) return g.scatter;

  if (g.personality === "blinky") {
    return { x: state.player.x, y: state.player.y };
  }
  if (g.personality === "pinky") {
    return playerAhead(4);
  }
  if (g.personality === "inky") {
    const blinky = state.ghosts.find((x) => x.personality === "blinky") || g;
    const ahead = playerAhead(2);
    return { x: ahead.x + (ahead.x - blinky.x), y: ahead.y + (ahead.y - blinky.y) };
  }

  const dx = state.player.x - g.x;
  const dy = state.player.y - g.y;
  const distance = Math.abs(dx) + Math.abs(dy);
  if (distance > 8) return { x: state.player.x, y: state.player.y };
  return g.scatter;
}

function pickGhostDir(g, now) {
  const dirs = ghostLegalDirs(g);
  if (!dirs.length) return g.dir;

  if (g.frightened && now < state.frightenedEnd) {
    return dirs[Math.floor(Math.random() * dirs.length)];
  }

  const target = targetForGhost(g, now);
  if (!target) return dirs[0];

  let best = dirs[0];
  let bestDist = Infinity;
  for (const dir of dirs) {
    const d = DIRS[dir];
    const nx = g.x + d.x;
    const ny = g.y + d.y;
    const dist = Math.abs(target.x - nx) + Math.abs(target.y - ny);
    if (dist < bestDist) {
      bestDist = dist;
      best = dir;
    }
  }
  return best;
}

function stepGhosts(now) {
  const frightened = now < state.frightenedEnd;

  for (const g of state.ghosts) {
    if (g.deadUntil > now) continue;
    g.frightened = frightened;
    g.dir = pickGhostDir(g, now);

    if (canMove(g.x, g.y, g.dir)) {
      const d = DIRS[g.dir];
      g.x += d.x;
      g.y += d.y;
    }
  }
}

function checkHits(now) {
  for (const g of state.ghosts) {
    if (g.deadUntil > now) continue;
    if (g.x !== state.player.x || g.y !== state.player.y) continue;

    if (g.frightened) {
      state.score += GHOST_SCORE;
      g.deadUntil = now + 2000;
      g.x = state.ghostHome.x;
      g.y = state.ghostHome.y;
      g.dir = "left";
      blip(120, 0.18, 0.14, "square");
      updateHUD();
      continue;
    }

    state.lives -= 1;
    blip(80, 0.2, 0.22, "sawtooth");
    updateHUD();

    if (state.lives <= 0) {
      showEndScreen("gameover");
      return;
    }

    state.player.x = state.playerSpawn.x;
    state.player.y = state.playerSpawn.y;
    state.movingDir = "left";
    state.nextDir = null;
    return;
  }
}

function startRound(mode) {
  state.mode = mode;
  resetBoard(true);
}

function getPrimaryGamepad() {
  const pads = navigator.getGamepads?.() ?? [];
  return pads.find((pad) => pad?.connected) ?? null;
}

function consumePadEdge(name, isDown) {
  const wasDown = !!state.gamepadButtons[name];
  state.gamepadButtons[name] = isDown;
  return isDown && !wasDown;
}

function axisDirection(value, negative, positive) {
  if (value <= -GAMEPAD_DEADZONE) return negative;
  if (value >= GAMEPAD_DEADZONE) return positive;
  return null;
}

function pollGamepad() {
  const pad = getPrimaryGamepad();
  if (!pad) {
    state.gamepadAxis.horizontal = 0;
    state.gamepadAxis.vertical = 0;
    state.startSelectHeld = false;
    return;
  }

  const primaryPressed =
    consumePadEdge("primary0", !!pad.buttons[0]?.pressed) ||
    consumePadEdge("primary2", !!pad.buttons[2]?.pressed) ||
    consumePadEdge("start", !!pad.buttons[9]?.pressed);
  const resetPressed = consumePadEdge("reset", !!pad.buttons[8]?.pressed);
  const mutePressed = consumePadEdge("mute", !!pad.buttons[3]?.pressed);
  const backPressed = consumePadEdge("back", !!pad.buttons[1]?.pressed);
  const regularPressed = consumePadEdge("regular", !!pad.buttons[4]?.pressed);
  const liquidPressed = consumePadEdge("liquid", !!pad.buttons[5]?.pressed);

  if (mutePressed) {
    state.muted = !state.muted;
    if (audio.master) audio.master.gain.value = state.muted ? 0 : 0.24;
  }

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

  const horizontalEdge = horizontalState !== 0 && horizontalState !== state.gamepadAxis.horizontal;
  const verticalEdge = verticalState !== 0 && verticalState !== state.gamepadAxis.vertical;
  state.gamepadAxis.horizontal = horizontalState;
  state.gamepadAxis.vertical = verticalState;

  const startSelectHeld = !!pad.buttons[8]?.pressed && !!pad.buttons[9]?.pressed;
  const startSelectPressed = startSelectHeld && !state.startSelectHeld;
  state.startSelectHeld = startSelectHeld;

  if (startSelectPressed) {
    window.location.href = HOME_URL;
    return;
  }

  if (state.phase === "intro") {
    if (primaryPressed) showDifficultyScreen();
    return;
  }

  if (state.phase === "select") {
    if (regularPressed || (horizontalEdge && horizontalState < 0)) handleDifficultyChoice("regular");
    if (liquidPressed || (horizontalEdge && horizontalState > 0)) handleDifficultyChoice("liquid");
    if (primaryPressed) handleDifficultyChoice(horizontalState < 0 ? "regular" : "liquid");
    if (backPressed) showIntroScreen();
    return;
  }

  if (state.phase === "menu") {
    if (verticalEdge) moveMenu(verticalState < 0 ? -1 : 1);
    if (primaryPressed) activateMenuChoice();
    if (backPressed || resetPressed) {
      if (state.previousPhase === "win" || state.previousPhase === "gameover") {
        showDifficultyScreen();
      } else {
        closeGameMenu();
      }
    }
    return;
  }

  if (state.phase === "win" || state.phase === "gameover") {
    if (primaryPressed || backPressed) showDifficultyScreen();
    if (resetPressed) openGameMenu();
    return;
  }

  if (regularPressed) handleDifficultyChoice("regular");
  if (liquidPressed) handleDifficultyChoice("liquid");
  if (resetPressed || consumePadEdge("menuStart", !!pad.buttons[9]?.pressed)) openGameMenu();

  if (horizontalEdge) state.nextDir = horizontalState < 0 ? "left" : "right";
  if (verticalEdge) state.nextDir = verticalState < 0 ? "up" : "down";
}

function gameLoop(now) {
  pollGamepad();

  if (state.running && state.phase === "playing") {
    if (state.mode === "regular" && !state.canCollect && now >= state.queueEnd) {
      state.canCollect = true;
      blip(520, 0.12, 0.09, "triangle");
    }

    if (now - state.lastStep >= STEP_MS) {
      state.lastStep = now;
      stepPlayer();
    }

    if (now - state.lastGhostStep >= GHOST_STEP_MS) {
      state.lastGhostStep = now;
      stepGhosts(now);
    }

    checkHits(now);
    updateHUD(now);
  }

  drawBoard(now);
  requestAnimationFrame(gameLoop);
}

function ensureAudio() {
  if (audio.ctx) {
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    return;
  }

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audio.ctx = new AC();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = state.muted ? 0 : 0.24;
  audio.master.connect(audio.ctx.destination);
}

function blip(freq = 440, gain = 0.06, dur = 0.08, type = "square") {
  if (state.muted) return;
  ensureAudio();
  if (!audio.ctx) return;

  const t0 = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(audio.master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function note(freq, len = 0.16, t = 0, type = "square", vol = 0.04) {
  if (!audio.ctx || state.muted) return;
  const n0 = audio.ctx.currentTime + t;
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, n0);
  g.gain.setValueAtTime(0.0001, n0);
  g.gain.exponentialRampToValueAtTime(vol, n0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, n0 + len);
  osc.connect(g).connect(audio.master);
  osc.start(n0);
  osc.stop(n0 + len + 0.02);
}

function startMusic() {
  ensureAudio();
  if (!audio.ctx || audio.timer) return;

  const lead = [262, 330, 392, 523, 392, 330, 262, 196, 220, 262, 330, 392, 330, 262, 220, 196];
  const bass = [131, 131, 147, 147, 165, 165, 147, 147];

  audio.step = 0;
  audio.timer = setInterval(() => {
    if (!state.running || state.muted) return;
    const i = audio.step % lead.length;
    const b = audio.step % bass.length;
    note(lead[i], 0.12, 0, "square", 0.033);
    note(lead[(i + 8) % lead.length] * 0.5, 0.11, 0.07, "triangle", 0.02);
    note(bass[b], 0.16, 0, "sawtooth", 0.019);
    audio.step += 1;
  }, 180);
}

function handleDifficultyChoice(mode) {
  startRound(mode);
}

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) e.preventDefault();

  if (key === "m") {
    state.muted = !state.muted;
    if (audio.master) audio.master.gain.value = state.muted ? 0 : 0.24;
  }

  if (state.phase === "intro") {
    if (key === " " || key === "enter") showDifficultyScreen();
    return;
  }

  if (state.phase === "select") {
    if (key === "1") handleDifficultyChoice("regular");
    if (key === "2") handleDifficultyChoice("liquid");
    if (key === "escape" || key === "b") showIntroScreen();
    return;
  }

  if (state.phase === "menu") {
    if (key === "arrowup" || key === "w") moveMenu(-1);
    if (key === "arrowdown" || key === "s") moveMenu(1);
    if (key === " " || key === "enter") activateMenuChoice();
    if (key === "escape" || key === "b") closeGameMenu();
    return;
  }

  if (state.phase === "win" || state.phase === "gameover") {
    if (key === " " || key === "enter" || key === "r") showDifficultyScreen();
    return;
  }

  if (key === "1") handleDifficultyChoice("regular");
  if (key === "2") handleDifficultyChoice("liquid");
  if (key === "r") showDifficultyScreen();
  if (key === "escape" || key === "tab") openGameMenu();
  if (key === "h") window.location.href = HOME_URL;

  if (key === "arrowleft" || key === "a") state.nextDir = "left";
  if (key === "arrowright" || key === "d") state.nextDir = "right";
  if (key === "arrowup" || key === "w") state.nextDir = "up";
  if (key === "arrowdown" || key === "s") state.nextDir = "down";
});

window.addEventListener("pointerdown", ensureAudio, { once: true });

state.map = copyMap();
startMusic();
showIntroScreen();
requestAnimationFrame((t) => {
  state.lastStep = t;
  state.lastGhostStep = t;
  requestAnimationFrame(gameLoop);
});
