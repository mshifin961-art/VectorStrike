/**
 * Vector Strike - Local Wi-Fi Multiplayer Engine
 * Real-time LAN client-server synchronization, entity interpolation,
 * authoritative host resolution, and robust connection lifecycle.
 */

const NET_MSG = {
    ROOM_CREATE: 'ROOM_CREATE',
    ROOM_JOIN: 'ROOM_JOIN',
    ROOM_JOINED: 'ROOM_JOINED',
    PLAYER_JOINED: 'PLAYER_JOINED',
    PLAYER_LEFT: 'PLAYER_LEFT',
    PLAYER_READY: 'PLAYER_READY',
    START_MATCH: 'START_MATCH',
    CLIENT_INPUT: 'CLIENT_INPUT',
    SERVER_TICK: 'SERVER_TICK',
    EVENT_SPAWN_BULLET: 'EVENT_SPAWN_BULLET',
    EVENT_DAMAGE: 'EVENT_DAMAGE',
    EVENT_DEATH: 'EVENT_DEATH',
    EVENT_RESPAWN: 'EVENT_RESPAWN',
    MATCH_OVER: 'MATCH_OVER'
};

class NetworkManager {
    constructor(world) {
        this.world = world;
        this.isHost = false;
        this.isConnected = false;
        this.roomCode = null;
        this.localPlayerId = null;
        this.remotePlayers = new Map(); // id -> CharacterEntity
        this.channel = null;
        this.socket = null;
        this.tickRate = 20; // Android-safe LAN rate
        this.tickTimer = 0;
        this.inputTimer = 0;
        this.onRoomStateChange = null;
        this.onMatchStart = null;
        this.lobbyPlayers = [];
        this.lastLanStatus = '';
    }

    createRoom(roomCode, hostPlayerName, characterClass, mapId, modeId, timeLimit = 300) {
        this.isHost = true;
        this.roomCode = roomCode || this.generateRoomCode();
        this.remotePlayers.clear();
        this.lobbyPlayers = [];
        this.tickTimer = 0;
        this.inputTimer = 0;
        this.localPlayerId = 'host_' + Math.random().toString(36).substring(2, 7);
        this.roomSettings = {
            mapId: mapId || 'MAP_NEON_FOUNDRY',
            timeLimit: Number(timeLimit) || 300,
            modeId: modeId || 'SOLO_DEATHMATCH'
        };

        this.initChannel(this.roomCode);

        // Host registers themselves
        const hostPlayer = {
            id: this.localPlayerId,
            name: hostPlayerName,
            characterClass: characterClass,
            team: 'ALPHA',
            isHost: true,
            ready: true
        };
        this.lobbyPlayers = [hostPlayer];

        if (this.onRoomStateChange) {
            this.onRoomStateChange({
                roomCode: this.roomCode,
                players: this.lobbyPlayers,
                isHost: true,
                mapId: this.roomSettings.mapId,
                timeLimit: this.roomSettings.timeLimit,
                modeId: this.roomSettings.modeId
            });
        }
        return this.roomCode;
    }

    joinRoom(roomCode, playerName, characterClass) {
        this.isHost = false;
        this.roomCode = roomCode.toUpperCase();
        this.remotePlayers.clear();
        this.lobbyPlayers = [];
        this.tickTimer = 0;
        this.inputTimer = 0;
        this.localPlayerId = 'client_' + Math.random().toString(36).substring(2, 7);

        this.initChannel(this.roomCode);

        // Send Join Request
        this.send({
            type: NET_MSG.ROOM_JOIN,
            roomCode: this.roomCode,
            player: {
                id: this.localPlayerId,
                name: playerName,
                characterClass: characterClass,
                team: 'BRAVO',
                isHost: false,
                ready: false
            }
        });
    }

    initChannel(channelName) {
        this.isConnected = false;
        this.lastLanStatus = 'CONNECTING';
        if (window.AndroidBridge) {
            if (this.isHost && window.AndroidBridge.startLanHost) {
                window.AndroidBridge.startLanHost(channelName);
                this.isConnected = true;
            } else if (!this.isHost && window.AndroidBridge.joinLanRoom) {
                window.AndroidBridge.joinLanRoom(channelName);
            }
        } else {
            console.error('Vector Strike LAN: AndroidBridge unavailable');
        }
    }

    handleNativeStatus(status) {
        this.lastLanStatus = status || '';
        if (status === 'HOSTING' || status === 'CONNECTED') {
            this.isConnected = true;
        }
        if (status === 'DISCONNECTED') {
            this.isConnected = false;
        }
        if (status && status.indexOf('ERROR:') === 0) {
            this.isConnected = false;
            console.error('Vector Strike LAN:', status);
            if (this.onRoomStateChange) {
                this.onRoomStateChange({
                    roomCode: this.roomCode,
                    players: this.lobbyPlayers || [],
                    isHost: this.isHost,
                    error: status.substring(6)
                });
            }
        }
    }

    handleNativeMessage(json) {
        try {
            const msg = typeof json === 'string' ? JSON.parse(json) : json;
            this.handleMessage(msg);
        } catch (e) {
            console.error('Vector Strike LAN message parse failed:', e);
        }
    }

