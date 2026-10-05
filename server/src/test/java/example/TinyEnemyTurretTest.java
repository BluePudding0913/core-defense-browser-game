package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TinyEnemyTurretTest {
    GameSession game;
    Method update;
    Random random;
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
        var field = GameSession.class.getDeclaredField("random");
        field.setAccessible(true);
        random = (Random) field.get(game);
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

    @Test void tinyEnemyHitRatesMatchEachTierAndMissesConsumeCooldown() throws Exception {
        String[] types = {"turret", "copperTurret", "silverTurret"};
        double[] chances = {.2, .3, .4};
        double[] damages = {37, 74, 129.5};
        var mapper = new ObjectMapper();
        for (int tier = 0; tier < types.length; tier++) {
            TrapSlot slot = turret(types[tier]);
            random.setSeed(20261006L);
            Random expectedRolls = new Random(20261006L);
            int hits = 0, misses = 0;
            for (int shot = 0; shot < 200; shot++) {
                Enemy enemy = target("tiny");
                slot.defense.cooldown = 0;
                effects.clear();
                boolean hit = expectedRolls.nextDouble() < chances[tier];
                update.invoke(game, .05);
                assertEquals(hit ? damages[tier] : 0, enemy.maxHp - enemy.hp, 1e-9, types[tier]);
                assertEquals(tier == 2 ? .45 : .7, slot.defense.cooldown, 1e-9);
                assertEquals(1, effects.size());
                var effect = mapper.readTree(effects.get(0));
                assertEquals(hit ? damages[tier] : 0, effect.path("damage").asDouble(), 1e-9);
                assertEquals(hit ? enemy.y : enemy.y + 16, effect.path("y").asDouble(), 1e-9);
                assertFalse(effect.path("defeated").asBoolean());
                double hp = enemy.hp;
                update.invoke(game, .05);
                assertEquals(hp, enemy.hp, "No immediate retry after a miss or hit");
                assertEquals(1, effects.size());
                if (hit) hits++; else misses++;
            }
            assertTrue(hits > 0 && misses > 0, types[tier]);
        }
    }

    @Test void otherEnemyTypesStillAlwaysTakeTurretDamage() throws Exception {
        for (String turretType : List.of("turret", "copperTurret", "silverTurret")) {
            TrapSlot slot = turret(turretType);
            for (String enemyType : List.of("grunt", "runner", "brute", "armored", "hunter",
                    "siege", "champion", "boss", "warlord", "titan")) {
                random.setSeed(20261006L);
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
