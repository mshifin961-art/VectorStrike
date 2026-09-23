/**
 * Vector Strike - Extensible Weapon & Projectile System
 * 6 balanced, distinct original weapon archetypes + throwables.
 */

if (typeof Vec2 === 'undefined' && typeof require !== 'undefined') {
    Vec2 = require('./vector2d.js');
}

const WEAPON_TYPES = {
    RAIL_PISTOL: 'RAIL_PISTOL',
    ARC_CARBINE: 'ARC_CARBINE',
    SCATTER_PULSE: 'SCATTER_PULSE',
    ION_SNIPER: 'ION_SNIPER',
    MAG_LAUNCHER: 'MAG_LAUNCHER',
    PLASMA_EDGE: 'PLASMA_EDGE'
};

const WEAPON_DEFS = {
    [WEAPON_TYPES.RAIL_PISTOL]: {
        name: 'KP-9 Rail Pistol',
        category: 'Sidearm',
        damage: 26,
        fireRate: 4.0, // shots per sec
        magSize: 12,
        reloadTime: 0.9,
        projSpeed: 1900,
        spread: 0.02,
        recoil: 45,
        range: 900,
        isAuto: false,
        bulletColor: '#00e5ff',
        bulletLength: 16,
        bulletWidth: 3,
        pellets: 1,
        pierce: 1,
        bounces: 0,
        description: 'Precise semi-auto kinetic handgun with high muzzle velocity.'
    },
    [WEAPON_TYPES.ARC_CARBINE]: {
        name: 'Arc Carbine',
        category: 'Assault',
        damage: 19,
        fireRate: 2.2, // bursts per sec
        burstCount: 3,
        burstInterval: 0.07,
        magSize: 24, // 8 bursts
        reloadTime: 1.3,
        projSpeed: 1500,
        spread: 0.04,
        recoil: 70,
        range: 850,
        isAuto: true,
        bulletColor: '#38ef7d',
        bulletLength: 14,
        bulletWidth: 4,
        pellets: 1,
        pierce: 1,
        bounces: 0,
        description: 'Rapid 3-round hyper-velocity plasma burst rifle.'
    },
    [WEAPON_TYPES.SCATTER_PULSE]: {
        name: 'Scatter-Pulse',
        category: 'Shotgun',
        damage: 11, // per pellet (x7 = 63 max)
        pellets: 7,
        fireRate: 1.3,
        magSize: 6,
        reloadTime: 1.8,
        projSpeed: 1300,
        spread: 0.20,
        recoil: 150,
        range: 550,
        isAuto: false,
        bulletColor: '#ff9900',
        bulletLength: 10,
        bulletWidth: 3,
        pierce: 1,
        bounces: 1, // Ricochets once off walls!
        description: 'Tactical flechette shotgun. Pellets ricochet once off hard surfaces.'
    },
    [WEAPON_TYPES.ION_SNIPER]: {
        name: 'Ion Beam Sniper',
        category: 'Precision',
        damage: 95,
        fireRate: 0.8,
        magSize: 4,
        reloadTime: 2.2,
        projSpeed: 3500,
        spread: 0.003,
        recoil: 220,
        range: 1600,
        isAuto: false,
        bulletColor: '#e040fb',
        bulletLength: 40,
        bulletWidth: 5,
        pellets: 1,
        pierce: 3, // Pierces through up to 3 targets
        bounces: 0,
        hasTargetLaser: true,
        description: 'High-caliber anti-armor energy rifle with piercing laser bolt.'
    },
    [WEAPON_TYPES.MAG_LAUNCHER]: {
        name: 'Mag-Launcher',
        category: 'Explosive',
        damage: 82,
        splashRadius: 95,
        fireRate: 1.1,
        magSize: 4,
        reloadTime: 2.0,
        projSpeed: 820,
        projGravity: 550,
        spread: 0.03,
        recoil: 130,
        range: 800,
        isAuto: false,
        bulletColor: '#ff1744',
        pellets: 1,
        isExplosive: true,
        fuseTime: 2.5,
        description: 'Magnetic launcher firing proximity mines that stick and detonate.'
    },
    [WEAPON_TYPES.PLASMA_EDGE]: {
        name: 'Plasma Edge',
        category: 'Melee',
        damage: 54,
        meleeRange: 65,
        meleeArc: Math.PI * 0.7,
        fireRate: 2.3,
        magSize: 999, // infinite
        reloadTime: 0.1,
        isMelee: true,
        deflectDuration: 0.18, // Can deflect bullets during swing
        recoil: -80, // Lunges forward on swing!
        bladeColor: '#00e5ff',
        description: 'Thermal energy blade that lunges and can deflect enemy projectiles.'
    }
};

