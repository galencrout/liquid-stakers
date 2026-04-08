import "./style.css";

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const ROUND_LENGTH_MS = 60_000;
const PLAYER_SPEED = 380;
const BULLET_SPEED = 760;
const BULLET_COOLDOWN_MS = 180;
const ENEMY_BULLET_SPEED = 260;
const ENEMY_DROP = 18;
const ENEMY_ZONE_Y = 500;
const GAMEPAD_DEADZONE = 0.45;
const UI_DEBOUNCE_MS = 260;
const MAX_LEVEL = 20;
const HOME_URL = "./index.html";
const HIGH_SCORE_KEY = "liquid-stakers-high-score";
const LEADERBOARD_KEY = "liquid-stakers-leaderboard";
const MUSIC_STEP_TIME = 0.18;
const MUSIC_PATTERN = [
  { lead: 523.25, bass: 130.81, harmony: 392.0, accent: true },
  { lead: 587.33, bass: 130.81, harmony: 440.0, accent: false },
  { lead: 659.25, bass: 146.83, harmony: 493.88, accent: false },
  { lead: 698.46, bass: 146.83, harmony: 523.25, accent: true },
  { lead: 783.99, bass: 164.81, harmony: 587.33, accent: false },
  { lead: 698.46, bass: 164.81, harmony: 523.25, accent: false },
  { lead: 659.25, bass: 174.61, harmony: 493.88, accent: true },
  { lead: 587.33, bass: 174.61, harmony: 440.0, accent: false },
  { lead: 523.25, bass: 196.0, harmony: 392.0, accent: true },
  { lead: 587.33, bass: 196.0, harmony: 440.0, accent: false },
  { lead: 659.25, bass: 174.61, harmony: 493.88, accent: false },
  { lead: 783.99, bass: 174.61, harmony: 587.33, accent: true },
  { lead: 880.0, bass: 164.81, harmony: 659.25, accent: false },
  { lead: 783.99, bass: 164.81, harmony: 587.33, accent: false },
  { lead: 698.46, bass: 146.83, harmony: 523.25, accent: true },
  { lead: 659.25, bass: 130.81, harmony: 493.88, accent: false },
];

const INTRO_STAGES = [
  {
    title: "Liquid Stakers",
    body:
      "Welcome to Liquid Stakers, a game about the opportunity cost of waiting through the Ethereum exit queue.",
    hint: "Press Space to continue.",
  },
  {
    title: "Why It Matters",
    body:
      "Traditional staking positions can take days or months to unwind. Lido stVaults let you unwind instantly with stETH, and skip the Ethereum Withdrawal Queue",
    hint: "Press Space to continue.",
  },
  {
    title: "Rules",
    body:
      "Survive sixty seconds and clear the queue pressure. Blue enemies take one shot, red take two, green take three. If they reach your validator zone, the round ends.",
    hint: "Press Space to continue.",
  },
];

const MODES = [
  {
    key: "delegated",
    label: "Delegated Staking",
    shortLabel: "Delegated",
    copy: "Exit queue lag applies. Inputs arrive late and spikes can get worse without notice.",
    badge: "Exit Queue In Effect",
    hudColor: "#ffb2a1",
    lagMin: 800,
    lagMax: 2000,
    spikeMin: 750,
    spikeMax: 1450,
    badgeFill: "rgba(86, 35, 35, 0.9)",
    badgeStroke: "#de7166",
  },
  {
    key: "stvaults",
    label: "stVaults",
    shortLabel: "stVaults",
    copy: "Instant control. No queue lag. Markets may remain dynamic, but your inputs do not wait.",
    badge: "Instant Control",
    hudColor: "#9fe6ff",
    lagMin: 0,
    lagMax: 0,
    spikeMin: 0,
    spikeMax: 0,
    badgeFill: "rgba(24, 65, 102, 0.9)",
    badgeStroke: "#5fc8ff",
  },
];

const app = document.querySelector("#app");
app.innerHTML = `
  <main class="stakers-shell">
    <section class="stakers-frame">
      <div class="stakers-topbar">
        <div class="stakers-brand">LIQUID STAKERS</div>
        <div class="stakers-subbrand">ETH EXIT QUEUE SIMULATOR</div>
      </div>
      <section class="stakers-stage">
        <canvas class="stakers-canvas" width="${GAME_WIDTH}" height="${GAME_HEIGHT}" aria-label="Liquid Stakers game"></canvas>
        <div class="stakers-hud">
          <div class="stakers-chip"><span class="stakers-chip-label">MODE</span><span class="stakers-chip-value" data-hud="mode">Delegated</span></div>
          <div class="stakers-chip"><span class="stakers-chip-label">LEVEL</span><span class="stakers-chip-value" data-hud="level">1</span></div>
          <div class="stakers-chip"><span class="stakers-chip-label">SCORE</span><span class="stakers-chip-value" data-hud="score">0</span></div>
          <div class="stakers-chip"><span class="stakers-chip-label">TIME</span><span class="stakers-chip-value" data-hud="time">60.0s</span></div>
          <div class="stakers-chip"><span class="stakers-chip-label">LAG</span><span class="stakers-chip-value" data-hud="lag">0ms</span></div>
          <div class="stakers-chip"><span class="stakers-chip-label">STATUS</span><span class="stakers-chip-value" data-hud="status">Standby</span></div>
        </div>
        <div class="stakers-overlay" data-overlay>
          <div class="stakers-overlay-card" data-overlay-card></div>
        </div>
      </section>
      <div class="stakers-footer" data-footer-hint>Arcade: stick moves, A fires, Start opens menu.</div>
    </section>
  </main>
`;

const canvas = document.querySelector(".stakers-canvas");
const ctx = canvas.getContext("2d");
const overlay = document.querySelector("[data-overlay]");
const overlayCard = document.querySelector("[data-overlay-card]");
const footerHint = document.querySelector("[data-footer-hint]");

const hud = {
  mode: document.querySelector('[data-hud="mode"]'),
  level: document.querySelector('[data-hud="level"]'),
  score: document.querySelector('[data-hud="score"]'),
  time: document.querySelector('[data-hud="time"]'),
  lag: document.querySelector('[data-hud="lag"]'),
  status: document.querySelector('[data-hud="status"]'),
};

const input = {
  keys: Object.create(null),
  gamepadButtons: Object.create(null),
  horizontal: 0,
  vertical: 0,
  fireHeld: false,
  lastUiActionAt: 0,
};

const ui = {
  introStage: 0,
  selectedMode: 0,
  pauseIndex: 0,
  endIndex: 0,
};

