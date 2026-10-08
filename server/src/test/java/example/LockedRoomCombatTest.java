package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class LockedRoomCombatTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test void roomBoundaryBlocksLinesAndReflectsUntilUnlocked() {
        assertTrue(GameMap.hasClearLine(1020, 1700, 1020, 1620));
        assertFalse(GameMap.hasClearLine(1020, 1700, 1020, 1620, Set.of()));
        assertEquals(20, GameMap.distanceToWall(1020, 1700, 0, -1, 80, Set.of()));
        var wall = GameMap.rayWall(1020, 1700, 0, -1, 80, Set.of());
        assertEquals(20, wall.distance());
        assertFalse(wall.flipX());
        assertTrue(wall.flipY());
        assertTrue(GameMap.hasClearLine(1020, 1700, 1020, 1620, Set.of("entry-room")));
        assertEquals(80, GameMap.rayWall(1020, 1700, 0, -1, 80, Set.of("entry-room")).distance());
    }

    @Test void turretCannotFireAcrossLockedRoomBoundary() {
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        Player player = game.connectPlayer("locked-turret");
        game.setRoomOwner(player);
        game.handleMessage(player, "START");
        game.players.clear(); game.players.add(player);
        game.phase = GamePhase.WAVE;
        game.queuedEnemies = 0;
        game.trapSlots.clear();
        var slot = new TrapSlot("test", "test", 1020, 1700, null);
        slot.defense = new Defense("turret");
        game.trapSlots.add(slot);
        var enemy = new Enemy(1, "grunt", GameMap.SPAWN_POINTS.get(0), 10000, 0, 0, 100);
        enemy.x = 1020; enemy.y = 1620;
        game.enemies.add(enemy);
        game.update(.1);
        assertEquals(10000, enemy.hp);
        assertEquals(0, slot.defense.cooldown);
        game.unlockedAreas.add("entry-room");
        game.update(.1);
        assertTrue(enemy.hp < 10000);
        assertTrue(slot.defense.cooldown > 0);
    }

    @ParameterizedTest
    @ValueSource(strings = {"pistol", "shotgun", "smg", "rifle", "sniper", "ricochet",
            "revolver", "rocket", "railgun", "lmg", "drone"})
    void realSessionStopsShotsAndDamageThenAllowsThemAfterUnlock(String weapon) throws Exception {
        List<String> effects = new ArrayList<>();
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player player, String message) { }
        });
        Player player = game.connectPlayer("locked-room");
        game.setRoomOwner(player);
        if (weapon.equals("drone")) game.handleMessage(player, "JOB:drone");
        game.handleMessage(player, "START");
        game.players.clear(); game.players.add(player);
        player.x = 1020; player.y = 1700;
        if (weapon.equals("drone")) {
            player.weapons.grant("pistol");
            game.handleMessage(player, "EQUIP_BUILD:drone");
            game.handleMessage(player, "DRONE_LAUNCH:pistol");
            assertTrue(player.drone.active && player.drone.controlled);
        }
        else {
            player.weapons.grant(weapon);
            player.equipWeapon(weapon);
        }
        var enemy = new Enemy(1, "grunt", GameMap.SPAWN_POINTS.get(0), 10000, 0, 0, 100);
        enemy.x = 1020; enemy.y = 1620;
        game.enemies.add(enemy);
        for (boolean unlocked : new boolean[]{false, true}) {
            if (unlocked) game.unlockedAreas.add("entry-room");
            effects.clear(); player.cooldown = 0;
            if (player.drone != null) player.drone.cooldown = 0;
            int ammo = player.weapons.ammo(player.weapon);
            game.handleMessage(player, "FIRE:1020:1620:1");
            if (weapon.equals("railgun")) {
                game.update(.1);
                game.update(1.3);
                JsonNode state = json.readTree(SnapshotBuilder.build(game));
                double range = state.path("players").get(0).path("railgunRange").asDouble();
                assertTrue(unlocked ? range > 20 : range <= 20);
            }
            game.handleMessage(player, "FIRE:1020:1620:0");
            if (WeaponCatalog.capacity(player.weapon) > 0 && !weapon.equals("drone"))
                assertEquals(ammo - 1, player.weapons.ammo(player.weapon));
            assertTrue(player.cooldown > 0 || player.drone != null || weapon.equals("railgun"));
            if (unlocked) assertTrue(enemy.hp < 10000, weapon);
            else {
                assertEquals(10000, enemy.hp, weapon);
                for (String message : effects) {
                    JsonNode effect = json.readTree(message);
                    if (effect.path("effect").asText().equals("hit") && effect.path("enemyId").isNull())
                        assertTrue(effect.path("y").asDouble() >= 1680, message);
                }
            }
        }
    }
}
