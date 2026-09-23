/**
 * Vector Strike - Automated Test Suite
 * Tests physics, weapons, projectiles, characters, maps, AI, and game modes.
 */

const assert = require('assert');

// 1. Vector2D Tests
console.log('--- Testing Vector2D ---');
const Vec2 = require('../app/src/main/assets/game/js/vector2d.js');

const v1 = new Vec2(3, 4);
assert.strictEqual(v1.mag(), 5, 'Vector magnitude should be 5');
const norm = v1.clone().normalize();
assert.ok(Math.abs(norm.mag() - 1.0) < 0.0001, 'Normalized vector mag should be 1');
const v2 = new Vec2(1, 2);
v1.add(v2);
assert.strictEqual(v1.x, 4);
assert.strictEqual(v1.y, 6);
console.log('✓ Vector2D math passed.');

// 2. Physics & Collision Tests
console.log('--- Testing Physics & Collision ---');
const PhysicsEngine = require('../app/src/main/assets/game/js/physics.js');
const physics = new PhysicsEngine();

const mockMap = {
    solids: [
        { x: 0, y: 500, w: 1000, h: 50 }, // Floor
        { x: 200, y: 300, w: 50, h: 200 }  // Vertical Wall
    ],
    oneWayPlatforms: [
        { x: 100, y: 400, w: 200, h: 10 }
    ],
    movingPlatforms: [],
    jumpPads: []
};

const mockEntity = {
    pos: new Vec2(50, 100),
    vel: new Vec2(0, 0),
    width: 24,
    height: 46,
    active: true,
    isStatic: false,
    grounded: false
};

// Simulate 1 second of falling under gravity
for (let i = 0; i < 60; i++) {
    physics.update(1 / 60, [mockEntity], mockMap);
}
assert.ok(mockEntity.grounded, 'Entity should have landed on the floor');
assert.strictEqual(mockEntity.pos.y, 500 - 23, 'Entity should be aligned on top of floor without penetrating');
assert.strictEqual(mockEntity.vel.y, 0, 'Vertical velocity should be zeroed upon landing');
console.log('✓ Gravity and floor collision passed.');

// Horizontal wall collision test
mockEntity.pos.set(160, 400);
mockEntity.vel.set(300, 0); // Moving towards wall at x=200
mockEntity.grounded = true;
mockEntity.targetVelX = 300;

for (let i = 0; i < 30; i++) {
    physics.update(1 / 60, [mockEntity], mockMap);
}
assert.ok(mockEntity.pos.x <= 200 - 12, 'Entity should not penetrate vertical wall');
assert.ok(mockEntity.isTouchingWall, 'Entity should register touching wall');
console.log('✓ Horizontal wall collision and penetration prevention passed.');

// Raycast test
const rayOrigin = new Vec2(50, 350);
const rayDir = new Vec2(1, 0);
const hit = physics.raycast(rayOrigin, rayDir, 500, mockMap);
assert.ok(hit.hit, 'Raycast should hit vertical wall');
assert.strictEqual(hit.point.x, 200, 'Raycast hit X should match wall boundary');
console.log('✓ Raycast calculation passed.');

// 3. Weapons & Combat Tests
console.log('--- Testing Weapon System ---');
const { WEAPON_TYPES, WEAPON_DEFS, WeaponInstance, Projectile, GrenadeThrowable } = require('../app/src/main/assets/game/js/weapons.js');

const pistol = new WeaponInstance(WEAPON_TYPES.RAIL_PISTOL);
assert.strictEqual(pistol.ammo, 12, 'Pistol starting ammo should be 12');

const mockWorld = {
    physics: physics,
    map: mockMap,
    entities: [],
    spawnedProjectiles: [],
    spawnProjectile: function(p) { this.spawnedProjectiles.push(p); }
};

const shooter = {
    id: 'shooter_1',
    pos: new Vec2(100, 200),
    vel: new Vec2(0, 0),
    team: 'ALPHA'
};

const fired = pistol.triggerFire(shooter, 0, mockWorld);
assert.ok(fired, 'Weapon trigger should fire successfully');
assert.strictEqual(pistol.ammo, 11, 'Pistol ammo should decrease to 11');
assert.strictEqual(mockWorld.spawnedProjectiles.length, 1, 'A projectile should be spawned');
console.log('✓ Weapon firing logic passed.');

// 4. Character Health, Shield & Abilities
console.log('--- Testing Character Classes & Abilities ---');
const { CHARACTER_CLASSES, CharacterEntity } = require('../app/src/main/assets/game/js/characters.js');

const vanguard = new CharacterEntity('c_1', 'Vanguard 1', 'VANGUARD', false, 'ALPHA');
assert.strictEqual(vanguard.health, 100);
assert.strictEqual(vanguard.shield, 50);

// Damage test - shield absorbs first
vanguard.takeDamage(30, null, 'BULLET', mockWorld);
assert.strictEqual(vanguard.shield, 20, 'Shield should absorb 30 damage');
assert.strictEqual(vanguard.health, 100, 'Health should remain intact while shield active');

// Excessive damage breaks shield and damages health
vanguard.takeDamage(40, null, 'BULLET', mockWorld);
assert.strictEqual(vanguard.shield, 0, 'Shield should be broken');
assert.strictEqual(vanguard.health, 80, 'Health should take remaining 20 damage');
console.log('✓ Shield and Health damage absorption passed.');

// Kinetic Dash test
const dashed = vanguard.triggerKineticDash(new Vec2(1, 0), mockWorld);
assert.ok(dashed, 'Kinetic dash should trigger');
assert.ok(vanguard.dashTime > 0, 'Dash timer should be active');
assert.ok(vanguard.vel.x > 500, 'Dash should propel entity at high speed');
console.log('✓ Kinetic Dash mechanic passed.');

// 5. Game Modes
console.log('--- Testing Game Modes ---');
const { SoloDeathmatchMode, TeamBattleMode, SurvivalWaveMode } = require('../app/src/main/assets/game/js/modes.js');

const dmMode = new SoloDeathmatchMode({ entities: [vanguard] }, { fragLimit: 2 });
vanguard.kills = 2;
dmMode.onKill(null, vanguard, 'BULLET');
assert.ok(dmMode.matchEnded, 'Solo Deathmatch should end when frag limit reached');
assert.strictEqual(dmMode.winner, vanguard, 'Winner should be vanguard');
console.log('✓ Solo Deathmatch rules passed.');

console.log('\n========================================');
console.log('ALL CORE ENGINE AND COMBAT TESTS PASSED!');
console.log('========================================');
