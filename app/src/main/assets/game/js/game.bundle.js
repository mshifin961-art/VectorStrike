/* Vector Strike browser bundle - preserves original script order. */

/* ===== vector2d.js ===== */
/**
 * Vector Strike - 2D Vector Math Library
 * High-performance, allocation-friendly 2D vector utility.
 */
class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }

    copy(v) {
        this.x = v.x;
        this.y = v.y;
        return this;
    }

    clone() {
        return new Vec2(this.x, this.y);
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    addScaled(v, s) {
        this.x += v.x * s;
        this.y += v.y * s;
        return this;
    }

    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }

    mul(s) {
        this.x *= s;
        this.y *= s;
        return this;
    }

    div(s) {
        if (s !== 0) {
            this.x /= s;
            this.y /= s;
        }
        return this;
    }

    dot(v) {
        return this.x * v.x + this.y * v.y;
    }

    cross(v) {
        return this.x * v.y - this.y * v.x;
    }

    magSq() {
        return this.x * this.x + this.y * this.y;
    }

    mag() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const m = this.mag();
        if (m > 0.00001) {
            this.x /= m;
            this.y /= m;
        } else {
            this.x = 0;
            this.y = 0;
        }
        return this;
    }

    distSq(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return dx * dx + dy * dy;
    }

    dist(v) {
        return Math.sqrt(this.distSq(v));
    }

    angle() {
        return Math.atan2(this.y, this.x);
    }

    lerp(v, t) {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        return this;
    }

    clamp(minVal, maxVal) {
        this.x = Math.max(minVal, Math.min(maxVal, this.x));
        this.y = Math.max(minVal, Math.min(maxVal, this.y));
        return this;
    }

    static fromAngle(rad, length = 1) {
        return new Vec2(Math.cos(rad) * length, Math.sin(rad) * length);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Vec2;
}


/* ===== physics.js ===== */
/**
 * Vector Strike - High Precision 2D Physics Engine
 * Frame-rate independent sub-stepping, AABB swept resolution,
 * one-way platforms, slopes, and dynamic surfaces.
 */

if (typeof Vec2 === 'undefined' && typeof require !== 'undefined') {
    var Vec2 = require('./vector2d.js');
}

class PhysicsEngine {
    constructor() {
        this.gravity = 1400; // pixels per second squared
        this.fixedDelta = 1 / 60; // 60Hz fixed physics step
        this.accumulator = 0;
        this.maxSubSteps = 5;
    }

    /**
     * Advances the physics simulation by real delta time using fixed sub-steps.
     */
    update(dt, entities, map) {
        if (dt > 0.1) dt = 0.1; // Clamp to avoid spiral of death
        this.accumulator += dt;

        while (this.accumulator >= this.fixedDelta) {
            this.step(this.fixedDelta, entities, map);
            this.accumulator -= this.fixedDelta;
        }
    }

    /**
     * Executes a single fixed physics step.
     */
    step(dt, entities, map) {
        // 1. Update moving platforms
        if (map && map.movingPlatforms) {
            for (const plat of map.movingPlatforms) {
                plat.update(dt);
            }
        }

        // 2. Update all active physical entities
        for (let i = 0; i < entities.length; i++) {
            const e = entities[i];
            if (!e.active || e.isStatic) continue;

            this.updateEntity(e, dt, map);
        }
    }

    updateEntity(e, dt, map) {
        // Handle dash state
        if (e.dashTime > 0) {
            e.dashTime -= dt;
            // High speed movement during dash
            e.pos.x += e.vel.x * dt;
            e.pos.y += e.vel.y * dt;
            this.resolveMapCollisions(e, map);
            return;
        }

        // Gravity application
        if (!e.grounded) {
            let currentGrav = this.gravity * (e.gravityScale || 1.0);
            if (e.isWallSliding) {
                // Slower fall during wall slide
                currentGrav *= 0.3;
                if (e.vel.y > 150) e.vel.y = 150;
            } else if (e.isGravAnchored) {
                currentGrav *= 3.0;
            }
            e.vel.y += currentGrav * dt;
        }

        // Horizontal damping / acceleration
        if (e.grounded) {
            const friction = e.friction || 12.0;
            e.vel.x = this.approach(e.vel.x, e.targetVelX || 0, friction * 100 * dt);
        } else {
            const airControl = (e.friction || 12.0) * 0.6;
            e.vel.x = this.approach(e.vel.x, e.targetVelX || 0, airControl * 100 * dt);
        }

        // Cap maximum velocity
        const maxSpeedY = e.isGravAnchored ? 2500 : 1200;
        e.vel.y = Math.max(-1800, Math.min(maxSpeedY, e.vel.y));

        // Sub-step movement inside the entity step for perfect collision resolution
        const subSteps = 2;
        const subDt = dt / subSteps;

        for (let s = 0; s < subSteps; s++) {
            // Move X
            e.pos.x += e.vel.x * subDt;
            this.resolveHorizontalCollisions(e, map);

            // Move Y
            e.pos.y += e.vel.y * subDt;
            this.resolveVerticalCollisions(e, map);
        }

        // Check if still grounded
        this.checkGrounded(e, map);
    }

    approach(current, target, maxDelta) {
        if (current < target) {
            return Math.min(current + maxDelta, target);
        } else {
            return Math.max(current - maxDelta, target);
        }
    }

    resolveHorizontalCollisions(e, map) {
        if (!map) return;
        const halfW = e.width * 0.5;
        const halfH = e.height * 0.5;
        e.isTouchingWall = false;
        e.wallSide = 0;

        for (const wall of map.solids) {
            if (this.intersects(e.pos.x - halfW, e.pos.y - halfH, e.width, e.height,
                                wall.x, wall.y, wall.w, wall.h)) {
                if (e.vel.x > 0) { // Moving right
                    e.pos.x = wall.x - halfW;
                    e.vel.x = 0;
                    e.isTouchingWall = true;
                    e.wallSide = 1;
                } else if (e.vel.x < 0) { // Moving left
                    e.pos.x = wall.x + wall.w + halfW;
                    e.vel.x = 0;
                    e.isTouchingWall = true;
                    e.wallSide = -1;
                }
            } else {
                // Check 1px contact buffer when flush against wall
                const probeH = e.height - 4;
                if (e.pos.y - halfH + 2 < wall.y + wall.h && e.pos.y + halfH - 2 > wall.y) {
                    if (Math.abs((e.pos.x + halfW) - wall.x) <= 1.5) {
                        e.isTouchingWall = true;
                        e.wallSide = 1;
                    } else if (Math.abs((e.pos.x - halfW) - (wall.x + wall.w)) <= 1.5) {
                        e.isTouchingWall = true;
                        e.wallSide = -1;
                    }
                }
            }
        }
    }

