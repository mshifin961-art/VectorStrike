# Vector Strike: Kinetic Protocol

A completely original, high-performance Android-first 2D tactical action multiplayer shooter built from scratch.

---

## 1. Game Identity & Core Concept

**Vector Strike: Kinetic Protocol** is an original 2D tactical combat arena shooter designed specifically for Android mobile devices. Players pilot cybernetic operatives with agile kinetic movement systems, acrobatic wall maneuvers, and distinct class-based tactical abilities.

### Key Innovations:
- **Kinetic Dash & Wall-Slide/Kick**: Acrobatic traversal allowing players to slide down surfaces, kick off walls, and execute omnidirectional kinetic dashes.
- **Grav-Anchor**: Rapid mid-air slam mechanic that brings players quickly down to lower elevations, emitting a kinetic shockwave upon ground impact.
- **Dynamic Shield & Health Buffer**: Regenerating cybernetic shields that absorb incoming damage before permanent hull damage occurs.
- **Extensible 6-Weapon Arsenal**:
  1. **KP-9 Rail Pistol**: Semi-auto kinetic handgun with high precision.
  2. **Arc Carbine**: 3-round hyper-velocity plasma burst rifle.
  3. **Scatter-Pulse**: Tactical flechette shotgun with wall-ricochet mechanics.
  4. **Ion Beam Sniper**: High-caliber anti-armor energy rifle with targeting laser and target piercing.
  5. **Mag-Launcher**: Magnetic launcher firing proximity mines that stick and detonate.
  6. **Plasma Edge**: High-frequency thermal melee blade with projectile-deflection window.
- **Throwables**: Timed kinetic frag grenades with realistic bouncing physics and area damage.

---

## 2. Playable Operatives (Characters)

| Operative | Role | Health / Shield | Speed | Signature Ability |
| :--- | :--- | :--- | :--- | :--- |
| **Vanguard** | Assault Specialist | 100 / 50 | 280 | **Kinetic Surge**: High-velocity forward thrust with shockwave trail. |
| **Specter** | Infiltration Scout | 85 / 40 | 320 | **Phase Cloak**: 85% transparency and +35% move speed for 3.5s. |
| **Juggernaut** | Heavy Siege Unit | 130 / 70 | 240 | **Kinetic Dome**: Deployable 120 HP localized force-field dome. |
| **Cypher** | Tactical Disruptor | 100 / 50 | 290 | **EMP Pulse**: Radial electromagnetic pulse draining 35 shield and locking enemy abilities. |

---

## 3. Original Maps

1. **Sector 7: Neon Foundry** (2400 x 1400 px)
   - Multi-tier industrial arena with vertical catwalks, central molten core hazard zone, two kinetic jump pads, and strategic weapon/shield pickup pedestals.
2. **Sub-Terra 09: Hydro-Core** (2600 x 1500 px)
   - High-tech subterranean facility featuring horizontally translating hydraulic platforms, pressure launch pads, electrified coolant conduit hazard zones, and dual sniper perches.

---

## 4. Game Modes

1. **Solo Deathmatch**: Free-for-all kinetic warfare with configurable frag elimination limit (10 frags).
2. **Team Battle**: Squadron Alpha (Cyan) vs Squadron Bravo (Crimson) 20-frag squad combat.
3. **Survival Protocol**: Wave-based defense against escalating waves of autonomous aerial assault drones and heavy siege enforcers.

---

## 5. Tactical AI Bots

- 3 Tiers: **Recruit**, **Tactical**, and **Elite**.
- Features: Waypoint graph navigation, line-of-sight raycasting, evasive wall-jumping, predictive aiming (leading moving targets based on projectile speed), seeking health/shield pickups when low on health, and tactical ability usage.

---

## 6. Local Wi-Fi Multiplayer Architecture

- Host creates a room (generates a 4-letter Room Code, e.g., VS7A, and displays local IP).
- Clients connect over local Wi-Fi or LAN.
- Authoritative server simulation runs at 30 ticks/sec with client-side interpolation and prediction.
- Synchronizes player position, velocity, aiming angle, weapon firing, health, shields, deaths, respawns, and match scoring.

---

## 7. Procedural Audio Synthesizer

- Built using the Web Audio API without missing audio file dependencies.
- Generates procedural SFX for weapon discharges, laser beams, shotgun blasts, melee swings, bullet deflections, explosions, footstep/jump whooshes, shield breaks, and item pickup chimes.
- Generates an ambient algorithmic synthwave soundtrack in D minor with independent volume controls and mute toggles.

---

## 8. Android Project Structure & Build Instructions

```
VectorStrike/
├── .github/workflows/
│   └── build-apk.yml              # Automated GitHub Actions APK build workflow
├── app/
│   ├── build.gradle               # Android app build configuration (SDK 34)
│   └── src/main/
│       ├── AndroidManifest.xml    # App manifest with permissions & fullscreen config
│       ├── java/com/spark/vectorstrike/
│       │   ├── MainActivity.java  # Hardware-accelerated WebView Activity & back-handling
│       │   └── AndroidBridge.java # Javascript-to-native interface (vibration, IP, prefs)
│       ├── res/
│       │   ├── values/            # strings.xml, colors.xml, styles.xml
│       │   └── mipmap-*/          # App icons across all Android screen densities
│       └── assets/game/           # Complete game engine, logic, maps, and UI
│           ├── index.html         # HTML5 canvas and modern cybernetic UI overlay
│           ├── css/game.css       # Responsive touchscreen styling
│           └── js/
│               ├── vector2d.js    # 2D Vector math library
│               ├── physics.js     # Fixed-timestep sub-step physics solver & raycasting
│               ├── weapons.js     # 6 weapon classes, projectiles, and grenades
│               ├── characters.js  # 4 operative classes, abilities, and rendering
│               ├── maps.js        # Map geometry, moving platforms, jump pads, pickups
│               ├── bot_ai.js      # Waypoint pathfinding and tactical decision tree
│               ├── modes.js       # Deathmatch, Team Battle, Survival Wave
│               ├── multiplayer.js # LAN Wi-Fi client-server synchronization
│               ├── audio.js       # WebAudio procedural synthesizer & soundtrack
│               ├── engine.js      # GameWorld coordinator, camera, and particle FX
│               └── ui.js          # Touch controls & screen navigation
├── build.gradle                   # Root Gradle build script
├── settings.gradle                # Gradle settings
├── gradle.properties              # Memory and Jetifier settings
├── gradlew / gradlew.bat          # Gradle wrappers
└── tests/
    ├── run_tests.js               # Physics, combat, and core tests
    └── full_test_suite.js         # Comprehensive automated verification suite
```

### Building the APK

#### Option A: GitHub Actions (Recommended)
1. Push the `VectorStrike/` repository to GitHub.
2. The included `.github/workflows/build-apk.yml` workflow will automatically trigger.
3. Download the generated `VectorStrike-Debug-APK` directly from the workflow run artifacts.

#### Option B: Android Studio / Local Build
1. Open the `VectorStrike/` directory in Android Studio.
2. Allow Gradle to sync dependencies.
3. Select **Build > Build Bundle(s) / APK(s) > Build APK(s)** or execute:
   ```bash
   ./gradlew assembleDebug
   ```
4. The generated APK will be located at:
   `app/build/outputs/apk/debug/app-debug.apk`

---

## 9. Verification & Testing

To execute the automated verification test suite:
```bash
node tests/full_test_suite.js
```