const state = {
  screen: "intro",
  activeMode: MODES[0],
  roundStartedAt: 0,
  elapsedMs: 0,
  roundEnded: false,
  level: 1,
  score: 0,
  currentLagMs: 0,
  baseLagMs: 0,
  inLagSpike: false,
  nextLagSpikeAt: 0,
  lagSpikeUntil: 0,
  inputQueue: [],
  lastRawMove: 0,
  appliedMove: 0,
  lastFireAt: -BULLET_COOLDOWN_MS,
  player: {
    x: GAME_WIDTH * 0.5,
    y: 540,
    width: 38,
    height: 50,
    shield: 3,
    hitFlash: 0,
  },
  bullets: [],
  enemyBullets: [],
  enemies: [],
  enemyDirection: 1,
  enemySpeed: 52,
  enemyFireCooldown: 980,
  nextEnemyShotAt: 0,
  effects: [],
  stars: createStars(),
  endReason: "",
  message: "",
  messageAlpha: 0,
  bestBeforeRun: 0,
  pendingLeaderboardEntry: false,
  hudCache: { mode: "", level: "", score: "", time: "", lag: "", status: "" },
  nextHudRefreshAt: 0,
  pauseStartedAt: 0,
  muted: false,
};

const audio = createAudio();
const storage = createStorage();
const leaderboardState = {
  mode: null,
  score: 0,
  letters: ["A", "A", "A", "A", "A"],
  index: 0,
};
const LEADERBOARD_SUBMIT_INDEX = leaderboardState.letters.length;

const modeLabelByKey = Object.fromEntries(MODES.map((mode) => [mode.key, mode.shortLabel]));

showIntro();
updateHud(true);
requestAnimationFrame(frame);

window.addEventListener("keydown", (event) => {
  input.keys[event.code] = true;
  if (event.repeat) return;
  if (["Space", "Enter", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "KeyH" && state.screen === "playing") {
    toggleHelp();
    return;
  }

  if (event.code === "KeyM") {
    audio.toggleMute();
    state.muted = audio.isMuted();
    return;
  }

  if (state.screen === "playing") {
    if (event.code === "Enter" || event.code === "Escape") {
      showPauseMenu();
    }
    return;
  }

  if (state.screen === "intro") {
    handleIntroKey(event.code);
    return;
  }

  if (state.screen === "pause") {
    handlePauseKey(event.code);
    return;
  }

  if (state.screen === "help") {
    if (event.code === "Escape" || event.code === "Enter" || event.code === "Space") {
      closeHelp();
    }
    return;
  }

  if (state.screen === "gameover") {
    if (state.pendingLeaderboardEntry) {
      if (event.code === "ArrowLeft") {
        moveLeaderboardLetterIndex(-1);
        return;
      }
      if (event.code === "ArrowRight") {
        moveLeaderboardLetterIndex(1);
        return;
      }
      if (event.code === "ArrowUp") {
        cycleLeaderboardLetter(1);
        return;
      }
      if (event.code === "ArrowDown") {
        cycleLeaderboardLetter(-1);
        return;
      }
      if (event.code === "Enter" || event.code === "Space") {
        trySubmitLeaderboardEntry();
        return;
      }
    }
    handleGameOverKey(event.code);
  }
});

window.addEventListener("keyup", (event) => {
  input.keys[event.code] = false;
});

canvas.addEventListener("pointerdown", () => {
  if (state.screen === "playing") {
    handleFireInput(performance.now());
  } else if (state.screen === "intro" && ui.introStage >= INTRO_STAGES.length) {
    startGame(MODES[ui.selectedMode]);
  }
});

overlay.addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!target) return;
  const action = target.getAttribute("data-action");
  if (action === "next-intro") {
    ui.introStage = Math.min(INTRO_STAGES.length, ui.introStage + 1);
    showIntro();
  } else if (action === "pick-mode") {
    ui.selectedMode = Number.parseInt(target.getAttribute("data-index") || "0", 10) || 0;
    startGame(MODES[ui.selectedMode]);
  } else if (action === "resume") {
    resumeGame();
  } else if (action === "restart") {
    startGame(state.activeMode);
  } else if (action === "mode-select") {
    resetToIntro(true);
  } else if (action === "home") {
    window.location.href = HOME_URL;
  } else if (action === "close-help") {
    closeHelp();
  } else if (action === "save-leaderboard" || action === "entry-submit") {
    saveLeaderboardInitials();
  } else if (action === "entry-slot") {
    leaderboardState.index = Number.parseInt(target.getAttribute("data-index") || "0", 10) || 0;
    refreshLeaderboardPicker();
  }
});

function handleIntroKey(code) {
  if (!consumeUiAction()) return;
  if (ui.introStage < INTRO_STAGES.length) {
    if (code !== "Escape") {
      ui.introStage += 1;
      showIntro();
    }
    return;
  }

  if (code === "ArrowLeft") {
    ui.selectedMode = 0;
    showIntro();
    return;
  }
  if (code === "ArrowRight") {
    ui.selectedMode = 1;
    showIntro();
    return;
  }
  if (code === "Space" || code === "Enter") {
    startGame(MODES[ui.selectedMode]);
  }
}

function handlePauseKey(code) {
  if (!consumeUiAction()) return;
  if (code === "ArrowUp") {
    ui.pauseIndex = (ui.pauseIndex + 3) % 4;
    showPauseMenu();
  } else if (code === "ArrowDown") {
    ui.pauseIndex = (ui.pauseIndex + 1) % 4;
    showPauseMenu();
  } else if (code === "Enter" || code === "Space") {
    activatePauseItem();
  } else if (code === "Escape") {
    resumeGame();
  }
}

function handleGameOverKey(code) {
  if (!consumeUiAction()) return;
  if (code === "ArrowLeft") {
    ui.endIndex = 0;
    showGameOver();
    return;
  }
  if (code === "ArrowRight") {
    ui.endIndex = 1;
    showGameOver();
    return;
  }
  if (code === "Enter" || code === "Space" || code === "Escape") {
    resetToIntro(true);
  }
}

function frame(now) {
  pollGamepad();
  if (state.screen === "playing") updateGame(now);
  render(now);
  requestAnimationFrame(frame);
}

function updateGame(now) {
  if (!state.roundStartedAt) {
    state.roundStartedAt = now;
    state.nextEnemyShotAt = now + state.enemyFireCooldown;
  }

  state.elapsedMs = now - state.roundStartedAt;
  sampleLag(now);
  captureQueuedInput(now);
  applyQueuedInput(now);

  state.player.x += state.appliedMove * PLAYER_SPEED * (1 / 60);
  state.player.x = clamp(state.player.x, 36, GAME_WIDTH - 36);
  state.player.hitFlash = Math.max(0, state.player.hitFlash - 1 / 12);

  updateStars();
  updateBullets();
  updateEnemyBullets();
  updateEnemies(now);
  resolveCollisions();
  updateEffects();

  if (state.elapsedMs >= ROUND_LENGTH_MS) {
    endRound("Time expired while queue pressure remained.");
    return;
  }

  if (state.player.shield <= 0) {
    endRound("Your validator defense collapsed under queue pressure.");
    return;
  }

  if (now >= state.nextHudRefreshAt) {
    updateHud();
    state.nextHudRefreshAt = now + 100;
  }
}

