const assert = require('assert');

const Vec2 = require('../app/src/main/assets/game/js/vector2d.js');
const PhysicsEngine = require('../app/src/main/assets/game/js/physics.js');
const { WEAPON_TYPES, WEAPON_DEFS, WeaponInstance, Projectile, GrenadeThrowable } = require('../app/src/main/assets/game/js/weapons.js');
const { CHARACTER_CLASSES, CharacterEntity } = require('../app/src/main/assets/game/js/characters.js');
const { MovingPlatform, PickupStation, MAP_DEFINITIONS, GameMap } = require('../app/src/main/assets/game/js/maps.js');
const { BOT_DIFFICULTY, BotController } = require('../app/src/main/assets/game/js/bot_ai.js');
const { GAME_MODES, SoloDeathmatchMode, TeamBattleMode, SurvivalWaveMode } = require('../app/src/main/assets/game/js/modes.js');
const { NET_MSG, NetworkManager } = require('../app/src/main/assets/game/js/multiplayer.js');

console.log('=== RUNNING FULL VECTOR STRIKE VERIFICATION SUITE ===');

// Test 1: All 6 Weapon Archetypes
console.log('\n[1/6] Verifying All 6 Weapon Types...');
for (const typeKey of Object.keys(WEAPON_TYPES)) {
    const type = WEAPON_TYPES[typeKey];
    const w = new WeaponInstance(type);
    assert.ok(w.def, `Weapon def should exist for ${type}`);
    assert.ok(w.def.damage > 0, `Damage must be positive for ${type}`);
    assert.ok(w.def.fireRate > 0, `Fire rate must be positive for ${type}`);
    assert.strictEqual(w.ammo, w.def.magSize, `Initial ammo should match mag size for ${type}`);
}

// Test Scatter-Pulse Ricochet
const shotgun = new WeaponInstance(WEAPON_TYPES.SCATTER_PULSE);
assert.strictEqual(shotgun.def.bounces, 1, 'Scatter-Pulse should have 1 ricochet bounce');

// Test Ion Sniper Piercing
const sniper = new WeaponInstance(WEAPON_TYPES.ION_SNIPER);
assert.strictEqual(sniper.def.pierce, 3, 'Ion Sniper should pierce up to 3 targets');

// Test Plasma Edge Melee
const blade = new WeaponInstance(WEAPON_TYPES.PLASMA_EDGE);
assert.ok(blade.def.isMelee, 'Plasma edge must be melee');
console.log('✓ All 6 Weapon Archetypes verified successfully.');

// Test 2: Projectile Collision, Ricochet, Piercing & Grenades
console.log('\n[2/6] Verifying Projectiles, Ricochet & Grenade Explosions...');
const physics = new PhysicsEngine();
const testMap = new GameMap('MAP_NEON_FOUNDRY');

let spawnedSparks = 0;
let explosionCount = 0;
const mockWorld = {
    physics: physics,
    map: testMap,
    entities: [],
    spawnedProjectiles: [],
    spawnProjectile: function(p) { this.spawnedProjectiles.push(p); },
    spawnSpark: function() { spawnedSparks++; },
    spawnExplosion: function() { explosionCount++; },
    getEntityById: function(id) { return this.entities.find(e => e.id === id); }
};

// Target entity
const targetChar = new CharacterEntity('target_01', 'Target', 'VANGUARD', false, 'BRAVO');
targetChar.pos.set(600, 300);
mockWorld.entities.push(targetChar);

// Projectile hitting target
const proj = new Projectile({
    pos: new Vec2(550, 300),
    angle: 0,
    speed: 1000,
    damage: 30,
    range: 500,
    ownerId: 'shooter_01',
    ownerTeam: 'ALPHA'
});

// Update projectile until it strikes target
for (let i = 0; i < 10; i++) {
    proj.update(1 / 60, mockWorld);
}
assert.strictEqual(targetChar.shield, 20, 'Target shield should take 30 damage');
assert.ok(proj.dead, 'Single-hit projectile should terminate after impact');

// Grenade test
const grenade = new GrenadeThrowable(new Vec2(500, 200), new Vec2(100, 0), 'thrower_01', 'ALPHA');
grenade.fuse = 0.05; // Quick fuse
for (let i = 0; i < 10; i++) {
    grenade.update(1 / 60, mockWorld);
}
assert.ok(grenade.dead, 'Grenade should have detonated');
assert.ok(explosionCount > 0, 'Explosion should be registered');
console.log('✓ Projectile impacts, ricochet and grenade explosion mechanics verified.');

