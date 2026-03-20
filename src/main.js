import Phaser from "phaser";
import "./style.css";

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const ROUND_LENGTH_MS = 60_000;
const PLAYER_Y = 560;
const PLAYER_SPEED = 320;
const BULLET_SPEED = -520;
const BULLET_COOLDOWN_MS = 220;
const ENEMY_ICON_W = 28;
const ENEMY_ICON_H = 36;
const ENEMY_START_Y = 110;
const ENEMY_GAP_X = 52;
const ENEMY_GAP_Y = 42;
const ENEMY_DROP = 18;
const PLAYER_ZONE_Y = 500;
const PLAYER_ICON_W = 34;
const PLAYER_ICON_H = 44;
const ENEMY_FORMATION = [
  "00111111100",
  "01101110110",
  "11111111111",
  "11011110111",
  "01100110010",
];
const GAMEPAD_DEADZONE = 0.45;

const MODE_DELEGATED = "Delegated (Exit Queue Lag)";
const MODE_STVAULTS = "stVaults (Instant Control)";
const TEX_ETH = "logo-eth";
const TEX_LIDO = "logo-lido";
const HOME_URL = "./index.html";
const ENEMY_TIERS = [
  { hp: 3, tint: 0x6efc87 }, // Green: 3 hits
  { hp: 3, tint: 0x6efc87 },
  { hp: 2, tint: 0xff6b6b }, // Red: 2 hits
  { hp: 2, tint: 0xff6b6b },
  { hp: 1, tint: 0x65b9ff }, // Blue: 1 hit
];

class StakeInvadersScene extends Phaser.Scene {
  constructor() {
    super("StakeInvaders");
  }