function sampleLag(now) {
  if (state.activeMode.key === "stvaults") {
    state.baseLagMs = 0;
    state.currentLagMs = 0;
    state.inLagSpike = false;
    return;
  }

  ensureDelegatedLag(now);

  if (!state.inLagSpike && now >= state.nextLagSpikeAt) {
    state.inLagSpike = true;
    state.lagSpikeUntil = now + randomBetween(650, 1200);
    state.currentLagMs = state.baseLagMs + randomBetween(state.activeMode.spikeMin, state.activeMode.spikeMax);
    queueMessage("Lag Spike");
  }

  if (state.inLagSpike && now >= state.lagSpikeUntil) {
    state.inLagSpike = false;
    state.baseLagMs = randomBetween(state.activeMode.lagMin, state.activeMode.lagMax);
    state.currentLagMs = state.baseLagMs;
    state.nextLagSpikeAt = now + randomBetween(2400, 5200);
  }

  if (!state.inLagSpike) {
    state.currentLagMs = state.baseLagMs;
  }
}

function ensureDelegatedLag(now) {
  if (state.activeMode.key === "stvaults" || state.baseLagMs) return;
  state.baseLagMs = randomBetween(state.activeMode.lagMin, state.activeMode.lagMax);
  state.currentLagMs = state.baseLagMs;
  state.nextLagSpikeAt = now + randomBetween(2600, 5200);
}

function captureQueuedInput(now) {
  const move = getRawMove();
  const fire = isFirePressed();

  if (state.activeMode.key === "stvaults") {
    state.appliedMove = move;
    if (fire && !input.fireHeld) attemptFire(now);
    input.fireHeld = fire;
    return;
  }

  if (move !== state.lastRawMove) {
    state.lastRawMove = move;
    state.inputQueue.push({ applyAt: now + state.currentLagMs, move });
  }

  if (fire && !input.fireHeld) {
    state.inputQueue.push({ applyAt: now + state.currentLagMs, fire: true });
  }

  input.fireHeld = fire;
}

function handleFireInput(now) {
  if (state.activeMode.key === "stvaults") {
    attemptFire(now);
    return;
  }

  ensureDelegatedLag(now);
  state.inputQueue.push({ applyAt: now + state.currentLagMs, fire: true });
}

function applyQueuedInput(now) {
  let write = 0;
  for (let index = 0; index < state.inputQueue.length; index += 1) {
    const item = state.inputQueue[index];
    if (item.applyAt <= now) {
      if (typeof item.move === "number") state.appliedMove = item.move;
      if (item.fire) attemptFire(now);
    } else {
      state.inputQueue[write] = item;
      write += 1;
    }
  }
  state.inputQueue.length = write;
}

function attemptFire(now) {
  if (now - state.lastFireAt < BULLET_COOLDOWN_MS) return;
  state.lastFireAt = now;
  state.bullets.push({ x: state.player.x, y: state.player.y - 26, width: 5, height: 18 });
  state.effects.push({ type: "muzzle", x: state.player.x, y: state.player.y - 24, life: 10 });
  audio.shoot();
}

function updateBullets() {
  let write = 0;
  for (const bullet of state.bullets) {
    bullet.y -= BULLET_SPEED / 60;
    if (bullet.y + bullet.height > -20) {
      state.bullets[write] = bullet;
      write += 1;
    }
  }
  state.bullets.length = write;
}

function updateEnemyBullets() {
  let write = 0;
  for (const bullet of state.enemyBullets) {
    bullet.y += ENEMY_BULLET_SPEED / 60;
    bullet.x += bullet.vx;
    if (bullet.y < GAME_HEIGHT + 24) {
      state.enemyBullets[write] = bullet;
      write += 1;
    }
  }
  state.enemyBullets.length = write;
}

function updateEnemies(now) {
  if (!state.enemies.length) return;

  let minX = Infinity;
  let maxX = -Infinity;
  let lowestY = 0;

  for (const enemy of state.enemies) {
    enemy.x += state.enemyDirection * state.enemySpeed * (1 / 60);
    enemy.anim += enemy.animSpeed;
    minX = Math.min(minX, enemy.x - enemy.width * 0.5);
    maxX = Math.max(maxX, enemy.x + enemy.width * 0.5);
    lowestY = Math.max(lowestY, enemy.y + enemy.height * 0.5);
  }

  if (minX <= 34 || maxX >= GAME_WIDTH - 34) {
    state.enemyDirection *= -1;
    for (const enemy of state.enemies) {
      enemy.y += ENEMY_DROP;
    }
    lowestY += ENEMY_DROP;
  }

  if (lowestY >= ENEMY_ZONE_Y) {
    endRound("Enemy front reached your validator zone.");
    return;
  }

  if (now >= state.nextEnemyShotAt) {
    fireEnemyVolley();
    state.nextEnemyShotAt = now + state.enemyFireCooldown;
  }
}

function fireEnemyVolley() {
  const columns = new Map();
  for (const enemy of state.enemies) {
    const key = Math.round(enemy.x / 8);
    const existing = columns.get(key);
    if (!existing || enemy.y > existing.y) columns.set(key, enemy);
  }
  const shooters = [...columns.values()];
  if (!shooters.length) return;
  const count = Math.min(1 + Math.floor((state.level - 1) / 4), 4, shooters.length);
  for (let index = 0; index < count; index += 1) {
    const shooter = shooters[(Math.random() * shooters.length) | 0];
    const aim = clamp((state.player.x - shooter.x) / 260, -1.2, 1.2);
    state.enemyBullets.push({ x: shooter.x, y: shooter.y + 18, width: 6, height: 16, vx: aim });
    state.effects.push({ type: "beam", x: shooter.x, y: shooter.y + 18, life: 14 });
  }
}

