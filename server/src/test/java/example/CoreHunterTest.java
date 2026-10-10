package example;
import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;
class CoreHunterTest {
    @Test void ignoresTankDroneDecoyAndNearbyTurretButMovesToAndDamagesCore() throws Exception {
        var game = new GameSession(new GameEventSink() { public void broadcast(String s) {} public void send(Player p,String s) {} });
        var player = game.connectPlayer("core-hunter"); game.setRoomOwner(player);
        game.handleMessage(player, "START"); game.phase = GamePhase.WAVE;
        game.enemies.clear(); game.trapSlots.clear(); game.players.clear(); game.players.add(player);
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.job = "tank"; player.x = 1020; player.y = 1900;
        player.drone = new Drone(); player.drone.active = true;
        player.drone.x = 1020; player.drone.y = 1900; player.drone.attackers.add(100);
        var decoy = new Decoy(player, new MapPoint(1,0)); game.decoys.add(decoy);
        game.coreX = 1180; game.coreY = 1900; game.coreShield = 0;
        var turret = new TrapSlot("nearby-turret", "north", 1020, 1940, "core-room");
        turret.defense = new Defense("turret"); game.trapSlots.add(turret);
        var hunter = new Enemy(100, "coreHunter", GameMap.SPAWN_POINTS.get(0), 1000, 60, 30, 40);
        hunter.x = 1040; hunter.y = 1900; game.enemies.add(hunter);
        var update = GameSession.class.getDeclaredMethod("updateEnemies", double.class); update.setAccessible(true);
        update.invoke(game, .1);
        assertTrue(hunter.x > 1040); assertNull(hunter.visiblePlayer);
        assertEquals(100, player.hp); assertEquals(DroneRules.HP, player.drone.hp);
        assertEquals(DecoyRules.HP, decoy.hp); assertEquals(turret.defense.maxHp, turret.defense.hp);
        hunter.x = 1130; hunter.y = 1900; hunter.attackCooldown = 0;
        double hp = game.coreHp; update.invoke(game, .1);
        assertEquals(hp - 30, game.coreHp); assertEquals(100, player.hp);
    }
    @Test void normalAndDebugSpawnsUseCoreHunterStatsAndIntroduction() throws Exception {
        var game = new GameSession(new GameEventSink() { public void broadcast(String s) {} public void send(Player p,String s) {} });
        game.round = 10;
        var spawn = GameSession.class.getDeclaredMethod("spawnEnemy", String.class, SpawnPoint.class); spawn.setAccessible(true);
        spawn.invoke(game, "coreHunter", GameMap.SPAWN_POINTS.get(0));
        var hunter = game.enemies.get(0);
        assertEquals(360, hunter.maxHp); assertEquals(28, hunter.damage); assertEquals("core", hunter.targetPriority);
        assertTrue(GameSession.DEBUG_ENEMY_TYPES.contains("coreHunter"));
        var entry = EnemyWaveRules.SPECIALS.stream().filter(e -> e.type().equals("coreHunter")).findFirst().orElseThrow();
        assertEquals(0, EnemyWaveRules.weight(entry,9,true,true));
        assertEquals(6, EnemyWaveRules.weight(entry,10,true,true));
    }
}
