export function createCsmMode(config) {
  const { width, height, lowPerf, onCleared, onFail, getSpawnType, sprite } = config;
  const MAX_OBSTACLES = 8;
  const groundY = height - Math.round(height * 0.16);
  const playerX = Math.round(width * 0.22);
  const playerWidth = Math.round(width * 0.082);
  const playerHeight = Math.round(height * 0.15);
  const spacing = Math.round(width * 0.24);
  const spawnX = width + Math.round(width * 0.08);
  const startSpeed = Math.round(width * 0.38);
  const speedStep = Math.round(width * 0.016);
  const maxSpeed = Math.round(width * 0.48);
  const gravity = height * 5.4;
  const jumpVelocity = -height * 1.3;
  const variants = [
    { width: Math.round(width * 0.05), height: Math.round(height * 0.12) },
    { width: Math.round(width * 0.068), height: Math.round(height * 0.14) },
    { width: Math.round(width * 0.084), height: Math.round(height * 0.16) },
  ];

  const state = {
    speed: startSpeed,
    playerY: groundY,
    playerVY: 0,
    playerTilt: 0,
    onGround: true,
    spawnOrdinal: 0,
    obstacles: Array.from({ length: MAX_OBSTACLES }, () => ({
      active: false,
      type: "standard",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      scored: false,
    })),
  };

  function reset(phaseIndex) {
    state.speed = Math.min(maxSpeed, startSpeed + phaseIndex * speedStep);
    state.playerY = groundY;
    state.playerVY = 0;
    state.playerTilt = 0;
    state.onGround = true;
    state.spawnOrdinal = 0;
    for (const obstacle of state.obstacles) {
      obstacle.active = false;
    }
    for (let index = 0; index < 4; index += 1) {
      spawnObstacle(index * spacing);
    }
  }

  function setPhase(phaseIndex) {
    state.speed = Math.min(maxSpeed, startSpeed + phaseIndex * speedStep);
  }

  function primaryAction() {
    if (!state.onGround) return;
    state.playerVY = jumpVelocity;
    state.playerTilt = -0.15;
    state.onGround = false;
  }

  function update(dt) {
    state.playerVY += gravity * dt;
    state.playerY += state.playerVY * dt;
    state.playerTilt = Math.min(0.18, state.playerTilt + dt * 0.75);

    if (state.playerY >= groundY) {
      state.playerY = groundY;
      state.playerVY = 0;
      state.playerTilt = 0;
      state.onGround = true;
    }

    const playerLeft = playerX - playerWidth * 0.4;
    const playerRight = playerX + playerWidth * 0.4;
    const playerTop = state.playerY - playerHeight + 6;
    const playerBottom = state.playerY - 4;

    let rightmostX = -Infinity;
    for (const obstacle of state.obstacles) {
      if (!obstacle.active) continue;
      obstacle.x -= state.speed * dt;
      rightmostX = Math.max(rightmostX, obstacle.x);

      if (!obstacle.scored && obstacle.x + obstacle.width < playerLeft) {
        obstacle.scored = true;
        onCleared(obstacle.type === "proposal");
      }

      const overlaps =
        playerLeft < obstacle.x + obstacle.width &&
        playerRight > obstacle.x &&
        playerTop < obstacle.y + obstacle.height &&
        playerBottom > obstacle.y;
      if (overlaps) {
        onFail();
        return;
      }

      if (obstacle.x + obstacle.width < -obstacle.width) {
        obstacle.active = false;
      }
    }

    if (rightmostX < width - spacing) {
      spawnObstacle();
    }
  }

  function render(ctx, theme) {
    for (const obstacle of state.obstacles) {
      if (!obstacle.active) continue;
      ctx.fillStyle = obstacle.type === "proposal" ? theme.proposal : theme.floor;
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }

    if (lowPerf) {
      ctx.drawImage(sprite, playerX - sprite.width * 0.5, state.playerY - playerHeight);
      return;
    }

    ctx.save();
    ctx.translate(playerX, state.playerY - playerHeight * 0.5);
    ctx.rotate(state.playerTilt);
    ctx.drawImage(sprite, -sprite.width * 0.5, -sprite.height * 0.5);
    ctx.restore();
  }

  function spawnObstacle(offset = 0) {
    const obstacle = getInactiveObstacle();
    if (!obstacle) return;

    state.spawnOrdinal += 1;
    const type = getSpawnType(state.spawnOrdinal);
    const variant = type === "proposal" ? { width: Math.round(width * 0.09), height: Math.round(height * 0.17) } : variants[(Math.random() * variants.length) | 0];

    obstacle.active = true;
    obstacle.type = type;
    obstacle.width = variant.width;
    obstacle.height = variant.height;
    obstacle.x = spawnX + offset;
    obstacle.y = groundY - obstacle.height;
    obstacle.scored = false;
  }

  function getInactiveObstacle() {
    for (const obstacle of state.obstacles) {
      if (!obstacle.active) return obstacle;
    }
    return state.obstacles[0];
  }

  return {
    reset,
    setPhase,
    update,
    render,
    primaryAction,
  };
}