class WeaponInstance {
    constructor(type = WEAPON_TYPES.RAIL_PISTOL) {
        this.type = type;
        this.def = WEAPON_DEFS[type] || WEAPON_DEFS[WEAPON_TYPES.RAIL_PISTOL];
        this.ammo = this.def.magSize;
        this.maxAmmo = this.def.magSize;
        // Unlimited reserve ammunition: magazine still empties and reloads normally.
        // This keeps firing available throughout the match without removing reload gameplay.
        this.reserveAmmo = Infinity;
        this.isReloading = false;
        this.reloadTimer = 0;
        this.fireCooldown = 0;
        this.burstLeft = 0;
        this.burstTimer = 0;
        this.burstAimAngle = 0;
    }

    update(dt, owner, world) {
        if (this.fireCooldown > 0) this.fireCooldown -= dt;

        if (this.isReloading) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0) {
                this.isReloading = false;
                const needed = this.maxAmmo - this.ammo;
                const take = Math.min(needed, this.reserveAmmo);
                this.ammo += take;
                if (Number.isFinite(this.reserveAmmo)) this.reserveAmmo -= take;
                if (world && world.audio) world.audio.playReloadComplete();
            }
        }

        // Burst logic
        if (this.burstLeft > 0) {
            this.burstTimer -= dt;
            if (this.burstTimer <= 0) {
                this.burstTimer = this.def.burstInterval || 0.07;
                this.burstLeft--;
                this.emitShot(owner, this.burstAimAngle, world);
            }
        }
    }

    triggerFire(owner, aimAngle, world) {
        if (this.isReloading) return false;
        if (this.fireCooldown > 0) return false;

        // Auto reload if empty
        if (this.ammo <= 0) {
            this.startReload(world);
            return false;
        }

        this.fireCooldown = 1.0 / this.def.fireRate;

        if (this.def.isMelee) {
            this.performMeleeSwing(owner, aimAngle, world);
            return true;
        }

        if (this.def.burstCount && this.def.burstCount > 1) {
            this.ammo--;
            this.burstLeft = this.def.burstCount - 1;
            this.burstTimer = this.def.burstInterval || 0.07;
            this.burstAimAngle = aimAngle;
            this.emitShot(owner, aimAngle, world);
            return true;
        }

        this.ammo--;
        const count = this.def.pellets || 1;
        for (let i = 0; i < count; i++) {
            const spreadAngle = aimAngle + (Math.random() - 0.5) * this.def.spread;
            this.emitShot(owner, spreadAngle, world);
        }

        // Owner recoil knockback
        if (owner && this.def.recoil) {
            const recoilVec = Vec2.fromAngle(aimAngle + Math.PI, this.def.recoil);
            owner.vel.x += recoilVec.x * 0.4;
            owner.vel.y += recoilVec.y * 0.2;
        }

        if (world && world.audio) {
            world.audio.playWeaponFire(this.type);
        }

        return true;
    }

    emitShot(owner, angle, world) {
        if (!world || !world.spawnProjectile) return;

        const muzzleOffset = Vec2.fromAngle(angle, 28);
        const spawnPos = owner.pos.clone().add(muzzleOffset);

        const proj = new Projectile({
            pos: spawnPos,
            angle: angle,
            speed: this.def.projSpeed,
            damage: this.def.damage,
            range: this.def.range,
            ownerId: owner.id,
            ownerTeam: owner.team,
            color: this.def.bulletColor,
            length: this.def.bulletLength || 12,
            width: this.def.bulletWidth || 3,
            bounces: this.def.bounces || 0,
            pierce: this.def.pierce || 1,
            isExplosive: this.def.isExplosive || false,
            splashRadius: this.def.splashRadius || 0,
            gravity: this.def.projGravity || 0,
            fuseTime: this.def.fuseTime || 0
        });

        world.spawnProjectile(proj);
    }

    performMeleeSwing(owner, angle, world) {
        owner.meleeSwingTime = 0.25;
        owner.meleeAimAngle = angle;
        // Deflection window
        owner.isDeflecting = true;
        owner.deflectTime = this.def.deflectDuration;

        // Lunge in aim direction
        const lunge = Vec2.fromAngle(angle, 260);
        owner.vel.x += lunge.x;
        owner.vel.y += lunge.y * 0.5;

        if (world && world.audio) world.audio.playMeleeSwing();

        // Check melee hit against entities in arc
        if (world && world.entities) {
            for (const target of world.entities) {
                if (target === owner || !target.alive) continue;
                if (target.team && target.team === owner.team) continue;

                const toTarget = target.pos.clone().sub(owner.pos);
                const dist = toTarget.mag();
                if (dist <= this.def.meleeRange + target.width * 0.5) {
                    const angleDiff = Math.abs(this.angleDiff(angle, toTarget.angle()));
                    if (angleDiff <= this.def.meleeArc * 0.5) {
                        target.takeDamage(this.def.damage, owner, 'MELEE', world);
                        // Melee knockback
                        const kb = Vec2.fromAngle(angle, 350);
                        target.vel.x += kb.x;
                        target.vel.y += kb.y * 0.5;
                    }
                }
            }
        }
    }

    startReload(world) {
        if (this.isReloading || this.ammo >= this.maxAmmo) return;
        this.isReloading = true;
        this.reloadTimer = this.def.reloadTime;
        if (world && world.audio) world.audio.playReloadStart();
    }

    angleDiff(a, b) {
        let diff = (a - b) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        return diff;
    }
}

