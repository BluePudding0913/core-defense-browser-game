package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TinyEnemyTurretTest {
    GameSession game;
    Method update;
    final List<String> effects = new ArrayList<>();

    @BeforeEach void setup() throws Exception {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player player, String message) { }
        });
        game.round = 40;
        game.trapSlots.clear();
        update = GameSession.class.getDeclaredMethod("updateDefenses", double.class);
        update.setAccessible(true);
    }

    Enemy target(String type) {
        game.enemies.clear();
        Enemy enemy = new Enemy(1, type, GameMap.SPAWN_POINTS.get(0), 10000, 0, 0, 0);
        enemy.x = 1140; enemy.y = 1900;
        game.enemies.add(enemy);
        return enemy;
    }

    TrapSlot turret(String type) {
        game.trapSlots.clear();
        TrapSlot slot = new TrapSlot("accuracy-test", "free", 1020, 1900, null);
        slot.defense = new Defense(type);
        game.trapSlots.add(slot);
        return slot;
    }

    @Test void tinyIsImmuneToEveryTurretAndMissesSpendHpAndCooldown() throws Exception {
        var mapper = new ObjectMapper();
        for (String type : List.of("turret", "copperTurret", "silverTurret", "overclockSilver")) {
            TrapSlot slot = turret(type);
            Enemy enemy = target("tiny");
            double initialHp = slot.defense.hp;
            effects.clear();
            update.invoke(game, .05);
            assertEquals(enemy.maxHp, enemy.hp, type);
            assertEquals(initialHp - 4, slot.defense.hp, 1e-9, type);
            assertEquals(type.equals("overclockSilver") ? .15 : type.equals("silverTurret") ? .45 : .7,
                    slot.defense.cooldown, 1e-9);
            assertEquals(1, effects.size());
            var effect = mapper.readTree(effects.get(0));
            assertEquals(0, effect.path("damage").asDouble());
            assertEquals(enemy.y + 16, effect.path("y").asDouble(), 1e-9);
            assertFalse(effect.path("defeated").asBoolean());
            update.invoke(game, .05);
            assertEquals(enemy.maxHp, enemy.hp);
            assertEquals(initialHp - 4, slot.defense.hp, 1e-9, "Cooldown must prevent HP consumption");
            assertEquals(1, effects.size());
        }
    }

    @Test void finalShotDealsDamageThenDestroysTurret() throws Exception {
        for (String type : List.of("turret", "copperTurret", "silverTurret", "overclockSilver")) {
            for (double remainingHp : List.of(1.0, 4.0)) {
                TrapSlot slot = turret(type);
                slot.defense.hp = remainingHp;
                Enemy enemy = target("grunt");
                effects.clear();
                update.invoke(game, .05);
                assertTrue(enemy.hp < enemy.maxHp, type);
                assertNull(slot.defense, "Final shot must remove the exhausted turret");
                double hp = enemy.hp;
                update.invoke(game, 1.0);
                assertEquals(hp, enemy.hp);
                assertEquals(1, effects.stream().filter(e -> e.contains("\"weapon\":\"turret\"")).count());
            }
        }
    }

    @Test void noTargetOrOutOfRangeCostsNoHp() throws Exception {
        TrapSlot slot = turret("turret");
        double hp = slot.defense.hp;
        update.invoke(game, .05);
        assertEquals(hp, slot.defense.hp);
        Enemy enemy = target("grunt");
        enemy.x = slot.x + 301;
        update.invoke(game, .05);
        assertEquals(hp, slot.defense.hp);
        assertEquals(enemy.maxHp, enemy.hp);
    }

    @Test void tinyStillTakesMineDamage() throws Exception {
        TrapSlot slot = turret("mine");
        Enemy enemy = target("tiny");
        enemy.x = slot.x + 20;
        update.invoke(game, .05);
        assertEquals(450, enemy.maxHp - enemy.hp, 1e-9);
        assertNull(slot.defense);
    }

    @Test void tinySpawnsWithTwentyFivePercentMoreHp() throws Exception {
        Method spawn = GameSession.class.getDeclaredMethod("spawnEnemy", String.class, SpawnPoint.class);
        spawn.setAccessible(true);
        spawn.invoke(game, "tiny", GameMap.SPAWN_POINTS.get(0));
        Enemy enemy = game.enemies.get(game.enemies.size() - 1);
        assertEquals(250, enemy.maxHp, 1e-9);
        assertEquals(enemy.maxHp, enemy.hp);
    }

    @Test void otherEnemyTypesStillAlwaysTakeTurretDamage() throws Exception {
        for (String turretType : List.of("turret", "copperTurret", "silverTurret", "overclockSilver")) {
            TrapSlot slot = turret(turretType);
            slot.defense.hp = 10000;
            for (String enemyType : List.of("grunt", "runner", "brute", "armored", "hunter", "ghost",
                    "siege", "champion", "boss", "warlord", "titan")) {
                for (int shot = 0; shot < 20; shot++) {
                    Enemy enemy = target(enemyType);
                    slot.defense.cooldown = 0;
                    update.invoke(game, .05);
                    assertTrue(enemy.hp < enemy.maxHp, turretType + " against " + enemyType);
                }
            }
        }
    }
}
