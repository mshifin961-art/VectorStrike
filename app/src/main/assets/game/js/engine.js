/**
 * Vector Strike - Core Game Engine & Renderer
 * 2D Canvas rendering, camera with lookahead & screen shake, particle systems,
 * entity management, combat drone waves, and visual effects.
 */

if (typeof Vec2 === 'undefined' && typeof require !== 'undefined') {
    var Vec2 = require('./vector2d.js');
}
if (typeof PhysicsEngine === 'undefined' && typeof require !== 'undefined') {
    var PhysicsEngine = require('./physics.js');
}
if (typeof WeaponInstance === 'undefined' && typeof require !== 'undefined') {
    var { WeaponInstance, Projectile, GrenadeThrowable } = require('./weapons.js');
}
if (typeof CharacterEntity === 'undefined' && typeof require !== 'undefined') {
    var { CharacterEntity } = require('./characters.js');
}
if (typeof GameMap === 'undefined' && typeof require !== 'undefined') {
    var { GameMap } = require('./maps.js');
}
if (typeof BotController === 'undefined' && typeof require !== 'undefined') {
    var { BotController } = require('./bot_ai.js');
}
if (typeof SoloDeathmatchMode === 'undefined' && typeof require !== 'undefined') {
    var { SoloDeathmatchMode, TeamBattleMode, SurvivalWaveMode } = require('./modes.js');
}

class Particle {
    constructor(cfg) {
        this.pos = cfg.pos.clone();
        this.vel = cfg.vel.clone();
        this.color = cfg.color || '#00e5ff';
        this.size = cfg.size || 3;
        this.maxLife = cfg.life || 0.4;
        this.life = this.maxLife;
        this.gravity = cfg.gravity || 0;
        this.shrink = cfg.shrink !== undefined ? cfg.shrink : true;
    }

    update(dt) {
        this.life -= dt;
        this.vel.y += this.gravity * dt;
        this.pos.addScaled(this.vel, dt);
    }
}

class Shockwave {
    constructor(pos, maxRadius, color = '#00e5ff', duration = 0.35) {
        this.pos = pos.clone();
        this.maxRadius = maxRadius;
        this.radius = 4;
        this.color = color;
        this.duration = duration;
        this.timer = duration;
    }

    update(dt) {
        this.timer -= dt;
        const progress = 1 - (this.timer / this.duration);
        this.radius = 4 + (this.maxRadius - 4) * Math.sin(progress * Math.PI * 0.5);
    }
}

class DeployableBarrier {
    constructor(pos, ownerId, team, maxHealth = 120, lifetime = 6.0) {
        this.pos = pos.clone();
        this.ownerId = ownerId;
        this.team = team;
        this.width = 44;
        this.height = 70;
        this.maxHealth = maxHealth;
        this.health = maxHealth;
        this.lifetime = lifetime;
        this.timer = lifetime;
        this.alive = true;
    }

    update(dt) {
        this.timer -= dt;
        if (this.timer <= 0 || this.health <= 0) {
            this.alive = false;
        }
    }

    takeDamage(dmg) {
        this.health -= dmg;
        if (this.health <= 0) {
            this.alive = false;
        }
    }
}

class CombatDrone {
    constructor(pos, wave = 1, isHeavy = false) {
        this.id = 'drone_' + Math.random().toString(36).substring(2, 6);
        this.isDrone = true;
        this.isHeavy = isHeavy;
        this.name = isHeavy ? 'Heavy Enforcer' : 'Assault Droid';
        this.pos = pos.clone();
        this.vel = new Vec2(0, 0);
        this.width = isHeavy ? 36 : 24;
        this.height = isHeavy ? 36 : 24;
        this.maxHealth = isHeavy ? (120 + wave * 30) : (40 + wave * 15);
        this.health = this.maxHealth;
        this.shield = isHeavy ? 50 : 0;
        this.maxShield = this.shield;
        this.speed = isHeavy ? 140 : 210;
        this.alive = true;
        this.fireCooldown = 0;
        this.fireRate = isHeavy ? 1.4 : 0.8;
        this.aimAngle = 0;
        this.hoverOffset = Math.random() * Math.PI * 2;
    }

