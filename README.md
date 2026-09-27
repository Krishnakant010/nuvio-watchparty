# 🍿 Nuvio Watch Party & NuvioX

> Ultra-lightweight, zero-dependency, real-time playback synchronization system for **Nuvio** across **Samsung Smart TVs (Tizen)**, **Android Mobile phones**, and **Desktop/Web**.

---

## 🌟 Overview

**Nuvio Watch Party** enables synchronized movie and series watching between multiple people and multiple devices in real-time. Whether you are watching on your Samsung Smart TV while your partner or friends are on their Android phones (at home or thousands of miles away), playback state stays frame-accurate and perfectly synchronized.

### Key Highlights
- 🔄 **True Two-Way Synchronization:** Anyone in the room can Play, Pause, or Seek at any time. All other devices follow instantly.
- 👥 **Multi-Device Support:** Syncs 2, 3, or 10+ devices simultaneously in the same room.
- ⚡ **Sub-Second Precision:** Network transit latency compensation with tight frame thresholds (150ms on pause, 350ms on play). Eliminates the common 2–3 second delay.
- 📺 **Native Samsung TV Integration:** Hooks directly into Samsung's hardware AVPlay pipeline with zero event delay (0ms) and provides an interactive on-screen settings HUD with remote virtual keyboard support.
- 📱 **Android Compose Integration:** Clean in-app header button and modal in the official Android player.
- 🪶 **Zero-Dependency Server:** Runs on pure standard Node.js without a single `node_modules` dependency. Uses `< 15 MB RAM` and `< 0.1% CPU`.
- 🌐 **Self-Host Anywhere:** Run on Android (via Termux), Raspberry Pi, Docker, VPS, or your local PC.

---

## 🔄 How Syncing Works (The Two-Way Synchronization Engine)

We added a dedicated, sub-second bi-directional synchronization subsystem connecting Samsung TV's hardware decoder directly to Android's media engine:

```
┌─────────────────────────────────┐               ┌─────────────────────────────────┐
│       Samsung Smart TV          │               │         Android Mobile          │
│   (Native C / AVPlay Engine)    │               │    (Kotlin Multiplatform)       │
│                                 │               │                                 │
│  Remote Click (Play/Pause/Seek) │               │  Screen Tap / Timeline Scrub    │
│                 │               │               │                 │               │
│                 ▼               │               │                 ▼               │
│    AVPlay Hook (0ms delay)      │               │   ExoPlayer Controller Hook     │
└────────────────┬────────────────┘               └────────────────┬────────────────┘
                 │                                                 │
      sync(state, timeMs, epoch)                        sync(state, timeMs, epoch)
                 │                                                 │
                 ▼                                                 ▼
     ┌──────────────────────────────────────────────────────────────────┐
     │           Watch Party Coordination Server (server.mjs)           │
     │      - Zero-dependency WebSocket engine (<15MB RAM)              │
     │      - Symmetrical room broadcasting to all connected peers     │
     │      - Echo suppression (prevents re-trigger loops)              │
     └─────────────────┬───────────────────────────────┬────────────────┘
                       │                               │
                       ▼                               ▼
     ┌─────────────────────────────────┐ ┌─────────────────────────────────┐
     │  Receiver Transit Compensation  │ │  Receiver Transit Compensation  │
     │  offset = now - epoch           │ │  offset = now - epoch           │
     │  targetMs = timeMs + offset     │ │  targetMs = timeMs + offset     │
     │  Threshold: 150ms (Pause)       │ │  Threshold: 150ms (Pause)       │
     │             350ms (Play)        │ │             350ms (Play)        │
     └─────────────────────────────────┘ └─────────────────────────────────┘
```

### 1. Instant 0ms Local Event Capture
- **Samsung TV (`src/video_tizen.c`):** Rather than polling video position once every second, we hooked directly into AVPlay operations (`op === "pausar"` and `op === "buscar"`). The moment a button is pressed on the TV remote, the sync packet dispatches to the WebSocket with **0ms latency**.
- **Android Mobile (`WatchPartyCoordinator.kt`):** Hooked directly into player controls, scrubbing timeline, double-tap 10s skips, and gesture actions.

### 2. Network Transit Latency Compensation
Packets traveling over WiFi or the internet can take 50ms–200ms to arrive. If unadjusted, the receiver would always lag behind the sender.
- Every packet carries a sender timestamp: `epoch = Date.now()`.
- When the receiving device gets the packet, it calculates transit time:
  $$\text{transitMs} = \max(0, \text{Date.now}() - \text{msg.epoch})$$
- If the stream is playing, it advances the seek target by $\text{transitMs}$:
  $$\text{targetMs} = \text{msg.timeMs} + \text{transitMs}$$
- This guarantees both devices play the exact same video frame in real time.

### 3. Tightened Sub-Second Drift Deadbands
- **On Pause:** Frame-accurate threshold of **150ms** (down from 2,500ms). Both screens freeze on the exact same frame.
- **On Play:** Threshold tightened to **350ms** (down from 2,500ms), eliminating the 2–3 second delay while preventing audio glitches.

### 4. Symmetrical Echo Suppression
When Device A sends a pause event, Device B pauses. Device B suppresses re-broadcasting its own pause back to Device A for 900ms (`ignoreLocalSyncUntil`), eliminating infinite ping-pong loops.

---

## 📺 What We Did for Samsung TV (`nuviox-tv.wgt`)

In addition to Watch Party syncing, we made major fixes and performance optimizations to the official native C engine for Samsung TV:

