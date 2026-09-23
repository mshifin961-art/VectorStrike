/**
 * Vector Strike - High Precision 2D Physics Engine
 * Frame-rate independent sub-stepping, AABB swept resolution,
 * one-way platforms, slopes, and dynamic surfaces.
 */

if (typeof Vec2 === 'undefined' && typeof require !== 'undefined') {
    Vec2 = require('./vector2d.js');
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