    update(dt, world) {
        if (!this.alive) return;
        this.hoverOffset += dt * 3;

        if (this.fireCooldown > 0) this.fireCooldown -= dt;

        if (world && world.player && world.player.alive) {
            const toPlayer = world.player.pos.clone().sub(this.pos);
            const dist = toPlayer.mag();
            this.aimAngle = toPlayer.angle();

            // Hover and glide toward player
            const targetDist = this.isHeavy ? 260 : 180;
            if (dist > targetDist) {
                this.vel.x = Math.cos(this.aimAngle) * this.speed;
                this.vel.y = Math.sin(this.aimAngle) * this.speed + Math.sin(this.hoverOffset) * 40;
            } else {
                this.vel.x = Math.sin(this.hoverOffset) * 60;
                this.vel.y = Math.cos(this.hoverOffset) * 40;
            }

            this.pos.addScaled(this.vel, dt);

            // Drone firing
            if (this.fireCooldown <= 0 && dist < 700) {
                this.fireCooldown = 1.0 / this.fireRate;
                const proj = new Projectile({
                    pos: this.pos.clone(),
                    angle: this.aimAngle + (Math.random() - 0.5) * 0.08,
                    speed: 950,
                    damage: this.isHeavy ? 20 : 12,
                    range: 800,
                    ownerId: this.id,
                    ownerTeam: 'DRONES',
                    color: this.isHeavy ? '#ff0055' : '#ff9900',
                    length: 12,
                    width: 3
                });
                world.spawnProjectile(proj);
                if (world.audio) world.audio.playWeaponFire('ARC_CARBINE');
            }
        }
    }

    takeDamage(amount, attacker, type, world) {
        if (!this.alive) return;
        this.health -= amount;
        if (world && world.audio) world.audio.playFleshHit();
        if (world && world.spawnBloodOrSparks) world.spawnBloodOrSparks(this.pos, new Vec2(0, -1));

        if (this.health <= 0) {
            this.alive = false;
            if (world) {
                if (world.spawnExplosion) world.spawnExplosion(this.pos, 50);
                if (world.mode && world.mode.onKill) world.mode.onKill(this, attacker, type);
            }
        }
    }
}

class GameWorld {
    constructor(canvas, config = {}) {
        this.canvas = canvas;
        this.ctx = canvas ? canvas.getContext('2d') : null;
        this.config = config;

        this.physics = new PhysicsEngine();
        this.WeaponInstance = WeaponInstance;
        this.Projectile = Projectile;

        this.map = new GameMap(config.mapId || 'MAP_NEON_FOUNDRY');
        this.entities = [];
        this.bots = [];
        this.projectiles = [];
        this.grenades = [];
        this.particles = [];
        this.shockwaves = [];
        this.barriers = [];
        this.killfeed = [];

        this.player = null;
        this.mode = null;
        this.audio = config.audio || null;

        // Camera
        this.camera = {
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            shake: 0,
            zoom: 1.0
        };

        this.running = false;
        this.paused = false;
        this.lastTime = 0;

        this.initEntities(config);
        this.initMode(config.modeId || 'SOLO_DEATHMATCH');
    }

