package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class AutoAimTest {
    GameSession game() {
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        var player = game.connectPlayer("auto-aim");
        game.players.clear(); game.players.add(player); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.phase = GamePhase.WAVE;
        player.x = 1020; player.y = 1900;
        CombatTestRandom.center(game);
        return game;
    }
    Enemy enemy(int id, double x, double y) {
        var enemy = new Enemy(id, "grunt", GameMap.SPAWN_POINTS.get(0), 100000, 0, 0, 0);
        enemy.x = x; enemy.y = y; return enemy;
    }

    @Test void onlyMaxSelectsLiveVisibleInRangeEnemyClosestToCursor() {
        Enemy near = enemy(1, 100, 0), cursor = enemy(2, 0, 180), dead = enemy(3, 0, 199),
                far = enemy(4, 0, 210), hidden = enemy(5, 0, 198);
        dead.hp = 0;
        var enemies = List.of(near, cursor, dead, far, hidden);
        for (int level = 0; level < 3; level++)
            assertNull(AutoAimRules.target(level, 0, 0, 0, 200, 200, enemies, e -> e != hidden));
        assertSame(cursor, AutoAimRules.target(3, 0, 0, 0, 200, 200, enemies, e -> e != hidden));
        assertNull(AutoAimRules.target(3, 0, 0, 0, 200, 200, enemies, e -> false));
    }

    @Test void maxRedirectsEveryUpgradeableShotAndConsumesOnlyOneRound() {
        for (String weapon : List.of("pistol", "shotgun", "smg", "rifle", "sniper", "ricochet",
                "revolver", "lmg", "flamethrower", "rocket", "laserCannon", "poisonGas")) {
            var game = game(); var player = game.players.get(0);
            player.weapons.grant(weapon); player.equipWeapon(weapon);
            player.enchantments.put(weapon, 3);
            var target = enemy(1, 1100, 1900); game.enemies.add(target);
            int ammo = player.weapons.ammo(weapon);
            game.combat.attackAt(player, 1020, 1980);
            if (weapon.equals("rocket")) game.combat.updateRockets(1);
            assertTrue(target.hp < target.maxHp, weapon);
            if (WeaponCatalog.capacity(weapon) > 0) assertEquals(ammo - 1, player.weapons.ammo(weapon), weapon);
            assertEquals(WeaponCatalog.stats(weapon).cooldown(), player.cooldown, 1e-9, weapon);
        }
    }

    @Test void lowerTiersRetainManualAimAndWallsExcludeTargetsEvenAtMax() {
        var game = game(); var player = game.players.get(0);
        Enemy visible = enemy(1, 1100, 1900), hidden = enemy(2, 0, 0);
        game.enemies.add(visible);
        player.enchantments.put("pistol", 2);
        game.combat.attackAt(player, 1020, 1980);
        assertEquals(visible.maxHp, visible.hp);
        boolean found = false;
        search: for (int x = 60; x < GameMap.WORLD_W - 160; x += 40)
            for (int y = 20; y < GameMap.WORLD_H; y += 40) {
                if (GameMap.canOccupy(x, y, 5, game.unlockedAreas)
                        && GameMap.canOccupy(x - 40, y, 5, game.unlockedAreas)
                        && GameMap.canOccupy(x + 160, y, 5, game.unlockedAreas)
                        && GameMap.hasClearLine(x, y, x - 40, y, game.unlockedAreas)
                        && !GameMap.hasClearLine(x, y, x + 160, y, game.unlockedAreas)) {
                    player.x = x; player.y = y;
                    visible.x = x - 40; visible.y = y;
                    hidden.x = x + 160; hidden.y = y;
                    found = true; break search;
                }
            }
        assertTrue(found, "fixture has two floors separated by a wall within weapon range");
        game.enemies.add(hidden);
        player.cooldown = 0; player.enchantments.put("pistol", 3);
        game.combat.attackAt(player, hidden.x, hidden.y);
        assertTrue(visible.hp < visible.maxHp); assertEquals(hidden.maxHp, hidden.hp);
        game.enemies.remove(visible); player.cooldown = 0;
        game.combat.attackAt(player, player.x, player.y + 80);
        assertEquals(hidden.maxHp, hidden.hp);
    }

    @Test void secondaryAimUsesItsOwnWeaponLevelAndPreservesPrimaryState() {
        var game = game(); var player = game.players.get(0); player.job = "attacker";
        player.weapons.grant("smg"); player.equipSecondaryWeapon("smg"); player.enchantments.put("smg", 3);
        player.aimX = 1020; player.aimY = 1980;
        var target = enemy(1, 1100, 1900); game.enemies.add(target);
        game.combat.attackSecondary(player, 1020, 1980);
        assertTrue(target.hp < target.maxHp); assertEquals(player.weapons.capacity("smg") - 1, player.weapons.ammo("smg"));
        assertEquals("pistol", player.weapon); assertEquals(0, player.cooldown);
        assertEquals(1020, player.aimX); assertEquals(1980, player.aimY);
        assertEquals(.14, player.secondaryCooldown);
    }

    @Test void controlledDroneTargetsFromDronePositionUsingMountedWeaponUpgrade() {
        var game = game(); var player = game.players.get(0); player.job = "drone";
        player.x = 100; player.y = 100; player.weapons.grant("smg"); player.enchantments.put("smg", 3);
        player.drone = new Drone(); player.drone.active = true; player.drone.controlled = true;
        player.drone.x = 1020; player.drone.y = 1900; player.drone.weapon = "smg";
        var target = enemy(1, 1100, 1900); game.enemies.add(target);
        game.combat.attackAt(player, 1020, 1980);
        assertTrue(target.hp < target.maxHp); assertEquals(player.weapons.capacity("smg") - 1, player.weapons.ammo("smg"));
        assertEquals(.14, player.drone.cooldown);
    }

    @Test void maxRailgunTracksMovingTargetWhileLowerTierKeepsFixedBeam() {
        for (int level : new int[]{2, 3}) {
            var game = game(); var player = game.players.get(0);
            player.weapons.grant("railgun"); player.equipWeapon("railgun");
            player.enchantments.put("railgun", level); player.firing = true;
            player.aimX = 1100; player.aimY = 1900;
            var target = enemy(1, 1100, 1900); game.enemies.add(target);
            game.combat.attackAt(player, player.aimX, player.aimY);
            game.combat.updateRailgun(player, GameConfig.RAILGUN_CHARGE + .11);
            assertTrue(target.hp < target.maxHp); assertEquals(1, player.weapons.ammo("railgun"));
            target.x = 1060; target.y = 1820;
            double hp = target.hp;
            game.combat.updateRailgun(player, .11);
            if (level == 3) {
                assertTrue(player.railgunDy < -.8); assertTrue(target.hp < hp);
            } else assertEquals(0, player.railgunDy);
            assertEquals(1, player.weapons.ammo("railgun"), "tracking does not consume extra ammo");
        }
    }
}