class Projectile {
    constructor(cfg) {
        this.pos = cfg.pos.clone();
        this.vel = Vec2.fromAngle(cfg.angle, cfg.speed);
        this.angle = cfg.angle;
        this.damage = cfg.damage;
        this.maxDistance = cfg.range || 1000;
        this.travelled = 0;
        this.ownerId = cfg.ownerId;
        this.ownerTeam = cfg.ownerTeam;
        this.color = cfg.color || '#00e5ff';
        this.length = cfg.length || 12;
        this.width = cfg.width || 3;
        this.bounces = cfg.bounces || 0;
        this.pierce = cfg.pierce || 1;
        this.isExplosive = cfg.isExplosive || false;
        this.splashRadius = cfg.splashRadius || 80;
        this.gravity = cfg.gravity || 0;
        this.fuseTimer = cfg.fuseTime || 0;
        this.stuck = false;
        this.dead = false;
        this.hitEntities = new Set();
    }

    update(dt, world) {
        if (this.dead) return;

        if (this.isExplosive && this.fuseTimer > 0) {
            this.fuseTimer -= dt;
            if (this.fuseTimer <= 0) {
                this.explode(world);
                return;
            }
        }

        if (this.stuck) {
            // Check proximity detonation if mine
            if (this.isExplosive && world && world.entities) {
                for (const target of world.entities) {
                    if (target.id === this.ownerId || !target.alive) continue;
                    if (target.team && target.team === this.ownerTeam) continue;
                    if (target.pos.dist(this.pos) < 45) {
                        this.explode(world);
                        return;
                    }
                }
            }
            return;
        }

        if (this.gravity > 0) {
            this.vel.y += this.gravity * dt;
            this.angle = this.vel.angle();
        }

        const moveDist = this.vel.mag() * dt;
        this.travelled += moveDist;
        if (this.travelled >= this.maxDistance) {
            if (this.isExplosive) {
                this.explode(world);
            } else {
                this.dead = true;
            }
            return;
        }

        const prevPos = this.pos.clone();
        this.pos.addScaled(this.vel, dt);

        // Check map solid collision
        if (world && world.physics && world.map) {
            const ray = world.physics.raycast(prevPos, this.vel, moveDist, world.map);
            if (ray.hit) {
                if (this.bounces > 0) {
                    this.bounces--;
                    this.pos = ray.point;
                    // Reflect velocity
                    const dot = this.vel.dot(ray.normal);
                    this.vel.sub(ray.normal.clone().mul(2 * dot));
                    this.angle = this.vel.angle();
                    if (world.spawnSpark) world.spawnSpark(ray.point, ray.normal, this.color);
                } else if (this.isExplosive) {
                    this.stuck = true;
                    this.pos = ray.point;
                    this.vel.set(0, 0);
                    if (world.spawnSpark) world.spawnSpark(ray.point, ray.normal, '#ff3300');
                } else {
                    this.dead = true;
                    this.pos = ray.point;
                    if (world.spawnSpark) world.spawnSpark(ray.point, ray.normal, this.color);
                    return;
                }
            }
        }

        // Check entity collision
        if (world && world.entities) {
            for (const target of world.entities) {
                if (target.id === this.ownerId || !target.alive) continue;
                if (target.team && target.team === this.ownerTeam) continue;
                if (this.hitEntities.has(target.id)) continue;

                const halfW = target.width * 0.5;
                const halfH = target.height * 0.5;
                if (this.pos.x >= target.pos.x - halfW && this.pos.x <= target.pos.x + halfW &&
                    this.pos.y >= target.pos.y - halfH && this.pos.y <= target.pos.y + halfH) {

                    // Check if target is deflecting (Plasma Edge melee deflection)
                    if (target.isDeflecting && !this.isExplosive) {
                        this.ownerId = target.id;
                        this.ownerTeam = target.team;
                        this.vel.mul(-1.2);
                        this.angle = this.vel.angle();
                        this.color = '#00ffff';
                        if (world.spawnSpark) world.spawnSpark(this.pos, new Vec2(0, -1), '#00ffff');
                        if (world.audio) world.audio.playDeflect();
                        continue;
                    }

                    this.hitEntities.add(target.id);

                    if (this.isExplosive) {
                        this.explode(world);
                        return;
                    }

                    target.takeDamage(this.damage, world.getEntityById(this.ownerId), 'PROJECTILE', world);

                    // Knockback
                    target.vel.addScaled(this.vel.clone().normalize(), this.damage * 4.5);

                    if (world.spawnBloodOrSparks) world.spawnBloodOrSparks(this.pos, this.vel.clone().normalize());

                    this.pierce--;
                    if (this.pierce <= 0) {
                        this.dead = true;
                        return;
                    }
                }
            }
        }
    }