    initEntities(config) {
        const playerClass = config.characterClass || 'VANGUARD';
        const playerName = config.playerName || 'OPERATIVE';

        // Local Player
        this.player = new CharacterEntity('player_local', playerName, playerClass, false, 'ALPHA');
        this.player.world = this;
        this.entities.push(this.player);

        // Spawn position
        const spawn = this.getRespawnPoint(this.player.team);
        this.player.pos.copy(spawn);

        // Add AI Bots if offline or configured
        const botCount = config.botCount !== undefined ? config.botCount : 3;
        const classes = ['VANGUARD', 'SPECTER', 'JUGGERNAUT', 'CYPHER'];
        const botNames = ['Apex-01', 'Ghost-9', 'Valkyrie', 'Titan-X', 'Echo-4'];

        for (let i = 0; i < botCount; i++) {
            const bClass = classes[i % classes.length];
            const bName = botNames[i % botNames.length];
            const bTeam = (i % 2 === 0) ? 'BRAVO' : 'ALPHA';
            const bot = new CharacterEntity('bot_' + i, bName, bClass, true, bTeam);
            bot.world = this;

            const bSpawn = this.getRespawnPoint(bTeam);
            bot.pos.copy(bSpawn);

            const brain = new BotController(bot, config.botDifficulty || 'TACTICAL');
            this.entities.push(bot);
            this.bots.push(brain);
        }
    }

    initMode(modeId) {
        switch (modeId) {
            case 'TEAM_BATTLE':
                this.mode = new TeamBattleMode(this, { fragLimit: 20 });
                break;
            case 'SURVIVAL_WAVE':
                this.mode = new SurvivalWaveMode(this);
                break;
            case 'SOLO_DEATHMATCH':
            default:
                this.mode = new SoloDeathmatchMode(this, { fragLimit: 10 });
                break;
        }
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        try { this.render(); } catch (err) { this.reportRuntimeError(err, 'initial render'); }
        if (typeof window === 'undefined') return;
        const raf = window.requestAnimationFrame
            ? (cb) => window.requestAnimationFrame(cb)
            : (cb) => window.setTimeout(() => cb(performance.now()), 16);
        this.loop = (t) => {
            if (!this.running) return;
            try {
                const dt = Math.min(Math.max((t - this.lastTime) / 1000, 0), 0.1);
                this.lastTime = t;
                if (!this.paused) this.update(dt);
                this.render();
            } catch (err) {
                this.running = false;
                this.reportRuntimeError(err, 'game loop');
                return;
            }
            raf(this.loop);
        };
        raf(this.loop);
    }

    reportRuntimeError(err, phase) {
        const message = (err && err.stack) ? err.stack : String(err);
        console.error('Vector Strike runtime error [' + phase + ']: ' + message);
        if (!this.ctx || !this.canvas) return;
        try {
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.fillStyle = '#070b14';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#ff1744';
            this.ctx.font = 'bold 18px sans-serif';
            this.ctx.fillText('VECTOR STRIKE RUNTIME ERROR', 24, 42);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '13px monospace';
            message.split('\n').slice(0, 12).forEach((line, index) => {
                this.ctx.fillText(line.substring(0, 120), 24, 70 + index * 18);
            });
            this.ctx.restore();
        } catch (_) {}
    }
    stop() {
        this.running = false;
    }

    update(dt) {
        // 1. Update Game Mode
        if (this.mode) {
            this.mode.update(dt);
        }

        // 2. Update Map (pickups, hazards, platforms)
        this.map.update(dt, this);

        // 3. Update Bot AI
        for (const bot of this.bots) {
            bot.update(dt, this);
        }

        // 4. Update Characters & Physics
        this.physics.update(dt, this.entities, this.map);

        for (let i = 0; i < this.entities.length; i++) {
            this.entities[i].update(dt, this);
        }

        // 5. Update Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt, this);
            if (p.dead) {
                this.projectiles.splice(i, 1);
            }
        }

        // 6. Update Grenades
        for (let i = this.grenades.length - 1; i >= 0; i--) {
            const g = this.grenades[i];
            g.update(dt, this);
            if (g.dead) {
                this.grenades.splice(i, 1);
            }
        }

        // 7. Update Barriers
        for (let i = this.barriers.length - 1; i >= 0; i--) {
            const b = this.barriers[i];
            b.update(dt);
            if (!b.alive) {
                this.barriers.splice(i, 1);
            }
        }