    resolveVerticalCollisions(e, map) {
        if (!map) return;
        const halfW = e.width * 0.5;
        const halfH = e.height * 0.5;

        // Solid walls & ceilings
        for (const wall of map.solids) {
            if (this.intersects(e.pos.x - halfW, e.pos.y - halfH, e.width, e.height,
                                wall.x, wall.y, wall.w, wall.h)) {
                if (e.vel.y > 0) { // Landing on solid floor
                    e.pos.y = wall.y - halfH;
                    e.vel.y = 0;
                    e.grounded = true;
                    if (e.isGravAnchored) {
                        e.isGravAnchored = false;
                        if (e.onSlamImpact) e.onSlamImpact();
                    }
                } else if (e.vel.y < 0) { // Hitting ceiling
                    e.pos.y = wall.y + wall.h + halfH;
                    e.vel.y = 0;
                }
            }
        }

        // One-way platforms (only land when moving downward from above)
        if (e.vel.y >= 0 && !e.droppingThroughPlatform && map.oneWayPlatforms) {
            for (const plat of map.oneWayPlatforms) {
                const feetY = e.pos.y + halfH;
                const prevFeetY = feetY - (e.vel.y * (1 / 60));
                if (feetY >= plat.y && prevFeetY <= plat.y + 8 &&
                    e.pos.x + halfW > plat.x && e.pos.x - halfW < plat.x + plat.w) {
                    e.pos.y = plat.y - halfH;
                    e.vel.y = 0;
                    e.grounded = true;
                    if (e.isGravAnchored) {
                        e.isGravAnchored = false;
                        if (e.onSlamImpact) e.onSlamImpact();
                    }
                }
            }
        }

        // Moving platforms
        if (e.vel.y >= 0 && map.movingPlatforms) {
            for (const mp of map.movingPlatforms) {
                const feetY = e.pos.y + halfH;
                if (feetY >= mp.y && feetY <= mp.y + 12 &&
                    e.pos.x + halfW > mp.x && e.pos.x - halfW < mp.x + mp.w) {
                    e.pos.y = mp.y - halfH;
                    e.vel.y = 0;
                    e.grounded = true;
                    // Carry platform velocity
                    e.pos.x += mp.dx;
                    e.pos.y += mp.dy;
                }
            }
        }

        // Jump pads / Kinetic Launchers
        if (map.jumpPads) {
            for (const pad of map.jumpPads) {
                if (this.intersects(e.pos.x - halfW, e.pos.y - halfH, e.width, e.height,
                                    pad.x, pad.y, pad.w, pad.h)) {
                    e.vel.y = -pad.forceY || -1100;
                    if (pad.forceX) e.vel.x = pad.forceX;
                    e.grounded = false;
                    if (e.onJumpPadLaunch) e.onJumpPadLaunch(pad);
                }
            }
        }
    }

    checkGrounded(e, map) {
        if (!map) return;
        const halfW = e.width * 0.45;
        const halfH = e.height * 0.5;
        const probeY = e.pos.y + halfH + 3;

        let onGround = false;

        // Check solids
        for (const wall of map.solids) {
            if (probeY >= wall.y && e.pos.y + halfH <= wall.y + 6 &&
                e.pos.x + halfW > wall.x && e.pos.x - halfW < wall.x + wall.w) {
                onGround = true;
                break;
            }
        }

        // Check one way
        if (!onGround && !e.droppingThroughPlatform && map.oneWayPlatforms) {
            for (const plat of map.oneWayPlatforms) {
                if (probeY >= plat.y && e.pos.y + halfH <= plat.y + 6 &&
                    e.pos.x + halfW > plat.x && e.pos.x - halfW < plat.x + plat.w) {
                    onGround = true;
                    break;
                }
            }
        }

        e.grounded = onGround;
    }

    resolveMapCollisions(e, map) {
        this.resolveHorizontalCollisions(e, map);
        this.resolveVerticalCollisions(e, map);
        this.checkGrounded(e, map);
    }

    intersects(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x1 < x2 + w2 &&
               x1 + w1 > x2 &&
               y1 < y2 + h2 &&
               y1 + h1 > y2;
    }

    /**
     * High performance 2D Raycast against map solid geometry.
     * Returns { hit: boolean, point: Vec2, normal: Vec2, distance: number }
     */
    raycast(origin, dir, maxDist, map) {
        const normDir = dir.clone().normalize();
        let closestHit = {
            hit: false,
            point: origin.clone().addScaled(normDir, maxDist),
            normal: new Vec2(0, 0),
            distance: maxDist
        };

        if (!map || !map.solids) return closestHit;

        for (const solid of map.solids) {
            const hit = this.rayAABB(origin, normDir, maxDist, solid);
            if (hit && hit.distance < closestHit.distance) {
                closestHit = hit;
            }
        }

        return closestHit;
    }

    rayAABB(origin, dir, maxDist, box) {
        const invDirX = dir.x !== 0 ? 1 / dir.x : 1e9;
        const invDirY = dir.y !== 0 ? 1 / dir.y : 1e9;

        const t1 = (box.x - origin.x) * invDirX;
        const t2 = (box.x + box.w - origin.x) * invDirX;
        const t3 = (box.y - origin.y) * invDirY;
        const t4 = (box.y + box.h - origin.y) * invDirY;

        const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
        const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));

        if (tmax < 0 || tmin > tmax || tmin > maxDist || tmin < 0) {
            return null;
        }

        const hitPoint = origin.clone().addScaled(dir, tmin);
        let normal = new Vec2(0, 0);

        // Determine hit surface normal
        const epsilon = 0.5;
        if (Math.abs(hitPoint.x - box.x) < epsilon) normal.x = -1;
        else if (Math.abs(hitPoint.x - (box.x + box.w)) < epsilon) normal.x = 1;
        else if (Math.abs(hitPoint.y - box.y) < epsilon) normal.y = -1;
        else if (Math.abs(hitPoint.y - (box.y + box.h)) < epsilon) normal.y = 1;

        return {
            hit: true,
            point: hitPoint,
            normal: normal,
            distance: tmin
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PhysicsEngine;
}


/* ===== weapons.js ===== */
/**
 * Vector Strike - Extensible Weapon & Projectile System
 * 6 balanced, distinct original weapon archetypes + throwables.
 */