    send(data) {
        if (window.AndroidBridge && window.AndroidBridge.sendLanMessage) {
            window.AndroidBridge.sendLanMessage(JSON.stringify(data));
        } else if (this.channel) {
            this.channel.postMessage(data);
        } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    handleMessage(msg) {
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case NET_MSG.ROOM_JOIN:
                if (this.isHost) {
                    // Check if space available
                    if (this.lobbyPlayers.length < 4) {
                        const newPlayer = msg.player;
                        newPlayer.team = (this.lobbyPlayers.length % 2 === 0) ? 'ALPHA' : 'BRAVO';
                        this.lobbyPlayers.push(newPlayer);

                        // Broadcast updated lobby
                        this.send({
                            type: NET_MSG.ROOM_JOINED,
                            roomCode: this.roomCode,
                            players: this.lobbyPlayers,
                            mapId: this.roomSettings.mapId,
                            timeLimit: this.roomSettings.timeLimit,
                            modeId: this.roomSettings.modeId
                        });

                        if (this.onRoomStateChange) {
                            this.onRoomStateChange({
                                roomCode: this.roomCode,
                                players: this.lobbyPlayers,
                                isHost: true,
                                mapId: this.roomSettings.mapId,
                                timeLimit: this.roomSettings.timeLimit
                            });
                        }
                    }
                }
                break;

            case NET_MSG.PLAYER_LEFT:
                this.lobbyPlayers = (this.lobbyPlayers || []).filter(p => p.id !== msg.playerId);
                if (this.onRoomStateChange) {
                    this.onRoomStateChange({
                        roomCode: this.roomCode,
                        players: this.lobbyPlayers,
                        isHost: this.isHost,
                        error: 'PLAYER_DISCONNECTED'
                    });
                }
                break;

            case NET_MSG.ROOM_JOINED:
                this.lobbyPlayers = msg.players || [];
                if (msg.mapId) {
                    this.roomSettings = {
                        mapId: msg.mapId,
                        timeLimit: Number(msg.timeLimit) || 300,
                        modeId: msg.modeId || 'SOLO_DEATHMATCH'
                    };
                }
                this.isConnected = true;
                if (this.onRoomStateChange) {
                    this.onRoomStateChange({
                        roomCode: this.roomCode,
                        players: this.lobbyPlayers,
                        isHost: this.isHost
                    });
                }
                break;

            case NET_MSG.PLAYER_READY:
                if (this.isHost) {
                    const readyPlayer = (this.lobbyPlayers || []).find(p => p.id === msg.playerId);
                    if (readyPlayer) readyPlayer.ready = !!msg.ready;
                    this.send({
                        type: NET_MSG.ROOM_JOINED,
                        roomCode: this.roomCode,
                        players: this.lobbyPlayers
                    });
                    if (this.onRoomStateChange) {
                        this.onRoomStateChange({
                            roomCode: this.roomCode,
                            players: this.lobbyPlayers,
                            isHost: true
                        });
                    }
                }
                break;

            case NET_MSG.START_MATCH:
                if (msg.config && msg.config.timeLimit) {
                    this.roomSettings = Object.assign({}, this.roomSettings || {}, {
                        mapId: msg.config.mapId || (this.roomSettings && this.roomSettings.mapId),
                        timeLimit: Number(msg.config.timeLimit) || 300,
                        modeId: msg.config.modeId || (this.roomSettings && this.roomSettings.modeId) || 'SOLO_DEATHMATCH'
                    });
                }
                if (this.onMatchStart) {
                    this.onMatchStart(msg.config);
                }
                break;

            case NET_MSG.CLIENT_INPUT:
                if (this.isHost) {
                    this.processClientInput(msg.playerId, msg.input);
                }
                break;

            case NET_MSG.SERVER_TICK:
                if (!this.isHost) {
                    this.applyServerTick(msg.state);
                }
                break;

            case NET_MSG.EVENT_SPAWN_BULLET:
                if (!this.isHost) {
                    this.replicateBullet(msg.bullet);
                }
                break;

            case NET_MSG.MATCH_OVER:
                if (!this.isHost && this.world && this.world.onMatchOver) {
                    this.world.onMatchOver(msg.results);
                }
                break;
        }
    }

    update(dt) {
        if (!this.isConnected) return;

        if (this.isHost) {
            this.tickTimer += dt;
            if (this.tickTimer >= 1.0 / this.tickRate) {
                this.tickTimer = 0;
                this.broadcastServerTick();
            }
        } else {
            this.inputTimer += dt;
            if (this.inputTimer < 1.0 / this.tickRate) return;
            this.inputTimer = 0;
            if (this.world && this.world.player) {
                const p = this.world.player;
                this.send({
                    type: NET_MSG.CLIENT_INPUT,
                    playerId: this.localPlayerId,
                    input: {
                        x: p.pos.x,
                        y: p.pos.y,
                        vx: p.vel.x,
                        vy: p.vel.y,
                        aim: p.aimAngle,
                        grounded: p.grounded,
                        alive: p.alive
                    }
                });
            }
        }
    }