        // 8. Update Shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.update(dt);
            if (sw.timer <= 0) {
                this.shockwaves.splice(i, 1);
            }
        }

        // 9. Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const pt = this.particles[i];
            pt.update(dt);
            if (pt.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // 10. Update Camera
        if (this.player && this.canvas) {
            // Lookahead based on aim
            const lookDist = 90;
            const lookX = Math.cos(this.player.aimAngle) * lookDist;
            const lookY = Math.sin(this.player.aimAngle) * lookDist * 0.5;

            const targetCamX = this.player.pos.x + lookX - this.canvas.width * 0.5;
            const targetCamY = this.player.pos.y + lookY - this.canvas.height * 0.5;

            // Camera lerp
            this.camera.x += (targetCamX - this.camera.x) * (dt * 6.5);
            this.camera.y += (targetCamY - this.camera.y) * (dt * 6.5);

            // Clamp camera to map bounds
            const maxCamX = Math.max(0, this.map.width - this.canvas.width);
            const maxCamY = Math.max(0, this.map.height - this.canvas.height);
            this.camera.x = Math.max(0, Math.min(maxCamX, this.camera.x));
            this.camera.y = Math.max(0, Math.min(maxCamY, this.camera.y));

            // Camera shake decay
            if (this.camera.shake > 0) {
                this.camera.shake -= dt * 25;
                if (this.camera.shake < 0) this.camera.shake = 0;
            }
        }
    }

    render() {
        if (!this.ctx || !this.canvas) return;
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.save();
        ctx.fillStyle = this.map.ambientColor || '#070b14';
        ctx.fillRect(0, 0, width, height);

        // Apply camera offset + screen shake
        let shakeX = (Math.random() - 0.5) * this.camera.shake;
        let shakeY = (Math.random() - 0.5) * this.camera.shake;
        ctx.translate(-Math.round(this.camera.x + shakeX), -Math.round(this.camera.y + shakeY));

        // 1. Draw Background Grid
        this.renderBackgroundGrid(ctx);

        // 2. Draw Map Solis & Platforms
        this.renderMap(ctx);

        // 3. Draw Barriers
        for (const b of this.barriers) {
            ctx.fillStyle = 'rgba(0, 229, 255, 0.35)';
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(b.pos.x, b.pos.y, 42, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        // 4. Draw Projectiles
        for (const p of this.projectiles) {
            ctx.save();
            ctx.translate(p.pos.x, p.pos.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.fillRect(-p.length, -p.width * 0.5, p.length, p.width);
            ctx.restore();
        }

        // 5. Draw Grenades
        for (const g of this.grenades) {
            ctx.save();
            ctx.fillStyle = '#ff1744';
            ctx.shadowColor = '#ff1744';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(g.pos.x, g.pos.y, g.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 6. Draw Characters & Drones
        for (const e of this.entities) {
            if (!e.alive) continue;
            this.renderCharacter(ctx, e);
        }

        // 7. Draw Shockwaves
        for (const sw of this.shockwaves) {
            ctx.save();
            ctx.strokeStyle = sw.color;
            ctx.lineWidth = 3;
            ctx.shadowColor = sw.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(sw.pos.x, sw.pos.y, sw.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 8. Draw Particles
        for (const pt of this.particles) {
            ctx.save();
            ctx.fillStyle = pt.color;
            ctx.shadowColor = pt.color;
            ctx.shadowBlur = 4;
            const size = pt.shrink ? pt.size * (pt.life / pt.maxLife) : pt.size;
            ctx.fillRect(pt.pos.x - size * 0.5, pt.pos.y - size * 0.5, size, size);
            ctx.restore();
        }

        ctx.restore();
    }

    renderBackgroundGrid(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
        ctx.lineWidth = 1;
        const gridSize = 80;
        for (let x = 0; x <= this.map.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.map.height);
            ctx.stroke();
        }
        for (let y = 0; y <= this.map.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.map.width, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    renderMap(ctx) {
        // Solids
        for (const s of this.map.solids) {
            ctx.fillStyle = '#101626';
            ctx.fillRect(s.x, s.y, s.w, s.h);

            // Tech bevel border
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(s.x, s.y, s.w, s.h);

            // Top highlight
            ctx.fillStyle = 'rgba(0, 229, 255, 0.2)';
            ctx.fillRect(s.x, s.y, s.w, 4);
        }

        // One way platforms
        if (this.map.oneWayPlatforms) {
            for (const p of this.map.oneWayPlatforms) {
                ctx.fillStyle = '#1c283d';
                ctx.fillRect(p.x, p.y, p.w, p.h);
                ctx.strokeStyle = '#38ef7d';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(p.x, p.y, p.w, p.h);
            }
        }

        // Moving platforms
        if (this.map.movingPlatforms) {
            for (const mp of this.map.movingPlatforms) {
                ctx.fillStyle = '#22344d';
                ctx.fillRect(mp.x, mp.y, mp.w, mp.h);
                ctx.strokeStyle = '#ff9900';
                ctx.lineWidth = 2;
                ctx.strokeRect(mp.x, mp.y, mp.w, mp.h);
            }
        }

        // Jump pads
        if (this.map.jumpPads) {
            for (const jp of this.map.jumpPads) {
                ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
                ctx.fillRect(jp.x, jp.y, jp.w, jp.h);
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
                ctx.strokeRect(jp.x, jp.y, jp.w, jp.h);
            }
        }

        // Hazards
        if (this.map.hazards) {
            for (const h of this.map.hazards) {
                ctx.fillStyle = 'rgba(255, 23, 68, 0.5)';
                ctx.fillRect(h.x, h.y, h.w, h.h);
                ctx.strokeStyle = '#ff1744';
                ctx.lineWidth = 2;
                ctx.strokeRect(h.x, h.y, h.w, h.h);
            }
        }

        // Pickups
        if (this.map.pickups) {
            for (const pk of this.map.pickups) {
                if (pk.available) {
                    ctx.save();
                    const color = pk.type === 'HEALTH' ? '#00e676' :
                                 (pk.type === 'SHIELD' ? '#00b0ff' :
                                 (pk.type === 'GRENADE' ? '#ff3d00' : '#ffd600'));
                    ctx.fillStyle = color;
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 10;
                    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
                    ctx.restore();
                }
            }
        }
    }

    renderCharacter(ctx, c) {
        ctx.save();
        ctx.translate(c.pos.x, c.pos.y);

        // Alpha opacity for Cloak
        if (c.isCloaked) {
            ctx.globalAlpha = 0.25;
        }

        // Invincibility flashing
        if (c.invincibleTimer > 0 && Math.floor(performance.now() / 80) % 2 === 0) {
            ctx.globalAlpha = 0.4;
        }

        const classDef = c.classDef || {
            primaryColor: '#00e5ff',
            secondaryColor: '#1a2639',
            visorColor: '#00ffff'
        };
        const halfW = (Number.isFinite(c.width) ? c.width : 24) * 0.5;
        const halfH = (Number.isFinite(c.height) ? c.height : 46) * 0.5;
        const facing = c.facing === -1 ? -1 : 1;

        // Facing direction scale
        ctx.scale(facing, 1);

        // 1. Cybernetic Legs
        ctx.fillStyle = '#151d2a';
        ctx.fillRect(-6, 8, 4, 14);
        ctx.fillRect(2, 8, 4, 14);

        // 2. Torso Armor Plate
        ctx.fillStyle = classDef.secondaryColor || '#1a2639';
        ctx.fillRect(-halfW + 2, -halfH + 12, c.width - 4, 20);

        // Team indicator chest core
        ctx.fillStyle = (c.team === 'ALPHA') ? '#00e5ff' : '#ff0055';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
        ctx.fillRect(-3, -halfH + 16, 6, 6);
        ctx.shadowBlur = 0;

        // 3. Cybernetic Helmet
        ctx.fillStyle = classDef.primaryColor || '#00e5ff';
        ctx.beginPath();
        ctx.arc(0, -halfH + 7, 9, 0, Math.PI * 2);
        ctx.fill();

        // Glowing Visor
        ctx.fillStyle = classDef.visorColor || '#00ffff';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 6;
        ctx.fillRect(1, -halfH + 4, 6, 4);
        ctx.shadowBlur = 0;

        // 4. Weapon
        ctx.save();
        ctx.translate(2, -halfH + 18);
        const aimAngleRelative = facing === 1 ? (c.aimAngle || 0) : (Math.PI - (c.aimAngle || 0));
        ctx.rotate(aimAngleRelative);

        ctx.fillStyle = '#37474f';
        ctx.fillRect(0, -3, 20, 6);
        ctx.fillStyle = c.currentWeapon ? c.currentWeapon.def.bulletColor : '#00e5ff';
        ctx.fillRect(14, -2, 6, 4);

        // Ion Sniper Laser sight
        if (c.currentWeapon && c.currentWeapon.def.hasTargetLaser) {
            ctx.strokeStyle = 'rgba(224, 64, 251, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(20, 0);
            ctx.lineTo(600, 0);
            ctx.stroke();
        }

        ctx.restore();

        // 5. Shield Bubble (if shield active)
        if (c.shield > 0) {
            ctx.strokeStyle = `rgba(0, 229, 255, ${0.2 + (c.shield / c.maxShield) * 0.4})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, 26, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();

        // 6. Nameplate, Health & Shield Bars (Above Entity)
        ctx.save();
        const barW = 34;
        const barH = 4;
        const barX = c.pos.x - barW * 0.5;
        const barY = c.pos.y - c.height * 0.5 - 16;

        // Name
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(c.name, c.pos.x, barY - 4);

        // Health bg
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(barX, barY, barW, barH);
        // Health bar
        const hpPct = Math.max(0, c.health / c.maxHealth);
        ctx.fillStyle = '#00e676';
        ctx.fillRect(barX, barY, barW * hpPct, barH);

        // Shield bar (if maxShield > 0)
        if (c.maxShield > 0) {
            const shPct = Math.max(0, c.shield / c.maxShield);
            ctx.fillStyle = '#00e5ff';
            ctx.fillRect(barX, barY - 3, barW * shPct, 2);
        }

        ctx.restore();
    }

    spawnProjectile(proj) {
        this.projectiles.push(proj);
    }

    spawnGrenade(grenade) {
        this.grenades.push(grenade);
    }

    spawnBarrier(pos, ownerId, team, hp, life) {
        this.barriers.push(new DeployableBarrier(pos, ownerId, team, hp, life));
    }

    spawnCombatDrone(wave, isHeavy) {
        const x = 300 + Math.random() * (this.map.width - 600);
        const y = 200 + Math.random() * 300;
        const drone = new CombatDrone(new Vec2(x, y), wave, isHeavy);
        this.entities.push(drone);
    }

    spawnSpark(pos, normal, color = '#00e5ff') {
        for (let i = 0; i < 4; i++) {
            const spd = 60 + Math.random() * 140;
            const angle = normal.angle() + (Math.random() - 0.5) * 1.4;
            this.particles.push(new Particle({
                pos: pos.clone(),
                vel: Vec2.fromAngle(angle, spd),
                color: color,
                size: 2 + Math.random() * 2,
                life: 0.2 + Math.random() * 0.2,
                gravity: 300
            }));
        }
    }

    spawnExplosion(pos, radius) {
        this.camera.shake = Math.min(25, this.camera.shake + 12);
        this.shockwaves.push(new Shockwave(pos, radius, '#ff3d00', 0.4));

        for (let i = 0; i < 28; i++) {
            const spd = 80 + Math.random() * 260;
            const angle = Math.random() * Math.PI * 2;
            const color = Math.random() < 0.6 ? '#ff3d00' : '#ffea00';
            this.particles.push(new Particle({
                pos: pos.clone(),
                vel: Vec2.fromAngle(angle, spd),
                color: color,
                size: 3 + Math.random() * 4,
                life: 0.35 + Math.random() * 0.35,
                gravity: 400
            }));
        }
    }

    spawnShockwave(pos, radius) {
        this.shockwaves.push(new Shockwave(pos, radius, '#00e5ff', 0.3));
    }

    spawnDashTrail(pos, color) {
        for (let i = 0; i < 8; i++) {
            this.particles.push(new Particle({
                pos: pos.clone().add(new Vec2((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 24)),
                vel: new Vec2((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40),
                color: color,
                size: 3 + Math.random() * 3,
                life: 0.25,
                shrink: true
            }));
        }
    }

    spawnPickupBurst(pos, color = '#00e5ff') {
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 70 + Math.random() * 120;
            this.particles.push(new Particle({ pos: pos.clone(), vel: Vec2.fromAngle(angle, speed), color, size: 2 + Math.random() * 2, life: 0.25 + Math.random() * 0.2, gravity: 80 }));
        }
    }

    spawnEmpVisual(pos, radius = 200) {
        this.shockwaves.push(new Shockwave(pos, radius, '#e040fb', 0.45));
        for (let i = 0; i < 16; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 100;
            this.particles.push(new Particle({ pos: pos.clone(), vel: Vec2.fromAngle(angle, speed), color: '#e040fb', size: 2 + Math.random() * 3, life: 0.35 + Math.random() * 0.25 }));
        }
    }
    spawnBloodOrSparks(pos, dir) {
        for (let i = 0; i < 5; i++) {
            const spd = 50 + Math.random() * 120;
            const angle = dir.angle() + (Math.random() - 0.5) * 1.0;
            this.particles.push(new Particle({
                pos: pos.clone(),
                vel: Vec2.fromAngle(angle, spd),
                color: '#ff0055',
                size: 2 + Math.random() * 2,
                life: 0.3,
                gravity: 300
            }));
        }
    }

    spawnJumpPuff(pos) {
        for (let i = 0; i < 6; i++) {
            this.particles.push(new Particle({
                pos: pos.clone().add(new Vec2((Math.random() - 0.5) * 14, 20)),
                vel: new Vec2((Math.random() - 0.5) * 70, (Math.random() - 0.5) * 20),
                color: 'rgba(0, 229, 255, 0.4)',
                size: 3,
                life: 0.22,
                gravity: -50
            }));
        }
    }

    spawnWallSparks(pos, side) {
        for (let i = 0; i < 6; i++) {
            this.particles.push(new Particle({
                pos: pos.clone().add(new Vec2(side * 12, 0)),
                vel: new Vec2(-side * (40 + Math.random() * 80), -40 - Math.random() * 60),
                color: '#ffd600',
                size: 2,
                life: 0.25,
                gravity: 400
            }));
        }
    }

    onEntityKilled(victim, killer, type) {
        const killerName = killer ? killer.name : 'Environmental Hazard';
        this.killfeed.unshift({
            killer: killerName,
            victim: victim.name,
            weapon: type,
            time: performance.now()
        });

        if (this.killfeed.length > 5) {
            this.killfeed.pop();
        }

        if (this.mode && this.mode.onKill) {
            this.mode.onKill(victim, killer, type);
        }

        if (this.onKillfeedUpdate) {
            this.onKillfeedUpdate(this.killfeed);
        }
    }

    getRespawnPoint(team) {
        const spawns = this.map.spawnPoints.filter(s => !team || s.team === team);
        const pool = spawns.length > 0 ? spawns : this.map.spawnPoints;
        const pt = pool[Math.floor(Math.random() * pool.length)];
        return new Vec2(pt.x, pt.y);
    }

    getEntityById(id) {
        for (const e of this.entities) {
            if (e.id === id) return e;
        }
        return null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameWorld, Particle, Shockwave, CombatDrone, DeployableBarrier };
}