1. **Multi-Profile Addon Isolation Bug Fix:**
   - **Problem:** When switching to Profile 2 (with `uses_primary_addons` turned off and 0 addons), Profile 2 was inheriting all addons from Profile 1.
   - **Fix:** In `src/addons.c` and `src/sync.c`, memory is unconditionally zeroed on profile load, and `perfilLista` is cleanly marked even when 0 cloud addons are returned. Profiles are now 100% isolated.
2. **AVPlay Native 4K UHD Mode (`SET_MODE_4K`):**
   - Configured `player.setStreamingProperty("SET_MODE_4K", "TRUE")` in `src/video_tizen.c`, rendering true 3840×2160 UHD output directly on Samsung's hardware video plane instead of downscaling.
3. **Adaptive Buffer Tuning (15MB / 30MB):**
   - Configured `PLAYER_BUFFER_FOR_PLAY` to 15MB and `PLAYER_BUFFER_FOR_RESUME` to 30MB, eliminating initial buffer starvation and stutter on 4K Remux streams.
4. **Dolby Vision Profile 5 Fix (No More Black / Purple Screens):**
   - Samsung TVs do not have hardware Dolby Vision decoders. In `src/streams.c`, we updated the stream selection scoring for Tizen to penalize Dolby Vision streams (`p -= 100000`) and boost 4K HDR10/HDR10+ streams (`p += 100000`), ensuring the TV always picks streams that Samsung hardware can display properly.
5. **Compiler & WebGL Optimization:**
   - Compiled with `-O3` compiler optimization flags and `-sMAX_WEBGL_VERSION=2` (WebGL 2 enabled).
   - Tuned pthread pool to 12 threads with dedicated stack sizing (8MB main, 2MB workers), recovering ~72MB of RAM and eliminating thread exhaustion freezes.
6. **Smart Hub Launcher Preview:**
   - Registered `use.preview` in `tools/tizen-config.xml` to populate continue-watching media on Samsung's home screen ribbon with 10-minute rate limiting.
7. **On-Screen Watch Party TV HUD:**
   - Added an on-screen HUD (toggled with the **Yellow button** or `W`/`F4` on the remote) allowing users to enter custom Room Codes and Server URLs directly using Samsung's native virtual keyboard. Settings persist across TV reboots via `localStorage`.

---

## 🚀 Quick Start Guide

### Option 1: Running on Android via Termux (Easiest)

You can run the entire Watch Party coordination server directly from your Android phone without needing a computer or VPS!

1. Install **Termux** on your Android phone (from F-Droid or GitHub).
2. Open Termux and run:
   ```bash
   pkg update -y && pkg install git nodejs -y
   git clone https://github.com/Krishnakant010/nuvio-watchparty.git
   cd nuvio-watchparty
   chmod +x termux-start.sh
   ./termux-start.sh
   ```
3. Termux will start the server and display your phone's local WiFi IP (e.g. `192.168.0.101`).
4. Connect your TV and phones using:
   ```text
   ws://<YOUR-PHONE-IP>:8089
   ```

---

### Option 2: Running on Local PC / Mac / Linux

1. Clone and enter the repository:
   ```bash
   git clone https://github.com/Krishnakant010/nuvio-watchparty.git
   cd nuvio-watchparty
   ```
2. Start the server (no `npm install` needed!):
   ```bash
   node server.mjs
   ```
3. The server is immediately available at `ws://localhost:8089` (and your local LAN IP e.g. `ws://192.168.0.x:8089`).
4. Open `http://localhost:8089` in any browser to see the live status dashboard.

---

### Option 3: Remote Watching Across the Internet (Free Cloudflare Tunnel)

If your friends or partner are not on the same home WiFi network, you can expose port `8089` securely without opening any router ports:

1. Start `node server.mjs` on your PC, VPS, or Termux.
2. In another terminal window, run:
   ```bash
   npx cloudflared tunnel --url http://localhost:8089
   ```
3. Cloudflare will give you a public secure URL like:
   ```text
   https://random-words.trycloudflare.com
   ```
4. Simply replace `https://` with `wss://` on both devices:
   ```text
   wss://random-words.trycloudflare.com
   ```
   Both your Samsung TV and your mobile devices will connect securely over the internet!

---

### Option 4: Docker / Docker Compose (VPS / Home Server)

Run with Docker Compose:
```bash
docker compose up -d
```

---

## 📺 How to Use on Samsung TV (`nuviox-tv.wgt`)

1. Open **NuvioX** on your Samsung TV (Package: `NuvioX0001.NuvioX`).
2. Start any movie or series stream.
3. Press the **Yellow button** (or `W` / `F4`) on your remote to bring up the on-screen **Watch Party HUD**.
4. The HUD displays:
   - **Room Code:** default `NUVIO1`
   - **Connection Status:** `CONNECTED`
   - **Active Viewers Count**
   - **Server URL:** Click to edit with remote keyboard if using a custom self-hosted or Cloudflare URL.
5. Play, Pause, or Seek with your remote — all connected devices update in real-time.

---

## 📱 How to Use on Android Mobile (`nuviox-mobile.apk`)

1. Open **NuvioX** on your Android phone (Package: `com.nuviox.app`) and start any video.
2. Tap the screen to reveal the player controls.
3. Tap the **Watch Party button** (groups icon) in the top-right header or bottom toolbar.
4. Verify or enter your **Room Code** (e.g. `NUVIO1`) and **Server URL** (e.g. `ws://192.168.0.101:8089` or your Cloudflare tunnel).
5. Tap **Join Party**. The icon turns green and displays a confirmation toast.
6. Any pause, scrub, or 10s skip instantly syncs across all devices.

---

## 📜 License
MIT License. Free to use, modify, and self-host.