  create(data = {}) {
    this.background();
    this.createLogoTextures();

    this.roundEnded = false;
    this.gameStarted = false;
    this.roundStartedAt = null;
    this.introStage = data?.difficultyOnly ? 4 : 1;
    this.musicStarted = false;
    this.musicStep = 0;
    this.mode = MODE_DELEGATED;
    this.pendingAutoStartMode = data?.autoStartMode ?? null;
    this.baseLagMs = 1200;
    this.currentLagMs = this.baseLagMs;
    this.inLagSpike = false;
    this.nextLagSpikeAt = this.time.now + Phaser.Math.Between(3500, 7000);
    this.lagSpikeUntil = 0;

    this.inputQueue = [];
    this.playerState = { moveX: 0, shoot: false };
    this.gamepadButtons = {};
    this.gamepadStickHeld = false;
    this.gamepadVerticalHeld = false;
    this.startSelectHeld = false;
    this.menuOpen = false;
    this.menuIndex = 0;
    this.menuOptions = [];

    this.score = 0;
    this.lastFireAt = -BULLET_COOLDOWN_MS;

    this.player = this.add
      .image(GAME_WIDTH / 2, PLAYER_Y, TEX_ETH)
      .setDisplaySize(PLAYER_ICON_W, PLAYER_ICON_H);

    this.bullets = this.add.group();
    this.enemyBullets = this.add.group();

    this.createEnemies();

    this.enemyDirection = 1;
    this.enemySpeed = 70;

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      h: Phaser.Input.Keyboard.KeyCodes.H,
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    this.input.keyboard.on("keydown-ONE", () => this.handleDifficultyChoice(MODE_DELEGATED));
    this.input.keyboard.on("keydown-TWO", () => this.handleDifficultyChoice(MODE_STVAULTS));
    this.input.keyboard.on("keydown-H", () => this.toggleHelpOverlay());
    this.input.keyboard.on("keydown-ENTER", () => this.handlePrimaryAction());
    this.input.keyboard.on("keydown-SPACE", () => this.handlePrimaryAction());

    this.hudPanel = this.add
      .rectangle(GAME_WIDTH / 2, 22, GAME_WIDTH - 20, 34, 0x050913, 0.75)
      .setStrokeStyle(1, 0x395072, 0.8)
      .setDepth(20);
    this.hudText = this.add.text(18, 11, "", {
      fontSize: "16px",
      color: "#f2f8ff",
    }).setDepth(21);
    this.switchModeHintBg = this.add
      .rectangle(GAME_WIDTH / 2, 54, 360, 24, 0x10233d, 0.9)
      .setStrokeStyle(1, 0x3f618d, 0.9)
      .setDepth(21);
    this.switchModeHint = this.add
      .text(GAME_WIDTH / 2, 46, "", {
        fontSize: "13px",
        color: "#d8ebff",
      })
      .setOrigin(0.5, 0)
      .setDepth(22);
    this.spikeBadge = this.add
      .text(GAME_WIDTH - 18, 11, "SPIKE", {
        fontSize: "15px",
        color: "#ffffff",
        backgroundColor: "#d83b3b",
        padding: { left: 6, right: 6, top: 1, bottom: 1 },
      })
      .setOrigin(1, 0)
      .setDepth(21)
      .setVisible(false);
    this.controlsHint = this.add
      .text(
        14,
        GAME_HEIGHT - 20,
        "Arcade: Stick moves, A fires, L/R pick difficulty, Start or Select opens menu",
        { fontSize: "14px", color: "#a9bfdc" }
      )
      .setOrigin(0, 0.5)
      .setDepth(20);
    this.modeTopFlash = this.add
      .text(GAME_WIDTH / 2, 72, "", {
        fontSize: "22px",
        color: "#ffffff",
        backgroundColor: "#1a9be8",
        padding: { left: 12, right: 12, top: 6, bottom: 6 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setAlpha(0)
      .setVisible(false);
    this.modeBottomPrompt = this.add
      .text(GAME_WIDTH / 2, 106, "", {
        fontSize: "18px",
        color: "#d5f4ff",
        backgroundColor: "#123657",
        padding: { left: 10, right: 10, top: 4, bottom: 4 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setAlpha(0)
      .setVisible(false);
    this.delegatedInputBadge = this.add
      .text(GAME_WIDTH - 12, GAME_HEIGHT - 8, "Delegated Staking", {
        fontSize: "15px",
        color: "#ffe2e2",
        backgroundColor: "#4b1f1f",
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
      })
      .setOrigin(1, 1)
      .setDepth(26)
      .setAlpha(0.8);
    this.stvaultsInputBadge = this.add
      .text(GAME_WIDTH - 12, GAME_HEIGHT - 8, "stVaults", {
        fontSize: "15px",
        color: "#d6f8ff",
        backgroundColor: "#113b62",
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
      })
      .setOrigin(1, 1)
      .setDepth(26)
      .setAlpha(0.8);

    this.endGroup = this.add.container(0, 0);
    this.createIntroOverlay();
    this.createHelpOverlay();
    this.createPauseMenu();
    this.updateInputBadgeVisibility();
    this.updateModeVisuals();
    this.updateHUD();
    this.startMusic();

    if (this.pendingAutoStartMode) {
      this.setMode(this.pendingAutoStartMode);
      this.startGame();
    }

    this.events.on("shutdown", () => this.stopMusic());
    this.events.on("destroy", () => this.stopMusic());
  }

  background() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0d1324);
    this.add.rectangle(GAME_WIDTH / 2, 132, GAME_WIDTH, 220, 0x111c34, 0.8);
    this.add.line(0, PLAYER_ZONE_Y, 0, 0, GAME_WIDTH, 0, 0xff5252, 0.55).setOrigin(0, 0.5);
  }

  createLogoTextures() {
    const eth = this.make.graphics({ x: 0, y: 0, add: false });
    eth.fillStyle(0xe6ebff, 1);
    eth.fillPoints(
      [
        new Phaser.Geom.Point(16, 2),
        new Phaser.Geom.Point(28, 18),
        new Phaser.Geom.Point(16, 24),
        new Phaser.Geom.Point(4, 18),
      ],
      true
    );
    eth.fillStyle(0xb3c0ff, 1);
    eth.fillPoints(
      [
        new Phaser.Geom.Point(16, 26),
        new Phaser.Geom.Point(28, 20),
        new Phaser.Geom.Point(16, 42),
        new Phaser.Geom.Point(4, 20),
      ],
      true
    );
    eth.generateTexture(TEX_ETH, 32, 44);
    eth.destroy();

    const lido = this.make.graphics({ x: 0, y: 0, add: false });
    const lidoBlue = 0x1a9be8;

    // Bottom blue circle
    lido.fillStyle(lidoBlue, 1);
    lido.fillCircle(16, 31, 13);

    // White notch between top and bottom sections
    lido.fillStyle(0xffffff, 1);
    lido.fillPoints(
      [
        new Phaser.Geom.Point(16, 21),
        new Phaser.Geom.Point(24, 24),
        new Phaser.Geom.Point(16, 29),
        new Phaser.Geom.Point(8, 24),
      ],
      true
    );

    // Top outlined droplet
    lido.lineStyle(4, lidoBlue, 1);
    lido.beginPath();
    lido.moveTo(16, 3);
    lido.lineTo(26, 17);
    lido.lineTo(16, 23);
    lido.lineTo(6, 17);
    lido.closePath();
    lido.strokePath();

    // Hollow center in droplet
    lido.fillStyle(0xffffff, 1);
    lido.fillPoints(
      [
        new Phaser.Geom.Point(16, 8),
        new Phaser.Geom.Point(22, 17),
        new Phaser.Geom.Point(16, 20),
        new Phaser.Geom.Point(10, 17),
      ],
      true
    );
    lido.generateTexture(TEX_LIDO, 32, 44);
    lido.destroy();
  }

  createIntroOverlay() {
    this.modalBackdrop = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x01030a, 0.72)
      .setDepth(38)
      .setVisible(true);

    this.introPanel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 730, 470, 0x02060f, 1)
      .setStrokeStyle(2, 0x3f5e8a, 0.9);
    this.introTitle = this.add.text(GAME_WIDTH / 2, 170, "Liquid Stakers", {
      fontSize: "40px",
      color: "#f4fbff",
    }).setOrigin(0.5);
    this.introBody = this.add.text(
      GAME_WIDTH / 2,
      200,
      "",
      {
        fontSize: "16px",
        color: "#d7e9ff",
        align: "center",
        wordWrap: { width: 640 },
        lineSpacing: 8,
      }
    ).setOrigin(0.5, 0);
    this.introHint = this.add.text(
      GAME_WIDTH / 2,
      500,
      "",
      {
        fontSize: "20px",
        color: "#7de2ff",
        align: "center",
        wordWrap: { width: 660 },
      }
    ).setOrigin(0.5);

    this.introContinueBox = this.add.rectangle(GAME_WIDTH / 2, 500, 260, 40, 0x16365a, 0.88)
      .setStrokeStyle(1, 0x74d7ff, 0.8);

    this.introGroup = this.add.container(0, 0, [
      this.introPanel,
      this.introTitle,
      this.introBody,
      this.introContinueBox,
      this.introHint,
    ]).setDepth(40);

    this.showIntroStage(this.introStage);
  }

  showIntroStage(stage) {
    if (!this.introGroup) return;
    this.introStage = stage;

    if (stage === 1) {
      this.introTitle.setText("Liquid Stakers");
      this.introBody.setText(
        "Welcome to Liquid Stakers-a game to understand the opportunity costs of the Ethereum Exit Queue.\n\nIn traditional staking, users are subject to rate limits when they want to unwind their position."
      );
      this.introHint.setText("[press A or Start to continue]");
      this.introContinueBox.setDisplaySize(330, 40);
    } else if (stage === 2) {
      this.introTitle.setText("Why It Matters");
      this.introBody.setText(
        "It can take days (or months!) to exit a native or delegated staking setup.\n\nWith stVaults, stakers can adjust their position on demand - in seconds.\n\nWhy is this important? Markets are dynamic. Reaction time is everything."
      );
      this.introHint.setText("[press A or Start for rules]");
      this.introContinueBox.setDisplaySize(320, 40);
    } else if (stage === 3) {
      this.introTitle.setText("Rules");
      this.introBody.setText(
        "Survive 60 seconds and score points by clearing invaders.\n\nBlue enemies: 1 shot. Red enemies: 2 shots. Green enemies: 3 shots.\n\nDelegated mode applies delayed inputs plus random lag spikes.\nstVaults mode applies instant input response.\n\nIf enemies reach your validator zone, the round ends."
      );
      this.introHint.setText("[press A or Start to choose difficulty]");
      this.introContinueBox.setDisplaySize(430, 40);
    } else {
      this.introTitle.setText("Choose a Difficulty");
      this.introBody.setText(
        "Press L or move left for Delegated Staking.\n\nPress R or move right for stVaults."
      );
      this.introHint.setText("[L = Delegated, R = stVaults, B = back]");
      this.introContinueBox.setDisplaySize(420, 40);
    }

    this.introTitle.setY(170);
    this.introBody.setY(200);
    this.introContinueBox.setY(500);
    this.introHint.setY(500);
  }

  handlePrimaryAction() {
    if (this.menuOpen) {
      this.activatePauseSelection();
      return;
    }
    if (this.helpGroup?.visible) return;
    if (this.roundEnded) {
      this.returnToDifficultySelection();
      return;
    }
    if (this.gameStarted) return;
    this.ensureAudioRunning();
    if (this.introStage === 1) {
      this.showIntroStage(2);
      return;
    }
    if (this.introStage === 2) {
      this.showIntroStage(3);
      return;
    }
    if (this.introStage === 3) {
      this.showIntroStage(4);
    }
  }

  handleDifficultyChoice(mode) {
    if (this.roundEnded || this.helpGroup?.visible || this.gameStarted) return;
    if (!this.introGroup || this.introStage !== 4) return;
    this.setMode(mode);
    this.startGame();
  }

  returnToDifficultySelection() {
    this.closePauseMenu();
    this.scene.restart({ difficultyOnly: true });
  }

  createHelpOverlay() {
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 640, 340, 0x071122, 0.96)
      .setStrokeStyle(2, 0x3c5f8f, 0.9);
    const title = this.add.text(GAME_WIDTH / 2, 176, "Help", {
      fontSize: "32px",
      color: "#f3fbff",
    }).setOrigin(0.5);
    const body = this.add.text(
      GAME_WIDTH / 2,
      270,
      "Controls: arcade stick moves, A fires, L chooses Delegated, R chooses stVaults.\nPress Start or Select during a run to open the game menu.\nBlue enemies take 1 shot, red 2, green 3.",
      {
        fontSize: "18px",
        color: "#dcecff",
        align: "center",
        wordWrap: { width: 580 },
        lineSpacing: 9,
      }
    ).setOrigin(0.5);
    const close = this.add.text(GAME_WIDTH / 2, 386, "Press B, A, Start, or Select to close", {
      fontSize: "18px",
      color: "#7de2ff",
    }).setOrigin(0.5);

    this.helpGroup = this.add.container(0, 0, [panel, title, body, close]).setDepth(39).setVisible(false);
  }

  createPauseMenu() {
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 440, 300, 0x081325, 0.97)
      .setStrokeStyle(2, 0x61a9f0, 0.92);
    const title = this.add.text(GAME_WIDTH / 2, 188, "Game Menu", {
      fontSize: "32px",
      color: "#f3fbff",
    }).setOrigin(0.5);
    this.pauseMenuItems = [0, 1, 2, 3].map((i) =>
      this.add.text(GAME_WIDTH / 2, 238 + i * 34, "", {
        fontSize: "22px",
        color: "#d4e8ff",
      }).setOrigin(0.5)
    );
    const footer = this.add.text(GAME_WIDTH / 2, 360, "Stick: move   A/Start: choose   B: close", {
      fontSize: "16px",
      color: "#7de2ff",
    }).setOrigin(0.5);

    this.pauseMenuGroup = this.add
      .container(0, 0, [panel, title, ...this.pauseMenuItems, footer])
      .setDepth(41)
      .setVisible(false);
  }

