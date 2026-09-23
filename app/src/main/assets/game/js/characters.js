/**
 * Vector Strike - Original Playable Character Operatives
 * Distinct stats, kinetic abilities, procedural cybernetic rendering,
 * shield/health dynamics, and animation states.
 */

if (typeof Vec2 === 'undefined' && typeof require !== 'undefined') {
    Vec2 = require('./vector2d.js');
}
if (typeof WEAPON_TYPES === 'undefined' && typeof require !== 'undefined') {
    ({ WEAPON_TYPES, WeaponInstance, GrenadeThrowable } = require('./weapons.js'));
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
