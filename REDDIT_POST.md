# [RELEASE & TUTORIAL] Real-Time Watch Party (Samsung TV & Android Mobile) + Samsung TV Fixes & Performance Optimizations! 🍿⚡

> **TL;DR:** Built a zero-lag, two-way synchronized **Watch Party** system that syncs playback (play/pause/seek) between **Samsung Smart TV** and **Android Mobile** in real-time (< 300ms latency). Included is an ultra-lightweight coordination server (`server.mjs`) that you can self-host on your PC, Docker, or directly on an **Android phone via Termux in 1 minute** (no port forwarding needed thanks to Cloudflare Tunnels). Also included are major performance optimizations and bug fixes for the **Samsung TV (Tizen)** app (4K UHD mode, 15MB buffer, Dolby Vision black screen fix, and the profile addon leak fix!).

---

## 🔄 1. The Watch Party Two-Way Sync Engine

There was no way to watch movies or series in sync with a partner or friends when one person is on a Samsung TV and others are on Android phones (or multiple phones/TVs). Furthermore, existing sync solutions often suffer from an awkward **2 to 3 second delay**.

### What Was Built:
- **True Two-Way Synchronization:** Anyone can pause, play, or seek at any moment. All other devices (TV or Mobile) react immediately.
- **Support for 3+ Devices:** Works seamlessly with groups (e.g., 1 TV + 2 phones all in the same room).
- **Sub-Second Precision (No 2–3s Lag):**
  - **Transit Latency Compensation:** Senders attach an `epoch` timestamp. The receiver calculates network flight time (`now - epoch`) and offsets the playback target to match the sender in real-time.
  - **Tight Drift Deadbands:** Snaps to the exact frame on pause (**150ms** tolerance) and syncs smoothly on play (**350ms** tolerance).
  - **0ms AVPlay Event Dispatch:** TV remote actions immediately trigger WebSocket packets without waiting for slow polling intervals.
- **Interactive On-Screen TV HUD:** Press the **Yellow Button** (or `W`/`F4`) on your TV remote to open an on-screen HUD. You can type custom Room Codes and Server URLs directly using the Samsung TV virtual keyboard! Settings persist in `localStorage`.
- **Android In-App Button & Modal:** Native Compose button in the video player toolbar that opens a room dialog with connection status and toast alerts ("▶ Resumed by Peer", etc.).

---

## 📺 2. What We Did for Samsung TV (Fixes & Optimizations)

We tackled several long-standing issues in the official native C engine (`nuvio-native-legacy`):

### 🐛 Fixed: Multi-Profile Addon Inheritance Bug
- **The Issue:** When switching to Profile 2 (which had `uses_primary_addons` turned OFF and 0 addons configured), Profile 2 would still show and load all of Profile 1's addons.
- **Root Cause & Fix:** The in-memory addon table was never wiped if Profile 2 lacked a local `addons.txt`, and cloud sync skipped updating the profile pointer if 0 addons were returned. We patched `src/addons.c` and `src/sync.c` to zero memory unconditionally and cleanly isolate profile databases. Profile 2 now stays 100% clean and isolated.

### 🎬 Native 4K UHD Mode (`SET_MODE_4K`)
- In `src/video_tizen.c`, AVPlay is explicitly configured with `player.setStreamingProperty("SET_MODE_4K", "TRUE")`.
- Forces Samsung's video processing chip to render true 3840×2160 UHD output natively rather than downscaling to a 1080p canvas.

### 🚀 Adaptive Buffer Tuning (15MB / 30MB)
- Configured `PLAYER_BUFFER_FOR_PLAY` to 15MB and `PLAYER_BUFFER_FOR_RESUME` to 30MB in AVPlay.
- Prevents initial buffer starvation and freezes on high-bitrate 4K Remux streams. Safe fallback ensures normal playback is never blocked.

### 🌈 Fixed: Dolby Vision Profile 5 (No More Black / Purple Screens)
- Samsung TVs **do not** have hardware decoders for Dolby Vision (only HDR10 / HDR10+). Upstream code was prioritizing Dolby Vision streams, causing black screens (audio only) or distorted purple/green colors.
- In `src/streams.c` (`#ifdef __EMSCRIPTEN__`), we updated stream scoring to penalize Dolby Vision streams (`p -= 100000`) and boost standard 4K HDR10 / SDR (`p += 100000`), guaranteeing the TV always selects streams compatible with Samsung hardware.

