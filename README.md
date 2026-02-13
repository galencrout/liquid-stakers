# Liquid Stakers

Phaser 3 + Vite arcade demo that compares delayed delegated-control feel vs instant stVaults control.

## Setup

1. Install Node.js 18+.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run dev server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```
5. Preview build:
   ```bash
   npm run preview
   ```

## Controls

- `Left/Right` or `A/D`: move
- `Space`: shoot (220ms cooldown)
- `1`: Delegated mode (800-2000ms lag + occasional spikes)
- `2`: stVaults mode (0ms lag)
- `R`: restart after round ends

## Gameplay

- 60-second round on a single 800x600 screen.
- Clear invaders for points.
- Round ends if enemies reach the player zone or timer expires.
- HUD shows score, remaining time, mode, current lag, and `SPIKE` when lag spikes are active.

## Share on the internet (GitHub Pages)

1. Push this repo to GitHub (default branch: `main`).
2. In GitHub, open `Settings` -> `Pages`, and set **Source** to **GitHub Actions**.
3. Push to `main` again (or run the workflow manually from `Actions`).
4. Your live URL will be:
   `https://<your-github-username>.github.io/<repo-name>/`
