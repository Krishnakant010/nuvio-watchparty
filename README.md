# 🍿 Nuvio Watch Party

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

## 🚀 Quick Start Guide

### Option 1: Running on Android via Termux (Easiest)

You can run the entire Watch Party coordination server directly from your Android phone without needing a computer or VPS!

1. Install **Termux** on your Android phone (from F-Droid or GitHub).
2. Open Termux and clone this repository:
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

If your partner or friends are not on the same home WiFi network (e.g., long-distance relationship, cellular data, or separate houses), you can expose port `8089` securely without opening any router ports:

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

Or standalone Docker:
```bash
docker build -t nuvio-watchparty .
docker run -d --name nuvio-watchparty -p 8089:8089 --restart unless-stopped nuvio-watchparty
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

## ⚙️ How It Works (Architecture & Protocol)

### Zero-Delay Event Loop
1. **Samsung TV (Native C & AVPlay):**
   - In `src/video_tizen.c`, whenever the hardware decoder pauses, plays, or seeks (`op === "pausar"` / `op === "buscar"`), it notifies the WebSocket bridge immediately (0ms delay).
2. **Android Mobile (Jetpack Compose & Media3/ExoPlayer):**
   - In `PlayerScreenRuntimeGestureActions.kt` and `PlayerControls.kt`, user playback actions fire `onLocalPlay`, `onLocalPause`, and `onLocalSeek` directly into `WatchPartyCoordinator.kt`.
3. **Network Transit Compensation:**
   - Every `sync` packet contains an `epoch` timestamp:
     ```json
     {
       "type": "sync",
       "room": "NUVIO1",
       "state": "playing",
       "timeMs": 42000,
       "epoch": 1790506000000
     }
     ```
   - When a peer receives the packet, it calculates transit delay `transit = Date.now() - epoch` and offsets the target timestamp by `transit` ms, guaranteeing audio/video alignment within a fraction of a second.
4. **Drift Tolerances:**
   - **On Pause:** Snaps to the exact frame (tolerance `150ms`).
   - **On Play:** Snaps smoothly without audio glitching (tolerance `350ms`).

---

## 📜 License
MIT License. Free to use, modify, and self-host.