### ⚡ WebGL 2 & `-O3` Compiler Optimization
- Recompiled with full `-O3` optimization flags and `-sMAX_WEBGL_VERSION=2` (WebGL 2 enabled).
- Tuned pthread pool to 12 threads with sized stacks (8MB main, 2MB workers), recovering **~72 MB of RAM** from the TV heap and preventing thread exhaustion crashes.

### 🏠 Samsung Smart Hub Preview & Deep Linking
- Added `<tizen:metadata key="http://samsung.com/tv/metadata/use.preview" value="1.0.0"/>` to expose continue-watching media on Samsung's Smart Hub home launcher ribbon with 10-minute rate limiting, with deep links launching straight into playback.

---

## 🚀 3. How to Set Up the Server in 1 Minute (Termux, PC, or Docker)

The coordination server (`server.mjs`) has **zero npm dependencies**, uses **< 15 MB RAM**, and can run on anything.

### Option A: Run directly on Android Phone via Termux (No PC needed!)
1. Install **Termux** (from F-Droid or GitHub).
2. Open Termux and run:
   ```bash
   pkg update -y && pkg install git nodejs -y
   git clone https://github.com/Krishnakant010/nuvio-watchparty.git
   cd nuvio-watchparty
   chmod +x termux-start.sh
   ./termux-start.sh
   ```
3. It will display your phone's WiFi IP (e.g. `192.168.0.101`). Your server is live!

---

### Option B: Run on PC / Mac / Linux / Raspberry Pi
```bash
git clone https://github.com/Krishnakant010/nuvio-watchparty.git
cd nuvio-watchparty
node server.mjs
```
*(No `npm install` needed! Pure standard Node.js).*

---

### Option C: Watch Long-Distance with Friends (Free Cloudflare Tunnel — No Port Forwarding!)
If your friends or partner are not on your home WiFi:
1. Start `node server.mjs` on your PC or Termux.
2. In another terminal window:
   ```bash
   npx cloudflared tunnel --url http://localhost:8089
   ```
3. Cloudflare gives you a secure URL: `https://your-unique-tunnel.trycloudflare.com`.
4. Just enter `wss://your-unique-tunnel.trycloudflare.com` on your TV and phones! It works across the globe with zero firewall configuration.

---

## 📺 How to Use on Samsung TV (`nuviox-tv.wgt`)

1. Install the standalone package (packaged as `NuvioX0001.NuvioX` / App: `NuvioX` so it **does not overwrite** your official Nuvio TV app).
2. Start any movie or show.
3. Press the **Yellow remote button** (or `W`/`F4`) to open the **Watch Party HUD**.
4. Type your **Room Code** (e.g., `NUVIO1`) and **Server URL** using your remote.
5. Hit **Connect**. The badge turns green. You're now synchronized!

---

## 📱 How to Use on Android Mobile (`nuviox-mobile.apk`)

1. Install the standalone APK (packaged as `com.nuviox.app` / App: `NuvioX` so it installs side-by-side with your existing Nuvio app).
2. Play any video and tap the screen.
3. Tap the **Watch Party (Groups) icon** on the top right or bottom controls.
4. Enter the same Room Code and Server URL, then tap **Join Party**.
5. When anyone scrubs the timeline, skips 10s, pauses, or resumes, all screens update synchronously!

---

## 📂 Source Code & Downloads

- 🔗 **Watch Party Server & Termux Scripts:** [github.com/Krishnakant010/nuvio-watchparty](https://github.com/Krishnakant010/nuvio-watchparty)
- 📝 **Detailed Changelog & Root Cause Analysis:** Read `CHANGELOG.md` in the repo for full code line references and bug fixes.
- 📦 **Pre-built Packages:**
  - Samsung TV Widget: `nuviox-tv.wgt` (App: `NuvioX`, Package: `NuvioX0001.NuvioX`)
  - Android APK: `nuviox-mobile.apk` (App: `NuvioX`, Package: `com.nuviox.app`)

Feedback, issues, and PRs are welcome! Happy group watching! 🍿🎬