if (typeof Vec2 === 'undefined' && typeof require !== 'undefined') {
    var Vec2 = require('./vector2d.js');
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
        damage: 22,
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
        damage: 16,
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
        damage: 9, // per pellet (x7 = 63 max)
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
        damage: 85,
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
        damage: 75,
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
        damage: 48,
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
        this.reserveAmmo = this.def.magSize * 4;
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
                this.reserveAmmo -= take;
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
        if (this.isReloading || this.ammo >= this.maxAmmo || this.reserveAmmo <= 0) return;
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


/* ===== characters.js ===== */
/**
 * Vector Strike - Original Playable Character Operatives
 * Distinct stats, kinetic abilities, procedural cybernetic rendering,
 * shield/health dynamics, and animation states.
 */

if (typeof Vec2 === 'undefined' && typeof require !== 'undefined') {
    var Vec2 = require('./vector2d.js');
}
if (typeof WEAPON_TYPES === 'undefined' && typeof require !== 'undefined') {
    var { WEAPON_TYPES, WeaponInstance, GrenadeThrowable } = require('./weapons.js');
}

const CHARACTER_CLASSES = {
    VANGUARD: {
        id: 'VANGUARD',
        name: 'Vanguard',
        role: 'Assault Specialist',
        maxHealth: 100,
        maxShield: 50,
        speed: 280,
        jumpForce: 570,
        dashSpeed: 620,
        dashDuration: 0.22,
        dashCooldown: 5.0,
        abilityName: 'Kinetic Surge',
        abilityDesc: 'High-velocity forward thrust that blasts an air shockwave.',
        primaryColor: '#00e5ff',
        secondaryColor: '#1a2639',
        visorColor: '#00ffff'
    },
    SPECTER: {
        id: 'SPECTER',
        name: 'Specter',
        role: 'Infiltration Scout',
        maxHealth: 85,
        maxShield: 40,
        speed: 320,
        jumpForce: 590,
        dashSpeed: 680,
        dashDuration: 0.20,
        dashCooldown: 6.0,
        abilityName: 'Phase Cloak',
        abilityDesc: 'Activates active camo and +35% move speed for 3.5s.',
        primaryColor: '#38ef7d',
        secondaryColor: '#0f2027',
        visorColor: '#00ff88'
    },
    JUGGERNAUT: {
        id: 'JUGGERNAUT',
        name: 'Juggernaut',
        role: 'Heavy Siege Unit',
        maxHealth: 130,
        maxShield: 70,
        speed: 240,
        jumpForce: 530,
        dashSpeed: 520,
        dashDuration: 0.24,
        dashCooldown: 7.0,
        abilityName: 'Kinetic Dome',
        abilityDesc: 'Deploys a stationary 120 HP localized barrier dome.',
        primaryColor: '#ff9900',
        secondaryColor: '#2b1b00',
        visorColor: '#ffaa00'
    },
    CYPHER: {
        id: 'CYPHER',
        name: 'Cypher',
        role: 'Tactical Disruptor',
        maxHealth: 100,
        maxShield: 50,
        speed: 290,
        jumpForce: 570,
        dashSpeed: 600,
        dashDuration: 0.22,
        dashCooldown: 6.5,
        abilityName: 'EMP Pulse',
        abilityDesc: 'Releases a 200px shockwave draining shields and disabling abilities.',
        primaryColor: '#e040fb',
        secondaryColor: '#21092e',
        visorColor: '#ea80fc'
    }
};

class CharacterEntity {
    constructor(id, name, classId = 'VANGUARD', isBot = false, team = 'ALPHA') {
        this.id = id;
        this.name = name;
        this.classDef = CHARACTER_CLASSES[classId] || CHARACTER_CLASSES.VANGUARD;
        this.classId = classId;
        this.isBot = isBot;
        this.team = team; // 'ALPHA' (Cyan) or 'BRAVO' (Crimson) or 'SOLO'

        // Physical properties
        this.pos = new Vec2(0, 0);
        this.vel = new Vec2(0, 0);
        this.width = 24;
        this.height = 46;
        this.grounded = false;
        this.active = true;
        this.alive = true;
        this.facing = 1; // 1 = right, -1 = left
        this.aimAngle = 0;

        // Stats & Health
        this.maxHealth = this.classDef.maxHealth;
        this.health = this.maxHealth;
        this.maxShield = this.classDef.maxShield;
        this.shield = this.maxShield;
        this.shieldRegenDelay = 4.0;
        this.shieldTimer = 0;
        this.invincibleTimer = 0;

        // Movement mechanics
        this.dashTime = 0;
        this.dashCooldownTimer = 0;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.isWallSliding = false;
        this.isTouchingWall = false;
        this.wallSide = 0;
        this.isGravAnchored = false;
        this.droppingThroughPlatform = false;
        this.dropTimer = 0;

        // Abilities
        this.abilityCooldownTimer = 0;
        this.isCloaked = false;
        this.cloakTimer = 0;
        this.deployedBarrier = null;
        this.empSilenceTimer = 0;

        // Weapons
        this.weapons = [
            new WeaponInstance(WEAPON_TYPES.RAIL_PISTOL),
            new WeaponInstance(WEAPON_TYPES.ARC_CARBINE)
        ];
        this.currentWeaponIndex = 0;
        this.grenades = 2;
        this.maxGrenades = 3;

        // Melee & Deflection
        this.isDeflecting = false;
        this.deflectTime = 0;
        this.meleeSwingTime = 0;
        this.meleeAimAngle = 0;

        // Animation counters
        this.animTimer = 0;
        this.damageFlashTimer = 0;
        this.respawnTimer = 0;

        // Match metrics
        this.kills = 0;
        this.deaths = 0;
        this.damageDealt = 0;
        this.killstreak = 0;
    }

    get currentWeapon() {
        return this.weapons[this.currentWeaponIndex];
    }

    update(dt, world) {
        if (!this.alive) {
            if (this.respawnTimer > 0) {
                this.respawnTimer -= dt;
                if (this.respawnTimer <= 0) {
                    this.respawn(world);
                }
            }
            return;
        }

        this.animTimer += dt;

        // Invincibility after respawn
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= dt;
        }

        // Damage flash
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer -= dt;
        }

        // Shield regeneration logic
        if (this.shieldTimer > 0) {
            this.shieldTimer -= dt;
        } else if (this.shield < this.maxShield) {
            this.shield = Math.min(this.maxShield, this.shield + 28 * dt);
        }

        // Ability & Dash cooldowns
        if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;
        if (this.abilityCooldownTimer > 0) this.abilityCooldownTimer -= dt;
        if (this.empSilenceTimer > 0) this.empSilenceTimer -= dt;

        // Cloak timer
        if (this.isCloaked) {
            this.cloakTimer -= dt;
            if (this.cloakTimer <= 0) {
                this.isCloaked = false;
            }
        }

        // Deflect window
        if (this.isDeflecting) {
            this.deflectTime -= dt;
            if (this.deflectTime <= 0) {
                this.isDeflecting = false;
            }
        }
        if (this.meleeSwingTime > 0) {
            this.meleeSwingTime -= dt;
        }

        // Drop through timer
        if (this.dropTimer > 0) {
            this.dropTimer -= dt;
            if (this.dropTimer <= 0) {
                this.droppingThroughPlatform = false;
            }
        }

        // Coyote time & Jump buffer
        if (this.grounded) {
            this.coyoteTimer = 0.12;
            this.isGravAnchored = false;
        } else if (this.coyoteTimer > 0) {
            this.coyoteTimer -= dt;
        }

        if (this.jumpBufferTimer > 0) {
            this.jumpBufferTimer -= dt;
            if (this.grounded || this.coyoteTimer > 0) {
                this.executeJump(world);
            }
        }

        // Wall sliding detection
        this.isWallSliding = (!this.grounded && this.isTouchingWall && this.vel.y > 0);

        // Update active weapon
        if (this.currentWeapon) {
            this.currentWeapon.update(dt, this, world);
        }

        // Facing direction based on aim
        this.facing = (Math.cos(this.aimAngle) >= 0) ? 1 : -1;
    }

    applyMovementInput(dirX, jumpPressed, downPressed, world) {
        if (!this.alive) return;

        // Drop through one-way platform
        if (downPressed && jumpPressed && this.grounded) {
            this.droppingThroughPlatform = true;
            this.dropTimer = 0.25;
            this.grounded = false;
            this.vel.y = 80;
            return;
        }

        const moveSpeed = this.isCloaked ? this.classDef.speed * 1.35 : this.classDef.speed;
        this.targetVelX = dirX * moveSpeed;

        // Jump handling
        if (jumpPressed) {
            this.requestJump(world);
        }
    }

    requestJump(world) {
        if (this.grounded || this.coyoteTimer > 0) {
            this.executeJump(world);
        } else if (this.isWallSliding) {
            // Wall-kick
            this.vel.y = -this.classDef.jumpForce * 0.95;
            this.vel.x = -this.wallSide * this.classDef.speed * 1.25;
            this.isWallSliding = false;
            if (world && world.audio) world.audio.playWallKick();
            if (world && world.spawnWallSparks) world.spawnWallSparks(this.pos, this.wallSide);
        } else {
            this.jumpBufferTimer = 0.12;
        }
    }

    executeJump(world) {
        this.vel.y = -this.classDef.jumpForce;
        this.grounded = false;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        if (world && world.audio) world.audio.playJump();
        if (world && world.spawnJumpPuff) world.spawnJumpPuff(this.pos);
    }

    triggerKineticDash(targetDir, world) {
        if (!this.alive || this.dashCooldownTimer > 0) return false;

        let dashVec = targetDir.clone().normalize();
        if (dashVec.magSq() < 0.01) {
            dashVec.set(this.facing, 0);
        }

        this.dashTime = this.classDef.dashDuration;
        this.dashCooldownTimer = this.classDef.dashCooldown;
        this.vel.copy(dashVec.mul(this.classDef.dashSpeed));

        if (world && world.audio) world.audio.playDash();
        if (world && world.spawnDashTrail) world.spawnDashTrail(this.pos, this.classDef.primaryColor);

        return true;
    }

    triggerGravAnchor(world) {
        if (!this.alive || this.grounded || this.isGravAnchored) return false;
        this.isGravAnchored = true;
        this.vel.y = 800; // Immediate downward pull
        if (world && world.audio) world.audio.playGravAnchor();
        return true;
    }

    onSlamImpact() {
        // Slam shockwave upon landing with Grav-Anchor
        if (this.world && this.world.spawnShockwave) {
            this.world.spawnShockwave(this.pos, 100);
        }
    }

    triggerAbility(world) {
        if (!this.alive || this.abilityCooldownTimer > 0 || this.empSilenceTimer > 0) return false;

        switch (this.classId) {
            case 'VANGUARD':
                // Kinetic Surge
                this.triggerKineticDash(Vec2.fromAngle(this.aimAngle), world);
                if (world && world.spawnShockwave) world.spawnShockwave(this.pos, 90);
                this.abilityCooldownTimer = this.classDef.dashCooldown;
                break;

            case 'SPECTER':
                // Phase Cloak
                this.isCloaked = true;
                this.cloakTimer = 3.5;
                this.abilityCooldownTimer = 8.0;
                if (world && world.audio) world.audio.playCloak();
                break;

            case 'JUGGERNAUT':
                // Kinetic Dome
                this.abilityCooldownTimer = 10.0;
                if (world && world.spawnBarrier) {
                    world.spawnBarrier(this.pos.clone(), this.id, this.team, 120, 6.0);
                }
                if (world && world.audio) world.audio.playShieldDeploy();
                break;

            case 'CYPHER':
                // EMP Pulse
                this.abilityCooldownTimer = 7.5;
                if (world && world.audio) world.audio.playEmpPulse();
                if (world && world.spawnEmpVisual) world.spawnEmpVisual(this.pos, 200);
                if (world && world.entities) {
                    for (const target of world.entities) {
                        if (target === this || !target.alive) continue;
                        if (target.team && target.team === this.team) continue;
                        if (this.pos.dist(target.pos) <= 200) {
                            target.shield = Math.max(0, target.shield - 35);
                            target.empSilenceTimer = 4.0;
                            target.shieldTimer = 4.0; // Reset regen timer
                        }
                    }
                }
                break;
        }

        return true;
    }

    throwGrenade(aimAngle, world) {
        if (!this.alive || this.grenades <= 0) return false;
        this.grenades--;

        const throwDir = Vec2.fromAngle(aimAngle);
        const throwVel = throwDir.mul(650);
        throwVel.x += this.vel.x * 0.4;
        throwVel.y += -120; // upward bias

        const spawnPos = this.pos.clone().add(Vec2.fromAngle(aimAngle, 24));
        const grenade = new GrenadeThrowable(spawnPos, throwVel, this.id, this.team);

        if (world && world.spawnGrenade) {
            world.spawnGrenade(grenade);
        }
        if (world && world.audio) {
            world.audio.playGrenadeThrow();
        }

        return true;
    }

    switchWeapon() {
        if (this.weapons.length < 2) return;
        this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
    }

    takeDamage(amount, attacker, type, world) {
        if (!this.alive || this.invincibleTimer > 0) return;

        this.damageFlashTimer = 0.15;
        this.shieldTimer = this.shieldRegenDelay;

        let remainingDamage = amount;
        if (this.shield > 0) {
            if (this.shield >= remainingDamage) {
                this.shield -= remainingDamage;
                remainingDamage = 0;
                if (world && world.audio) world.audio.playShieldHit();
            } else {
                remainingDamage -= this.shield;
                this.shield = 0;
                if (world && world.audio) world.audio.playShieldBreak();
            }
        }

        if (remainingDamage > 0) {
            this.health -= remainingDamage;
            if (world && world.audio) world.audio.playFleshHit();
        }

        if (attacker && attacker !== this) {
            attacker.damageDealt += amount;
        }

        // Check death
        if (this.health <= 0) {
            this.die(attacker, type, world);
        }
    }

    die(killer, type, world) {
        this.alive = false;
        this.health = 0;
        this.shield = 0;
        this.deaths++;
        this.killstreak = 0;
        this.respawnTimer = 3.0; // 3 second respawn cycle

        if (killer && killer !== this) {
            killer.kills++;
            killer.killstreak++;
        }

        if (world) {
            if (world.onEntityKilled) world.onEntityKilled(this, killer, type);
            if (world.spawnDeathBurst) world.spawnDeathBurst(this.pos, this.classDef.primaryColor);
            if (world.audio) world.audio.playPlayerDeath();
        }
    }

    respawn(world) {
        this.alive = true;
        this.health = this.maxHealth;
        this.shield = this.maxShield;
        this.invincibleTimer = 1.6;
        this.vel.set(0, 0);

        // Reset weapons
        for (const w of this.weapons) {
            w.ammo = w.maxAmmo;
            w.isReloading = false;
        }
        this.grenades = 2;

        if (world && world.getRespawnPoint) {
            this.pos.copy(world.getRespawnPoint(this.team));
        }

        if (world && world.spawnRespawnBurst) {
            world.spawnRespawnBurst(this.pos, this.classDef.primaryColor);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CHARACTER_CLASSES, CharacterEntity };
}