    explode(world) {
        if (this.dead) return;
        this.dead = true;

        if (world) {
            if (world.spawnExplosion) world.spawnExplosion(this.pos, this.splashRadius);
            if (world.audio) world.audio.playExplosion();

            if (world.entities) {
                for (const target of world.entities) {
                    if (!target.alive) continue;
                    const dist = this.pos.dist(target.pos);
                    if (dist < this.splashRadius) {
                        const falloff = 1.0 - (dist / this.splashRadius);
                        const dmg = Math.floor(this.damage * falloff);
                        if (dmg > 5) {
                            target.takeDamage(dmg, world.getEntityById(this.ownerId), 'EXPLOSION', world);
                            // Radial knockback
                            const dir = target.pos.clone().sub(this.pos).normalize();
                            target.vel.addScaled(dir, dmg * 8);
                        }
                    }
                }
            }
        }
    }
}

class GrenadeThrowable {
    constructor(pos, throwVel, ownerId, ownerTeam) {
        this.pos = pos.clone();
        this.vel = throwVel.clone();
        this.ownerId = ownerId;
        this.ownerTeam = ownerTeam;
        this.radius = 6;
        this.fuse = 2.4; // 2.4s fuse
        this.damage = 90;
        this.blastRadius = 130;
        this.dead = false;
        this.gravity = 980;
        this.restitution = 0.55;
    }

    update(dt, world) {
        if (this.dead) return;
        this.fuse -= dt;
        if (this.fuse <= 0) {
            this.explode(world);
            return;
        }

        this.vel.y += this.gravity * dt;
        const prev = this.pos.clone();
        this.pos.addScaled(this.vel, dt);

        if (world && world.physics && world.map) {
            const moveVec = this.pos.clone().sub(prev);
            const ray = world.physics.raycast(prev, moveVec, moveVec.mag(), world.map);
            if (ray.hit) {
                this.pos = ray.point;
                const dot = this.vel.dot(ray.normal);
                this.vel.sub(ray.normal.clone().mul(2 * dot));
                this.vel.mul(this.restitution);
                if (this.vel.mag() > 60 && world.audio) {
                    world.audio.playGrenadeBounce();
                }
            }
        }
    }

    explode(world) {
        if (this.dead) return;
        this.dead = true;
        if (world) {
            if (world.spawnExplosion) world.spawnExplosion(this.pos, this.blastRadius);
            if (world.audio) world.audio.playExplosion();

            if (world.entities) {
                for (const target of world.entities) {
                    if (!target.alive) continue;
                    const dist = this.pos.dist(target.pos);
                    if (dist < this.blastRadius) {
                        const falloff = 1.0 - (dist / this.blastRadius);
                        const dmg = Math.floor(this.damage * falloff);
                        if (dmg > 10) {
                            target.takeDamage(dmg, world.getEntityById(this.ownerId), 'GRENADE', world);
                            const dir = target.pos.clone().sub(this.pos).normalize();
                            target.vel.addScaled(dir, dmg * 9);
                        }
                    }
                }
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WEAPON_TYPES, WEAPON_DEFS, WeaponInstance, Projectile, GrenadeThrowable };
}