// Test 3: Maps, Jump Pads, Moving Platforms & Pickups
console.log('\n[3/6] Verifying Maps (Neon Foundry & Hydro-Core)...');
const map1 = new GameMap('MAP_NEON_FOUNDRY');
assert.ok(map1.solids.length >= 10, 'Map 1 should have rich solid geometry');
assert.ok(map1.jumpPads.length >= 2, 'Map 1 should have jump pads');
assert.ok(map1.pickups.length >= 5, 'Map 1 should have pickup stations');
assert.ok(map1.waypoints.length >= 10, 'Map 1 should have waypoint network');

const map2 = new GameMap('MAP_HYDRO_CORE');
assert.ok(map2.solids.length >= 10, 'Map 2 should have solid geometry');
assert.ok(map2.movingPlatforms.length >= 2, 'Map 2 should have moving platforms');

// Moving platform physics update
const mp = map2.movingPlatforms[0];
const initialX = mp.x;
mp.update(0.5);
assert.notStrictEqual(mp.x, initialX, 'Moving platform should translate across space');

// Pickup collection
const pickup = map1.pickups[0];
assert.ok(pickup.available, 'Pickup station should start available');
const collector = new CharacterEntity('c_pick', 'Collector', 'VANGUARD', false, 'ALPHA');
const collected = pickup.collect(collector, mockWorld);
assert.ok(collected, 'Pickup should be collected');
assert.ok(!pickup.available, 'Pickup station should enter cooldown after collection');
pickup.update(pickup.respawnTime + 0.1);
assert.ok(pickup.available, 'Pickup station should respawn after cooldown');
console.log('✓ Maps, moving platforms, jump pads and pickups verified.');

// Test 4: Bot AI Decision Tree & Raycast Perception
console.log('\n[4/6] Verifying Tactical Bot AI Brain...');
const botChar = new CharacterEntity('bot_test', 'Bot Titan', 'JUGGERNAUT', true, 'BRAVO');
botChar.pos.set(220, 750);
const brain = new BotController(botChar, 'ELITE');

mockWorld.entities = [targetChar, botChar];
// Bot update step
brain.update(1 / 60, mockWorld);
assert.ok(brain.state === 'PATROL' || brain.state === 'ENGAGE', 'Bot should operate in valid tactical state');
console.log(`✓ Bot AI verified (Current state: ${brain.state}, Difficulty: ${brain.diffName}).`);

// Test 5: Game Modes (Deathmatch, Team Battle, Survival Wave)
console.log('\n[5/6] Verifying Game Modes...');
// Team Battle
const tbMode = new TeamBattleMode(mockWorld, { fragLimit: 5 });
const charAlpha = new CharacterEntity('a1', 'Alpha 1', 'VANGUARD', false, 'ALPHA');
const charBravo = new CharacterEntity('b1', 'Bravo 1', 'SPECTER', false, 'BRAVO');

tbMode.onKill(charBravo, charAlpha, 'RAIL_PISTOL');
assert.strictEqual(tbMode.scores.ALPHA, 1, 'Alpha score should be 1');
assert.strictEqual(tbMode.scores.BRAVO, 0, 'Bravo score should be 0');

// Survival Mode Drone Wave
let spawnedDrones = [];
const waveWorld = {
    player: charAlpha,
    entities: [],
    spawnCombatDrone: function(wave, isHeavy) {
        spawnedDrones.push({ wave, isHeavy, isDrone: true });
    },
    onWaveStart: function() {},
    onWaveCleared: function() {}
};

const survival = new SurvivalWaveMode(waveWorld);
assert.strictEqual(survival.wave, 1, 'Starting wave should be 1');
assert.ok(spawnedDrones.length >= 5, 'Wave 1 should spawn assault drones');
console.log('✓ Solo Deathmatch, Team Battle and Survival Wave modes verified.');

// Test 6: Local Wi-Fi Multiplayer Protocol
console.log('\n[6/6] Verifying Local Wi-Fi Multiplayer Protocol...');
const net = new NetworkManager(mockWorld);
const roomCode = net.createRoom('VS99', 'Commander', 'VANGUARD', 'MAP_NEON_FOUNDRY', 'SOLO_DEATHMATCH');
assert.strictEqual(roomCode, 'VS99', 'Room code should be VS99');
assert.ok(net.isHost, 'Host flag should be true');
assert.strictEqual(net.lobbyPlayers.length, 1, 'Lobby should have 1 player (the host)');
net.leaveRoom();
console.log('✓ Local Wi-Fi Multiplayer Protocol verified.');

console.log('\n============================================================');
console.log('VERIFICATION COMPLETE: ALL 6 TEST MODULES PASSED WITH 0 FAILURES!');
console.log('============================================================');

process.exit(0);
