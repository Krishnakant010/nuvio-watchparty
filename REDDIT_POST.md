# [RELEASE & TUTORIAL] Real-Time Watch Party for Nuvio across Samsung Smart TV (Tizen) & Android Mobile + Fix for Multi-Profile Addon Bug! 🍿⚡

> **TL;DR:** Built a zero-lag, two-way synchronized **Watch Party** system that syncs playback (play/pause/seek) between **Samsung Smart TV** and **Android Mobile** in real-time (< 300ms latency). Included is an ultra-lightweight coordination server (`server.mjs`) that you can self-host on your PC, Docker, or directly on an **Android phone via Termux in 1 minute** (no port forwarding needed thanks to Cloudflare Tunnels). Also fixed the notorious **Profile Addon Leak bug** on the official Samsung TV client where Profile 2 was inheriting Profile 1's addons.

---

## 🎯 The Backstory & Problems Solved

If you use Nuvio on Samsung TV (`nuvio-native-legacy`) and Android, you've likely hit two major limitations:

### 1. The Multi-Profile Addon Leak Bug 🐛
In the official native C engine for Samsung TV, switching profiles had a severe bug:
If Profile 1 had addons installed and you switched to Profile 2 (which had `uses_primary_addons` turned OFF and 0 addons configured), Profile 2 would still show and load all of Profile 1's addons. 

**Root Cause Found:**
- The in-memory addon array was never wiped if Profile 2 lacked a local `addons.txt`.
- When fetching cloud addons, if the profile had 0 remote addons, the sync code skipped updating the profile pointer (`perfilLista`), leaving the previous profile's memory active.
- **Fix Applied:** We rewrote the addon memory manager in `src/addons.c` and `src/sync.c` to zero memory unconditionally and cleanly isolate profile databases. Profile 2 now stays 100% clean and isolated.

---

### 2. No Native Watch Party Between TV and Mobile 📺📱
There was no way to watch movies or series in sync with a partner or friends when one person is on a Samsung TV and others are on Android phones (or multiple phones/TVs).
Furthermore, existing sync solutions often suffer from a noticeable **2 to 3 second delay**, making movie reactions awkward.

**What we built:**
- **Two-Way Synchronization:** Anyone can pause, play, or seek at any moment. All other devices (TV or Mobile) react immediately.
- **Support for 3+ Devices:** Works seamlessly with groups (e.g. 1 TV + 2 phones all in the same room).
- **Sub-Second Precision:** Eliminated the 2-3s sync lag by adding network transit latency compensation (`now - epoch`) and tight frame deadbands (150ms on pause, 350ms on play).
- **Direct AVPlay Hardware Hook:** Hooked directly into Samsung TV's AVPlay decoder (`webapis.avplay`) for instant 0ms event dispatch instead of waiting for slow 1-second polling intervals.
- **Interactive On-Screen TV HUD:** Press the **Yellow Button** (or `W`/`F4`) on your TV remote to open an on-screen HUD. You can type custom Room Codes and Server URLs directly using the Samsung TV virtual keyboard!
- **Android In-App Button & Modal:** Native Compose button in the video player toolbar that opens a room dialog with connection status and toast alerts ("▶ Resumed by Peer", etc.).

---

## 🚀 How to Set Up the Server in 1 Minute (Termux, PC, or Docker)

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
*(No `npm install` needed! Just standard Node.js).*

---

### Option C: Watch Long-Distance with Friends (Free Cloudflare Tunnel — No Port Forwarding!)
If your friends or partner are not on your home WiFi, don't open router ports. Instead:
1. Start `node server.mjs` on your PC or Termux.
2. In another terminal window:
   ```bash
   npx cloudflared tunnel --url http://localhost:8089
   ```
3. Cloudflare gives you a secure URL: `https://your-unique-tunnel.trycloudflare.com`.
4. Just enter `wss://your-unique-tunnel.trycloudflare.com` on your TV and phones! It works across the globe with zero firewall configuration.

---

## 📺 How to Use on Samsung TV (`nuvio-party-tv.wgt`)

1. Install the standalone package (packaged as `NuvioWP002` so it **does not overwrite** your official Nuvio TV app).
2. Start any movie or show.
3. Press the **Yellow remote button** (or `W`/`F4`) to open the **Watch Party HUD**.
4. Type your **Room Code** (e.g., `NUVIO1`) and **Server URL** using your remote.
5. Hit **Connect**. The badge turns green. You're now synchronized!

---

## 📱 How to Use on Android Mobile (`nuvio-mobile.apk`)

1. Install the standalone APK (packaged as `com.nuviodebug.com` so it installs side-by-side with your existing Nuvio app).
2. Play any video and tap the screen.
3. Tap the **Watch Party (Groups) icon** on the top right or bottom controls.
4. Enter the same Room Code and Server URL, then tap **Join Party**.
5. When anyone scrubs the timeline, skips 10s, pauses, or resumes, all screens update synchronously!

---

## 🔬 How We Fixed the 2–3 Second Sync Lag

| Old Behavior | New Sub-Second Watch Party Engine |
| :--- | :--- |
| **TV Polling:** Checked playback state once every 1,000ms. | **0ms Direct Dispatch:** AVPlay decoder immediately fires events to WebSocket when a button is pressed. |
| **Network Lag:** Packets arriving 200ms later caused audio/video to play 200ms behind. | **Epoch Transit Compensation:** Receiver calculates `transit = now - msg.epoch` and offsets position to match sender in real-time. |
| **Drift Deadbands:** 2,500ms deadband allowed devices to drift up to 2.5s apart without correcting. | **Tight Precision:** 150ms deadband on pause (frame accurate), 350ms on play (smooth playback). |

---

## 📂 Source Code & Downloads

- 🔗 **Watch Party Server & Termux Scripts:** [github.com/Krishnakant010/nuvio-watchparty](https://github.com/Krishnakant010/nuvio-watchparty)
- 📝 **Detailed Changelog & Root Cause Analysis:** Read `CHANGELOG.md` in the repo for full code line references and bug fixes.
- 📦 **Pre-built Packages:**
  - Samsung TV Widget: `nuvio-party-tv.wgt` (Side-by-side safe)
  - Android APK: `nuvio-mobile.apk` (Side-by-side safe)

Feedback, issues, and PRs are welcome! Happy group watching! 🍿🎬
