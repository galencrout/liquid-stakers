export function createVanillaMode(config) {
  const { width, height, lowPerf, onCleared, onFail, getSpawnType, sprite } = config;
  const MAX_COLUMNS = 8;
  const playerX = Math.round(width * 0.24);
  const playerWidth = Math.round(width * 0.075);
  const playerHeight = Math.round(height * 0.12);
  const floorY = height - Math.round(height * 0.14);
  const pipeWidth = Math.round(width * 0.09);
  const pipeSpacing = Math.round(width * 0.24);
  const gapHeight = Math.round(height * 0.28);
  const spawnX = width + pipeWidth;
  const startSpeed = Math.round(width * 0.24);
  const speedStep = Math.round(width * 0.012);
  const maxSpeed = Math.round(width * 0.32);
  const gravity = height * 2.5;
  const flapVelocity = -height * 0.85;
  const topLimit = Math.round(height * 0.12);

  const state = {
    speed: startSpeed,
    playerY: Math.round(height * 0.5),
    playerVY: 0,
    playerTilt: 0,
    spawnOrdinal: 0,
    columns: Array.from({ length: MAX_COLUMNS }, () => ({
      active: false,
      type: "standard",
      x: 0,
      topHeight: 0,
      bottomY: 0,
      scored: false,
    })),
  };

  function reset(phaseIndex) {
    state.speed = Math.min(maxSpeed, startSpeed + phaseIndex * speedStep);
    state.playerY = Math.round(height * 0.5);
    state.playerVY = 0;
    state.playerTilt = 0;
    state.spawnOrdinal = 0;
    for (const column of state.columns) {
      column.active = false;
    }
    for (let index = 0; index < 4; index += 1) {
      spawnColumn(index * pipeSpacing);
    }
  }

  function setPhase(phaseIndex) {
    state.speed = Math.min(maxSpeed, startSpeed + phaseIndex * speedStep);
  }

  function primaryAction() {
    state.playerVY = flapVelocity;
    state.playerTilt = -0.26;
  }

  function update(dt) {
    state.playerVY += gravity * dt;
    state.playerY += state.playerVY * dt;
    state.playerTilt = Math.min(0.3, state.playerTilt + dt * 0.9);

    if (state.playerY < topLimit) {
      state.playerY = topLimit;
      state.playerVY = 0;
    }
    if (state.playerY + playerHeight * 0.5 >= floorY) {
      onFail();
      return;
    }

    const playerLeft = playerX - playerWidth * 0.42;
    const playerRight = playerX + playerWidth * 0.42;
    const playerTop = state.playerY - playerHeight * 0.42;
    const playerBottom = state.playerY + playerHeight * 0.42;

    let rightmostX = -Infinity;
    for (const column of state.columns) {
      if (!column.active) continue;
      column.x -= state.speed * dt;
      rightmostX = Math.max(rightmostX, column.x);

      if (!column.scored && column.x + pipeWidth < playerLeft) {
        column.scored = true;
        onCleared(column.type === "proposal");
      }

      const overlapsX = playerLeft < column.x + pipeWidth && playerRight > column.x;
      if (!overlapsX) continue;
      if (playerTop < column.topHeight || playerBottom > column.bottomY) {
        onFail();
        return;
      }

      if (column.x + pipeWidth < -pipeWidth) {
        column.active = false;
      }
    }

    if (rightmostX < width - pipeSpacing) {
      spawnColumn();
    }
  }

  function render(ctx, theme) {
    const floorColor = theme.floor;
    const proposalColor = theme.proposal;

    for (const column of state.columns) {
      if (!column.active) continue;
      ctx.fillStyle = column.type === "proposal" ? proposalColor : floorColor;
      ctx.fillRect(column.x, 0, pipeWidth, column.topHeight);
      ctx.fillRect(column.x, column.bottomY, pipeWidth, floorY - column.bottomY);

      ctx.fillStyle = "rgba(7, 13, 19, 0.55)";
      ctx.fillRect(column.x - 4, column.topHeight - 8, pipeWidth + 8, 8);
      ctx.fillRect(column.x - 4, column.bottomY, pipeWidth + 8, 8);
    }

    drawPlayer(ctx);
  }

  function drawPlayer(ctx) {
    const drawX = playerX - sprite.width * 0.5;
    const drawY = state.playerY - sprite.height * 0.5;

    if (lowPerf) {
      ctx.drawImage(sprite, drawX, drawY);
      return;
    }

    ctx.save();
    ctx.translate(playerX, state.playerY);
    ctx.rotate(state.playerTilt);
    ctx.drawImage(sprite, -sprite.width * 0.5, -sprite.height * 0.5);
    ctx.restore();
  }

  function spawnColumn(offset = 0) {
    const column = getInactiveColumn();
    if (!column) return;

    state.spawnOrdinal += 1;
    const type = getSpawnType(state.spawnOrdinal);
    const gapCenter = height * 0.34 + Math.random() * height * 0.28;

    column.active = true;
    column.type = type;
    column.x = spawnX + offset;
    column.topHeight = Math.round(gapCenter - gapHeight * 0.5);
    column.bottomY = Math.round(gapCenter + gapHeight * 0.5);
    column.scored = false;
  }

  function getInactiveColumn() {
    for (const column of state.columns) {
      if (!column.active) return column;
    }
    return state.columns[0];
  }

  return {
    reset,
    setPhase,
    update,
    render,
    primaryAction,
  };
}
