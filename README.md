# LivingRoom Slides (MVP)

Browser-based skeuomorphic slideshow studio with analog projector feel.

## What is implemented

- Multi-image upload (`jpg/png/webp/heic` if browser supports decoding)
- Drag-and-drop slide ordering
- Skeuomorphic "living room projector" canvas scene
- Analog audio simulation (projector hum + transition clunk)
- Playback controls (auto/manual, speed, looping, keyboard shortcuts)
- Webcam presenter overlay
- In-browser recording export (`webm`) with aspect presets (16:9, 9:16, 1:1)

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Build production bundle:

```bash
npm run build
```

## Controls

- `Space` or `Right Arrow`: next slide
- `Left Arrow`: previous slide
- `F`: toggle fullscreen
- `M`: mute/unmute

## Notes and current limits

- This MVP is fully client-side (no backend persistence).
- "Share link" hosting and album integrations (Google/Apple Photos) are not yet implemented.
- Recording is exported as `webm`; transcoding to `mp4` would require a backend job or local ffmpeg step.
- Webcam + mic permissions are required for presenter recording.
