package example;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class EnemyWaveRulesTest {
    @Test void everyIntroductionIsReachableAndEarlierRoundsExcludeIt() {
        for (var entry : EnemyWaveRules.SPECIALS) {
            for (int round : new int[]{entry.firstRound()-1,entry.firstRound(),50}) {
                var seen = new HashSet<String>();
                for (int i=0;i<10000;i++) seen.add(EnemyWaveRules.select(round,"grunt",(i+.5)/10000,true,true));
                assertEquals(round >= entry.firstRound(),seen.contains(entry.type()),entry.type()+" R"+round);
                assertTrue(seen.contains("grunt"));
            }
        }
    }
    @Test void waveBudgetsHaveOneBossAndKeepSpecialSchedules() {
        for (int round=1;round<=50;round++) {
            assertTrue(EnemyWaveRules.regularCount(round)>0);
            assertEquals(round%4==0 || Set.of(25,35,45).contains(round) ? 1 : 0,EnemyWaveRules.bossCount(round));
        }
        assertEquals(141,EnemyWaveRules.regularCount(40)); assertEquals(274,EnemyWaveRules.regularCount(50));
    }
    @Test void activeCapsInTheSessionRecoverAfterEnemiesAreDefeated() throws Exception {
        var game = new GameSession(new GameEventSink() { public void broadcast(String s) {} public void send(Player p,String s) {} });
        game.round = 50;
        var spawn = GameSession.class.getDeclaredMethod("spawnEnemy",String.class,SpawnPoint.class); spawn.setAccessible(true);
        var select = GameSession.class.getDeclaredMethod("selectEnemyType",SpawnPoint.class); select.setAccessible(true);
        for (String type : List.of("blackout","carrier")) for (int i=0;i<2;i++) spawn.invoke(game,type,GameMap.SPAWN_POINTS.get(0));
        for (int i=0;i<2000;i++) assertFalse(Set.of("blackout","carrier").contains(select.invoke(game,GameMap.SPAWN_POINTS.get(0))));
        game.enemies.forEach(e -> e.hp = 0); var seen = new HashSet<String>();
        for (int i=0;i<5000;i++) seen.add((String)select.invoke(game,GameMap.SPAWN_POINTS.get(0)));
        assertTrue(seen.containsAll(List.of("blackout","carrier")));
    }

    @Test void bossHealthApproachesWardenAndEscalatesAcrossTiers() throws Exception {
        var game = new GameSession(new GameEventSink() { public void broadcast(String s) {} public void send(Player p,String s) {} });
        var spawn = GameSession.class.getDeclaredMethod("spawnEnemy",String.class,SpawnPoint.class); spawn.setAccessible(true);
        game.round = 40;
        for (String type : List.of("boss","warden","warlord","titan")) spawn.invoke(game,type,GameMap.SPAWN_POINTS.get(0));
        assertEquals(37400,game.enemies.get(0).maxHp); assertEquals(46800,game.enemies.get(1).maxHp);
        assertEquals(46800,game.enemies.get(2).maxHp); assertEquals(56200,game.enemies.get(3).maxHp);
    }

    @Test void saturatedUtilityEnemyCapsRemoveThemFromTheLotteryAndKeepBaseEnemies() {
        var counts = new HashMap<String,Integer>();
        for (int i=0;i<10000;i++) counts.merge(EnemyWaveRules.select(50,"grunt",(i+.5)/10000,false,false),1,Integer::sum);
        assertFalse(counts.containsKey("blackout")); assertFalse(counts.containsKey("carrier"));
        assertTrue(counts.get("grunt")+counts.get("runner")+counts.get("brute")>4000);
        assertEquals(counts.get("hunter"),counts.get("ghost"),1);
    }
}
