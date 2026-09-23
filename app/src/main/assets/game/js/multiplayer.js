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
        this.tickRate = 30; // 30Hz network sync
        this.tickTimer = 0;
        this.onRoomStateChange = null;
    }

    createRoom(roomCode, hostPlayerName, characterClass, mapId, modeId) {
        this.isHost = true;
        this.roomCode = roomCode || this.generateRoomCode();
        this.localPlayerId = 'host_' + Math.random().toString(36).substring(2, 7);

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
                isHost: true
            });
        }
        return this.roomCode;
    }

    joinRoom(roomCode, playerName, characterClass) {
        this.isHost = false;
        this.roomCode = roomCode.toUpperCase();
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
                ready: true
            }
        });
    }

    initChannel(channelName) {
        if (typeof BroadcastChannel !== 'undefined') {
            this.channel = new BroadcastChannel('vector_strike_' + channelName);
            this.channel.onmessage = (event) => this.handleMessage(event.data);
            this.isConnected = true;
        }
    }

    send(data) {
        if (this.channel) {
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
                }
                break;

            case NET_MSG.ROOM_JOINED:
                this.lobbyPlayers = msg.players;
                this.isConnected = true;
                if (this.onRoomStateChange) {
                    this.onRoomStateChange({
                        roomCode: this.roomCode,
                        players: this.lobbyPlayers,
                        isHost: this.isHost
                    });
                }
                break;

            case NET_MSG.START_MATCH:
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
            // Client sends movement & aim inputs
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
            if (entity && entity !== this.world.player) {
                // Smooth interpolation for remote entities
                entity.pos.x += (es.x - entity.pos.x) * 0.45;
                entity.pos.y += (es.y - entity.pos.y) * 0.45;
                entity.vel.set(es.vx, es.vy);
                entity.aimAngle = es.aim;
                entity.health = es.hp;
                entity.shield = es.sh;
                entity.alive = es.alive;
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

    leaveRoom() {
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
        this.isConnected = false;
        this.isHost = false;
        this.roomCode = null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NET_MSG, NetworkManager };
}