  openPauseMenu() {
    this.menuOptions = [
      { label: "Resume", action: () => this.closePauseMenu() },
      { label: "Restart Round", action: () => this.scene.restart({ difficultyOnly: true, autoStartMode: this.mode }) },
      { label: "Choose Difficulty", action: () => this.returnToDifficultySelection() },
      { label: "Back To Game Select", action: () => { window.location.href = HOME_URL; } },
    ];
    this.menuIndex = 0;
    this.menuOpen = true;
    this.pauseMenuGroup.setVisible(true);
    if (this.modalBackdrop) this.modalBackdrop.setVisible(true);
    this.refreshPauseMenu();
  }

  closePauseMenu() {
    this.menuOpen = false;
    this.pauseMenuGroup?.setVisible(false);
    if (this.modalBackdrop && !this.helpGroup?.visible && !this.introGroup) {
      this.modalBackdrop.setVisible(false);
    }
  }

  refreshPauseMenu() {
    this.pauseMenuItems.forEach((item, i) => {
      const selected = i === this.menuIndex;
      item
        .setText(`${selected ? ">" : " "} ${this.menuOptions[i]?.label ?? ""}`)
        .setColor(selected ? "#9ee3ff" : "#d4e8ff");
    });
  }

  movePauseSelection(delta) {
    if (!this.menuOpen) return;
    this.menuIndex = Phaser.Math.Wrap(this.menuIndex + delta, 0, this.menuOptions.length);
    this.refreshPauseMenu();
  }

