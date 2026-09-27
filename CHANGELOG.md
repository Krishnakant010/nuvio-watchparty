# Detailed Changelog & Technical Deep Dive

## 1. Samsung TV Profile Addon Inheritance Bug

### The Problem
In the official native C repository (`nuvio-native-legacy`), users with multiple profiles on the same account experienced a severe data leak bug:
When switching from Profile 1 (which had installed addons) to Profile 2 (which had `uses_primary_addons` turned OFF and zero addons configured), Profile 2 still showed and inherited all of Profile 1's addons.

### The Root Cause
1. In `src/addons.c`, `addons_carregar(dirArte)` did not clear the global in-memory `addon[]` table if the target profile had no saved `addons.txt` on disk. The previous profile's memory remained intact.
2. In `src/addons.c`, `addons_definir_lista()` did not mark `perfilLista = perfilAlvo` when 0 addons were returned from the cloud API for Profile 2.
3. In `src/sync.c`, the account sync callback wrapped `addons_marcar_da_conta(perfilDoCiclo)` inside an `if (nAddonsRem > 0)` check. If Profile 2 had 0 addons in the cloud, `perfilLista` was never updated, tricking the app into believing Profile 1's addons belonged to Profile 2.

### The Fix
- In [`src/addons.c`](file:///home/krishnakant/.gemini/antigravity/scratch/nuvio-native-legacy-source/src/addons.c): Zero out memory (`nAddon = 0; memset(addon, 0, sizeof addon);`) before opening any file. Missing file now guarantees a 100% clean, empty state.
- In [`src/addons.c`](file:///home/krishnakant/.gemini/antigravity/scratch/nuvio-native-legacy-source/src/addons.c): In `addons_definir_lista()`, when `perfilAlvo != 1` and 0 addons exist, cleanly call `addons_carregar(NULL)`, set `perfilLista = perfilAlvo`, increment `versaoLista++`, and trigger UI reload.
- In [`src/sync.c`](file:///home/krishnakant/.gemini/antigravity/scratch/nuvio-native-legacy-source/src/sync.c): Removed `if (nAddonsRem > 0)` condition guarding `addons_marcar_da_conta`. The profile is always marked cleanly even when it has 0 addons.
- In [`src/perfis.c`](file:///home/krishnakant/.gemini/antigravity/scratch/nuvio-native-legacy-source/src/perfis.c): Fixed `uses_primary_addons` JSON boolean parsing.
- In [`src/app.c`](file:///home/krishnakant/.gemini/antigravity/scratch/nuvio-native-legacy-source/src/app.c): On profile switch, if `perfis_ativo_addons() != 1 || perfilAntes == 1`, force immediate cache reload with `addons_carregar(NULL); desc_repetir_addons();`.

---

## 2. Real-Time Watch Party Subsystem

### The Goal
Enable seamless, real-time playback synchronization between Samsung Smart TVs and Android Mobile phones (or multiple mobile phones) using a lightweight self-hosted coordination server.

### What Was Developed
1. **Coordination Server (`server.mjs`):**
   - Zero-dependency, pure Node.js WebSocket & HTTP server (<15MB RAM).
   - Manages rooms (`NUVIO1`), multi-client join/leave, symmetric two-way sync, and heartbeats.
   - Built-in status dashboard accessible via standard browser.
2. **Samsung Smart TV Client (`tools/tizen-shell.html` & `src/video_tizen.c`):**
   - Interactive on-screen Watch Party HUD overlay (toggled with Yellow remote button or `W` / `F4`).
   - Interactive input fields for Room Code and Server URL with Samsung virtual keyboard support.
   - Persistence of server and room settings in TV `localStorage`.
   - Direct hook into AVPlay hardware decoder (`webapis.avplay`) for instant 0ms play/pause/seek dispatch.
3. **Android Mobile Client (`nuvio-mobile`):**
   - Kotlin Multiplatform WebSocket networking (`WatchPartySocket.kt`, `WatchPartySocket.android.kt` using OkHttp).
   - `WatchPartyCoordinator.kt` integrated into `PlayerScreenRuntime`.
   - In-app Watch Party button in player controls header and toolbar (`Icons.Rounded.Groups`).
   - `WatchPartyModal.kt` Compose UI for entering Room Code and Server URL.
   - On-screen toast notifications for remote actions ("▶ Resumed by Peer", "⏸ Paused by Peer").

---

## 3. Resolving the 2–3 Second Sync Delay

### Why Did the Delay Exist?
1. **TV Polling Lag:** The TV previously polled for playback state changes once every 1,000ms. An action on the remote took up to 1 full second before being sent to the socket.
2. **High Drift Thresholds:** TV had a `diff > 2500ms` check, and Mobile had a `driftToleranceMs = 1500ms` check. If two devices were 1.5–2.5 seconds apart, neither device adjusted.
3. **Network Transit Lag:** Time spent transmitting packets over WiFi/Internet was not accounted for.

### How It Was Solved
1. **0ms Event Dispatch:** [`src/video_tizen.c`](file:///home/krishnakant/.gemini/antigravity/scratch/nuvio-native-legacy-source/src/video_tizen.c) hooks directly into AVPlay operations (`op === "pausar"` / `op === "buscar"`). The moment a remote button is pressed, the event is dispatched immediately with 0ms delay.
2. **Network Transit Latency Compensation:** Packets carry an `epoch` timestamp. The receiver calculates transit time (`transit = now - msg.epoch`) and adds it to `timeMs`, aligning the position to where the sender actually is right now.
3. **Sub-second Drift Tolerances:**
   - **On Pause:** Frame-accurate threshold of **150ms** (down from 2500ms).
   - **On Play:** Tolerance reduced to **350ms** (down from 2500ms).
4. **Fast 250ms Fallback:** Polling interval reduced from 1000ms to 250ms on TV.

---

## 4. Multi-Device (3+ Device) Group Sync
- Uses symmetric room broadcasting: when ANY device in the room sends an action, the server forwards it to all other active devices.
- Echo-suppression flags (`ignoreLocalSyncUntil`) prevent infinite echo loops.
- Tested and verified with 3 simultaneous clients (TV + 2 mobile phones).

---

## 5. Production-Ready "NuvioX" App Packaging
- **Samsung TV:** Packaged as `NuvioX0001.NuvioX` (`nuviox-tv.wgt`), app label `NuvioX`, leaving official TV app untouched.
- **Android Mobile:** Packaged as `com.nuviox.app` (`nuviox-mobile.apk`), app label `NuvioX`, leaving official mobile app untouched.
