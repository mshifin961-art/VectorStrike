/**
 * Vector Strike - Game Modes System
 * Solo Deathmatch, Team Battle, and Survival Wave Mode.
 */

const GAME_MODES = {
    SOLO_DEATHMATCH: 'SOLO_DEATHMATCH',
    TEAM_BATTLE: 'TEAM_BATTLE',
    SURVIVAL_WAVE: 'SURVIVAL_WAVE'
};

class GameModeBase {
    constructor(world, config = {}) {
        this.world = world;
        this.config = config;
        this.matchTime = config.timeLimit || 300; // 5 minutes default
        this.timeRemaining = this.matchTime;
        this.matchEnded = false;
        this.winner = null;
    }

    update(dt) {
        if (this.matchEnded) return;

        this.timeRemaining -= dt;
        if (this.timeRemaining <= 0) {
            this.timeRemaining = 0;
            this.onTimeExpired();
        }
    }

    onKill(victim, killer, type) {}
    onTimeExpired() {}
}

class SoloDeathmatchMode extends GameModeBase {
    constructor(world, config = {}) {
        super(world, config);
        this.type = GAME_MODES.SOLO_DEATHMATCH;
        this.name = 'Solo Deathmatch';
        this.fragLimit = config.fragLimit || 10;
    }

    onKill(victim, killer, type) {
        if (this.matchEnded) return;

        if (killer && killer !== victim) {
            if (killer.kills >= this.fragLimit) {
                this.endMatch(killer);
            }
        }
    }

    onTimeExpired() {
        // Winner is entity with highest kills
        let topEntity = null;
        let topKills = -1;

        for (const e of this.world.entities) {
            if (e.kills > topKills) {
                topKills = e.kills;
                topEntity = e;
            }
        }

        this.endMatch(topEntity);
    }

    endMatch(winner) {
        this.matchEnded = true;
        this.winner = winner;
        if (this.world.onMatchOver) {
            this.world.onMatchOver({
                mode: this.name,
                winnerName: winner ? winner.name : 'Draw',
                winnerTeam: null,
                leaderboard: this.getLeaderboard()
            });
        }
    }

    getLeaderboard() {
        return [...this.world.entities].sort((a, b) => {
            if (b.kills !== a.kills) return b.kills - a.kills;
            return a.deaths - b.deaths;
        });
    }
}

class TeamBattleMode extends GameModeBase {
    constructor(world, config = {}) {
        super(world, config);
        this.type = GAME_MODES.TEAM_BATTLE;
        this.name = 'Team Battle';
        this.teamFragLimit = config.fragLimit || 20;
        this.scores = {
            ALPHA: 0,
            BRAVO: 0
        };
    }

    onKill(victim, killer, type) {
        if (this.matchEnded) return;

        if (killer && killer !== victim && killer.team && killer.team !== victim.team) {
            this.scores[killer.team] = (this.scores[killer.team] || 0) + 1;
            if (this.scores[killer.team] >= this.teamFragLimit) {
                this.endMatch(killer.team);
            }
        }
    }

    onTimeExpired() {
        let winningTeam = 'DRAW';
        if (this.scores.ALPHA > this.scores.BRAVO) {
            winningTeam = 'ALPHA';
        } else if (this.scores.BRAVO > this.scores.ALPHA) {
            winningTeam = 'BRAVO';
        }
        this.endMatch(winningTeam);
    }

    endMatch(winningTeam) {
        this.matchEnded = true;
        this.winner = winningTeam;
        if (this.world.onMatchOver) {
            this.world.onMatchOver({
                mode: this.name,
                winnerName: winningTeam === 'DRAW' ? 'Draw' : `Team ${winningTeam}`,
                winnerTeam: winningTeam,
                scores: this.scores,
                leaderboard: [...this.world.entities].sort((a, b) => b.kills - a.kills)
            });
        }
    }
}

class SurvivalWaveMode extends GameModeBase {
    constructor(world, config = {}) {
        super(world, config);
        this.type = GAME_MODES.SURVIVAL_WAVE;
        this.name = 'Survival Protocol';
        this.wave = 1;
        this.waveTimer = 0;
        this.waveActive = false;
        this.enemiesRemaining = 0;
        this.intermissionTime = 5.0;
        this.totalDronesKilled = 0;
        this.startNextWave();
    }

    startNextWave() {
        this.waveActive = true;
        const droneCount = 3 + this.wave * 2;
        this.enemiesRemaining = droneCount;

        // Spawn combat assault drones
        for (let i = 0; i < droneCount; i++) {
            const isHeavy = (this.wave >= 3 && i === 0);
            this.world.spawnCombatDrone(this.wave, isHeavy);
        }

        if (this.world.onWaveStart) {
            this.world.onWaveStart(this.wave, droneCount);
        }
    }

    update(dt) {
        if (this.matchEnded) return;

        // Check if player died
        if (this.world.player && !this.world.player.alive && this.world.player.deaths > 0) {
            this.endMatch('SYSTEM OVERRUN');
            return;
        }

        if (!this.waveActive) {
            this.waveTimer -= dt;
            if (this.waveTimer <= 0) {
                this.wave++;
                this.startNextWave();
            }
        }
    }

    onKill(victim, killer, type) {
        if (this.matchEnded) return;

        if (victim.isDrone) {
            this.enemiesRemaining--;
            this.totalDronesKilled++;

            if (this.enemiesRemaining <= 0) {
                this.waveActive = false;
                this.waveTimer = this.intermissionTime;
                if (this.world.onWaveCleared) {
                    this.world.onWaveCleared(this.wave);
                }
            }
        }
    }

    endMatch(status) {
        this.matchEnded = true;
        if (this.world.onMatchOver) {
            this.world.onMatchOver({
                mode: this.name,
                winnerName: `Survived Wave ${this.wave - 1}`,
                dronesKilled: this.totalDronesKilled,
                leaderboard: [this.world.player]
            });
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GAME_MODES, SoloDeathmatchMode, TeamBattleMode, SurvivalWaveMode };
}