  activatePauseSelection() {
    if (!this.menuOpen) return;
    this.menuOptions[this.menuIndex]?.action?.();
  }

  toggleHelpOverlay() {
    if (!this.gameStarted || this.introGroup) return;
    if (this.roundEnded) return;
    if (!this.helpGroup) return;
    const next = !this.helpGroup.visible;
    this.helpGroup.setVisible(next);
    this.helpGroup.setAlpha(next ? 1 : 0);
    if (this.modalBackdrop) {
      this.modalBackdrop.setVisible(next);
    }
    if (next) {
      this.helpGroup.setAlpha(0);
      this.tweens.add({
        targets: this.helpGroup,
        alpha: 1,
        duration: 120,
      });
    }
  }

  startGame() {
    if (this.gameStarted || this.roundEnded) return;
    this.ensureAudioRunning();
    this.gameStarted = true;
    this.roundStartedAt = this.time.now;
    this.lastRawInput = null;
    this.inputQueue.length = 0;
    if (this.introGroup) {
      this.tweens.add({
        targets: this.introGroup,
        alpha: 0,
        duration: 180,
        onComplete: () => {
          this.introGroup.destroy();
          this.introGroup = null;
          if (this.modalBackdrop && !this.helpGroup?.visible) {
            this.modalBackdrop.setVisible(false);
          }
          if (this.mode === MODE_DELEGATED) {
            this.flashDelegatedActivation();
          } else {
            this.flashModeActivation();
          }
        },
      });
    }
  }

