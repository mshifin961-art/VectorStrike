/**
 * Vector Strike - Original Tactical Map System
 * Geometric collision layers, dynamic moving platforms, hazard sectors,
 * interactive jump pads, pickup pedestals, and AI navigation graphs.
 */

if (typeof Vec2 === 'undefined' && typeof require !== 'undefined') {
    Vec2 = require('./vector2d.js');
}
if (typeof WeaponInstance === 'undefined' && typeof require !== 'undefined') {
    ({ WeaponInstance } = require('./weapons.js'));
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