function resolveCollisions() {
  let bulletWrite = 0;
  for (const bullet of state.bullets) {
    let hit = false;
    for (let index = 0; index < state.enemies.length; index += 1) {
      const enemy = state.enemies[index];
      if (!rectsOverlap(bullet, enemy)) continue;
      hit = true;
      enemy.hp -= 1;
      enemy.hitFlash = 1;
      state.effects.push({ type: "ring", x: enemy.x, y: enemy.y, life: 14, color: enemy.hp <= 0 ? "#ffe38c" : enemy.accent });
      if (enemy.hp <= 0) {
        state.score += 14 * enemy.maxHp * state.level;
        state.effects.push({ type: "burst", x: enemy.x, y: enemy.y, life: 18, color: enemy.accent });
        state.enemies.splice(index, 1);
        index -= 1;
      }
      break;
    }
    if (!hit) {
      state.bullets[bulletWrite] = bullet;
      bulletWrite += 1;
    }
  }
  state.bullets.length = bulletWrite;

  let enemyBulletWrite = 0;
  for (const bullet of state.enemyBullets) {
    if (rectsOverlap(bullet, state.player)) {
      state.player.shield -= 1;
      state.player.hitFlash = 1;
      state.effects.push({ type: "burst", x: bullet.x, y: bullet.y, life: 18, color: "#ff8f75" });
      queueMessage(state.activeMode.key === "delegated" ? "Exit Queue Punishes Delay" : "Stay Liquid");
      audio.failSoft();
      continue;
    }
    state.enemyBullets[enemyBulletWrite] = bullet;
    enemyBulletWrite += 1;
  }
  state.enemyBullets.length = enemyBulletWrite;

  if (!state.enemies.length) {
    if (state.level >= MAX_LEVEL) {
      endRound(`You cleared all ${MAX_LEVEL} levels before timeout.`);
    } else {
      advanceLevel();
    }
  }
}

function advanceLevel() {
  state.level += 1;
  state.inputQueue.length = 0;
  state.bullets.length = 0;
  state.enemyBullets.length = 0;
  state.appliedMove = 0;
  state.lastRawMove = 0;
  queueMessage(`Level ${state.level}`);
  buildLevel(state.level);
  updateHud(true);
}

function updateEffects() {
  let write = 0;
  for (const effect of state.effects) {
    effect.life -= 1;
    if (effect.type === "ring") effect.radius += 1.25;
    if (effect.type === "burst") effect.radius += 1.8;
    if (effect.life > 0) {
      state.effects[write] = effect;
      write += 1;
    }
  }
  state.effects.length = write;
  state.messageAlpha = Math.max(0, state.messageAlpha - 0.016);
}

function render(now) {
  drawBackground(now);
  drawValidatorZone();
  drawEnemies();
  drawEnemyBullets();
  drawBullets();
  drawPlayer();
  drawEffects();
  drawCenterMessage();
}

