/**
 * Vector Strike - Tactical AI Bot Brain
 * Waypoint graph navigation, predictive aiming, state-driven decision tree,
 * dynamic ability usage, and multi-tier difficulty profiles.
 */

if (typeof Vec2 === 'undefined' && typeof require !== 'undefined') {
    Vec2 = require('./vector2d.js');
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
