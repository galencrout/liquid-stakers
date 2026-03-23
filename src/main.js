import "./style.css";

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const LOW_PERF_DEVICE =
  /Raspberry Pi/i.test(navigator.userAgent) ||
  ((navigator.deviceMemory || 8) <= 4 && (navigator.hardwareConcurrency || 8) <= 4);
const DPR = Math.max(1, Math.min(LOW_PERF_DEVICE ? 1 : 2, window.devicePixelRatio || 1));
const RENDER_SCALE = LOW_PERF_DEVICE ? 0.6 : 1;
const ROUND_LENGTH_MS = 60_000;
const PLAYER_SPEED = 320;
const BULLET_SPEED = 520;
const BULLET_COOLDOWN_MS = 220;
const ENEMY_MOVE_SPEED = 38;
const ENEMY_DROP = 18;
const ENEMY_ZONE_Y = 500;
const ENEMY_SHOT_INTERVAL_MS = 880;
const START_SPEED_MULTIPLIER = 1.08;
const START_SHOT_INTERVAL_MULTIPLIER = 0.95;
const MAX_LEVEL = 20;
const LEVEL_ENEMY_GROWTH = 0.1;
const LEVEL_SPEED_GROWTH = 0.15;
const GAMEPAD_DEADZONE = 0.45;
const HOME_URL = "./index.html";

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
    spikeMin: 700,
    spikeMax: 1300,
    badgeFill: "#4b1f1f",
    badgeStroke: "#b94949",
    flashFill: "#5c2828",
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
    badgeFill: "#113b62",
    badgeStroke: "#1a9be8",
    flashFill: "#123657",
  },
];

const ENEMY_ROWS = [
  { pattern: "00111111100", hp: 3, color: "#6efc87" },
  { pattern: "01101110110", hp: 3, color: "#6efc87" },
  { pattern: "11111111111", hp: 2, color: "#ff6b6b" },
  { pattern: "11011110111", hp: 2, color: "#ff6b6b" },
  { pattern: "01100110010", hp: 1, color: "#65b9ff" },
];
const BASE_ENEMY_COUNT = ENEMY_ROWS.reduce(
  (total, row) => total + [...row.pattern].filter((cell) => cell === "1").length,
  0
);