    broadcastServerTick() {
        if (!this.world || !this.world.entities) return;

        const entitiesState = this.world.entities.map(e => ({
            id: e.id,
            x: Math.round(e.pos.x),
            y: Math.round(e.pos.y),
            vx: Math.round(e.vel.x),
            vy: Math.round(e.vel.y),
            aim: e.aimAngle,
            hp: e.health,
            sh: e.shield,
            alive: e.alive,
            kills: e.kills,
            deaths: e.deaths
        }));

        this.send({
            type: NET_MSG.SERVER_TICK,
            state: {
                timeRemaining: this.world.mode ? this.world.mode.timeRemaining : 0,
                entities: entitiesState
            }
        });
    }

    applyServerTick(serverState) {
        if (!this.world || !this.world.entities) return;

        for (const es of serverState.entities) {
            const entity = this.world.getEntityById(es.id);
            if (!entity) continue;

            if (entity === this.world.player) {
                // The host is authoritative for HP/shield/death. Do not overwrite the
                // local position because local movement remains responsive.
                entity.health = Math.max(0, es.hp);
                entity.shield = Math.max(0, es.sh);
                entity.alive = !!es.alive;
                entity.kills = es.kills;
                entity.deaths = es.deaths;
                entity.vel.set(es.vx, es.vy);
                entity.aimAngle = es.aim;
            } else {
                // Smooth interpolation for remote entities.
                entity.pos.x += (es.x - entity.pos.x) * 0.45;
                entity.pos.y += (es.y - entity.pos.y) * 0.45;
                entity.vel.set(es.vx, es.vy);
                entity.aimAngle = es.aim;
                entity.health = Math.max(0, es.hp);
                entity.shield = Math.max(0, es.sh);
                entity.alive = !!es.alive;
                entity.kills = es.kills;
                entity.deaths = es.deaths;
            }
        }

        if (this.world.mode) {
            this.world.mode.timeRemaining = serverState.timeRemaining;
        }
    }

    processClientInput(playerId, input) {
        const entity = this.world.getEntityById(playerId);
        if (entity) {
            entity.pos.x += (input.x - entity.pos.x) * 0.5;
            entity.pos.y += (input.y - entity.pos.y) * 0.5;
            entity.vel.set(input.vx, input.vy);
            entity.aimAngle = input.aim;
            entity.grounded = input.grounded;
        }
    }

    replicateBullet(bulletData) {
        if (this.world && this.world.spawnProjectile) {
            const proj = new this.world.Projectile({
                pos: new Vec2(bulletData.x, bulletData.y),
                angle: bulletData.angle,
                speed: bulletData.speed,
                damage: bulletData.damage,
                range: bulletData.range,
                ownerId: bulletData.ownerId,
                ownerTeam: bulletData.ownerTeam,
                color: bulletData.color,
                length: bulletData.length,
                width: bulletData.width
            });
            this.world.spawnProjectile(proj);
        }
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    updateRoomSettings(mapId, timeLimit) {
        if (!this.isHost) return;
        this.roomSettings = {
            mapId: mapId || (this.roomSettings && this.roomSettings.mapId) || 'MAP_NEON_FOUNDRY',
            timeLimit: Number(timeLimit) || (this.roomSettings && this.roomSettings.timeLimit) || 300,
            modeId: (this.roomSettings && this.roomSettings.modeId) || 'SOLO_DEATHMATCH'
        };
        this.send({
            type: NET_MSG.ROOM_JOINED,
            roomCode: this.roomCode,
            players: this.lobbyPlayers,
            mapId: this.roomSettings.mapId,
            timeLimit: this.roomSettings.timeLimit
        });
        if (this.onRoomStateChange) {
            this.onRoomStateChange({
                roomCode: this.roomCode,
                players: this.lobbyPlayers,
                isHost: true,
                mapId: this.roomSettings.mapId,
                timeLimit: this.roomSettings.timeLimit
            });
        }
    }

    setReady(ready) {
        if (!this.localPlayerId) return;
        const local = (this.lobbyPlayers || []).find(p => p.id === this.localPlayerId);
        if (local) local.ready = !!ready;
        this.send({
            type: NET_MSG.PLAYER_READY,
            playerId: this.localPlayerId,
            ready: !!ready
        });
        if (this.onRoomStateChange) {
            this.onRoomStateChange({
                roomCode: this.roomCode,
                players: this.lobbyPlayers || [],
                isHost: this.isHost
            });
        }
    }

    leaveRoom() {
        if (window.AndroidBridge && window.AndroidBridge.stopLan) {
            window.AndroidBridge.stopLan();
        }
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
        this.isConnected = false;
        this.isHost = false;
        this.roomCode = null;
        this.roomSettings = null;
        this.localPlayerId = null;
        this.lobbyPlayers = [];
        this.remotePlayers.clear();
        this.world = null;
        this.tickTimer = 0;
        this.inputTimer = 0;
        this.lastLanStatus = 'STOPPED';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NET_MSG, NetworkManager };
}