/* ===== maps.js ===== */
/**
 * Vector Strike - Original Tactical Map System
 * Geometric collision layers, dynamic moving platforms, hazard sectors,
 * interactive jump pads, pickup pedestals, and AI navigation graphs.
 */

if (typeof Vec2 === 'undefined' && typeof require !== 'undefined') {
    var Vec2 = require('./vector2d.js');
}
if (typeof WeaponInstance === 'undefined' && typeof require !== 'undefined') {
    var { WeaponInstance } = require('./weapons.js');
}

class MovingPlatform {
    constructor(x, y, w, h, startX, startY, endX, endY, speed = 80) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.startX = startX;
        this.startY = startY;
        this.endX = endX;
        this.endY = endY;
        this.speed = speed;
        this.t = 0;
        this.direction = 1;
        this.dx = 0;
        this.dy = 0;
    }

    update(dt) {
        const dist = Math.hypot(this.endX - this.startX, this.endY - this.startY);
        if (dist === 0) return;

        const step = (this.speed * dt) / dist;
        this.t += step * this.direction;

        if (this.t >= 1.0) {
            this.t = 1.0;
            this.direction = -1;
        } else if (this.t <= 0.0) {
            this.t = 0.0;
            this.direction = 1;
        }

        const prevX = this.x;
        const prevY = this.y;
        this.x = this.startX + (this.endX - this.startX) * this.t;
        this.y = this.startY + (this.endY - this.startY) * this.t;
        this.dx = this.x - prevX;
        this.dy = this.y - prevY;
    }
}

class PickupStation {
    constructor(x, y, type, subType, respawnTime = 12.0) {
        this.x = x;
        this.y = y;
        this.w = 28;
        this.h = 28;
        this.type = type; // 'WEAPON', 'SHIELD', 'HEALTH', 'GRENADE'
        this.subType = subType; // e.g. WEAPON_TYPES.ION_SNIPER
        this.respawnTime = respawnTime;
        this.timer = 0;
        this.available = true;
    }

    update(dt) {
        if (!this.available) {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.available = true;
            }
        }
    }

    collect(character, world) {
        if (!this.available) return false;

        let collected = false;
        if (this.type === 'WEAPON') {
            // Replace secondary weapon or current
            const WClass = (world && world.WeaponInstance) ? world.WeaponInstance : (typeof WeaponInstance !== 'undefined' ? WeaponInstance : null);
            if (WClass) character.weapons[1] = new WClass(this.subType);
            character.currentWeaponIndex = 1;
            collected = true;
        } else if (this.type === 'SHIELD') {
            if (character.shield < character.maxShield) {
                character.shield = Math.min(character.maxShield, character.shield + 40);
                collected = true;
            }
        } else if (this.type === 'HEALTH') {
            if (character.health < character.maxHealth) {
                character.health = Math.min(character.maxHealth, character.health + 45);
                collected = true;
            }
        } else if (this.type === 'GRENADE') {
            if (character.grenades < character.maxGrenades) {
                character.grenades = Math.min(character.maxGrenades, character.grenades + 1);
                collected = true;
            }
        }

        if (collected) {
            this.available = false;
            this.timer = this.respawnTime;
            if (world && world.audio) world.audio.playPickup();
            if (world && world.spawnPickupBurst) world.spawnPickupBurst(new Vec2(this.x + 14, this.y + 14), '#00e5ff');
        }
        return collected;
    }
}

