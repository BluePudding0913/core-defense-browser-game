package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.*;
import com.fasterxml.jackson.databind.ObjectMapper;

class DebugEnemyPreviewTest {
    GameSession game; Player host;
    static final Set<String> ALL = Set.of("grunt","runner","brute","shield","hunter","ghost","armored",
            "siege","champion","tiny","bomber","artillery","gilded","blueAce","carrier","blackout",
            "seeker","boss","warlord","titan","warden","explosionBoss");
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String s) {}
            public void send(Player p,String s) {}
        });
        host=game.connectPlayer("enemy-preview");game.setRoomOwner(host);game.handleMessage(host,"START:DEBUG");
    }
    void begin(int round) throws Exception {
        game.enemies.clear();game.round=round-1;
        var method=GameSession.class.getDeclaredMethod("beginRound");method.setAccessible(true);method.invoke(game);
    }
    void spawn(double dt) throws Exception {
        var method=GameSession.class.getDeclaredMethod("updateSpawning",double.class);method.setAccessible(true);method.invoke(game,dt);
    }
    @Test void debugRoundFiveSpawnsEveryTypeExactlyOnceAndCountsPendingEnemies() throws Exception {
        begin(5);assertEquals(500000,host.credits);
        assertEquals(22,game.queuedEnemies);assertEquals(22,game.roundEnemyTotal);
        assertEquals(0,game.queuedBosses);assertEquals(0,game.queuedBlueEnemies);assertEquals(0,game.queuedTinyEnemies);
        assertEquals("none",game.roundEvent);assertNull(game.failedSpawnId);
        var json=new ObjectMapper();assertEquals(22,json.readTree(SnapshotBuilder.build(game)).path("queued").asInt());
        spawn(.5);assertTrue(game.enemies.isEmpty());spawn(.5);assertEquals(1,game.enemies.size());
        for(int i=0;i<21;i++)spawn(.5);
        assertEquals(22,game.enemies.size());assertEquals(0,game.queuedEnemies);
        assertEquals(ALL,new HashSet<>(game.enemies.stream().map(e->e.type).toList()));
        assertTrue(game.enemies.stream().allMatch(e->e.hp>0&&e.maxHp==e.hp));
        assertEquals(1,game.enemies.stream().filter(e->e.type.equals("warden")).count());
        assertEquals(1,game.enemies.stream().filter(e->e.type.equals("explosionBoss")).count());
        assertEquals(0,json.readTree(SnapshotBuilder.build(game)).path("queued").asInt());
        spawn(100);assertEquals(22,game.enemies.size(),"No repeated preview or random additions");
    }
    @Test void otherDebugRoundsAndNormalRestartKeepTheirUsualPopulations() throws Exception {
        begin(6);assertNotEquals(22,game.roundEnemyTotal);
        game.phase=GamePhase.LOST;game.handleMessage(host,"START");assertEquals(0,host.credits);
        begin(5);assertEquals(0,game.queuedBosses);assertEquals("door_failure",game.roundEvent);
        for(int i=0;i<100;i++)spawn(2);
        assertTrue(game.enemies.stream().noneMatch(e->Set.of("warden","explosionBoss","blackout","seeker","blueAce").contains(e.type)));
    }
}