function drawBackground(now) {
  const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  gradient.addColorStop(0, "#08101c");
  gradient.addColorStop(0.55, "#101b32");
  gradient.addColorStop(1, "#050813");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  const aurora = ctx.createRadialGradient(130, 120, 20, 130, 120, 340);
  aurora.addColorStop(0, state.activeMode.key === "delegated" ? "rgba(255,120,98,0.18)" : "rgba(72,192,255,0.18)");
  aurora.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = aurora;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = "rgba(10, 18, 32, 0.55)";
  ctx.fillRect(0, 0, GAME_WIDTH, 160);

  for (const star of state.stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = star.color;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(67, 96, 135, 0.18)";
  ctx.lineWidth = 1;
  for (let y = 86; y < 520; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(GAME_WIDTH, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(6, 10, 18, 0.94)";
  ctx.fillRect(0, 520, GAME_WIDTH, 80);
}

function drawValidatorZone() {
  ctx.strokeStyle = state.activeMode.key === "delegated" ? "#d56c60" : "#4ec6ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, ENEMY_ZONE_Y);
  ctx.lineTo(GAME_WIDTH, ENEMY_ZONE_Y);
  ctx.stroke();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(state.player.x, state.player.y);
  const pulse = state.player.hitFlash > 0 ? 1 + state.player.hitFlash * 0.08 : 1;
  ctx.scale(pulse, pulse);
  ctx.globalAlpha = 1 - state.player.hitFlash * 0.18;

  const bodyColor = state.activeMode.key === "delegated" ? "#f2f2ff" : "#ffffff";
  const accent = state.activeMode.key === "delegated" ? "#acb9ff" : "#1ea9ff";
  ctx.shadowBlur = 18;
  ctx.shadowColor = accent;

  if (state.activeMode.key === "delegated") {
    drawEthIcon(ctx, 0, 0, 1.2, bodyColor, accent);
  } else {
    drawLidoIcon(ctx, 0, 0, 1.18, accent, bodyColor);
  }
  ctx.restore();

  drawShieldPips();
}

function drawShieldPips() {
  for (let index = 0; index < 3; index += 1) {
    const filled = index < state.player.shield;
    ctx.fillStyle = filled ? "#9ee4ff" : "rgba(87, 113, 146, 0.32)";
    ctx.fillRect(24 + index * 16, 558, 10, 10);
  }
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    const bob = Math.sin(enemy.anim) * 2;
    const flash = enemy.hitFlash > 0 ? enemy.hitFlash : 0;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - 0.08);

    ctx.save();
    ctx.translate(enemy.x, enemy.y + bob);
    ctx.globalAlpha = 0.88 + flash * 0.12;
    ctx.shadowBlur = 16;
    ctx.shadowColor = enemy.accent;

    if (state.activeMode.key === "delegated") {
      drawEthIcon(ctx, 0, 0, 0.92, enemy.fill, enemy.accent);
    } else {
      drawLidoIcon(ctx, 0, 0, 0.92, enemy.fill, "#ffffff");
    }
    ctx.restore();

    if (enemy.maxHp > 1) {
      ctx.fillStyle = "rgba(7, 14, 24, 0.9)";
      ctx.fillRect(enemy.x - 16, enemy.y + 21, 32, 5);
      ctx.fillStyle = enemy.accent;
      ctx.fillRect(enemy.x - 16, enemy.y + 21, (32 * enemy.hp) / enemy.maxHp, 5);
    }
  }
  ctx.globalAlpha = 1;
}

function drawBullets() {
  for (const bullet of state.bullets) {
    ctx.fillStyle = "#eff8ff";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#9fe6ff";
    ctx.fillRect(bullet.x - bullet.width * 0.5, bullet.y - bullet.height * 0.5, bullet.width, bullet.height);
  }
  ctx.shadowBlur = 0;
}

function drawEnemyBullets() {
  for (const bullet of state.enemyBullets) {
    ctx.fillStyle = "#ffcc88";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#ff9e66";
    ctx.fillRect(bullet.x - bullet.width * 0.5, bullet.y - bullet.height * 0.5, bullet.width, bullet.height);
  }
  ctx.shadowBlur = 0;
}

function drawEffects() {
  for (const effect of state.effects) {
    const alpha = effect.life / (effect.type === "burst" ? 18 : 14);
    ctx.globalAlpha = alpha;
    if (effect.type === "ring") {
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius ?? 8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (effect.type === "burst") {
      ctx.fillStyle = effect.color;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius ?? 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.type === "beam") {
      ctx.strokeStyle = "rgba(255, 198, 112, 0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.x, ENEMY_ZONE_Y);
      ctx.stroke();
    } else if (effect.type === "muzzle") {
      ctx.fillStyle = "rgba(169, 229, 255, 0.7)";
      ctx.fillRect(effect.x - 8, effect.y - 8, 16, 8);
    }
  }
  ctx.globalAlpha = 1;
}

function drawCenterMessage() {
  if (!state.message || state.messageAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = state.messageAlpha;
  ctx.fillStyle = state.activeMode.badgeFill;
  ctx.strokeStyle = state.activeMode.badgeStroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  roundRect(ctx, 250, 78, 300, 42, 14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f8fcff";
  ctx.font = "700 18px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(state.message, GAME_WIDTH * 0.5, 99);
  ctx.restore();
}

function showIntro() {
  state.screen = "intro";
  state.roundEnded = false;
  overlayCard.setAttribute("data-view", "intro");
  overlay.classList.remove("is-hidden");

  if (ui.introStage < INTRO_STAGES.length) {
    const stage = INTRO_STAGES[ui.introStage];
    overlayCard.innerHTML = `
      <div class="stakers-overlay-kicker">LIQUID STAKERS</div>
      <h1 class="stakers-overlay-title">${stage.title}</h1>
      <p class="stakers-overlay-copy">${stage.body}</p>
      <div class="stakers-overlay-hint">${stage.hint}</div>
      <button class="stakers-button stakers-button--primary" type="button" data-action="next-intro">Continue</button>
    `;
    footerHint.textContent = "Keyboard: press Space to continue. Arcade: press any button to continue.";
    return;
  }

  overlayCard.innerHTML = `
    <div class="stakers-overlay-kicker">CHOOSE A GAME MODE</div>
    <h1 class="stakers-overlay-title">Select your game mode.</h1>
    <div class="stakers-mode-grid">
      ${MODES.map(
        (mode, index) => `
          <button class="stakers-mode-card ${ui.selectedMode === index ? "is-selected" : ""}" type="button" data-action="pick-mode" data-index="${index}">
            <span class="stakers-mode-title">${mode.label}</span>
            <span class="stakers-mode-copy">${mode.copy}</span>
            <span class="stakers-mode-tag">${mode.badge}</span>
          </button>
        `
      ).join("")}
    </div>
    <div class="stakers-leaderboard-panel">
      <span class="stakers-mode-subtitle">All-Time Top Runs</span>
      ${renderLeaderboard()}
    </div>
    <div class="stakers-overlay-hint">Keyboard: use Left and Right to choose, then press Space to start.</div>
  `;
  footerHint.textContent = "Keyboard: Left and Right choose, Space starts and fires, Escape opens menu. Arcade: stick chooses and any button starts.";
}

function showPauseMenu() {
  state.screen = "pause";
  state.pauseStartedAt = performance.now();
  overlayCard.setAttribute("data-view", "pause");
  overlay.classList.remove("is-hidden");
  overlayCard.innerHTML = `
    <div class="stakers-overlay-kicker">${state.activeMode.label}</div>
    <h2 class="stakers-overlay-title">Game Menu</h2>
    <div class="stakers-menu-list">
      ${["Resume", "Restart Round", "Choose Game Mode", "Back to Game Select"]
        .map(
          (label, index) => `
            <button class="stakers-menu-item ${ui.pauseIndex === index ? "is-selected" : ""}" type="button" data-action="${[
              "resume",
              "restart",
              "mode-select",
              "home",
            ][index]}">${label}</button>
          `
        )
        .join("")}
    </div>
    <div class="stakers-overlay-hint">Keyboard: Up and Down choose, Space confirms, Escape resumes.</div>
  `;
}

function showHelp() {
  state.screen = "help";
  state.pauseStartedAt = performance.now();
  overlayCard.setAttribute("data-view", "help");
  overlay.classList.remove("is-hidden");
  overlayCard.innerHTML = `
    <div class="stakers-overlay-kicker">HELP</div>
    <h2 class="stakers-overlay-title">Controls</h2>
    <p class="stakers-overlay-copy">Keyboard: Left and Right move, Space fires, Escape opens the menu. Arcade: stick or D-pad moves, A fires, Start opens the menu. Game mode is chosen before each round. Delegated mode delays your inputs. stVaults does not.</p>
    <button class="stakers-button stakers-button--primary" type="button" data-action="close-help">Return</button>
  `;
}

function showGameOver() {
  state.screen = "gameover";
  state.roundEnded = true;
  overlay.classList.remove("is-hidden");
  if (state.pendingLeaderboardEntry) {
    overlayCard.setAttribute("data-view", "entry");
    overlayCard.innerHTML = `
      <div class="stakers-overlay-kicker">${state.activeMode.label}</div>
      <h2 class="stakers-overlay-title">New High Score</h2>
      <p class="stakers-overlay-copy stakers-overlay-copy--compact">Enter your five-letter ID for the leaderboard.</p>
      <div class="entry-picker" data-entry-picker>${renderLeaderboardPicker()}</div>
      <div class="stakers-overlay-hint">Use Left and Right to choose a slot. Up and Down change letters. Move to ENTER and press Space to save.</div>
    `;
    return;
  }
  overlayCard.setAttribute("data-view", "results");
  overlayCard.innerHTML = `
    <div class="stakers-overlay-kicker">${state.activeMode.label}</div>
    <h2 class="stakers-overlay-title">Round Complete</h2>
    <div class="stakers-results-grid">
      <div class="stakers-result-box"><span class="stakers-result-value">${state.score}</span><span class="stakers-result-label">Score</span></div>
      <div class="stakers-result-box"><span class="stakers-result-value">${state.level}</span><span class="stakers-result-label">Level</span></div>
      <div class="stakers-result-box"><span class="stakers-result-value">${state.activeMode.shortLabel}</span><span class="stakers-result-label">Mode</span></div>
      <div class="stakers-result-box"><span class="stakers-result-value">${state.player.shield}</span><span class="stakers-result-label">Shield</span></div>
    </div>
    <div class="stakers-leaderboard-panel">
      <span class="stakers-mode-subtitle">All-Time Top Runs</span>
      ${renderLeaderboard()}
    </div>
    <p class="stakers-overlay-copy">${state.endReason}</p>
    <div class="stakers-overlay-actions">
      <button class="stakers-button ${ui.endIndex === 0 ? "is-selected" : ""}" type="button" data-action="mode-select">Choose Game Mode</button>
      <button class="stakers-button stakers-button--ghost ${ui.endIndex === 1 ? "is-selected" : ""}" type="button" data-action="home">Back to Game Select</button>
    </div>
  `;
}

function startGame(mode) {
  state.activeMode = mode;
  state.screen = "playing";
  state.roundStartedAt = 0;
  state.elapsedMs = 0;
  state.roundEnded = false;
  state.level = 1;
  state.score = 0;
  state.currentLagMs = 0;
  state.baseLagMs = 0;
  state.inLagSpike = false;
  state.nextLagSpikeAt = 0;
  state.lagSpikeUntil = 0;
  state.inputQueue.length = 0;
  state.lastRawMove = 0;
  state.appliedMove = 0;
  state.lastFireAt = -BULLET_COOLDOWN_MS;
  state.player.x = GAME_WIDTH * 0.5;
  state.player.shield = 3;
  state.player.hitFlash = 0;
  state.bullets.length = 0;
  state.enemyBullets.length = 0;
  state.effects.length = 0;
  state.endReason = "";
  state.bestBeforeRun = getHighScore();
  state.pendingLeaderboardEntry = false;
  state.pauseStartedAt = 0;
  ui.pauseIndex = 0;
  ui.endIndex = 0;
  leaderboardState.mode = null;
  leaderboardState.score = 0;
  leaderboardState.letters = ["A", "A", "A", "A", "A"];
  leaderboardState.index = 0;
  buildLevel(1);
  queueMessage(mode.badge);
  overlay.classList.add("is-hidden");
  footerHint.textContent = "Keyboard: Left and Right move, Space fires, Escape opens menu. Arcade: stick moves, A fires, Start opens menu.";
  audio.start();
  audio.startMusic();
  updateHud(true);
}

function buildLevel(level) {
  state.enemies.length = 0;
  state.enemyDirection = 1;
  state.enemySpeed = 52 + level * 10;
  state.enemyFireCooldown = Math.max(420, 980 - level * 26);
  state.nextEnemyShotAt = 0;

  const rows = Math.min(4 + Math.floor((level - 1) / 3), 9);
  const cols = Math.min(7 + Math.floor(level * 0.7), 14);
  const spacingX = cols >= 12 ? 48 : 56;
  const spacingY = rows >= 7 ? 34 : 38;
  const startX = GAME_WIDTH * 0.5 - ((cols - 1) * spacingX) / 2;
  const startY = rows >= 7 ? 84 : 94;
  const targetCount = Math.min(rows * cols, Math.ceil(26 + level * 4.5));
  const positions = buildFormationPositions(rows, cols, targetCount);

  for (const position of positions) {
    const ratio = rows === 1 ? 1 : position.row / (rows - 1);
    const tier = ratio < 0.34 ? 3 : ratio < 0.68 ? 2 : 1;
    const colorSet = tier === 3
      ? { fill: state.activeMode.key === "delegated" ? "#6efc87" : "#24d48f", accent: "#86ffae" }
      : tier === 2
        ? { fill: state.activeMode.key === "delegated" ? "#ff6b6b" : "#ff7f6b", accent: "#ffd06d" }
        : { fill: state.activeMode.key === "delegated" ? "#65b9ff" : "#4ec6ff", accent: "#9fe6ff" };

    state.enemies.push({
      x: startX + position.col * spacingX,
      y: startY + position.row * spacingY,
      width: 30,
      height: 38,
      hp: tier,
      maxHp: tier,
      fill: colorSet.fill,
      accent: colorSet.accent,
      anim: Math.random() * Math.PI * 2,
      animSpeed: 0.03 + Math.random() * 0.02,
      hitFlash: 0,
    });
  }
}

function buildFormationPositions(rows, cols, targetCount) {
  const positions = [];
  const center = (cols - 1) / 2;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const centerDistance = Math.abs(col - center);
      const archBias = Math.abs(row - (rows - 1) * 0.45);
      const notch = row < 2 && centerDistance < 1.2 ? 2.8 : 0;
      positions.push({ row, col, weight: centerDistance * 0.85 + archBias * 0.35 + notch + Math.random() * 0.2 });
    }
  }
  positions.sort((a, b) => a.weight - b.weight);
  return positions.slice(0, targetCount);
}

