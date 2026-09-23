/**
 * Vector Strike - Modern Cyberpunk UI & Touch Input Controller
 * Dual virtual joysticks, responsive touch controls, HUD telemetry,
 * screen state machine, and settings persistence.
 */

class UIManager {
    constructor() {
        this.gameWorld = null;
        this.audio = null;
        this.network = null;

        // Current settings
        this.settings = {
            sfxVolume: 0.8,
            musicVolume: 0.5,
            musicEnabled: true,
            botDifficulty: 'TACTICAL',
            touchOpacity: 0.8
        };

        // Match setup state
        this.matchConfig = {
            modeId: 'SOLO_DEATHMATCH',
            mapId: 'MAP_NEON_FOUNDRY',
            characterClass: 'VANGUARD',
            playerName: 'OPERATIVE_01',
            botCount: 3,
            botDifficulty: 'TACTICAL'
        };

        // Touch Input States
        this.input = {
            moveX: 0,
            moveY: 0,
            jumpPressed: false,
            downPressed: false,
            aimAngle: 0,
            isAiming: false,
            isShooting: false,
            dashPressed: false,
            abilityPressed: false,
            grenadePressed: false,
            reloadPressed: false,
            switchPressed: false
        };

        this.leftStick = { active: false, id: null, startX: 0, startY: 0, curX: 0, curY: 0 };
        this.rightStick = { active: false, id: null, startX: 0, startY: 0, curX: 0, curY: 0 };

        this.loadSettings();
    }

    init(audioEngine) {
        this.audio = audioEngine;
        this.bindScreens();
        this.bindTouchControls();
        this.bindKeyboardControls();
        this.applySettings();
    }

    loadSettings() {
        try {
            let saved = null;
            if (window.AndroidBridge && window.AndroidBridge.getSetting) {
                saved = window.AndroidBridge.getSetting('vector_settings', null);
            } else if (typeof localStorage !== 'undefined') {
                saved = localStorage.getItem('vector_settings');
            }
            if (saved) {
                this.settings = Object.assign(this.settings, JSON.parse(saved));
            }
        } catch (e) {
            console.warn('Failed to load settings:', e);
        }
    }

