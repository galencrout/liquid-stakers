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

const MODE_DELEGATED = "Delegated (Exit Queue Lag)";
const MODE_STVAULTS = "stVaults (Instant Control)";
const TEX_ETH = "logo-eth";
const TEX_LIDO = "logo-lido";
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

  create() {
    this.background();
    this.createLogoTextures();

    this.roundEnded = false;
    this.roundStartedAt = this.time.now;
    this.mode = MODE_DELEGATED;
    this.baseLagMs = 1200;
    this.currentLagMs = this.baseLagMs;
    this.inLagSpike = false;
    this.nextLagSpikeAt = this.time.now + Phaser.Math.Between(3500, 7000);
    this.lagSpikeUntil = 0;

    this.inputQueue = [];
    this.playerState = { moveX: 0, shoot: false };

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
      one: Phaser.Input.Keyboard.KeyCodes.ONE,
      two: Phaser.Input.Keyboard.KeyCodes.TWO,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    this.input.keyboard.on("keydown-ONE", () => this.setMode(MODE_DELEGATED));
    this.input.keyboard.on("keydown-TWO", () => this.setMode(MODE_STVAULTS));
    this.input.keyboard.on("keydown-R", () => {
      if (this.roundEnded) {
        this.scene.restart();
      }
    });

    this.hudPanel = this.add
      .rectangle(GAME_WIDTH / 2, 22, GAME_WIDTH - 20, 34, 0x050913, 0.75)
      .setStrokeStyle(1, 0x395072, 0.8)
      .setDepth(20);
    this.hudText = this.add.text(18, 11, "", {
      fontSize: "16px",
      color: "#f2f8ff",
    }).setDepth(21);
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
        GAME_WIDTH / 2,
        GAME_HEIGHT - 20,
        "Move: Arrows/A,D  Fire: Space  Modes: 1 Delegated 2 stVaults",
        { fontSize: "14px", color: "#a9bfdc" }
      )
      .setOrigin(0.5)
      .setDepth(20);
    this.modeFlash = this.add
      .text(GAME_WIDTH / 2, 72, "INSTANT LIQUIDITY ACTIATED", {
        fontSize: "26px",
        color: "#ffffff",
        backgroundColor: "#1a9be8",
        padding: { left: 12, right: 12, top: 6, bottom: 6 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setAlpha(0)
      .setVisible(false);

    this.endGroup = this.add.container(0, 0);
    this.updateModeVisuals();
    this.updateHUD();
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
    const prevMode = this.mode;
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
    this.updateModeVisuals();
    this.updateHUD();

    if (mode === MODE_STVAULTS && prevMode !== MODE_STVAULTS) {
      this.flashModeActivation();
    }
    if (mode === MODE_DELEGATED && prevMode !== MODE_DELEGATED) {
      this.flashDelegatedActivation();
    }
  }

  flashModeActivation() {
    this.tweens.killTweensOf(this.modeFlash);
    this.modeFlash
      .setText("INSTANT LIQUIDITY ACTIATED")
      .setStyle({ backgroundColor: "#1a9be8" })
      .setVisible(true)
      .setAlpha(1)
      .setScale(0.9);
    this.tweens.add({
      targets: this.modeFlash,
      scaleX: 1,
      scaleY: 1,
      duration: 90,
      ease: "Back.Out",
    });
    this.tweens.add({
      targets: this.modeFlash,
      alpha: 0,
      delay: 650,
      duration: 260,
      ease: "Quad.In",
      onComplete: () => this.modeFlash.setVisible(false),
    });
  }

  flashDelegatedActivation() {
    this.tweens.killTweensOf(this.modeFlash);
    this.modeFlash
      .setText("Delegate staking: exit queue in effect")
      .setStyle({ backgroundColor: "#b94949" })
      .setVisible(true)
      .setAlpha(1)
      .setScale(0.9);
    this.tweens.add({
      targets: this.modeFlash,
      scaleX: 1,
      scaleY: 1,
      duration: 90,
      ease: "Back.Out",
    });
    this.tweens.add({
      targets: this.modeFlash,
      alpha: 0,
      delay: 680,
      duration: 260,
      ease: "Quad.In",
      onComplete: () => this.modeFlash.setVisible(false),
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
    const left = this.cursors.left.isDown || this.keys.a.isDown;
    const right = this.cursors.right.isDown || this.keys.d.isDown;
    const moveX = (right ? 1 : 0) - (left ? 1 : 0);
    const shoot = this.cursors.space.isDown || this.keys.space.isDown;
    return { moveX, shoot };
  }

  enqueueInput(now) {
    const raw = this.captureRawInput();
    const previous = this.lastRawInput;
    const changed = !previous || previous.moveX !== raw.moveX || previous.shoot !== raw.shoot;
    if (!changed) return;

    this.lastRawInput = raw;
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

    const restart = this.add.text(GAME_WIDTH / 2, 444, "Press R to restart", {
      fontSize: "24px",
      color: "#ff9f9f",
    }).setOrigin(0.5);

    this.endGroup.add([overlay, title, score, mode, explain, detail, restart]);
  }

  updateHUD() {
    const elapsed = this.time.now - this.roundStartedAt;
    const remaining = Math.max(0, ROUND_LENGTH_MS - elapsed);
    const modeLabel = this.mode === MODE_DELEGATED ? "Delegated" : "stVaults";
    this.hudText.setText(
      `Score ${this.score}   Time ${(remaining / 1000).toFixed(1)}s   Mode ${modeLabel}   Lag ${Math.round(this.currentLagMs)}ms`
    );
    this.spikeBadge.setVisible(this.inLagSpike);
  }

  update(_, delta) {
    const now = this.time.now;
    const deltaSec = delta / 1000;

    if (this.roundEnded) {
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

    if (now - this.roundStartedAt >= ROUND_LENGTH_MS) {
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
