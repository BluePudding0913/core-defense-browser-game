package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class CombatSpatialIndexTest {
    record Hit(String weapon, double fromX, double fromY, double x, double y, double damage,
               boolean defeated, int credits, boolean headshot, Integer enemyId) { }
    static final class Events implements CombatEvents {
        final List<Hit> hits = new ArrayList<>();
        public void hit(String id, String weapon, double ox, double oy, double x, double y, double damage,
                        boolean defeated, int credits, boolean headshot, Integer enemyId) {
            hits.add(new Hit(weapon, ox, oy, x, y, damage, defeated, credits, headshot, enemyId));
        }
        public void sound(Player player, String effect, String item) { }
        public void explosion(double x, double y, double radius) { }
        public void outOfAmmo(Player player) { }
    }
    static final class World implements CombatSystem.World {
        final List<Enemy> enemies;
        final List<Player> players = new ArrayList<>();
        final List<PoisonGasRules.Cloud> clouds = new ArrayList<>();
        final Set<String> areas = GameMap.AREAS.stream().map(UnlockArea::id).collect(Collectors.toSet());
        boolean spawnOnDeath;
        World(boolean indexed) { enemies = indexed ? new EnemySpatialIndex() : new ArrayList<>(); }
        public boolean canAttack() { return true; }
        public Set<String> unlockedAreas() { return areas; }
        public List<Enemy> enemies() { return enemies; }
        public List<PoisonGasRules.Cloud> poisonClouds() { return clouds; }
        public List<Player> players() { return players; }
        public boolean canOccupy(double x, double y, double radius) { return true; }
        public void damagePlayer(Player player, double damage) { player.hp -= damage; }
        public void onEnemyDefeated(Enemy enemy) {
            if (spawnOnDeath && enemy.id < 1000)
                enemies.add(EnemySpatialIndexTest.enemy(enemy.id + 1000, "runner", enemy.x, enemy.y));
        }
    }
    record Outcome(List<Hit> hits, List<Double> hp, List<Double> bags, List<Double> positions,
                   int gold, int kills, int ammo, double cooldown) { }

    @Test void allWeaponsBothHandsAndFpsRetainHitsConsumptionRewardsAndSpawnOrder() {
        for (var definition : WeaponCatalog.ALL) {
            for (boolean fps : new boolean[]{false, true}) {
                for (boolean secondary : new boolean[]{false, true}) {
                    assertEquals(run(false, definition.id(), fps, secondary), run(true, definition.id(), fps, secondary),
                            definition.id() + " fps=" + fps + " secondary=" + secondary);
                }
            }
        }
    }
    private Outcome run(boolean indexed, String weapon, boolean fps, boolean secondary) {
        World world = new World(indexed); Events events = new Events();
        CombatSystem combat = new CombatSystem(world, events, () -> .5);
        Player player = new Player(1); player.x = 980; player.y = 1900;
        player.weapons.grant(weapon); player.equipWeapon(weapon);
        if (secondary) { player.job = "attacker"; player.equipWeapon("bat"); player.equipSecondaryWeapon(weapon); }
        player.aimPitch = fps ? 0.0 : null;
        player.secondaryAimPitch = player.aimPitch;
        world.players.add(player);
        String[] types = {"grunt", "carrier", "tiny", "shield", "finalBoss"};
        for (int i = 0; i < 30; i++) {
            Enemy enemy = EnemySpatialIndexTest.enemy(i, types[i % types.length], 1000 + i % 10 * 24, 1900 + (i / 10 - 1) * 32);
            enemy.facingX = 1; enemy.facingY = 0;
            enemy.hp = i % 3 == 0 ? 1 : 500;
            world.enemies.add(enemy);
        }
        // Same-distance enemies must keep the original insertion order, even after a bucket move.
        world.enemies.get(11).moveTo(1700, 1700);
        world.enemies.get(11).moveTo(1024, 1900);
        for (int i = 30; i < 500; i++) world.enemies.add(EnemySpatialIndexTest.enemy(i, "grunt", 400, 400));
        world.spawnOnDeath = !weapon.equals("rocket"); // Rocket offspring are deferred by the real session.
        player.firing = true; player.aimX = 1250; player.aimY = 1900;
        player.secondaryFiring = true; player.secondaryAimX = 1250; player.secondaryAimY = 1900;
        if (secondary) combat.attackSecondary(player, 1250, 1900); else combat.attackAt(player, 1250, 1900);
        if (weapon.equals("railgun")) {
            if (secondary) combat.updateSecondaryRailgun(player, GameConfig.RAILGUN_CHARGE + .3);
            else combat.updateRailgun(player, GameConfig.RAILGUN_CHARGE + .3);
        }
        if (weapon.equals("rocket")) combat.updateRockets(1);
        if (weapon.equals("poisonGas")) combat.updatePoisonGas(PoisonGasRules.THROW_DELAY + .5);
        if (weapon.equals("hook")) { player.hookReeling = true; combat.updateHooks(.5); }
        // A following shot must see knockback, hook movement and newly spawned enemies immediately.
        player.cooldown = player.secondaryCooldown = 0;
        player.equipWeapon("pistol"); player.weapons.grant("pistol");
        combat.attackAt(player, 1250, 1900);
        return new Outcome(events.hits, world.enemies.stream().map(e -> e.hp).toList(),
                world.enemies.stream().map(e -> e.bagHp).toList(),
                world.enemies.stream().flatMap(e -> java.util.stream.Stream.of(e.x, e.y)).toList(),
                player.credits, player.kills, player.weapons.ammo(weapon), player.cooldown);
    }
}