const MAP_DEFINITIONS = {
    MAP_NEON_FOUNDRY: {
        id: 'MAP_NEON_FOUNDRY',
        name: 'Sector 7: Neon Foundry',
        theme: 'Industrial Smelting Foundry',
        ambientColor: '#0a0d18',
        width: 2400,
        height: 1400,
        solids: [
            // Outer boundaries
            { x: 0, y: 0, w: 2400, h: 40 }, // ceiling
            { x: 0, y: 1340, w: 2400, h: 60 }, // floor
            { x: 0, y: 0, w: 40, h: 1400 }, // left wall
            { x: 2360, y: 0, w: 40, h: 1400 }, // right wall

            // Main central structure
            { x: 850, y: 920, w: 700, h: 40 }, // mid center bridge
            { x: 1050, y: 640, w: 300, h: 36 }, // high sniper platform
            { x: 1150, y: 676, w: 100, h: 244 }, // central column support

            // Left flank towers
            { x: 240, y: 1080, w: 360, h: 36 },
            { x: 180, y: 780, w: 380, h: 36 },
            { x: 380, y: 520, w: 260, h: 32 },

            // Right flank towers
            { x: 1800, y: 1080, w: 360, h: 36 },
            { x: 1840, y: 780, w: 380, h: 36 },
            { x: 1760, y: 520, w: 260, h: 32 },

            // Lower underground blocks & cover blocks
            { x: 680, y: 1200, w: 140, h: 140 },
            { x: 1580, y: 1200, w: 140, h: 140 }
        ],
        oneWayPlatforms: [
            // Drop-through platforms
            { x: 740, y: 760, w: 200, h: 12 },
            { x: 1460, y: 760, w: 200, h: 12 },
            { x: 920, y: 460, w: 220, h: 12 },
            { x: 1260, y: 460, w: 220, h: 12 },
            { x: 420, y: 940, w: 180, h: 12 },
            { x: 1800, y: 940, w: 180, h: 12 }
        ],
        jumpPads: [
            // Kinetic launchers launching players to upper catwalks
            { x: 120, y: 1320, w: 70, h: 20, forceY: 1200, forceX: 180 },
            { x: 2210, y: 1320, w: 70, h: 20, forceY: 1200, forceX: -180 },
            { x: 800, y: 900, w: 60, h: 20, forceY: 1000, forceX: 0 },
            { x: 1540, y: 900, w: 60, h: 20, forceY: 1000, forceX: 0 }
        ],
        hazards: [
            // Molten slag pit in center floor
            { x: 1020, y: 1320, w: 360, h: 25, dps: 35, name: 'Molten Core' }
        ],
        movingPlatforms: [
            new MovingPlatform(1050, 360, 180, 24, 880, 360, 1340, 360, 90)
        ],
        pickups: [
            new PickupStation(1185, 600, 'WEAPON', 'ION_SNIPER', 16.0),
            new PickupStation(450, 480, 'WEAPON', 'SCATTER_PULSE', 12.0),
            new PickupStation(1900, 480, 'WEAPON', 'MAG_LAUNCHER', 14.0),
            new PickupStation(1185, 880, 'WEAPON', 'ARC_CARBINE', 10.0),
            new PickupStation(360, 1040, 'HEALTH', null, 15.0),
            new PickupStation(2000, 1040, 'HEALTH', null, 15.0),
            new PickupStation(1185, 320, 'SHIELD', null, 12.0),
            new PickupStation(500, 740, 'GRENADE', null, 10.0),
            new PickupStation(1860, 740, 'GRENADE', null, 10.0)
        ],
        spawnPoints: [
            { x: 220, y: 720, team: 'ALPHA' },
            { x: 300, y: 1020, team: 'ALPHA' },
            { x: 420, y: 460, team: 'ALPHA' },
            { x: 2180, y: 720, team: 'BRAVO' },
            { x: 2050, y: 1020, team: 'BRAVO' },
            { x: 1950, y: 460, team: 'BRAVO' }
        ],
        // Waypoints for AI navigation graph
        waypoints: [
            { id: 0, x: 220, y: 750, neighbors: [1, 2, 7] },
            { id: 1, x: 400, y: 750, neighbors: [0, 2, 3] },
            { id: 2, x: 300, y: 1040, neighbors: [0, 1, 8] },
            { id: 3, x: 500, y: 500, neighbors: [1, 4] },
            { id: 4, x: 800, y: 740, neighbors: [3, 5, 9] },
            { id: 5, x: 1200, y: 620, neighbors: [4, 6] },
            { id: 6, x: 1600, y: 740, neighbors: [5, 11, 12] },
            { id: 7, x: 150, y: 1300, neighbors: [0, 2] },
            { id: 8, x: 740, y: 1180, neighbors: [2, 9] },
            { id: 9, x: 1200, y: 900, neighbors: [4, 6, 8, 10] },
            { id: 10, x: 1640, y: 1180, neighbors: [9, 13] },
            { id: 11, x: 1900, y: 500, neighbors: [6, 12] },
            { id: 12, x: 2000, y: 750, neighbors: [6, 11, 13] },
            { id: 13, x: 2050, y: 1040, neighbors: [10, 12, 14] },
            { id: 14, x: 2250, y: 1300, neighbors: [12, 13] }
        ]
    },

    MAP_HYDRO_CORE: {
        id: 'MAP_HYDRO_CORE',
        name: 'Sub-Terra 09: Hydro-Core',
        theme: 'Subterranean Coolant Complex',
        ambientColor: '#05111a',
        width: 2600,
        height: 1500,
        solids: [
            // Boundaries
            { x: 0, y: 0, w: 2600, h: 40 },
            { x: 0, y: 1440, w: 2600, h: 60 },
            { x: 0, y: 0, w: 40, h: 1500 },
            { x: 2560, y: 0, w: 40, h: 1500 },

            // Lower level raised platforms
            { x: 300, y: 1220, w: 500, h: 36 },
            { x: 1800, y: 1220, w: 500, h: 36 },
            { x: 1100, y: 1120, w: 400, h: 40 },

            // Mid tier bridges
            { x: 600, y: 920, w: 440, h: 36 },
            { x: 1560, y: 920, w: 440, h: 36 },
            { x: 1150, y: 720, w: 300, h: 36 },

            // High perches
            { x: 200, y: 620, w: 350, h: 36 },
            { x: 2050, y: 620, w: 350, h: 36 },
            { x: 800, y: 460, w: 1000, h: 36 }
        ],
        oneWayPlatforms: [
            { x: 650, y: 720, w: 200, h: 12 },
            { x: 1750, y: 720, w: 200, h: 12 },
            { x: 1100, y: 560, w: 400, h: 12 },
            { x: 380, y: 1060, w: 240, h: 12 },
            { x: 1980, y: 1060, w: 240, h: 12 }
        ],
        jumpPads: [
            { x: 100, y: 1420, w: 70, h: 20, forceY: 1300, forceX: 160 },
            { x: 2430, y: 1420, w: 70, h: 20, forceY: 1300, forceX: -160 },
            { x: 1260, y: 1100, w: 80, h: 20, forceY: 1150, forceX: 0 }
        ],
        hazards: [
            // High voltage conduit pit
            { x: 950, y: 1420, w: 700, h: 25, dps: 30, name: 'Electric Coolant' }
        ],
        movingPlatforms: [
            new MovingPlatform(600, 1050, 160, 24, 450, 1050, 950, 1050, 85),
            new MovingPlatform(1840, 1050, 160, 24, 1650, 1050, 2150, 1050, 85)
        ],
        pickups: [
            new PickupStation(1285, 420, 'WEAPON', 'PLASMA_EDGE', 15.0),
            new PickupStation(1285, 680, 'WEAPON', 'ARC_CARBINE', 10.0),
            new PickupStation(300, 580, 'WEAPON', 'ION_SNIPER', 16.0),
            new PickupStation(2200, 580, 'WEAPON', 'SCATTER_PULSE', 14.0),
            new PickupStation(500, 1180, 'HEALTH', null, 12.0),
            new PickupStation(2050, 1180, 'HEALTH', null, 12.0),
            new PickupStation(1285, 1080, 'SHIELD', null, 14.0),
            new PickupStation(750, 880, 'GRENADE', null, 10.0),
            new PickupStation(1800, 880, 'GRENADE', null, 10.0)
        ],
        spawnPoints: [
            { x: 280, y: 560, team: 'ALPHA' },
            { x: 450, y: 1160, team: 'ALPHA' },
            { x: 700, y: 860, team: 'ALPHA' },
            { x: 2300, y: 560, team: 'BRAVO' },
            { x: 2150, y: 1160, team: 'BRAVO' },
            { x: 1900, y: 860, team: 'BRAVO' }
        ],
        waypoints: [
            { id: 0, x: 280, y: 590, neighbors: [1, 2] },
            { id: 1, x: 750, y: 440, neighbors: [0, 4] },
            { id: 2, x: 450, y: 1180, neighbors: [0, 3] },
            { id: 3, x: 800, y: 890, neighbors: [2, 4, 5] },
            { id: 4, x: 1300, y: 440, neighbors: [1, 6, 7] },
            { id: 5, x: 1300, y: 690, neighbors: [3, 4, 7, 8] },
            { id: 6, x: 1850, y: 440, neighbors: [4, 9] },
            { id: 7, x: 1300, y: 1090, neighbors: [5, 8] },
            { id: 8, x: 1800, y: 890, neighbors: [5, 7, 10] },
            { id: 9, x: 2300, y: 590, neighbors: [6, 10] },
            { id: 10, x: 2150, y: 1180, neighbors: [8, 9] }
        ]
    }
};