    saveSettings() {
        try {
            const str = JSON.stringify(this.settings);
            if (window.AndroidBridge && window.AndroidBridge.saveSetting) {
                window.AndroidBridge.saveSetting('vector_settings', str);
            }
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('vector_settings', str);
            }
        } catch (e) {
            console.warn('Failed to save settings:', e);
        }
    }

    applySettings() {
        if (this.audio) {
            this.audio.setSfxVolume(this.settings.sfxVolume);
            this.audio.setMusicVolume(this.settings.musicVolume);
            this.audio.musicEnabled = this.settings.musicEnabled;
        }
        const touchContainer = document.getElementById('touch-controls');
        if (touchContainer) {
            touchContainer.style.opacity = this.settings.touchOpacity;
        }
    }

    showScreen(screenId) {
        const screens = document.querySelectorAll('.ui-screen');
        screens.forEach(s => s.classList.remove('active'));
        const target = document.getElementById(screenId);
        if (target) {
            target.classList.add('active');
        }
    }

    bindScreens() {
        // Splash -> Main Menu
        const splashBtn = document.getElementById('btn-splash-start');
        if (splashBtn) {
            splashBtn.addEventListener('click', () => {
                if (this.audio) this.audio.init();
                this.showScreen('screen-main-menu');
            });
        }

        // Main Menu buttons
        const playOfflineBtn = document.getElementById('btn-menu-play');
        if (playOfflineBtn) {
            playOfflineBtn.addEventListener('click', () => this.showScreen('screen-mode-select'));
        }

        const multiplayerBtn = document.getElementById('btn-menu-multiplayer');
        if (multiplayerBtn) {
            multiplayerBtn.addEventListener('click', () => this.showScreen('screen-multiplayer'));
        }

        const operativesBtn = document.getElementById('btn-menu-operatives');
        if (operativesBtn) {
            operativesBtn.addEventListener('click', () => this.showScreen('screen-character-select'));
        }

        const settingsBtn = document.getElementById('btn-menu-settings');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.updateSettingsUI();
                this.showScreen('screen-settings');
            });
        }

        // Mode Select
        document.querySelectorAll('.mode-card').forEach(card => {
            card.addEventListener('click', () => {
                this.matchConfig.modeId = card.dataset.mode;
                this.showScreen('screen-map-select');
            });
        });

        // Map Select
        document.querySelectorAll('.map-card').forEach(card => {
            card.addEventListener('click', () => {
                this.matchConfig.mapId = card.dataset.map;
                this.startMatch();
            });
        });

        // Operative Select
        document.querySelectorAll('.character-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.matchConfig.characterClass = card.dataset.class;
            });
        });

        // Settings Sliders
        const sfxSlider = document.getElementById('setting-sfx-vol');
        if (sfxSlider) {
            sfxSlider.addEventListener('input', (e) => {
                this.settings.sfxVolume = parseFloat(e.target.value);
                this.applySettings();
                this.saveSettings();
            });
        }

        const musicSlider = document.getElementById('setting-music-vol');
        if (musicSlider) {
            musicSlider.addEventListener('input', (e) => {
                this.settings.musicVolume = parseFloat(e.target.value);
                this.applySettings();
                this.saveSettings();
            });
        }

        const musicToggle = document.getElementById('setting-music-toggle');
        if (musicToggle) {
            musicToggle.addEventListener('change', (e) => {
                this.settings.musicEnabled = e.target.checked;
                this.applySettings();
                this.saveSettings();
            });
        }

        const botDiffSelect = document.getElementById('setting-bot-diff');
        if (botDiffSelect) {
            botDiffSelect.addEventListener('change', (e) => {
                this.settings.botDifficulty = e.target.value;
                this.matchConfig.botDifficulty = e.target.value;
                this.saveSettings();
            });
        }

        // Back buttons
        document.querySelectorAll('.btn-back').forEach(btn => {
            btn.addEventListener('click', () => {
                const backTarget = btn.dataset.target || 'screen-main-menu';
                this.showScreen(backTarget);
            });
        });

        // Pause Menu buttons
        const btnPause = document.getElementById('btn-hud-pause');
        if (btnPause) {
            btnPause.addEventListener('click', () => this.togglePause(true));
        }

        const btnResume = document.getElementById('btn-pause-resume');
        if (btnResume) {
            btnResume.addEventListener('click', () => this.togglePause(false));
        }

        const btnRestart = document.getElementById('btn-pause-restart');
        if (btnRestart) {
            btnRestart.addEventListener('click', () => {
                this.togglePause(false);
                this.startMatch();
            });
        }

        const btnQuit = document.getElementById('btn-pause-quit');
        if (btnQuit) {
            btnQuit.addEventListener('click', () => {
                this.togglePause(false);
                if (this.gameWorld) this.gameWorld.stop();
                this.showScreen('screen-main-menu');
            });
        }

        // Match Results buttons
        const btnRematch = document.getElementById('btn-results-rematch');
        if (btnRematch) {
            btnRematch.addEventListener('click', () => {
                this.startMatch();
            });
        }

        const btnResultsMenu = document.getElementById('btn-results-menu');
        if (btnResultsMenu) {
            btnResultsMenu.addEventListener('click', () => {
                this.showScreen('screen-main-menu');
            });
        }

        // Local Multiplayer buttons
        const btnHostRoom = document.getElementById('btn-host-room');
        if (btnHostRoom) {
            btnHostRoom.addEventListener('click', () => {
                const code = this.network.createRoom(
                    null,
                    this.matchConfig.playerName,
                    this.matchConfig.characterClass,
                    this.matchConfig.mapId,
                    this.matchConfig.modeId
                );
                document.getElementById('display-room-code').innerText = code;
                this.showScreen('screen-multiplayer-lobby');
                this.renderLobbyState({
                    roomCode: code,
                    players: this.network.lobbyPlayers,
                    isHost: true
                });
            });
        }

        const btnJoinRoom = document.getElementById('btn-join-room');
        if (btnJoinRoom) {
            btnJoinRoom.addEventListener('click', () => {
                const inputCode = document.getElementById('input-room-code').value.trim();
                if (inputCode) {
                    this.network.joinRoom(
                        inputCode,
                        this.matchConfig.playerName,
                        this.matchConfig.characterClass
                    );
                    document.getElementById('display-room-code').innerText = inputCode.toUpperCase();
                    this.showScreen('screen-multiplayer-lobby');
                    this.renderLobbyState({
                        roomCode: inputCode.toUpperCase(),
                        players: this.network.lobbyPlayers,
                        isHost: false
                    });
                }
            });
        }

        const btnReady = document.getElementById('btn-lobby-ready');
        if (btnReady) {
            btnReady.addEventListener('click', () => {
                const local = (this.network.lobbyPlayers || []).find(
                    p => p.id === this.network.localPlayerId
                );
                const nextReady = !(local && local.ready);
                this.network.setReady(nextReady);
            });
        }

        const btnStartMultiplayer = document.getElementById('btn-lobby-start');
        if (btnStartMultiplayer) {
            btnStartMultiplayer.addEventListener('click', () => {
                if (!this.network.isHost) return;
                const players = this.network.lobbyPlayers || [];
                if (players.length < 2) {
                    this.renderLobbyState({
                        roomCode: this.network.roomCode,
                        players,
                        isHost: true,
                        error: 'WAITING_FOR_PLAYER'
                    });
                    return;
                }
                if (!players.every(p => p.ready)) {
                    this.renderLobbyState({
                        roomCode: this.network.roomCode,
                        players,
                        isHost: true,
                        error: 'ALL_PLAYERS_MUST_BE_READY'
                    });
                    return;
                }

                const config = Object.assign({}, this.matchConfig, {
                    multiplayer: true,
                    botCount: 0,
                    networkPlayerId: this.network.localPlayerId,
                    multiplayerPlayers: players.map(p => Object.assign({}, p))
                });
                this.network.send({
                    type: 'START_MATCH',
                    config: config
                });
                this.matchConfig = config;
                this.startMatch(true);
            });
        }
    }

    updateSettingsUI() {
        const sfxSlider = document.getElementById('setting-sfx-vol');
        if (sfxSlider) sfxSlider.value = this.settings.sfxVolume;

        const musicSlider = document.getElementById('setting-music-vol');
        if (musicSlider) musicSlider.value = this.settings.musicVolume;

        const musicToggle = document.getElementById('setting-music-toggle');
        if (musicToggle) musicToggle.checked = this.settings.musicEnabled;

        const botDiffSelect = document.getElementById('setting-bot-diff');
        if (botDiffSelect) botDiffSelect.value = this.settings.botDifficulty;
    }

    renderLobbyState(state) {
        const codeEl = document.getElementById('display-room-code');
        if (codeEl && state && state.roomCode) codeEl.innerText = state.roomCode;

        const list = document.getElementById('lobby-players-list');
        if (list) {
            list.innerHTML = '';
            (state && state.players ? state.players : []).forEach(p => {
                const row = document.createElement('div');
                row.className = 'setting-row';
                const hostTag = p.isHost ? ' [HOST]' : '';
                row.innerHTML = '<span>' + p.name + hostTag + '</span><span style="color:' +
                    (p.ready ? '#00e5ff' : '#ff9900') + ';">' + (p.ready ? 'READY' : 'NOT READY') + '</span>';
                list.appendChild(row);
            });
        }

        const readyBtn = document.getElementById('btn-lobby-ready');
        if (readyBtn) {
            const local = (state && state.players ? state.players : []).find(
                p => p.id === (this.network && this.network.localPlayerId)
            );
            readyBtn.innerText = local && local.ready ? 'NOT READY' : 'READY';
            readyBtn.disabled = !!(state && state.isHost);
        }

        const startBtn = document.getElementById('btn-lobby-start');
        if (startBtn) {
            const players = state && state.players ? state.players : [];
            startBtn.disabled = !state.isHost || players.length < 2 || !players.every(p => p.ready);
        }

        if (state && state.error) {
            console.warn('Vector Strike lobby status:', state.error);
        }
    }

    startMatch(multiplayerOverride = false) {
        if (multiplayerOverride) {
            this.matchConfig.multiplayer = true;
            this.matchConfig.botCount = 0;
            this.matchConfig.networkPlayerId = this.network.localPlayerId;
            this.matchConfig.multiplayerPlayers = (this.network.lobbyPlayers || []).map(p => Object.assign({}, p));
            this.matchConfig.network = this.network;
        }
        this.showScreen('screen-hud');

        const canvas = document.getElementById('gameCanvas');
        this.resizeCanvas(canvas);

        if (this.gameWorld) {
            this.gameWorld.stop();
        }

        this.matchConfig.audio = this.audio;
        try {
            const GameWorldCtor = (typeof window !== 'undefined' && typeof window.GameWorld === 'function')
                ? window.GameWorld
                : null;
            if (typeof GameWorldCtor !== 'function') {
                const errors = (typeof window !== 'undefined' && Array.isArray(window.__vectorStrikeScriptErrors))
                    ? window.__vectorStrikeScriptErrors.join('\\n')
                    : '';
                const engineState = (typeof window !== 'undefined' && window.VectorStrikeEngineError)
                    ? '\\nEngine load error: ' + window.VectorStrikeEngineError
                    : '';
                throw new Error('Game engine failed to load: window.GameWorld is unavailable.' +
                    (errors ? '\\nEarly JS errors:\\n' + errors : '') + engineState);
            }
            const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
            if (!ctx) {
                throw new Error('Canvas 2D context unavailable in WebView');
            }
            this.gameWorld = new GameWorldCtor(canvas, this.matchConfig);
            if (this.matchConfig.multiplayer && this.network) {
                this.network.world = this.gameWorld;
            }
        } catch (err) {
            console.error('Vector Strike startMatch failed:', err && err.stack ? err.stack : err);
            this.showGameError(err);
            return;
        }

        this.gameWorld.onMatchOver = (results) => {
            this.showMatchResults(results);
        };

        this.gameWorld.onKillfeedUpdate = (killfeed) => {
            this.renderKillfeed(killfeed);
        };

        this.gameWorld.start();
    }

    showGameError(err) {
        const message = err && err.stack ? err.stack : String(err);
        let box = document.getElementById('vector-strike-error');
        if (!box) {
            box = document.createElement('div');
            box.id = 'vector-strike-error';
            box.style.cssText = 'position:absolute;z-index:9999;left:16px;right:16px;top:16px;padding:16px;background:#070b14;color:#fff;border:2px solid #ff1744;font:13px monospace;white-space:pre-wrap;max-height:45%;overflow:auto;pointer-events:auto;';
            document.body.appendChild(box);
        }
        box.textContent = 'VECTOR STRIKE STARTUP ERROR\\n\\n' + message;
    }

    togglePause(paused) {
        if (!this.gameWorld) return;
        this.gameWorld.paused = paused;
        const pauseScreen = document.getElementById('screen-pause');
        if (pauseScreen) {
            if (paused) {
                pauseScreen.classList.add('active');
            } else {
                pauseScreen.classList.remove('active');
            }
        }
    }

    showMatchResults(results) {
        const winnerBanner = document.getElementById('results-winner-text');
        if (winnerBanner) {
            winnerBanner.innerText = results.winnerName ? `${results.winnerName} VICTORY` : 'MATCH OVER';
        }

        const tableBody = document.getElementById('results-table-body');
        if (tableBody && results.leaderboard) {
            tableBody.innerHTML = '';
            results.leaderboard.forEach((ent, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>#${idx + 1} ${ent.name}</td>
                    <td>${ent.kills || 0}</td>
                    <td>${ent.deaths || 0}</td>
                    <td>${Math.round(ent.damageDealt || 0)}</td>
                `;
                tableBody.appendChild(tr);
            });
        }

        this.showScreen('screen-match-results');
    }

    renderKillfeed(killfeed) {
        const container = document.getElementById('hud-killfeed');
        if (!container) return;
        container.innerHTML = '';
        killfeed.forEach(item => {
            const div = document.createElement('div');
            div.className = 'killfeed-item';
            div.innerHTML = `<span class="kf-killer">${item.killer}</span> <span class="kf-icon">[${item.weapon}]</span> <span class="kf-victim">${item.victim}</span>`;
            container.appendChild(div);
        });
    }

    updateHUD() {
        if (!this.gameWorld || !this.gameWorld.player) return;
        const p = this.gameWorld.player;

        // Health & Shield gauges
        const hpBar = document.getElementById('hud-hp-bar');
        const hpText = document.getElementById('hud-hp-text');
        if (hpBar) {
            const pct = Math.max(0, (p.health / p.maxHealth) * 100);
            hpBar.style.width = pct + '%';
            if (hpText) hpText.innerText = Math.round(p.health) + ' / ' + p.maxHealth;
        }

        const shBar = document.getElementById('hud-shield-bar');
        const shText = document.getElementById('hud-shield-text');
        if (shBar) {
            const pct = Math.max(0, (p.shield / p.maxShield) * 100);
            shBar.style.width = pct + '%';
            if (shText) shText.innerText = Math.round(p.shield) + ' / ' + p.maxShield;
        }

        // Weapon & Ammo
        if (p.currentWeapon) {
            const wName = document.getElementById('hud-weapon-name');
            const wAmmo = document.getElementById('hud-weapon-ammo');
            if (wName) wName.innerText = p.currentWeapon.def.name;
            if (wAmmo) {
                if (p.currentWeapon.isReloading) {
                    wAmmo.innerText = 'RELOADING...';
                } else {
                    wAmmo.innerText = `${p.currentWeapon.ammo} / ${p.currentWeapon.reserveAmmo}`;
                }
            }
        }

        // Grenades count
        const nadeText = document.getElementById('hud-grenades-count');
        if (nadeText) nadeText.innerText = p.grenades;

        // Ability cooldown
        const abilityBtn = document.getElementById('btn-touch-ability');
        if (abilityBtn) {
            if (p.abilityCooldownTimer > 0) {
                abilityBtn.classList.add('on-cooldown');
                abilityBtn.innerText = Math.ceil(p.abilityCooldownTimer) + 's';
            } else {
                abilityBtn.classList.remove('on-cooldown');
                abilityBtn.innerText = 'SURGE';
            }
        }

        // Match Timer & Frags
        const timerText = document.getElementById('hud-match-timer');
        if (timerText && this.gameWorld.mode) {
            const s = Math.ceil(this.gameWorld.mode.timeRemaining || 0);
            const m = Math.floor(s / 60);
            const remS = s % 60;
            timerText.innerText = `${m}:${remS < 10 ? '0' : ''}${remS}`;
        }

        const scoreText = document.getElementById('hud-match-frags');
        if (scoreText) {
            scoreText.innerText = `FRAGS: ${p.kills} | DEATHS: ${p.deaths}`;
        }
    }

    bindTouchControls() {
        const leftZone = document.getElementById('touch-left-stick');
        const leftKnob = document.getElementById('touch-left-knob');
        const rightZone = document.getElementById('touch-right-stick');
        const rightKnob = document.getElementById('touch-right-knob');

        const maxRadius = 45;

        // Left Joystick (Movement)
        if (leftZone) {
            leftZone.addEventListener('pointerdown', (e) => {
                leftZone.setPointerCapture(e.pointerId);
                this.leftStick.active = true;
                this.leftStick.id = e.pointerId;
                const rect = leftZone.getBoundingClientRect();
                this.leftStick.startX = rect.left + rect.width * 0.5;
                this.leftStick.startY = rect.top + rect.height * 0.5;
                this.handleLeftStick(e.clientX, e.clientY, maxRadius, leftKnob);
            });

            leftZone.addEventListener('pointermove', (e) => {
                if (this.leftStick.active && this.leftStick.id === e.pointerId) {
                    this.handleLeftStick(e.clientX, e.clientY, maxRadius, leftKnob);
                }
            });

            const endLeft = (e) => {
                if (this.leftStick.id === e.pointerId) {
                    this.leftStick.active = false;
                    this.leftStick.id = null;
                    if (leftKnob) leftKnob.style.transform = `translate(0px, 0px)`;
                    this.input.moveX = 0;
                    this.input.moveY = 0;
                    this.input.jumpPressed = false;
                    this.input.downPressed = false;
                }
            };
            leftZone.addEventListener('pointerup', endLeft);
            leftZone.addEventListener('pointercancel', endLeft);
        }

        // Right Joystick (Aim & Fire)
        if (rightZone) {
            rightZone.addEventListener('pointerdown', (e) => {
                rightZone.setPointerCapture(e.pointerId);
                this.rightStick.active = true;
                this.rightStick.id = e.pointerId;
                const rect = rightZone.getBoundingClientRect();
                this.rightStick.startX = rect.left + rect.width * 0.5;
                this.rightStick.startY = rect.top + rect.height * 0.5;
                this.handleRightStick(e.clientX, e.clientY, maxRadius, rightKnob);
            });

            rightZone.addEventListener('pointermove', (e) => {
                if (this.rightStick.active && this.rightStick.id === e.pointerId) {
                    this.handleRightStick(e.clientX, e.clientY, maxRadius, rightKnob);
                }
            });

            const endRight = (e) => {
                if (this.rightStick.id === e.pointerId) {
                    this.rightStick.active = false;
                    this.rightStick.id = null;
                    if (rightKnob) rightKnob.style.transform = `translate(0px, 0px)`;
                    this.input.isShooting = false;
                }
            };
            rightZone.addEventListener('pointerup', endRight);
            rightZone.addEventListener('pointercancel', endRight);
        }

        // Action Buttons
        const bindBtn = (id, onDown, onUp) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                btn.setPointerCapture(e.pointerId);
                btn.classList.add('pressed');
                if (onDown) onDown();
            });
            const release = (e) => {
                btn.classList.remove('pressed');
                if (onUp) onUp();
            };
            btn.addEventListener('pointerup', release);
            btn.addEventListener('pointercancel', release);
        };

        bindBtn('btn-touch-jump',
            () => { this.input.jumpPressed = true; if (this.gameWorld && this.gameWorld.player) this.gameWorld.player.requestJump(this.gameWorld); },
            () => { this.input.jumpPressed = false; }
        );

        bindBtn('btn-touch-dash', () => {
            if (this.gameWorld && this.gameWorld.player) {
                const dir = new Vec2(this.input.moveX, this.input.moveY);
                this.gameWorld.player.triggerKineticDash(dir, this.gameWorld);
            }
        });

        bindBtn('btn-touch-ability', () => {
            if (this.gameWorld && this.gameWorld.player) {
                this.gameWorld.player.triggerAbility(this.gameWorld);
            }
        });

        bindBtn('btn-touch-grenade', () => {
            if (this.gameWorld && this.gameWorld.player) {
                this.gameWorld.player.throwGrenade(this.gameWorld.player.aimAngle, this.gameWorld);
            }
        });

        bindBtn('btn-touch-reload', () => {
            if (this.gameWorld && this.gameWorld.player && this.gameWorld.player.currentWeapon) {
                this.gameWorld.player.currentWeapon.startReload(this.gameWorld);
            }
        });

        bindBtn('btn-touch-switch', () => {
            if (this.gameWorld && this.gameWorld.player) {
                this.gameWorld.player.switchWeapon();
            }
        });
    }

    handleLeftStick(clientX, clientY, maxR, knob) {
        let dx = clientX - this.leftStick.startX;
        let dy = clientY - this.leftStick.startY;
        const dist = Math.hypot(dx, dy);

        if (dist > maxR) {
            dx = (dx / dist) * maxR;
            dy = (dy / dist) * maxR;
        }

        if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;

        // Normalized direction (-1 to 1)
        this.input.moveX = dx / maxR;
        this.input.moveY = dy / maxR;

        // Jump if pushed up hard
        if (this.input.moveY < -0.65) {
            this.input.jumpPressed = true;
        }
        // Down if pushed down
        if (this.input.moveY > 0.65) {
            this.input.downPressed = true;
        } else {
            this.input.downPressed = false;
        }

        if (this.gameWorld && this.gameWorld.player) {
            this.gameWorld.player.applyMovementInput(this.input.moveX, this.input.jumpPressed, this.input.downPressed, this.gameWorld);
        }
    }

    handleRightStick(clientX, clientY, maxR, knob) {
        let dx = clientX - this.rightStick.startX;
        let dy = clientY - this.rightStick.startY;
        const dist = Math.hypot(dx, dy);

        if (dist > maxR) {
            dx = (dx / dist) * maxR;
            dy = (dy / dist) * maxR;
        }

        if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;

        if (dist > 10) {
            this.input.aimAngle = Math.atan2(dy, dx);
            if (this.gameWorld && this.gameWorld.player) {
                this.gameWorld.player.aimAngle = this.input.aimAngle;
            }
        }

        // Auto fire when pulled past deadzone
        if (dist > 18) {
            this.input.isShooting = true;
            if (this.gameWorld && this.gameWorld.player && this.gameWorld.player.currentWeapon) {
                this.gameWorld.player.currentWeapon.triggerFire(this.gameWorld.player, this.input.aimAngle, this.gameWorld);
            }
        } else {
            this.input.isShooting = false;
        }
    }

    bindKeyboardControls() {
        const keys = {};
        window.addEventListener('keydown', (e) => {
            keys[e.code] = true;
            if (e.code === 'KeyR' && this.gameWorld && this.gameWorld.player) {
                this.gameWorld.player.currentWeapon.startReload(this.gameWorld);
            }
            if (e.code === 'KeyQ' && this.gameWorld && this.gameWorld.player) {
                this.gameWorld.player.switchWeapon();
            }
            if (e.code === 'KeyG' && this.gameWorld && this.gameWorld.player) {
                this.gameWorld.player.throwGrenade(this.gameWorld.player.aimAngle, this.gameWorld);
            }
            if (e.code === 'KeyE' && this.gameWorld && this.gameWorld.player) {
                this.gameWorld.player.triggerAbility(this.gameWorld);
            }
            if (e.code === 'ShiftLeft' && this.gameWorld && this.gameWorld.player) {
                const dir = new Vec2(this.input.moveX, this.input.moveY);
                this.gameWorld.player.triggerKineticDash(dir, this.gameWorld);
            }
            if (e.code === 'Escape' || e.code === 'KeyP') {
                this.togglePause(!this.gameWorld.paused);
            }
            this.processKeyboardMovement(keys);
        });

        window.addEventListener('keyup', (e) => {
            keys[e.code] = false;
            this.processKeyboardMovement(keys);
        });

        // Mouse aiming & shooting
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            canvas.addEventListener('mousemove', (e) => {
                if (!this.gameWorld || !this.gameWorld.player) return;
                const rect = canvas.getBoundingClientRect();
                const mouseWorldX = e.clientX - rect.left + this.gameWorld.camera.x;
                const mouseWorldY = e.clientY - rect.top + this.gameWorld.camera.y;
                const dx = mouseWorldX - this.gameWorld.player.pos.x;
                const dy = mouseWorldY - this.gameWorld.player.pos.y;
                this.gameWorld.player.aimAngle = Math.atan2(dy, dx);
            });

            canvas.addEventListener('mousedown', (e) => {
                if (e.button === 0 && this.gameWorld && this.gameWorld.player && this.gameWorld.player.currentWeapon) {
                    this.gameWorld.player.currentWeapon.triggerFire(this.gameWorld.player, this.gameWorld.player.aimAngle, this.gameWorld);
                }
            });
        }
    }

    processKeyboardMovement(keys) {
        if (!this.gameWorld || !this.gameWorld.player) return;
        let mx = 0;
        if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) mx += 1;

        const jump = !!(keys['KeyW'] || keys['Space'] || keys['ArrowUp']);
        const down = !!(keys['KeyS'] || keys['ArrowDown']);

        this.input.moveX = mx;
        this.gameWorld.player.applyMovementInput(mx, jump, down, this.gameWorld);
    }

    resizeCanvas(canvas) {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}

// Android Back Button hook
window.handleAndroidBack = function() {
    if (window.uiManager) {
        const hudScreen = document.getElementById('screen-hud');
        if (hudScreen && hudScreen.classList.contains('active')) {
            window.uiManager.togglePause(true);
        } else {
            window.uiManager.showScreen('screen-main-menu');
        }
    }
};

window.onAppPause = function() {
    if (window.uiManager) {
        window.uiManager.togglePause(true);
    }
};

window.onAppResume = function() {
    if (window.audioEngine) {
        window.audioEngine.resume();
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}
