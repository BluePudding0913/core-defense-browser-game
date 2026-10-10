package example;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.*;
import com.fasterxml.jackson.databind.ObjectMapper;

class BossAbilitySystemTest {
    GameSession game; Player player;
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() { public void broadcast(String s) {} public void send(Player p,String s) {} });
        player = game.connectPlayer("boss-skills"); game.players.clear(); game.players.add(player); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.phase = GamePhase.WAVE; game.round = 40;
        player.x = 1220; player.y = 1900; player.hp = 100;
        game.coreX = 980; game.coreY = 1980;
    }
    Enemy boss(String type) {
        Enemy e = new Enemy(9900,type,GameMap.SPAWN_POINTS.get(0),10000,22,type.equals("titan")?90:68,100);
        e.x = 1020; e.y = 1900; e.specialCooldown = 0; game.enemies.add(e); return e;
    }
    void update(double dt) throws Exception {
        var method = GameSession.class.getDeclaredMethod("updateEnemies",double.class); method.setAccessible(true); method.invoke(game,dt);
    }
    @Test void warlordSalvoWarnsAtThreeFixedLocationsAndUsesOrdinaryBlastDamage() throws Exception {
        Enemy boss = boss("warlord"); update(.05);
        assertEquals(3,game.artilleryShells.size()); assertEquals(100,player.hp);
        assertTrue(game.artilleryShells.stream().allMatch(s -> s.enemyId == boss.id && s.remaining == 1.5));
        assertEquals(3,game.artilleryShells.stream().map(s -> s.y).distinct().count());
        player.x = 1280; update(.5);
        assertTrue(game.artilleryShells.stream().allMatch(s -> s.x == 1220), "salvo does not track a dodging player");
        player.x = 1220; update(1);
        assertTrue(game.artilleryShells.isEmpty()); assertEquals(49,player.hp,1e-6);
        assertTrue(boss.specialCooldown > 0);
    }
    @Test void pointBlankSalvoStillSpreadsInsteadOfStackingThreeHits() throws Exception {
        Enemy boss = boss("warlord"); player.x = boss.x; player.y = boss.y; update(.05);
        assertEquals(3,game.artilleryShells.size());
        assertEquals(3,game.artilleryShells.stream().map(shell -> new MapPoint(shell.x,shell.y)).distinct().count());
    }

    @Test void titanWarnsThenHitsPlayersStructuresAndCoreOnlyOnce() throws Exception {
        Enemy boss = boss("titan"); player.x = 1120;
        game.coreX = 1070; game.coreY = 1900; game.coreShield = 100;
        var wall = new TrapSlot("pulse-wall","test",1020,1980,null); wall.defense = new Defense("barricade"); game.trapSlots.add(wall);
        double hp = game.coreHp; update(.05);
        assertEquals(1.5,boss.bossPulseRemaining); assertEquals(100,player.hp);
        var json = new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("enemies").get(0);
        assertEquals("PULSE_WARNING",json.path("bossAction").asText()); assertEquals(200,json.path("pulseRadius").asInt());
        assertEquals(1.5,json.path("actionDuration").asDouble());
        update(1); assertEquals(100,player.hp); update(.5);
        assertEquals(28,player.hp,1e-6); assertEquals(28,game.coreShield,1e-6); assertEquals(hp,game.coreHp);
        assertEquals(1128,wall.defense.hp,1e-6); assertEquals(0,boss.bossPulseRemaining);
        update(.1); assertEquals(28,player.hp,1e-6);
    }
    @Test void titanPulseCanBeDodgedAndDeathCancelsIt() throws Exception {
        Enemy boss = boss("titan"); player.x = 1120; update(.05);
        player.x = 1400; update(1.5); assertEquals(100,player.hp);
        boss.specialCooldown = 0; player.x = boss.x+100; update(.05); assertTrue(boss.bossPulseRemaining > 0);
        boss.hp = 0; update(2); assertEquals(100,player.hp);
    }
    @Test void titanWarningResistsKnockbackAndFreezingPausesItsTimer() throws Exception {
        Enemy boss = boss("titan"); player.x = 1120; update(.05);
        player.weapons.grant("pistol"); player.equipWeapon("pistol");
        game.combat.attackAt(player,boss.x,boss.y); assertTrue(boss.hp < boss.maxHp);
        assertEquals(1020,boss.x); assertEquals(1900,boss.y);
        boss.frozenRemaining = 1; update(.5); update(.5);
        assertEquals(1.5,boss.bossPulseRemaining); assertEquals(100,player.hp);
        update(1.5); assertEquals(28,player.hp,1e-6);
    }
    @Test void cpuEscapesTitanWarningBeforeShooting() throws Exception {
        Enemy boss = boss("titan"); player.x = 1120; update(.05); player.human = false;
        var method = GameSession.class.getDeclaredMethod("updateBots",double.class); method.setAccessible(true); method.invoke(game,.05);
        assertTrue(Math.hypot(player.x+player.moveX*30-boss.x,player.y+player.moveY*30-boss.y)>100);
        assertFalse(player.firing);
    }

    @Test void abilitiesRequireReachableTargetsAndNeverTriggerAfterDeath() throws Exception {
        Enemy boss = boss("warlord"); player.x = 1800; game.coreX = 1800; game.coreY = 1900;
        update(.05); assertTrue(game.artilleryShells.isEmpty());
        boss.hp = 0; player.x = 1120; update(20); assertTrue(game.artilleryShells.isEmpty());
    }

    @Test void generatedBossesWalkFasterExceptExplosionBoss() throws Exception {
        var spawn = GameSession.class.getDeclaredMethod("spawnEnemy", String.class, SpawnPoint.class);
        spawn.setAccessible(true);
        var point = new SpawnPoint("speed-test", "test", 1020, 1900, "west", "balanced", 1, "core", java.util.List.of());
        String[] types = {"boss", "warden", "warlord", "titan", "explosionBoss", "grunt"};
        double[] expected = {24, 33, 31.5, 27, 12, 59};
        for (int n = 0; n < types.length; n++) {
            game.enemies.clear(); spawn.invoke(game, types[n], point);
            assertEquals(expected[n], game.enemies.get(0).speed, 1e-9, types[n]);
        }
    }
    double movement(String type, double hp) throws Exception {
        setup(); player.x = 1300;
        Enemy e = boss(type); e.hp = hp; e.specialCooldown = 100;
        update(.1);
        return Math.hypot(e.x - 1020, e.y - 1900);
    }
    @Test void actualWalkingAcceleratesInBothHpPhases() throws Exception {
        for (String type : new String[]{"titan", "warlord"}) {
            double normal = movement(type, 6001);
            assertTrue(normal > 0);
            assertEquals(normal * 1.2, movement(type, 6000), 1e-6);
            assertEquals(normal * 1.5, movement(type, 3000), 1e-6);
        }
    }
    @Test void contactAttacksUseThePhaseRateAgainstAPlayer() throws Exception {
        for (String type : new String[]{"titan", "warlord"}) {
            for (double hp : new double[]{6001, 6000, 3000}) {
                setup(); Enemy e = boss(type); player.x = e.x + 20;
                e.hp = hp; e.specialCooldown = 100; e.attackCooldown = .9;
                double interval = hp > 6000 ? .9 : hp > 3000 ? .6 : .45;
                update(interval - .01); assertEquals(100, player.hp);
                update(.02); assertEquals(100 - e.damage, player.hp, 1e-6);
            }
        }
    }
    @Test void phaseChangeAcceleratesAlreadyRunningSpecialCooldowns() throws Exception {
        for (String type : new String[]{"titan", "warlord"}) {
            setup(); Enemy e = boss(type); e.specialCooldown = 8;
            update(2); assertEquals(6, e.specialCooldown);
            e.hp = 6000; update(2); assertEquals(3, e.specialCooldown);
            e.hp = 3000; update(1.49); assertTrue(e.specialCooldown > 0);
            assertEquals(0, e.bossPulseRemaining); assertTrue(game.artilleryShells.isEmpty());
            update(.02);
            if (type.equals("titan")) {
                assertEquals(1.5, e.bossPulseRemaining);
                update(1.49); assertTrue(e.bossPulseRemaining > 0);
                update(.02); assertEquals(0, e.bossPulseRemaining); assertEquals(8, e.specialCooldown);
            } else {
                assertEquals(3, game.artilleryShells.size());
                assertTrue(game.artilleryShells.stream().allMatch(shell -> shell.remaining == 1.5));
                assertEquals(8, e.specialCooldown);
            }
        }
    }
    @Test void freezingAndHooksStillPauseEnragedBosses() throws Exception {
        for (String type : new String[]{"titan", "warlord"}) {
            setup(); Enemy e = boss(type); e.hp = 3000; e.specialCooldown = 8;
            e.frozenRemaining = 1; update(.5);
            assertEquals(8, e.specialCooldown); assertEquals(1020, e.x); assertEquals(1900, e.y);
            e.frozenRemaining = 0; e.hookPulled = true; update(.5);
            assertEquals(8, e.specialCooldown); assertEquals(1020, e.x); assertEquals(1900, e.y);
        }
    }
}