class GameMap {
    constructor(mapId = 'MAP_NEON_FOUNDRY') {
        const def = MAP_DEFINITIONS[mapId] || MAP_DEFINITIONS.MAP_NEON_FOUNDRY;
        this.id = def.id;
        this.name = def.name;
        this.theme = def.theme;
        this.width = def.width;
        this.height = def.height;
        this.ambientColor = def.ambientColor;
        this.solids = def.solids.map(s => ({ ...s }));
        this.oneWayPlatforms = def.oneWayPlatforms.map(p => ({ ...p }));
        this.jumpPads = def.jumpPads.map(j => ({ ...j }));
        this.hazards = def.hazards.map(h => ({ ...h }));
        this.movingPlatforms = def.movingPlatforms;
        this.pickups = def.pickups;
        this.spawnPoints = def.spawnPoints;
        this.waypoints = def.waypoints;
    }

    update(dt, world) {
        // Update pickups
        for (const p of this.pickups) {
            p.update(dt);
        }

        // Check hazards against all entities
        if (world && world.entities) {
            for (const entity of world.entities) {
                if (!entity.alive) continue;
                for (const h of this.hazards) {
                    if (entity.pos.x + entity.width * 0.5 > h.x &&
                        entity.pos.x - entity.width * 0.5 < h.x + h.w &&
                        entity.pos.y + entity.height * 0.5 > h.y &&
                        entity.pos.y - entity.height * 0.5 < h.y + h.h) {
                        entity.takeDamage(h.dps * dt, null, 'HAZARD', world);
                    }
                }
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MovingPlatform, PickupStation, MAP_DEFINITIONS, GameMap };
}


/* ===== bot_ai.js ===== */
/**
 * Vector Strike - Tactical AI Bot Brain
 * Waypoint graph navigation, predictive aiming, state-driven decision tree,
 * dynamic ability usage, and multi-tier difficulty profiles.
 */

if (typeof Vec2 === 'undefined' && typeof require !== 'undefined') {
    var Vec2 = require('./vector2d.js');
}

const BOT_DIFFICULTY = {
    RECRUIT: {
        reactionDelay: 0.38,
        aimError: 0.16,
        trackSpeed: 3.5,
        fireBurstMin: 0.4,
        fireBurstMax: 0.8,
        dashChance: 0.25,
        grenadeChance: 0.20,
        retreatHealthThreshold: 25
    },
    TACTICAL: {
        reactionDelay: 0.20,
        aimError: 0.06,
        trackSpeed: 7.0,
        fireBurstMin: 0.6,
        fireBurstMax: 1.2,
        dashChance: 0.65,
        grenadeChance: 0.50,
        retreatHealthThreshold: 45
    },
    ELITE: {
        reactionDelay: 0.08,
        aimError: 0.015,
        trackSpeed: 14.0,
        fireBurstMin: 0.8,
        fireBurstMax: 1.6,
        dashChance: 0.90,
        grenadeChance: 0.80,
        retreatHealthThreshold: 55,
        predictiveAim: true
    }
};

class BotController {
    constructor(character, difficulty = 'TACTICAL') {
        this.character = character;
        this.difficulty = BOT_DIFFICULTY[difficulty] || BOT_DIFFICULTY.TACTICAL;
        this.diffName = difficulty;

        this.state = 'PATROL'; // 'PATROL', 'ENGAGE', 'SEEK_PICKUP', 'EVADE'
        this.target = null;
        this.targetLostTimer = 0;

        // Pathfinding
        this.currentWaypointIndex = -1;
        this.path = [];
        this.pathIndex = 0;
        this.repathTimer = 0;

        // Combat behavior timers
        this.strafeDir = 1;
        this.strafeTimer = 0;
        this.jumpDecisionTimer = 0;
        this.fireBurstTimer = 0;
        this.grenadeCooldown = 5.0;
        this.reactionTimer = 0;
        this.currentAim = 0;
    }

    update(dt, world) {
        if (!this.character.alive) {
            this.target = null;
            return;
        }

        this.repathTimer -= dt;
        this.grenadeCooldown -= dt;

        // 1. Sensory evaluation - find best target
        this.evaluateSensors(dt, world);

        // 2. State machine decision
        this.evaluateState(world);

        // 3. Execute behavior based on state
        switch (this.state) {
            case 'ENGAGE':
                this.executeEngage(dt, world);
                break;
            case 'SEEK_PICKUP':
                this.executeSeekPickup(dt, world);
                break;
            case 'EVADE':
                this.executeEvade(dt, world);
                break;
            case 'PATROL':
            default:
                this.executePatrol(dt, world);
                break;
        }
    }

    evaluateSensors(dt, world) {
        let bestTarget = null;
        let closestDist = 1400; // Sight range

        if (world && world.entities) {
            for (const entity of world.entities) {
                if (entity === this.character || !entity.alive) continue;
                if (entity.team && entity.team === this.character.team) continue;

                // Specter cloak check (reduces detection range)
                const detectionRange = entity.isCloaked ? 350 : 1200;
                const dist = this.character.pos.dist(entity.pos);
                if (dist > detectionRange) continue;

                // Line of sight raycast
                if (this.hasLineOfSight(this.character.pos, entity.pos, world)) {
                    if (dist < closestDist) {
                        closestDist = dist;
                        bestTarget = entity;
                    }
                }
            }
        }

        if (bestTarget) {
            this.target = bestTarget;
            this.targetLostTimer = 2.0; // Remember target for 2s behind cover
        } else if (this.target) {
            this.targetLostTimer -= dt;
            if (this.targetLostTimer <= 0) {
                this.target = null;
            }
        }
    }

    hasLineOfSight(from, to, world) {
        if (!world || !world.physics || !world.map) return true;
        const dir = to.clone().sub(from);
        const dist = dir.mag();
        if (dist === 0) return true;
        const ray = world.physics.raycast(from, dir, dist, world.map);
        return !ray.hit;
    }

    evaluateState(world) {
        const totalHealth = this.character.health + this.character.shield;

        if (totalHealth < this.difficulty.retreatHealthThreshold) {
            const nearestPickup = this.findNearestHealthOrShield(world);
            if (nearestPickup) {
                this.state = 'SEEK_PICKUP';
                this.targetPickup = nearestPickup;
                return;
            }
        }

        if (this.target && this.target.alive) {
            this.state = 'ENGAGE';
        } else {
            this.state = 'PATROL';
        }
    }

    executeEngage(dt, world) {
        if (!this.target) {
            this.state = 'PATROL';
            return;
        }

        const toTarget = this.target.pos.clone().sub(this.character.pos);
        const dist = toTarget.mag();

        // Aim calculation
        let targetAngle = toTarget.angle();

        // Predictive aiming for Elite bots
        if (this.difficulty.predictiveAim && this.character.currentWeapon) {
            const bulletSpeed = this.character.currentWeapon.def.projSpeed || 1500;
            const flightTime = dist / bulletSpeed;
            const predictedPos = this.target.pos.clone().addScaled(this.target.vel, flightTime);
            targetAngle = predictedPos.sub(this.character.pos).angle();
        }

        // Apply error and smooth tracking
        targetAngle += (Math.random() - 0.5) * this.difficulty.aimError;
        this.currentAim = this.approachAngle(this.currentAim, targetAngle, this.difficulty.trackSpeed * dt);
        this.character.aimAngle = this.currentAim;

        // Firing logic
        if (this.hasLineOfSight(this.character.pos, this.target.pos, world)) {
            // Burst firing
            this.fireBurstTimer += dt;
            if (this.fireBurstTimer > 0.1) {
                this.character.currentWeapon.triggerFire(this.character, this.currentAim, world);
                if (this.fireBurstTimer > this.difficulty.fireBurstMax) {
                    this.fireBurstTimer = -0.3; // brief pause between trigger bursts
                }
            }

            // Tactical ability trigger
            if (Math.random() < 0.03 && this.character.abilityCooldownTimer <= 0) {
                this.character.triggerAbility(world);
            }

            // Tactical grenade throw
            if (dist > 250 && dist < 650 && this.grenadeCooldown <= 0 && Math.random() < this.difficulty.grenadeChance) {
                this.character.throwGrenade(this.currentAim, world);
                this.grenadeCooldown = 6.0;
            }

            // Tactical dash (dodge or reposition)
            if (Math.random() < 0.02 && Math.random() < this.difficulty.dashChance) {
                const dashDir = new Vec2(this.strafeDir, Math.random() < 0.3 ? -0.5 : 0);
                this.character.triggerKineticDash(dashDir, world);
            }
        }

        // Movement & Strafe while engaging
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
            this.strafeDir = Math.random() < 0.5 ? 1 : -1;
            this.strafeTimer = 1.0 + Math.random() * 1.5;
        }

        let moveX = this.strafeDir;
        if (dist > 600) {
            moveX = toTarget.x > 0 ? 1 : -1; // Move closer
        } else if (dist < 180) {
            moveX = toTarget.x > 0 ? -1 : 1; // Back away
        }

        // Jump maneuvers during combat
        this.jumpDecisionTimer -= dt;
        let jump = false;
        if (this.jumpDecisionTimer <= 0) {
            this.jumpDecisionTimer = 0.8 + Math.random() * 1.2;
            if (Math.random() < 0.45) {
                jump = true;
            }
        }

        const down = (toTarget.y > 100 && Math.random() < 0.3);
        this.character.applyMovementInput(moveX, jump, down, world);
    }

    executePatrol(dt, world) {
        if (!world || !world.map || !world.map.waypoints || world.map.waypoints.length === 0) return;

        // Pick next waypoint if needed
        if (this.currentWaypointIndex === -1 || this.hasReachedWaypoint(world.map.waypoints[this.currentWaypointIndex])) {
            const currentWp = (this.currentWaypointIndex >= 0) ? world.map.waypoints[this.currentWaypointIndex] : null;
            if (currentWp && currentWp.neighbors && currentWp.neighbors.length > 0) {
                const nextId = currentWp.neighbors[Math.floor(Math.random() * currentWp.neighbors.length)];
                this.currentWaypointIndex = nextId;
            } else {
                this.currentWaypointIndex = Math.floor(Math.random() * world.map.waypoints.length);
            }
        }

        const targetWp = world.map.waypoints[this.currentWaypointIndex];
        if (!targetWp) return;

        this.navigateToward(targetWp.x, targetWp.y, dt, world);
    }

    executeSeekPickup(dt, world) {
        if (!this.targetPickup || !this.targetPickup.available) {
            this.state = 'PATROL';
            return;
        }

        this.navigateToward(this.targetPickup.x + 14, this.targetPickup.y + 14, dt, world);

        // If arrived and collected
        if (Math.hypot(this.character.pos.x - (this.targetPickup.x + 14),
                       this.character.pos.y - (this.targetPickup.y + 14)) < 35) {
            this.targetPickup.collect(this.character, world);
            this.state = 'PATROL';
        }
    }

    executeEvade(dt, world) {
        // Dash away from current target or danger
        if (this.target) {
            const awayDir = this.character.pos.clone().sub(this.target.pos).normalize();
            this.character.applyMovementInput(awayDir.x > 0 ? 1 : -1, true, false, world);
            if (this.character.dashCooldownTimer <= 0) {
                this.character.triggerKineticDash(awayDir, world);
            }
        } else {
            this.state = 'PATROL';
        }
    }

    navigateToward(targetX, targetY, dt, world) {
        const dx = targetX - this.character.pos.x;
        const dy = targetY - this.character.pos.y;

        const moveX = dx > 20 ? 1 : (dx < -20 ? -1 : 0);
        let jump = false;
        let down = false;

        // Vertical navigation
        if (dy < -40 && (this.character.grounded || this.character.isWallSliding)) {
            jump = true;
        } else if (dy > 60 && this.character.grounded) {
            down = true;
            jump = true; // Drop through one way platform
        }

        // Jump over obstacles in front
        if (this.character.isTouchingWall && this.character.grounded) {
            jump = true;
        }

        this.character.applyMovementInput(moveX, jump, down, world);

        // Aim in movement direction
        this.character.aimAngle = Math.atan2(dy, dx);
    }

    hasReachedWaypoint(wp) {
        if (!wp) return true;
        return Math.hypot(this.character.pos.x - wp.x, this.character.pos.y - wp.y) < 50;
    }

    findNearestHealthOrShield(world) {
        if (!world || !world.map || !world.map.pickups) return null;
        let closest = null;
        let minDist = 9999;
        for (const p of world.map.pickups) {
            if (p.available && (p.type === 'HEALTH' || p.type === 'SHIELD')) {
                const d = Math.hypot(this.character.pos.x - p.x, this.character.pos.y - p.y);
                if (d < minDist) {
                    minDist = d;
                    closest = p;
                }
            }
        }
        return closest;
    }

    approachAngle(current, target, step) {
        let diff = (target - current) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < step) return target;
        return current + Math.sign(diff) * step;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BOT_DIFFICULTY, BotController };
}