const INTRO_STAGES = [
  {
    title: "Liquid Stakers",
    body:
      "Welcome to Liquid Stakers, a game about the opportunity cost of waiting through the Ethereum exit queue.",
    hint: "Press A, Start, Space, or Enter to continue.",
  },
  {
    title: "Why It Matters",
    body:
      "Traditional staking positions can take days or months to unwind. stVaults aim to restore reaction time when markets move.",
    hint: "Press A, Start, Space, or Enter for rules.",
  },
  {
    title: "Rules",
    body:
      "Survive sixty seconds and clear the queue pressure. Blue enemies take one shot, red take two, green take three. If they reach your validator zone, the round ends.",
    hint: "Press A, Start, Space, or Enter to choose game mode.",
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
const ctx =
  canvas.getContext("2d", { alpha: false, desynchronized: true }) ||
  canvas.getContext("2d");
canvas.width = Math.round(GAME_WIDTH * DPR * RENDER_SCALE);
canvas.height = Math.round(GAME_HEIGHT * DPR * RENDER_SCALE);
canvas.style.width = `${GAME_WIDTH}px`;
canvas.style.height = `${GAME_HEIGHT}px`;
ctx.setTransform(DPR * RENDER_SCALE, 0, 0, DPR * RENDER_SCALE, 0, 0);

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

const renderCache = createRenderCache();
const audio = createAudio();

const input = {
  keys: Object.create(null),
  gamepadButtons: Object.create(null),
  horizontal: 0,
  vertical: 0,
  queuedMove: 0,
  fireHeld: false,
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
  gameStarted: false,
  roundEnded: false,
  roundStartedAt: 0,
  elapsedMs: 0,
  currentLagMs: 0,
  baseLagMs: 0,
  inLagSpike: false,
  nextLagSpikeAt: 0,
  lagSpikeUntil: 0,
  inputQueue: [],
  lastRawMove: 0,
  appliedMove: 0,
  player: { x: GAME_WIDTH / 2, y: 548, width: 34, height: 44 },
  bullets: [],
  enemies: [],
  level: 1,
  enemyMoveSpeed: ENEMY_MOVE_SPEED,
  enemyShotIntervalMs: ENEMY_SHOT_INTERVAL_MS,
  enemyDirection: 1,
  enemyOffsetY: 0,
  lastFireAt: -BULLET_COOLDOWN_MS,
  nextEnemyShotAt: 0,
  score: 0,
  endReason: "",
  effects: [],
  flashMessage: "",
  flashAlpha: 0,
  pauseStartedAt: 0,
  hudCache: { mode: "", level: "", score: "", time: "", lag: "", status: "" },
  nextHudRefreshAt: 0,
};

showIntro();
updateHud(true);
requestAnimationFrame(frame);

window.addEventListener("keydown", (event) => {
  input.keys[event.code] = true;

  if (["Space", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "KeyH" && state.screen === "playing") {
    toggleHelp();
    return;
  }

  if (state.screen === "playing") {
    if (event.code === "Enter") {
      showPauseMenu();
      return;
    }
    return;
  }

  if (state.screen === "intro") {
    if (ui.introStage < INTRO_STAGES.length) {
      if (event.code === "Enter" || event.code === "Space") {
        ui.introStage += 1;
        showIntro();
      }
      if (event.code === "Escape" && ui.introStage > 0) {
        ui.introStage -= 1;
        showIntro();
      }
      return;
    }
    if (event.code === "ArrowLeft" || event.code === "KeyA" || event.code === "Digit1") {
      ui.selectedMode = 0;
      showIntro();
      return;
    }
    if (event.code === "ArrowRight" || event.code === "KeyD" || event.code === "Digit2") {
      ui.selectedMode = 1;
      showIntro();
      return;
    }
    if (event.code === "Enter" || event.code === "Space") {
      startGame(MODES[ui.selectedMode]);
    }
    if (event.code === "Escape") {
      ui.introStage = INTRO_STAGES.length - 1;
      showIntro();
    }
    return;
  }

  if (state.screen === "pause") {
    if (event.code === "ArrowUp") {
      ui.pauseIndex = (ui.pauseIndex + 3) % 4;
      showPauseMenu();
      return;
    }
    if (event.code === "ArrowDown") {
      ui.pauseIndex = (ui.pauseIndex + 1) % 4;
      showPauseMenu();
      return;
    }
    if (event.code === "Enter" || event.code === "Space") {
      activatePauseItem();
      return;
    }
    if (event.code === "Escape") {
      resumeGame();
    }
    return;
  }

  if (state.screen === "help") {
    if (event.code === "Escape" || event.code === "Enter" || event.code === "Space") {
      closeHelp();
    }
    return;
  }

  if (state.screen === "gameover") {
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      ui.endIndex = 0;
      showGameOver();
      return;
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
      ui.endIndex = 1;
      showGameOver();
      return;
    }
    if (event.code === "Enter" || event.code === "Space") {
      if (ui.endIndex === 0) {
        startGame(state.activeMode);
      } else {
        resetToIntro();
      }
    }
  }

  if (state.screen === "gameover") {
    if (event.code === "Enter" || event.code === "Space" || event.code === "Escape") {
      resetToIntro(true);
    }
  }
});

window.addEventListener("keyup", (event) => {
  input.keys[event.code] = false;
});

canvas.addEventListener("pointerdown", () => {
  if (state.screen === "playing") {
    attemptFire(performance.now());
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
  } else if (action === "difficulty") {
    resetToIntro(true);
  } else if (action === "home") {
    window.location.href = HOME_URL;
  } else if (action === "close-help") {
    closeHelp();
  } else if (action === "mode-select") {
    resetToIntro(true);
  }
});

function frame(now) {
  pollGamepad();

  if (state.screen === "playing") {
    updateGame(now);
  }

  render();
  requestAnimationFrame(frame);
}

function updateGame(now) {
  if (!state.gameStarted || state.roundEnded) return;

  if (!state.roundStartedAt) {
    state.roundStartedAt = now;
    state.nextEnemyShotAt = now + state.enemyShotIntervalMs;
  }

  state.elapsedMs = now - state.roundStartedAt;
  sampleLag(now);
  captureQueuedInput(now);
  applyQueuedInput(now);

  state.player.x += state.appliedMove * PLAYER_SPEED * (1 / 60);
  state.player.x = clamp(state.player.x, 30, GAME_WIDTH - 30);

  updateBullets();
  updateEnemies(now);
  resolveCollisions();
  updateEffects();

  if (state.elapsedMs >= ROUND_LENGTH_MS) {
    endRound("Time expired while queue pressure remained.");
  }

  if (now >= state.nextHudRefreshAt) {
    updateHud();
    state.nextHudRefreshAt = now + 120;
  }
}

function sampleLag(now) {
  if (state.activeMode.key === "stvaults") {
    state.baseLagMs = 0;
    state.currentLagMs = 0;
    state.inLagSpike = false;
    return;
  }

  if (!state.baseLagMs) {
    state.baseLagMs = randomBetween(state.activeMode.lagMin, state.activeMode.lagMax);
    state.currentLagMs = state.baseLagMs;
    state.nextLagSpikeAt = now + randomBetween(3500, 7000);
  }

  if (!state.inLagSpike && now >= state.nextLagSpikeAt) {
    state.inLagSpike = true;
    state.lagSpikeUntil = now + randomBetween(650, 1300);
    state.currentLagMs = state.baseLagMs + randomBetween(state.activeMode.spikeMin, state.activeMode.spikeMax);
  }

  if (state.inLagSpike && now >= state.lagSpikeUntil) {
    state.inLagSpike = false;
    state.baseLagMs = randomBetween(state.activeMode.lagMin, state.activeMode.lagMax);
    state.currentLagMs = state.baseLagMs;
    state.nextLagSpikeAt = now + randomBetween(3200, 7600);
  }

  if (!state.inLagSpike) {
    state.currentLagMs = state.baseLagMs;
  }
}

function captureQueuedInput(now) {
  const move = getRawMove();
  const fire = isFirePressed();

  if (state.activeMode.key === "stvaults") {
    state.appliedMove = move;
    if (fire && !input.fireHeld) {
      attemptFire(now);
    }
    input.fireHeld = fire;
    return;
  }

  if (move !== state.lastRawMove) {
    state.lastRawMove = move;
    state.inputQueue.push({
      applyAt: now + state.currentLagMs,
      move,
    });
  }

  if (fire && !input.fireHeld) {
    state.inputQueue.push({
      applyAt: now + state.currentLagMs,
      fire: true,
    });
  }
  input.fireHeld = fire;
}

function applyQueuedInput(now) {
  let read = 0;
  let write = 0;
  while (read < state.inputQueue.length) {
    const item = state.inputQueue[read];
    if (item.applyAt <= now) {
      if (typeof item.move === "number") {
        state.appliedMove = item.move;
      }
      if (item.fire) {
        attemptFire(now);
      }
    } else {
      state.inputQueue[write] = item;
      write += 1;
    }
    read += 1;
  }
  state.inputQueue.length = write;
}

function attemptFire(now) {
  if (now - state.lastFireAt < BULLET_COOLDOWN_MS) return;
  state.lastFireAt = now;
  state.bullets.push({
    x: state.player.x,
    y: state.player.y - 26,
    width: 6,
    height: 16,
  });
  audio.shoot();
}

function updateBullets() {
  let write = 0;
  for (let index = 0; index < state.bullets.length; index += 1) {
    const bullet = state.bullets[index];
    bullet.y -= BULLET_SPEED / 60;
    if (bullet.y + bullet.height * 0.5 >= 0) {
      state.bullets[write] = bullet;
      write += 1;
    }
  }
  state.bullets.length = write;
}

function updateEnemies(now) {
  let minX = Infinity;
  let maxX = -Infinity;
  let lowestY = 0;

  for (const enemy of state.enemies) {
    enemy.x += state.enemyDirection * state.enemyMoveSpeed / 60;
    minX = Math.min(minX, enemy.x - enemy.width * 0.5);
    maxX = Math.max(maxX, enemy.x + enemy.width * 0.5);
    lowestY = Math.max(lowestY, enemy.y + enemy.height * 0.5);
  }

  if (minX <= 28 || maxX >= GAME_WIDTH - 28) {
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

  if (now >= state.nextEnemyShotAt && state.enemies.length) {
    const shooter = state.enemies[(Math.random() * state.enemies.length) | 0];
    state.effects.push({
      type: "beam",
      x: shooter.x,
      y: shooter.y + 20,
      life: LOW_PERF_DEVICE ? 10 : 14,
    });
    state.nextEnemyShotAt = now + state.enemyShotIntervalMs;
  }
}

function resolveCollisions() {
  let bulletWrite = 0;
  for (let bulletIndex = 0; bulletIndex < state.bullets.length; bulletIndex += 1) {
    const bullet = state.bullets[bulletIndex];
    let hit = false;

    for (let enemyIndex = 0; enemyIndex < state.enemies.length; enemyIndex += 1) {
      const enemy = state.enemies[enemyIndex];
      if (!rectsOverlap(bullet, enemy)) continue;

      hit = true;
      enemy.hp -= 1;
      if (!LOW_PERF_DEVICE) {
        state.effects.push({
          type: "ring",
          x: enemy.x,
          y: enemy.y,
          life: 12,
          color: enemy.hp <= 0 ? "#ffe38c" : "#bdd9ff",
        });
      }

      if (enemy.hp <= 0) {
        state.score += 10 * enemy.maxHp;
        state.enemies.splice(enemyIndex, 1);
        enemyIndex -= 1;
      }
      break;
    }

    if (!hit) {
      state.bullets[bulletWrite] = bullet;
      bulletWrite += 1;
    }
  }
  state.bullets.length = bulletWrite;

  if (!state.enemies.length) {
    if (state.level >= MAX_LEVEL) {
      endRound(`You cleared all ${MAX_LEVEL} levels before timeout.`);
    } else {
      advanceLevel();
    }
  }
}

function updateEffects() {
  let write = 0;
  for (let index = 0; index < state.effects.length; index += 1) {
    const effect = state.effects[index];
    effect.life -= 1;
    if (effect.life > 0) {
      state.effects[write] = effect;
      write += 1;
    }
  }
  state.effects.length = write;

  if (state.flashAlpha > 0) {
    state.flashAlpha = Math.max(0, state.flashAlpha - 0.025);
  }
}

function render() {
  ctx.drawImage(renderCache.background, 0, 0, GAME_WIDTH, GAME_HEIGHT);
  drawValidatorZone();
  drawEffects();
  drawBullets();
  drawEnemies();
  drawPlayer();
  drawFlashMessage();
}

function drawValidatorZone() {
  ctx.strokeStyle = state.activeMode.key === "delegated" ? "#b94949" : "#1a9be8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, ENEMY_ZONE_Y);
  ctx.lineTo(GAME_WIDTH, ENEMY_ZONE_Y);
  ctx.stroke();
}

function drawPlayer() {
  const sprite = state.activeMode.key === "delegated" ? renderCache.ethSprite : renderCache.lidoSprite;
  ctx.drawImage(sprite, state.player.x - 17, state.player.y - 22);
}

function drawBullets() {
  ctx.fillStyle = "#d4ecff";
  for (const bullet of state.bullets) {
    ctx.fillRect(bullet.x - bullet.width * 0.5, bullet.y - bullet.height * 0.5, bullet.width, bullet.height);
  }
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    const sprite = state.activeMode.key === "delegated" ? renderCache.ethSprite : renderCache.lidoSprite;
    ctx.globalAlpha = enemy.hp < enemy.maxHp ? 0.82 : 1;
    ctx.drawImage(sprite, enemy.x - 14, enemy.y - 18, 28, 36);
    ctx.globalAlpha = 1;

    if (enemy.maxHp > 1) {
      ctx.fillStyle = "rgba(7, 16, 30, 0.84)";
      ctx.fillRect(enemy.x - 16, enemy.y + 22, 32, 6);
      ctx.fillStyle = enemy.color;
      ctx.fillRect(enemy.x - 16, enemy.y + 22, (32 * enemy.hp) / enemy.maxHp, 6);
    }
  }
}

function drawEffects() {
  for (const effect of state.effects) {
    if (effect.type === "ring") {
      ctx.strokeStyle = effect.color;
      ctx.globalAlpha = effect.life / 12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 14 - effect.life * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (effect.type === "beam") {
      ctx.strokeStyle = "rgba(255, 191, 112, 0.3)";
      ctx.globalAlpha = effect.life / 14;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.x, ENEMY_ZONE_Y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFlashMessage() {
  if (!state.flashAlpha || !state.flashMessage) return;
  ctx.globalAlpha = state.flashAlpha;
  ctx.fillStyle = state.activeMode.flashFill;
  ctx.fillRect(210, 80, 380, 38);
  ctx.strokeStyle = state.activeMode.badgeStroke;
  ctx.strokeRect(210, 80, 380, 38);
  ctx.fillStyle = "#f4fbff";
  ctx.font = "bold 18px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(state.flashMessage, GAME_WIDTH / 2, 99);
  ctx.globalAlpha = 1;
}

function showIntro() {
  state.screen = "intro";
  state.roundEnded = false;
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
    footerHint.textContent = "Arcade: A or Start continues. B goes back.";
    return;
  }

  overlayCard.innerHTML = `
    <div class="stakers-overlay-kicker">CHOOSE A GAME MODE</div>
    <h1 class="stakers-overlay-title">Select Staking Mode</h1>
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
    <div class="stakers-overlay-hint">Press 1 for Delegated. Press 2 for stVaults. A or Start begins.</div>
  `;
  footerHint.textContent = "Arcade: 1 picks Delegated. 2 picks stVaults. A fires in-round. Start opens menu.";
}

function showPauseMenu() {
  state.screen = "pause";
  state.pauseStartedAt = performance.now();
  overlay.classList.remove("is-hidden");
  overlayCard.innerHTML = `
    <div class="stakers-overlay-kicker">${state.activeMode.label}</div>
    <h2 class="stakers-overlay-title">Game Menu</h2>
    <div class="stakers-menu-list">
      ${[
        "Resume",
        "Restart Round",
        "Choose Game Mode",
        "Back To Game Select",
      ]
        .map(
          (label, index) => `
            <button class="stakers-menu-item ${ui.pauseIndex === index ? "is-selected" : ""}" type="button" data-action="${
              ["resume", "restart", "difficulty", "home"][index]
            }">${label}</button>
          `
        )
        .join("")}
    </div>
    <div class="stakers-overlay-hint">Stick up or down chooses. A or Start confirms. B resumes.</div>
  `;
}

function showHelp() {
  state.screen = "help";
  state.pauseStartedAt = performance.now();
  overlay.classList.remove("is-hidden");
  overlayCard.innerHTML = `
    <div class="stakers-overlay-kicker">HELP</div>
    <h2 class="stakers-overlay-title">Controls</h2>
    <p class="stakers-overlay-copy">Move with the stick or D-pad. Press A to fire. Press Start or Select for the menu. Game mode is chosen before each round. Delegated mode delays your inputs. stVaults does not.</p>
    <button class="stakers-button stakers-button--primary" type="button" data-action="close-help">Return</button>
  `;
}

function showGameOver() {
  state.screen = "gameover";
  state.roundEnded = true;
  overlay.classList.remove("is-hidden");
  overlayCard.innerHTML = `
    <div class="stakers-overlay-kicker">${state.activeMode.label}</div>
    <h2 class="stakers-overlay-title">Round Complete</h2>
    <div class="stakers-results-grid">
      <div class="stakers-result-box"><span class="stakers-result-value">${state.score}</span><span class="stakers-result-label">Score</span></div>
      <div class="stakers-result-box"><span class="stakers-result-value">${state.level}</span><span class="stakers-result-label">Level</span></div>
      <div class="stakers-result-box"><span class="stakers-result-value">${state.activeMode.shortLabel}</span><span class="stakers-result-label">Mode</span></div>
    </div>
    <p class="stakers-overlay-copy">${state.endReason}</p>
    <div class="stakers-overlay-actions">
      <button class="stakers-button ${ui.endIndex === 0 ? "is-selected" : ""}" type="button" data-action="mode-select">Choose Game Mode</button>
      <button class="stakers-button stakers-button--ghost ${ui.endIndex === 1 ? "is-selected" : ""}" type="button" data-action="home">Back To Game Select</button>
    </div>
    <div class="stakers-overlay-hint">A or Start returns to game mode select. B also returns to game mode select.</div>
  `;
}

function startGame(mode) {
  state.activeMode = mode;
  state.screen = "playing";
  state.gameStarted = true;
  state.roundEnded = false;
  state.roundStartedAt = 0;
  state.elapsedMs = 0;
  state.score = 0;
  state.endReason = "";
  state.baseLagMs = 0;
  state.currentLagMs = 0;
  state.inLagSpike = false;
  state.nextLagSpikeAt = 0;
  state.lagSpikeUntil = 0;
  state.inputQueue.length = 0;
  state.bullets.length = 0;
  state.level = 1;
  state.enemyMoveSpeed = getEnemyMoveSpeed(state.level);
  state.enemyShotIntervalMs = getEnemyShotInterval(state.level);
  state.lastRawMove = 0;
  state.appliedMove = 0;
  state.lastFireAt = -BULLET_COOLDOWN_MS;
  state.nextEnemyShotAt = 0;
  state.effects.length = 0;
  state.flashMessage = mode.badge;
  state.flashAlpha = 1;
  state.pauseStartedAt = 0;
  state.player.x = GAME_WIDTH / 2;
  ui.pauseIndex = 0;
  ui.endIndex = 0;
  buildEnemies();
  overlay.classList.add("is-hidden");
  footerHint.textContent = "Arcade: stick moves. A fires. Start or Select opens menu.";
  audio.start();
  updateHud(true);
}

function buildEnemies() {
  state.enemies.length = 0;
  const config = getLevelFormation(state.level);
  const startX = GAME_WIDTH / 2 - ((config.cols - 1) * config.colSpacing) / 2;
  for (let row = 0; row < config.rows; row += 1) {
    const spec = getEnemySpecForRow(row, config.rows);
    const chosenCols = getFormationColumns(config.cols, config.rowCounts[row], spec.pattern, row);
    for (const col of chosenCols) {
      state.enemies.push({
        x: startX + col * config.colSpacing,
        y: config.startY + row * config.rowSpacing,
        width: 28,
        height: 36,
        hp: spec.hp,
        maxHp: spec.hp,
        color: spec.color,
      });
    }
  }
  state.enemyDirection = 1;
  state.nextEnemyShotAt = 0;
}

function advanceLevel() {
  state.level += 1;
  state.enemyMoveSpeed = getEnemyMoveSpeed(state.level);
  state.enemyShotIntervalMs = getEnemyShotInterval(state.level);
  state.inputQueue.length = 0;
  state.bullets.length = 0;
  state.appliedMove = 0;
  state.lastRawMove = 0;
  state.flashMessage = `Level ${state.level} queue pressure rising`;
  state.flashAlpha = 1;
  buildEnemies();
  updateHud(true);
}

function endRound(reason) {
  if (state.roundEnded) return;
  state.endReason = reason;
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
  if (state.screen === "help") {
    closeHelp();
  } else if (state.screen === "playing") {
    showHelp();
  }
}

function closeHelp() {
  if (state.pauseStartedAt && state.roundStartedAt) {
    state.roundStartedAt += performance.now() - state.pauseStartedAt;
  }
  state.pauseStartedAt = 0;
  state.screen = "playing";
  overlay.classList.add("is-hidden");
}

function resetToIntro(difficultyOnly = false) {
  ui.introStage = difficultyOnly ? INTRO_STAGES.length : 0;
  ui.selectedMode = state.activeMode.key === "stvaults" ? 1 : 0;
  showIntro();
  updateHud(true);
}

function activatePauseItem() {
  if (ui.pauseIndex === 0) {
    resumeGame();
  } else if (ui.pauseIndex === 1) {
    startGame(state.activeMode);
  } else if (ui.pauseIndex === 2) {
    resetToIntro(true);
  } else {
    window.location.href = HOME_URL;
  }
}

function updateHud(force = false) {
  const remaining = Math.max(0, ROUND_LENGTH_MS - state.elapsedMs);
  const status =
    state.screen === "playing"
      ? state.inLagSpike
        ? "Lag Spike"
        : "Active"
      : state.screen === "pause"
        ? "Paused"
        : state.screen === "gameover"
          ? "Round Complete"
          : "Standby";
  const next = {
    mode: state.activeMode.shortLabel,
    level: String(state.level),
    score: String(state.score),
    time: `${(remaining / 1000).toFixed(1)}s`,
    lag: `${Math.round(state.currentLagMs)}ms`,
    status,
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
  const pad = (navigator.getGamepads?.() ?? []).find((gamepad) => gamepad?.connected);
  if (!pad) {
    input.horizontal = 0;
    input.vertical = 0;
    return;
  }

  const primaryPressed =
    consumePadEdge("primary0", !!pad.buttons[0]?.pressed) ||
    consumePadEdge("primary2", !!pad.buttons[2]?.pressed);
  const startPressed = consumePadEdge("start", !!pad.buttons[9]?.pressed);
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
  const horizontalEdge = horizontalState !== 0 && horizontalState !== input.horizontal;
  const verticalEdge = verticalState !== 0 && verticalState !== input.vertical;
  input.horizontal = horizontalState;
  input.vertical = verticalState;

  if (state.screen === "playing") {
    if (primaryPressed) attemptFire(performance.now());
    if (startPressed || backPressed) {
      showPauseMenu();
    }
    return;
  }

  if (state.screen === "help") {
    if (primaryPressed || startPressed || backPressed) {
      closeHelp();
    }
    return;
  }

  if (state.screen === "pause") {
    if (verticalEdge) {
      ui.pauseIndex = (ui.pauseIndex + (verticalState > 0 ? 1 : 3)) % 4;
      showPauseMenu();
    }
    if (primaryPressed || startPressed) activatePauseItem();
    if (backPressed) resumeGame();
    return;
  }

  if (state.screen === "gameover") {
    if (leftPressed) {
      ui.endIndex = 0;
      showGameOver();
    } else if (rightPressed) {
      ui.endIndex = 1;
      showGameOver();
    } else if (horizontalEdge) {
      ui.endIndex = horizontalState > 0 ? 1 : 0;
      showGameOver();
    }
    if (primaryPressed || startPressed) {
      if (ui.endIndex === 0) {
        resetToIntro(true);
      } else {
        window.location.href = HOME_URL;
      }
    }
    if (backPressed) {
      resetToIntro(true);
    }
    return;
  }

  if (ui.introStage < INTRO_STAGES.length) {
    if (primaryPressed || startPressed) {
      ui.introStage += 1;
      showIntro();
    }
    if (backPressed && ui.introStage > 0) {
      ui.introStage -= 1;
      showIntro();
    }
    return;
  }

  if (leftPressed) {
    ui.selectedMode = 0;
    showIntro();
  } else if (rightPressed) {
    ui.selectedMode = 1;
    showIntro();
  } else if (horizontalEdge) {
    ui.selectedMode = horizontalState > 0 ? 1 : 0;
    showIntro();
  }

  if (primaryPressed || startPressed) {
    startGame(MODES[ui.selectedMode]);
  }

  if (backPressed) {
    ui.introStage = INTRO_STAGES.length - 1;
    showIntro();
  }
}

function getRawMove() {
  const keyboardMove = (input.keys.ArrowRight || input.keys.KeyD ? 1 : 0) - (input.keys.ArrowLeft || input.keys.KeyA ? 1 : 0);
  return keyboardMove || input.horizontal;
}

function isFirePressed() {
  return !!input.keys.Space;
}

function consumePadEdge(name, pressed) {
  const wasPressed = !!input.gamepadButtons[name];
  input.gamepadButtons[name] = pressed;
  return pressed && !wasPressed;
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

function getEnemyMoveSpeed(level) {
  return ENEMY_MOVE_SPEED * START_SPEED_MULTIPLIER * Math.pow(1 + LEVEL_SPEED_GROWTH, level - 1);
}

function getEnemyShotInterval(level) {
  return Math.max(
    360,
    ENEMY_SHOT_INTERVAL_MS * START_SHOT_INTERVAL_MULTIPLIER * Math.pow(0.97, level - 1)
  );
}

function getLevelFormation(level) {
  const enemyTarget = Math.ceil(BASE_ENEMY_COUNT * Math.pow(1 + LEVEL_ENEMY_GROWTH, level - 1));
  const cols = Math.min(19, 11 + Math.floor((level - 1) / 2));
  const rows = Math.max(ENEMY_ROWS.length, Math.ceil(enemyTarget / (cols * 0.82)));
  const rowSpacing = rows >= 14 ? 22 : rows >= 11 ? 26 : rows >= 8 ? 31 : 36;
  const colSpacing = cols >= 18 ? 36 : cols >= 15 ? 39 : cols >= 13 ? 42 : 46;
  const startY = rows >= 14 ? 64 : rows >= 11 ? 74 : 92;

  return {
    cols,
    rows,
    startY,
    rowSpacing,
    colSpacing,
    rowCounts: distributeEnemiesAcrossRows(enemyTarget, rows, cols),
  };
}

function distributeEnemiesAcrossRows(total, rows, cols) {
  const counts = new Array(rows).fill(0);
  const weights = [];
  let weightSum = 0;

  for (let row = 0; row < rows; row += 1) {
    const ratio = rows === 1 ? 0.5 : row / (rows - 1);
    const weight = 0.8 + 0.35 * Math.sin(ratio * Math.PI);
    weights.push(weight);
    weightSum += weight;
  }

  let assigned = 0;
  for (let row = 0; row < rows; row += 1) {
    const count = Math.min(cols, Math.max(1, Math.floor((total * weights[row]) / weightSum)));
    counts[row] = count;
    assigned += count;
  }

  let delta = total - assigned;
  while (delta > 0) {
    let changed = false;
    for (let row = 0; row < rows && delta > 0; row += 1) {
      if (counts[row] >= cols) continue;
      counts[row] += 1;
      delta -= 1;
      changed = true;
    }
    if (!changed) break;
  }

  while (delta < 0) {
    let changed = false;
    for (let row = rows - 1; row >= 0 && delta < 0; row -= 1) {
      if (counts[row] <= 1) continue;
      counts[row] -= 1;
      delta += 1;
      changed = true;
    }
    if (!changed) break;
  }

  return counts;
}

function getEnemySpecForRow(row, totalRows) {
  const ratio = totalRows === 1 ? 0 : row / (totalRows - 1);
  if (ratio <= 0.34) return ENEMY_ROWS[0];
  if (ratio <= 0.68) return ENEMY_ROWS[2];
  return ENEMY_ROWS[4];
}

function getFormationColumns(cols, count, pattern, row) {
  const preferred = [];
  const fallback = [];
  const center = (cols - 1) / 2;

  for (let col = 0; col < cols; col += 1) {
    const sample = pattern[(col + row) % pattern.length];
    if (sample === "1") {
      preferred.push(col);
    } else {
      fallback.push(col);
    }
  }

  const centerOut = (a, b) => {
    const aDistance = Math.abs(a - center);
    const bDistance = Math.abs(b - center);
    if (aDistance !== bDistance) return aDistance - bDistance;
    return a - b;
  };

  preferred.sort(centerOut);
  fallback.sort(centerOut);
  return preferred.concat(fallback).slice(0, count);
}

function createRenderCache() {
  return {
    background: buildBackgroundCanvas(),
    ethSprite: buildEthSprite(),
    lidoSprite: buildLidoSprite(),
  };
}

function buildBackgroundCanvas() {
  const background = document.createElement("canvas");
  background.width = GAME_WIDTH;
  background.height = GAME_HEIGHT;
  const backgroundCtx =
    background.getContext("2d", { alpha: false }) || background.getContext("2d");

  const gradient = backgroundCtx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  gradient.addColorStop(0, "#0d1324");
  gradient.addColorStop(1, "#050913");
  backgroundCtx.fillStyle = gradient;
  backgroundCtx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  backgroundCtx.fillStyle = "rgba(17, 28, 52, 0.8)";
  backgroundCtx.fillRect(0, 0, GAME_WIDTH, 220);
  backgroundCtx.strokeStyle = "#293a57";
  for (let index = 0; index < 6; index += 1) {
    const y = 116 + index * 58;
    backgroundCtx.beginPath();
    backgroundCtx.moveTo(0, y);
    backgroundCtx.lineTo(GAME_WIDTH, y);
    backgroundCtx.stroke();
  }

  backgroundCtx.fillStyle = "rgba(7, 14, 26, 0.95)";
  backgroundCtx.fillRect(0, 520, GAME_WIDTH, 80);
  return background;
}

function buildEthSprite() {
  const sprite = document.createElement("canvas");
  sprite.width = 32;
  sprite.height = 44;
  const spriteCtx = sprite.getContext("2d");

  spriteCtx.fillStyle = "#e6ebff";
  drawDiamond(spriteCtx, 16, 12, 12, 10);
  spriteCtx.fillStyle = "#b3c0ff";
  drawDiamond(spriteCtx, 16, 31, 12, 11);
  return sprite;
}

function buildLidoSprite() {
  const sprite = document.createElement("canvas");
  sprite.width = 32;
  sprite.height = 44;
  const spriteCtx = sprite.getContext("2d");
  const blue = "#1a9be8";

  spriteCtx.fillStyle = blue;
  spriteCtx.beginPath();
  spriteCtx.arc(16, 31, 13, 0, Math.PI * 2);
  spriteCtx.fill();

  spriteCtx.fillStyle = "#ffffff";
  drawDiamond(spriteCtx, 16, 25, 8, 4);

  spriteCtx.strokeStyle = blue;
  spriteCtx.lineWidth = 4;
  spriteCtx.beginPath();
  spriteCtx.moveTo(16, 4);
  spriteCtx.lineTo(26, 18);
  spriteCtx.lineTo(16, 24);
  spriteCtx.lineTo(6, 18);
  spriteCtx.closePath();
  spriteCtx.stroke();

  spriteCtx.fillStyle = "#ffffff";
  drawDiamond(spriteCtx, 16, 15, 6, 5);
  return sprite;
}

function drawDiamond(context, x, y, halfWidth, halfHeight) {
  context.beginPath();
  context.moveTo(x, y - halfHeight);
  context.lineTo(x + halfWidth, y);
  context.lineTo(x, y + halfHeight);
  context.lineTo(x - halfWidth, y);
  context.closePath();
  context.fill();
}

function createAudio() {
  let audioContext = null;

  function getContext() {
    if (LOW_PERF_DEVICE) return null;
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      audioContext = new AudioCtor();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function tone(freq, duration, type, gainValue) {
    const audioRef = getContext();
    if (!audioRef) return;
    const osc = audioRef.createOscillator();
    const gain = audioRef.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(gainValue, audioRef.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioRef.currentTime + duration);
    osc.connect(gain).connect(audioRef.destination);
    osc.start();
    osc.stop(audioRef.currentTime + duration);
  }

  return {
    start: () => tone(280, 0.08, "triangle", 0.016),
    shoot: () => tone(920, 0.08, "square", 0.012),
    fail: () => tone(140, 0.2, "sawtooth", 0.018),
  };
}