function queueMessage(message) {
  state.message = message;
  state.messageAlpha = 1;
}

function showStatus(text) {
  return text;
}

function endRound(reason) {
  if (state.roundEnded) return;
  state.roundEnded = true;
  state.endReason = reason;
  if (state.score > getHighScore()) {
    setHighScore(state.score);
    if (state.score > state.bestBeforeRun) {
      state.pendingLeaderboardEntry = true;
      leaderboardState.mode = state.activeMode.key;
      leaderboardState.score = state.score;
      leaderboardState.letters = ["A", "A", "A", "A", "A"];
      leaderboardState.index = 0;
    }
  }
  audio.fail();
  showGameOver();
  updateHud(true);
}

function resumeGame() {
  if (state.pauseStartedAt && state.roundStartedAt) {
    state.roundStartedAt += performance.now() - state.pauseStartedAt;
  }
  state.pauseStartedAt = 0;
  state.screen = "playing";
  overlay.classList.add("is-hidden");
}

function toggleHelp() {
  if (state.screen === "help") closeHelp();
  else if (state.screen === "playing") showHelp();
}

function closeHelp() {
  if (state.pauseStartedAt && state.roundStartedAt) {
    state.roundStartedAt += performance.now() - state.pauseStartedAt;
  }
  state.pauseStartedAt = 0;
  state.screen = "playing";
  overlay.classList.add("is-hidden");
}

function resetToIntro(modeOnly = false) {
  ui.introStage = modeOnly ? INTRO_STAGES.length : 0;
  ui.selectedMode = state.activeMode.key === "stvaults" ? 1 : 0;
  audio.stopMusic();
  showIntro();
  updateHud(true);
}

function activatePauseItem() {
  if (ui.pauseIndex === 0) resumeGame();
  else if (ui.pauseIndex === 1) startGame(state.activeMode);
  else if (ui.pauseIndex === 2) resetToIntro(true);
  else {
    audio.stopMusic();
    window.location.href = HOME_URL;
  }
}