  playShootSound() {
    const ctx = this.sound?.context;
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(1000, start);
    osc.frequency.exponentialRampToValueAtTime(420, start + 0.09);
    osc.detune.setValueAtTime(Phaser.Math.Between(-45, 45), start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.085, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + 0.11);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  playMusicNote(midi, duration, type, gainLevel, detune = 0) {
    const ctx = this.sound?.context;
    if (!ctx || midi == null) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(this.midiToHz(midi), now);
    osc.detune.setValueAtTime(detune, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainLevel, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  tickMusic() {
    const bass = [40, 43, 47, 43, 38, 42, 45, 42];
    const counter = [64, 67, 69, 71, 72, 71, 69, 67, 66, 67, 69, 71, 72, 74, 71, 69];
    const arpeggio = [76, 72, 74, 69, 71, 67, 69, 64];

    const b = bass[this.musicStep % bass.length];
    const c = counter[this.musicStep % counter.length];
    const a = arpeggio[(this.musicStep * 2) % arpeggio.length];

    this.playMusicNote(b, 0.19, "triangle", 0.0275, 0);
    this.playMusicNote(c, 0.14, "square", 0.0163, Phaser.Math.Between(-6, 6));

    if (this.musicStep % 2 === 0) {
      this.playMusicNote(a, 0.11, "sawtooth", 0.0113, Phaser.Math.Between(-10, 10));
    }

    // Glitch accent for a retro-electronic edge.
    if (this.musicStep % 16 === 7 || Phaser.Math.Between(0, 28) === 0) {
      this.playMusicNote(c + 12, 0.05, "square", 0.01, Phaser.Math.Between(-120, 120));
    }

    this.musicStep += 1;
  }

  startMusic() {
    if (this.musicStarted) return;
    const ctx = this.sound?.context;
    if (!ctx) return;
    this.musicStarted = true;
    this.musicStep = 0;
    this.musicEvent = this.time.addEvent({
      delay: 180,
      loop: true,
      callback: this.tickMusic,
      callbackScope: this,
    });
  }

  stopMusic() {
    if (this.musicEvent) {
      this.musicEvent.remove(false);
      this.musicEvent = null;
    }
    this.musicStarted = false;
  }

  ensureAudioRunning() {
    const ctx = this.sound?.context;
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  createEnemies() {
    this.enemies = this.add.group();
    const cols = ENEMY_FORMATION[0].length;
    const startX = GAME_WIDTH / 2 - ((cols - 1) * ENEMY_GAP_X) / 2;

    for (let row = 0; row < ENEMY_FORMATION.length; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (ENEMY_FORMATION[row][col] !== "1") continue;
        const x = startX + col * ENEMY_GAP_X;
        const y = ENEMY_START_Y + row * ENEMY_GAP_Y;
        const tier = ENEMY_TIERS[row] ?? ENEMY_TIERS[ENEMY_TIERS.length - 1];
        const enemy = this.add
          .image(x, y, TEX_ETH)
          .setDisplaySize(ENEMY_ICON_W, ENEMY_ICON_H)
          .setTint(tier.tint);
        enemy.setData("hp", tier.hp);
        enemy.setData("maxHp", tier.hp);
        this.enemies.add(enemy);
      }
    }
  }

  currentTextureKey() {
    return this.mode === MODE_STVAULTS ? TEX_LIDO : TEX_ETH;
  }

  updateModeVisuals() {
    const key = this.currentTextureKey();
    this.player.setTexture(key).setDisplaySize(PLAYER_ICON_W, PLAYER_ICON_H);
    this.enemies
      .getChildren()
      .forEach((enemy) => enemy.setTexture(key).setDisplaySize(ENEMY_ICON_W, ENEMY_ICON_H));
  }

  setMode(mode) {
    if (this.roundEnded) return;
    this.mode = mode;
    if (mode === MODE_STVAULTS) {
      this.baseLagMs = 0;
      this.currentLagMs = 0;
      this.inLagSpike = false;
      this.inputQueue.length = 0;
    } else {
      this.baseLagMs = Phaser.Math.Between(800, 2000);
      this.currentLagMs = this.baseLagMs;
      this.nextLagSpikeAt = this.time.now + Phaser.Math.Between(3000, 6500);
    }
    this.updateInputBadgeVisibility();
    this.updateModeVisuals();
    this.updateHUD();
  }

  updateInputBadgeVisibility() {
    const delegated = this.mode === MODE_DELEGATED;
    this.delegatedInputBadge.setText("Delegated Staking");
    this.stvaultsInputBadge.setText("stVaults");
    this.delegatedInputBadge.setVisible(delegated);
    this.stvaultsInputBadge.setVisible(!delegated);
  }

  flashInputBadge() {
    const target = this.mode === MODE_DELEGATED ? this.delegatedInputBadge : this.stvaultsInputBadge;
    const flashText = this.mode === MODE_DELEGATED ? "Delayed Reaction" : "Instant Liquidity";
    const idleText = this.mode === MODE_DELEGATED ? "Delegated Staking" : "stVaults";
    this.tweens.killTweensOf(target);
    target.setText(flashText);
    target.setAlpha(1).setScale(1.03);
    this.tweens.add({
      targets: target,
      alpha: 0.8,
      scaleX: 1,
      scaleY: 1,
      duration: 170,
      ease: "Quad.Out",
      onComplete: () => target.setText(idleText),
    });
  }

  flashModeActivation() {
    this.flashModeNotice(
      "stVaults Mode (Instant Liquidity)",
      "Difficulty selected for this round",
      "#1a9be8",
      "#113b62"
    );
  }

  flashDelegatedActivation() {
    this.flashModeNotice(
      "Delegated Staking Mode (Exit Queue In Effect)",
      "Difficulty selected for this round",
      "#b94949",
      "#4b1f1f"
    );
  }

  flashModeNotice(topText, bottomText, topBg, bottomBg) {
    this.tweens.killTweensOf(this.modeTopFlash);
    this.tweens.killTweensOf(this.modeBottomPrompt);

    this.modeTopFlash
      .setText(topText)
      .setStyle({ backgroundColor: topBg })
      .setVisible(true)
      .setAlpha(1)
      .setScale(0.94);
    this.modeBottomPrompt
      .setText(bottomText)
      .setStyle({ backgroundColor: bottomBg })
      .setVisible(true)
      .setAlpha(1)
      .setScale(0.94);

    this.tweens.add({
      targets: [this.modeTopFlash, this.modeBottomPrompt],
      scaleX: 1,
      scaleY: 1,
      duration: 90,
      ease: "Back.Out",
    });
    this.tweens.add({
      targets: [this.modeTopFlash, this.modeBottomPrompt],
      alpha: 0,
      delay: 1230,
      duration: 390,
      ease: "Quad.In",
      onComplete: () => {
        this.modeTopFlash.setVisible(false);
        this.modeBottomPrompt.setVisible(false);
      },
    });
  }

  sampleLag(now) {
    if (this.mode === MODE_STVAULTS) {
      this.inLagSpike = false;
      this.currentLagMs = 0;
      return;
    }

    if (!this.inLagSpike && now >= this.nextLagSpikeAt) {
      this.inLagSpike = true;
      const spikeDuration = Phaser.Math.Between(600, 1300);
      this.lagSpikeUntil = now + spikeDuration;
      const spikeBoost = Phaser.Math.Between(700, 1300);
      this.currentLagMs = this.baseLagMs + spikeBoost;
    }

    if (this.inLagSpike && now >= this.lagSpikeUntil) {
      this.inLagSpike = false;
      this.baseLagMs = Phaser.Math.Between(800, 2000);
      this.currentLagMs = this.baseLagMs;
      this.nextLagSpikeAt = now + Phaser.Math.Between(3500, 8000);
    }

    if (!this.inLagSpike) {
      this.currentLagMs = this.baseLagMs;
    }
  }

  captureRawInput() {
    const pad = this.getPrimaryGamepad();
    const left = this.cursors.left.isDown || this.keys.a.isDown || this.isPadLeft(pad);
    const right = this.cursors.right.isDown || this.keys.d.isDown || this.isPadRight(pad);
    const moveX = (right ? 1 : 0) - (left ? 1 : 0);
    const shoot = this.cursors.space.isDown || this.keys.space.isDown || this.isPadShootPressed(pad);
    return { moveX, shoot };
  }

  getPrimaryGamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    return pads.find((pad) => pad?.connected) ?? null;
  }

  isPadLeft(pad) {
    if (!pad) return false;
    return (pad.axes[0] ?? 0) <= -GAMEPAD_DEADZONE || !!pad.buttons[14]?.pressed;
  }

  isPadRight(pad) {
    if (!pad) return false;
    return (pad.axes[0] ?? 0) >= GAMEPAD_DEADZONE || !!pad.buttons[15]?.pressed;
  }

  isPadShootPressed(pad) {
    if (!pad) return false;
    return !!pad.buttons[0]?.pressed || !!pad.buttons[2]?.pressed;
  }

  consumeGamepadEdge(name, isDown) {
    const wasDown = !!this.gamepadButtons[name];
    this.gamepadButtons[name] = isDown;
    return isDown && !wasDown;
  }

  pollGamepadUi() {
    const pad = this.getPrimaryGamepad();
    if (!pad) {
      this.gamepadStickHeld = false;
      this.gamepadVerticalHeld = false;
      this.startSelectHeld = false;
      return;
    }

    const primaryPressed =
      this.consumeGamepadEdge("primary0", !!pad.buttons[0]?.pressed) ||
      this.consumeGamepadEdge("primary2", !!pad.buttons[2]?.pressed) ||
      this.consumeGamepadEdge("start", !!pad.buttons[9]?.pressed);
    const helpPressed = this.consumeGamepadEdge("help", !!pad.buttons[3]?.pressed);
    const resetPressed = this.consumeGamepadEdge("reset", !!pad.buttons[8]?.pressed);
    const backPressed = this.consumeGamepadEdge("back", !!pad.buttons[1]?.pressed);
    const regularPressed = this.consumeGamepadEdge("regular", !!pad.buttons[4]?.pressed);
    const liquidPressed = this.consumeGamepadEdge("liquid", !!pad.buttons[5]?.pressed);

    const left = this.isPadLeft(pad);
    const right = this.isPadRight(pad);
    const up = (pad.axes[1] ?? 0) <= -GAMEPAD_DEADZONE || !!pad.buttons[12]?.pressed;
    const down = (pad.axes[1] ?? 0) >= GAMEPAD_DEADZONE || !!pad.buttons[13]?.pressed;
    const axisActive = left || right;
    const verticalActive = up || down;
    const leftPressed = left && !this.gamepadStickHeld;
    const rightPressed = right && !this.gamepadStickHeld;
    const upPressed = up && !this.gamepadVerticalHeld;
    const downPressed = down && !this.gamepadVerticalHeld;
    this.gamepadStickHeld = axisActive;
    this.gamepadVerticalHeld = verticalActive;

    const startSelectHeld = !!pad.buttons[8]?.pressed && !!pad.buttons[9]?.pressed;
    const startSelectPressed = startSelectHeld && !this.startSelectHeld;
    this.startSelectHeld = startSelectHeld;

    if (startSelectPressed) {
      window.location.href = HOME_URL;
      return;
    }

    if (helpPressed && this.gameStarted && !this.roundEnded) {
      this.toggleHelpOverlay();
    }

    if (this.helpGroup?.visible) {
      if (helpPressed || primaryPressed || resetPressed || backPressed) {
        this.toggleHelpOverlay();
      }
      return;
    }

    if (this.menuOpen) {
      if (upPressed) this.movePauseSelection(-1);
      if (downPressed) this.movePauseSelection(1);
      if (primaryPressed) this.activatePauseSelection();
      if (backPressed || resetPressed) this.closePauseMenu();
      return;
    }

    if (this.roundEnded) {
      if (primaryPressed || resetPressed || backPressed) this.returnToDifficultySelection();
      return;
    }

    if (!this.gameStarted) {
      if (this.introStage < 4) {
        if (backPressed && this.introStage > 1) this.showIntroStage(this.introStage - 1);
        if (primaryPressed) this.handlePrimaryAction();
        return;
      }

      if (backPressed) {
        this.showIntroStage(3);
        return;
      }
      if (regularPressed) this.handleDifficultyChoice(MODE_DELEGATED);
      if (liquidPressed) this.handleDifficultyChoice(MODE_STVAULTS);
      if (leftPressed) this.handleDifficultyChoice(MODE_DELEGATED);
      if (rightPressed) this.handleDifficultyChoice(MODE_STVAULTS);
      if (this.consumeGamepadEdge("delegated", !!pad.buttons[14]?.pressed)) {
        this.handleDifficultyChoice(MODE_DELEGATED);
      }
      if (this.consumeGamepadEdge("stvaults", !!pad.buttons[15]?.pressed)) {
        this.handleDifficultyChoice(MODE_STVAULTS);
      }
      if (primaryPressed) {
        this.handleDifficultyChoice(left ? MODE_DELEGATED : MODE_STVAULTS);
      }
      return;
    }

    if (this.consumeGamepadEdge("menuStart", !!pad.buttons[9]?.pressed) || resetPressed) {
      this.openPauseMenu();
      return;
    }

    if (backPressed) {
      this.openPauseMenu();
    }
  }

  enqueueInput(now) {
    const raw = this.captureRawInput();
    const previous = this.lastRawInput;
    const changed = !previous || previous.moveX !== raw.moveX || previous.shoot !== raw.shoot;
    if (!changed) return;

    this.lastRawInput = raw;
    if (this.gameStarted && !this.roundEnded) {
      this.flashInputBadge();
    }
    this.inputQueue.push({
      tApply: now + this.currentLagMs,
      moveX: raw.moveX,
      shoot: raw.shoot,
    });
  }

  applyQueuedInput(now) {
    while (this.inputQueue.length && this.inputQueue[0].tApply <= now) {
      const next = this.inputQueue.shift();
      this.playerState.moveX = next.moveX;
      this.playerState.shoot = next.shoot;
    }
  }

  movePlayer(deltaSec) {
    this.player.x += this.playerState.moveX * PLAYER_SPEED * deltaSec;
    this.player.x = Phaser.Math.Clamp(this.player.x, 24, GAME_WIDTH - 24);
  }

  fireBullet(now) {
    if (!this.playerState.shoot) return;
    if (now - this.lastFireAt < BULLET_COOLDOWN_MS) return;

    this.lastFireAt = now;
    const bullet = this.add.rectangle(this.player.x, this.player.y - 16, 6, 16, 0xd4ecff);
    this.bullets.add(bullet);
    this.playShootSound();
  }

  updateBullets(deltaSec) {
    const dy = BULLET_SPEED * deltaSec;
    this.bullets.getChildren().forEach((bullet) => {
      bullet.y += dy;
      if (bullet.y < -20) {
        this.bullets.remove(bullet, true, true);
      }
    });
  }

  updateEnemies(deltaSec) {
    const shift = this.enemyDirection * this.enemySpeed * deltaSec;
    let hitEdge = false;

    this.enemies.getChildren().forEach((enemy) => {
      enemy.x += shift;
      if (enemy.x > GAME_WIDTH - 30 || enemy.x < 30) {
        hitEdge = true;
      }
    });

    if (hitEdge) {
      this.enemyDirection *= -1;
      this.enemies.getChildren().forEach((enemy) => {
        enemy.y += ENEMY_DROP;
      });
    }

    const reachedZone = this.enemies
      .getChildren()
      .some((enemy) => enemy.y + enemy.displayHeight / 2 >= PLAYER_ZONE_Y);

    if (reachedZone) {
      this.endRound("Enemy front reached your validator zone.");
    }
  }

  resolveCollisions() {
    const bullets = this.bullets.getChildren();
    const enemies = this.enemies.getChildren();

    bullets.forEach((bullet) => {
      for (let i = 0; i < enemies.length; i += 1) {
        const enemy = enemies[i];
        if (!enemy.active) continue;
        if (Phaser.Geom.Intersects.RectangleToRectangle(bullet.getBounds(), enemy.getBounds())) {
          this.bullets.remove(bullet, true, true);
          const hp = enemy.getData("hp") ?? 1;
          const nextHp = hp - 1;
          enemy.setData("hp", nextHp);
          this.showHitEffect(enemy.x, enemy.y, nextHp <= 0);

          if (nextHp <= 0) {
            this.enemies.remove(enemy, true, true);
            const maxHp = enemy.getData("maxHp") ?? 1;
            this.score += 10 * maxHp;
          } else {
            this.tweens.killTweensOf(enemy);
            enemy.setAlpha(0.45);
            this.tweens.add({
              targets: enemy,
              alpha: 1,
              scaleX: 1.12,
              scaleY: 1.12,
              yoyo: true,
              duration: 70,
              ease: "Quad.Out",
            });
          }
          break;
        }
      }
    });

    if (this.enemies.countActive(true) === 0) {
      this.endRound("You cleared all queue pressure before timeout.");
    }
  }

  showHitEffect(x, y, isKill) {
    const color = isKill ? 0xffe38c : 0xbdd9ff;
    const burst = this.add.circle(x, y, 5, color, 0.85).setDepth(19);
    this.tweens.add({
      targets: burst,
      radius: isKill ? 22 : 14,
      alpha: 0,
      duration: isKill ? 180 : 120,
      ease: "Cubic.Out",
      onComplete: () => burst.destroy(),
    });
  }

  endRound(reason) {
    if (this.roundEnded) return;
    this.roundEnded = true;

    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 560, 280, 0x02040a, 0.88);
    const title = this.add.text(GAME_WIDTH / 2, 220, "Round Complete", {
      fontSize: "40px",
      color: "#f7fbff",
    }).setOrigin(0.5);

    const score = this.add.text(GAME_WIDTH / 2, 275, `Score: ${this.score}`, {
      fontSize: "28px",
      color: "#8fe0ff",
    }).setOrigin(0.5);

    const mode = this.add.text(GAME_WIDTH / 2, 314, `Mode: ${this.mode}`, {
      fontSize: "22px",
      color: "#ffd17f",
    }).setOrigin(0.5);

    const explain = this.add.text(
      GAME_WIDTH / 2,
      352,
      this.mode === MODE_DELEGATED
        ? "Delegated staking adds queue lag and spikes before control updates apply."
        : "stVaults apply your inputs instantly, so control remains responsive.",
      {
        fontSize: "18px",
        color: "#f7fbff",
        align: "center",
        wordWrap: { width: 500 },
      }
    ).setOrigin(0.5);

    const detail = this.add.text(GAME_WIDTH / 2, 400, reason, {
      fontSize: "16px",
      color: "#c7d7ec",
      align: "center",
      wordWrap: { width: 520 },
    }).setOrigin(0.5);

    const restart = this.add.text(GAME_WIDTH / 2, 444, "Press A, B, Start, or Select for menu options", {
      fontSize: "24px",
      color: "#ff9f9f",
    }).setOrigin(0.5);

    this.endGroup.add([overlay, title, score, mode, explain, detail, restart]);
  }

  updateHUD() {
    const elapsed = this.gameStarted && this.roundStartedAt ? this.time.now - this.roundStartedAt : 0;
    const remaining = Math.max(0, ROUND_LENGTH_MS - elapsed);
    const modeLabel = this.mode === MODE_DELEGATED ? "Delegated" : "stVaults";
    const modeHint =
      this.mode === MODE_DELEGATED
        ? "Difficulty: Delegated Staking (chosen in intro)"
        : "Difficulty: stVaults Staking (chosen in intro)";
    this.hudText.setText(
      `Score ${this.score}   Time ${(remaining / 1000).toFixed(1)}s   Mode ${modeLabel}   Lag ${Math.round(this.currentLagMs)}ms`
    );
    this.switchModeHint.setText(modeHint);
    this.spikeBadge.setVisible(this.inLagSpike);
  }

  update(_, delta) {
    const now = this.time.now;
    const deltaSec = delta / 1000;

    this.pollGamepadUi();

    if (this.roundEnded) {
      this.updateHUD();
      return;
    }
    if (!this.gameStarted) {
      this.updateHUD();
      return;
    }
    if (this.helpGroup?.visible) {
      this.updateHUD();
      return;
    }

    this.sampleLag(now);
    this.enqueueInput(now);
    this.applyQueuedInput(now);

    this.movePlayer(deltaSec);
    this.fireBullet(now);
    this.updateBullets(deltaSec);
    this.updateEnemies(deltaSec);
    this.resolveCollisions();

    if (this.roundStartedAt && now - this.roundStartedAt >= ROUND_LENGTH_MS) {
      this.endRound("Time expired while queue pressure remained.");
    }

    this.updateHUD();
  }
}

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "app",
  backgroundColor: "#060913",
  scene: [StakeInvadersScene],
};

new Phaser.Game(config);