/* ===== modes.js ===== */
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


/* ===== multiplayer.js ===== */
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


/* ===== audio.js ===== */
/**
 * Vector Strike - Procedural Audio Engine
 * Pure WebAudio API synthesizer for all weapon sounds, explosions,
 * combat feedback, and algorithmic cyberpunk background soundtrack.
 */

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.sfxVolume = 0.8;
        this.musicVolume = 0.5;
        this.musicEnabled = true;
        this.isInitialized = false;
        this.musicNode = null;
        this.musicStep = 0;
        this.musicTimer = null;
    }

    init() {
        if (this.isInitialized) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
                this.isInitialized = true;
                if (this.musicEnabled) {
                    this.startBackgroundMusic();
                }
            }
        } catch (e) {
            console.warn('WebAudio not supported or blocked:', e);
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playWeaponFire(type) {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        gain.connect(this.ctx.destination);

        switch (type) {
            case 'RAIL_PISTOL':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(650, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
                gain.gain.setValueAtTime(this.sfxVolume * 0.45, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + 0.12);
                break;

            case 'ARC_CARBINE':
                osc.type = 'square';
                osc.frequency.setValueAtTime(480, now);
                osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
                gain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + 0.08);
                break;

            case 'SCATTER_PULSE':
                this.playNoise(0.18, 400, this.sfxVolume * 0.6);
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(160, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
                gain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + 0.2);
                break;

            case 'ION_SNIPER':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(1200, now);
                osc.frequency.exponentialRampToValueAtTime(60, now + 0.35);
                gain.gain.setValueAtTime(this.sfxVolume * 0.7, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + 0.35);
                this.playNoise(0.25, 800, this.sfxVolume * 0.5);
                break;

            case 'MAG_LAUNCHER':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.25);
                gain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + 0.25);
                break;

            default:
                break;
        }
    }

    playMeleeSwing() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.18);
        gain.gain.setValueAtTime(this.sfxVolume * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
    }

    playDeflect() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.setValueAtTime(1800, now + 0.05);
        gain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    playExplosion() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        this.playNoise(0.65, 300, this.sfxVolume * 0.85);

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.5);
        gain.gain.setValueAtTime(this.sfxVolume * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
    }

    playJump() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);
        gain.gain.setValueAtTime(this.sfxVolume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    playDash() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        this.playNoise(0.22, 1200, this.sfxVolume * 0.55);
    }

    playWallKick() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(540, now + 0.1);
        gain.gain.setValueAtTime(this.sfxVolume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playGravAnchor() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.25);
        gain.gain.setValueAtTime(this.sfxVolume * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    }

    playShieldHit() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
        gain.gain.setValueAtTime(this.sfxVolume * 0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
    }

    playShieldBreak() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        this.playNoise(0.3, 2400, this.sfxVolume * 0.6);
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(950, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.25);
        gain.gain.setValueAtTime(this.sfxVolume * 0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    }

    playFleshHit() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
        gain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playPlayerDeath() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        this.playNoise(0.4, 600, this.sfxVolume * 0.6);
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
        gain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
    }

    playPickup() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.06); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.12); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.18); // C6
        gain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    }

    playGrenadeThrow() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
        gain.gain.setValueAtTime(this.sfxVolume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playGrenadeBounce() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(200, now + 0.04);
        gain.gain.setValueAtTime(this.sfxVolume * 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    playReloadStart() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.setValueAtTime(350, now + 0.08);
        gain.gain.setValueAtTime(this.sfxVolume * 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    playReloadComplete() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.07);
        gain.gain.setValueAtTime(this.sfxVolume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
    }

    playNoise(duration, cutoff = 800, volume = 0.3) {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cutoff, this.ctx.currentTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
    }

    startBackgroundMusic() {
        if (!this.ctx || this.musicTimer || !this.musicEnabled) return;

        // Cyberpunk synth chords in D minor (Dm, Bb, F, C)
        const progression = [
            [146.83, 220.00, 261.63, 293.66], // Dm
            [116.54, 174.61, 233.08, 293.66], // Bb
            [174.61, 220.00, 261.63, 349.23], // F
            [130.81, 164.81, 196.00, 261.63]  // C
        ];

        let chordIdx = 0;
        let noteStep = 0;

        this.musicTimer = setInterval(() => {
            if (!this.musicEnabled || !this.ctx || this.musicVolume <= 0) return;
            this.resume();

            const now = this.ctx.currentTime;
            const currentChord = progression[chordIdx];
            const freq = currentChord[noteStep % currentChord.length];

            // Synth arpeggio note
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq * 1.5, now);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(900 + Math.sin(now * 2) * 400, now);

            gain.gain.setValueAtTime(this.musicVolume * 0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.22);

            // Sub bass on step 0
            if (noteStep === 0) {
                const bassOsc = this.ctx.createOscillator();
                const bassGain = this.ctx.createGain();
                bassOsc.type = 'sine';
                bassOsc.frequency.setValueAtTime(currentChord[0] * 0.5, now);
                bassGain.gain.setValueAtTime(this.musicVolume * 0.22, now);
                bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
                bassOsc.connect(bassGain);
                bassGain.connect(this.ctx.destination);
                bassOsc.start(now);
                bassOsc.stop(now + 0.7);
            }

            noteStep++;
            if (noteStep >= 8) {
                noteStep = 0;
                chordIdx = (chordIdx + 1) % progression.length;
            }
        }, 180); // 133 BPM 16th notes
    }

    stopBackgroundMusic() {
        if (this.musicTimer) {
            clearInterval(this.musicTimer);
            this.musicTimer = null;
        }
    }

    setMusicVolume(vol) {
        this.musicVolume = vol;
    }

    setSfxVolume(vol) {
        this.sfxVolume = vol;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioEngine;
}


/* ===== engine.js ===== */
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
        this.ctx = null;
        if (canvas) {
            try { this.ctx = canvas.getContext('2d', { alpha: false }); } catch (_) {}
            if (!this.ctx) {
                try { this.ctx = canvas.getContext('2d'); } catch (_) {}
            }
        }
        if (!this.ctx) {
            throw new Error('Vector Strike: 2D canvas context unavailable');
        }
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

        // Initialize the camera immediately so the first frame is centered on the player.
        if (this.canvas) {
            const maxCamX = Math.max(0, this.map.width - this.canvas.width);
            const maxCamY = Math.max(0, this.map.height - this.canvas.height);
            this.camera.x = Math.max(0, Math.min(maxCamX, this.player.pos.x - this.canvas.width * 0.5));
            this.camera.y = Math.max(0, Math.min(maxCamY, this.player.pos.y - this.canvas.height * 0.5));
            this.camera.targetX = this.camera.x;
            this.camera.targetY = this.camera.y;
        }

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

        const halfW = c.width * 0.5;
        const halfH = c.height * 0.5;

        // Facing direction scale
        ctx.scale(c.facing, 1);

        // 1. Cybernetic Legs
        ctx.fillStyle = '#151d2a';
        ctx.fillRect(-6, 8, 4, 14);
        ctx.fillRect(2, 8, 4, 14);

        // 2. Torso Armor Plate
        ctx.fillStyle = c.classDef.secondaryColor || '#1a2639';
        ctx.fillRect(-halfW + 2, -halfH + 12, c.width - 4, 20);

        // Team indicator chest core
        ctx.fillStyle = (c.team === 'ALPHA') ? '#00e5ff' : '#ff0055';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
        ctx.fillRect(-3, -halfH + 16, 6, 6);
        ctx.shadowBlur = 0;

        // 3. Cybernetic Helmet
        ctx.fillStyle = c.classDef.primaryColor || '#00e5ff';
        ctx.beginPath();
        ctx.arc(0, -halfH + 7, 9, 0, Math.PI * 2);
        ctx.fill();

        // Glowing Visor
        ctx.fillStyle = c.classDef.visorColor || '#00ffff';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 6;
        ctx.fillRect(1, -halfH + 4, 6, 4);
        ctx.shadowBlur = 0;

        // 4. Weapon
        ctx.save();
        ctx.translate(2, -halfH + 18);
        const aimAngleRelative = c.facing === 1 ? c.aimAngle : (Math.PI - c.aimAngle);
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

// Explicit browser global: classic-script lexical bindings can be inconsistent in embedded WebViews.
// UI code resolves the constructor through window.GameWorld.
if (typeof window !== 'undefined') {
    window.GameWorld = GameWorld;
    console.log('Vector Strike engine loaded: GameWorld ready');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameWorld, Particle, Shockwave, CombatDrone, DeployableBarrier };
}


/* ===== ui.js ===== */
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
                }
            });
        }

        const btnStartMultiplayer = document.getElementById('btn-lobby-start');
        if (btnStartMultiplayer) {
            btnStartMultiplayer.addEventListener('click', () => {
                if (this.network.isHost) {
                    this.network.send({
                        type: 'START_MATCH',
                        config: this.matchConfig
                    });
                    this.startMatch();
                }
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

    startMatch() {
        this.showScreen('screen-hud');

        const canvas = document.getElementById('gameCanvas');
        this.resizeCanvas(canvas);

        if (this.gameWorld) {
            this.gameWorld.stop();
        }

        this.matchConfig.audio = this.audio;
        try {
            const GameWorldCtor = (typeof window !== 'undefined') ? window.GameWorld : null;
            if (typeof GameWorldCtor !== 'function') {
                throw new Error('Game engine failed to load: window.GameWorld is unavailable');
            }
            const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
            if (!ctx) {
                throw new Error('Canvas 2D context unavailable in WebView');
            }
            this.gameWorld = new GameWorldCtor(canvas, this.matchConfig);
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