function updateHud(force = false) {
  const remaining = Math.max(0, ROUND_LENGTH_MS - state.elapsedMs);
  const next = {
    mode: state.activeMode.shortLabel,
    level: String(state.level),
    score: String(state.score),
    time: `${(remaining / 1000).toFixed(1)}s`,
    lag: `${Math.round(state.currentLagMs)}ms`,
    status:
      state.screen === "playing"
        ? state.inLagSpike
          ? "Lag Spike"
          : `Shield ${state.player.shield}`
        : state.screen === "pause"
          ? "Paused"
          : state.screen === "gameover"
            ? "Round Complete"
            : "Standby",
  };
  if (force || next.mode !== state.hudCache.mode) hud.mode.textContent = next.mode;
  if (force || next.level !== state.hudCache.level) hud.level.textContent = next.level;
  if (force || next.score !== state.hudCache.score) hud.score.textContent = next.score;
  if (force || next.time !== state.hudCache.time) hud.time.textContent = next.time;
  if (force || next.lag !== state.hudCache.lag) hud.lag.textContent = next.lag;
  if (force || next.status !== state.hudCache.status) hud.status.textContent = next.status;
  state.hudCache = next;
}

function pollGamepad() {
  const now = performance.now();
  const pads = [...(navigator.getGamepads?.() ?? [])].filter((item) => item?.connected);
  if (!pads.length) {
    input.horizontal = 0;
    input.vertical = 0;
    return;
  }

  const primaryPressed = consumePadEdge(
    "primary",
    pads.some((pad) => !!pad.buttons[0]?.pressed || !!pad.buttons[2]?.pressed)
  );
  const startPressed = consumePadEdge("start", pads.some((pad) => !!pad.buttons[9]?.pressed));
  const backPressed = consumePadEdge(
    "back",
    pads.some((pad) => !!pad.buttons[1]?.pressed || !!pad.buttons[8]?.pressed)
  );
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
  const horizontalEdge = horizontalState !== 0 && horizontalState !== input.horizontal;
  const verticalEdge = verticalState !== 0 && verticalState !== input.vertical;
  input.horizontal = horizontalState;
  input.vertical = verticalState;

  if (state.screen === "playing") {
    if (primaryPressed) handleFireInput(performance.now());
    if ((startPressed || backPressed) && consumeUiAction(now)) showPauseMenu();
    return;
  }

  if (state.screen === "help") {
    if ((primaryPressed || startPressed || backPressed) && consumeUiAction(now)) closeHelp();
    return;
  }

  if (state.screen === "pause") {
    if (verticalEdge && consumeUiAction(now)) {
      ui.pauseIndex = (ui.pauseIndex + (verticalState > 0 ? 1 : 3)) % 4;
      showPauseMenu();
    }
    if ((primaryPressed || startPressed) && consumeUiAction(now)) activatePauseItem();
    if (backPressed && consumeUiAction(now)) resumeGame();
    return;
  }

  if (state.screen === "gameover") {
    if (state.pendingLeaderboardEntry) {
      if (horizontalEdge && consumeUiAction(now)) moveLeaderboardLetterIndex(horizontalState > 0 ? 1 : -1);
      if (verticalEdge && consumeUiAction(now)) cycleLeaderboardLetter(verticalState < 0 ? 1 : -1);
      if ((primaryPressed || startPressed || backPressed) && consumeUiAction(now)) trySubmitLeaderboardEntry();
      return;
    }
    if (leftPressed && consumeUiAction(now)) {
      ui.endIndex = 0;
      showGameOver();
    } else if (rightPressed && consumeUiAction(now)) {
      ui.endIndex = 1;
      showGameOver();
    } else if (horizontalEdge && consumeUiAction(now)) {
      ui.endIndex = horizontalState > 0 ? 1 : 0;
      showGameOver();
    }
    if ((primaryPressed || startPressed || backPressed) && consumeUiAction(now)) resetToIntro(true);
    return;
  }

  if (ui.introStage < INTRO_STAGES.length) {
    if ((primaryPressed || startPressed || backPressed || leftPressed || rightPressed) && consumeUiAction(now)) {
      ui.introStage += 1;
      showIntro();
    }
    return;
  }

  if (leftPressed && consumeUiAction(now)) {
    ui.selectedMode = 0;
    showIntro();
  } else if (rightPressed && consumeUiAction(now)) {
    ui.selectedMode = 1;
    showIntro();
  } else if (horizontalEdge && consumeUiAction(now)) {
    ui.selectedMode = horizontalState > 0 ? 1 : 0;
    showIntro();
  }

  if ((primaryPressed || startPressed || backPressed) && consumeUiAction(now)) startGame(MODES[ui.selectedMode]);
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

function getHighScore() {
  return Number.parseInt(storage.get(HIGH_SCORE_KEY) || "0", 10) || 0;
}

function setHighScore(score) {
  storage.set(HIGH_SCORE_KEY, String(score));
}

function getLeaderboard() {
  try {
    const raw = storage.get(LEADERBOARD_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLeaderboard(entries) {
  storage.set(LEADERBOARD_KEY, JSON.stringify(entries));
}

function addLeaderboardEntry(id, score, modeKey = state.activeMode.key) {
  const entries = getLeaderboard();
  entries.push({
    id: id.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5).padEnd(5, "X"),
    score,
    mode: modeKey,
    createdAt: Date.now(),
  });
  entries.sort((a, b) => b.score - a.score || a.createdAt - b.createdAt);
  saveLeaderboard(entries.slice(0, 12));
}

function renderLeaderboard() {
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
              <span class="leaderboard-mode">${modeLabelByKey[entry.mode] || entry.mode || "-"}</span>
              <span class="leaderboard-score">${entry.score}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderLeaderboardPicker() {
  const letters = leaderboardState.letters
    .map(
      (letter, index) =>
        `<button class="entry-slot ${leaderboardState.index === index ? "is-selected" : ""}" type="button" data-action="entry-slot" data-index="${index}">${letter}</button>`
    )
    .join("");
  const submit = `<button class="entry-slot entry-slot--submit ${leaderboardState.index === LEADERBOARD_SUBMIT_INDEX ? "is-selected" : ""}" type="button" data-action="entry-submit" data-index="${LEADERBOARD_SUBMIT_INDEX}">ENTER</button>`;
  return `${letters}${submit}`;
}

function refreshLeaderboardPicker() {
  const picker = overlayCard.querySelector("[data-entry-picker]");
  if (picker) picker.innerHTML = renderLeaderboardPicker();
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
  addLeaderboardEntry(leaderboardState.letters.join(""), leaderboardState.score, leaderboardState.mode || state.activeMode.key);
  state.pendingLeaderboardEntry = false;
  showGameOver();
}

function trySubmitLeaderboardEntry() {
  if (leaderboardState.index === LEADERBOARD_SUBMIT_INDEX) {
    saveLeaderboardInitials();
  }
}

function getRawMove() {
  const keyboard = (input.keys.ArrowRight ? 1 : 0) - (input.keys.ArrowLeft ? 1 : 0);
  return keyboard || input.horizontal;
}

function isFirePressed() {
  return !!input.keys.Space;
}

function consumePadEdge(name, pressed) {
  const previous = !!input.gamepadButtons[name];
  input.gamepadButtons[name] = pressed;
  return pressed && !previous;
}

function consumeUiAction(now = performance.now()) {
  if (now - input.lastUiActionAt < UI_DEBOUNCE_MS) return false;
  input.lastUiActionAt = now;
  return true;
}

function axisDirection(value, negative, positive) {
  if (value <= -GAMEPAD_DEADZONE) return negative;
  if (value >= GAMEPAD_DEADZONE) return positive;
  return null;
}

function rectsOverlap(a, b) {
  return (
    a.x - a.width * 0.5 < b.x + b.width * 0.5 &&
    a.x + a.width * 0.5 > b.x - b.width * 0.5 &&
    a.y - a.height * 0.5 < b.y + b.height * 0.5 &&
    a.y + a.height * 0.5 > b.y - b.height * 0.5
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function createStars() {
  return Array.from({ length: 88 }, () => ({
    x: Math.random() * GAME_WIDTH,
    y: Math.random() * GAME_HEIGHT,
    size: Math.random() * 2 + 0.8,
    alpha: Math.random() * 0.6 + 0.2,
    speed: Math.random() * 0.28 + 0.08,
    color: Math.random() > 0.85 ? "#88d8ff" : "#ffffff",
  }));
}

function updateStars() {
  for (const star of state.stars) {
    star.y += star.speed;
    if (star.y > GAME_HEIGHT) {
      star.y = -4;
      star.x = Math.random() * GAME_WIDTH;
    }
  }
}

function drawEthIcon(target, x, y, scale, topColor, bottomColor) {
  target.save();
  target.translate(x, y);
  target.scale(scale, scale);
  target.fillStyle = topColor;
  target.beginPath();
  target.moveTo(0, -16);
  target.lineTo(12, 0);
  target.lineTo(0, 7);
  target.lineTo(-12, 0);
  target.closePath();
  target.fill();
  target.fillStyle = bottomColor;
  target.beginPath();
  target.moveTo(0, 9);
  target.lineTo(12, 2);
  target.lineTo(0, 20);
  target.lineTo(-12, 2);
  target.closePath();
  target.fill();
  target.restore();
}

function drawLidoIcon(target, x, y, scale, blue, white) {
  target.save();
  target.translate(x, y);
  target.scale(scale, scale);
  target.fillStyle = blue;
  target.beginPath();
  target.arc(0, 10, 12, 0, Math.PI * 2);
  target.fill();
  target.fillStyle = white;
  target.beginPath();
  target.moveTo(0, -18);
  target.lineTo(10, -3);
  target.lineTo(0, 3);
  target.lineTo(-10, -3);
  target.closePath();
  target.fill();
  target.strokeStyle = blue;
  target.lineWidth = 3;
  target.beginPath();
  target.moveTo(0, -18);
  target.lineTo(10, -3);
  target.lineTo(0, 3);
  target.lineTo(-10, -3);
  target.closePath();
  target.stroke();
  target.restore();
}

function roundRect(target, x, y, width, height, radius) {
  target.moveTo(x + radius, y);
  target.arcTo(x + width, y, x + width, y + height, radius);
  target.arcTo(x + width, y + height, x, y + height, radius);
  target.arcTo(x, y + height, x, y, radius);
  target.arcTo(x, y, x + width, y, radius);
}

function createAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let musicBus = null;
  let musicTimer = 0;
  let musicStep = 0;
  let musicPlaying = false;
  let muted = false;

  function ensureContext() {
    if (!AudioContextClass) return null;
    if (!context) context = new AudioContextClass();
    if (context.state === "suspended") context.resume();
    if (!musicBus) {
      musicBus = context.createGain();
      musicBus.gain.value = 0.12;
      musicBus.connect(context.destination);
    }
    return context;
  }

  function blip(type, frequency, duration, volume, slide = 0.86) {
    const ctxAudio = ensureContext();
    if (!ctxAudio) return;
    const oscillator = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctxAudio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * slide, ctxAudio.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctxAudio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctxAudio.currentTime + duration);
    oscillator.connect(gain).connect(ctxAudio.destination);
    oscillator.start();
    oscillator.stop(ctxAudio.currentTime + duration);
  }

  function musicNote(frequency, when, duration, type, volume, slide = 1) {
    const ctxAudio = ensureContext();
    if (!ctxAudio || !musicBus || muted) return;
    const oscillator = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * slide), when + duration);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(gain).connect(musicBus);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
  }

  function scheduleMusicBar() {
    const ctxAudio = ensureContext();
    if (!ctxAudio || !musicPlaying || muted) return;
    const barStart = ctxAudio.currentTime + 0.02;
    for (let stepIndex = 0; stepIndex < 16; stepIndex += 1) {
      const step = MUSIC_PATTERN[(musicStep + stepIndex) % MUSIC_PATTERN.length];
      const when = barStart + stepIndex * MUSIC_STEP_TIME;
      musicNote(step.bass, when, 0.22, "square", 0.032, 0.98);
      musicNote(step.lead, when, 0.14, "triangle", step.accent ? 0.048 : 0.04, 1.01);
      musicNote(step.harmony, when + 0.05, 0.1, "square", 0.014, 0.99);
      if (stepIndex % 2 === 1) {
        musicNote(step.lead * 0.5, when + 0.09, 0.06, "triangle", 0.012, 1.0);
      }
    }
    musicStep = (musicStep + 16) % MUSIC_PATTERN.length;
    musicTimer = window.setTimeout(scheduleMusicBar, MUSIC_STEP_TIME * 16 * 1000);
  }

  function stopMusic() {
    musicPlaying = false;
    if (musicTimer) {
      window.clearTimeout(musicTimer);
      musicTimer = 0;
    }
  }

  return {
    start() {
      ensureContext();
    },
    startMusic() {
      const ctxAudio = ensureContext();
      if (!ctxAudio || musicPlaying) return;
      musicPlaying = true;
      musicStep = 0;
      scheduleMusicBar();
    },
    stopMusic,
    shoot() {
      blip("square", 660, 0.08, 0.025, 1.5);
    },
    failSoft() {
      blip("triangle", 180, 0.14, 0.03, 0.7);
    },
    fail() {
      blip("sawtooth", 150, 0.22, 0.045, 0.45);
      setTimeout(() => blip("triangle", 92, 0.25, 0.03, 0.4), 70);
    },
    toggleMute() {
      muted = !muted;
      if (musicBus) musicBus.gain.value = muted ? 0 : 0.12;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
