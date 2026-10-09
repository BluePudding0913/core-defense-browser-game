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
}
