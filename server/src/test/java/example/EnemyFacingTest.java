package example;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class EnemyFacingTest {
    GameSession game = new GameSession(new GameEventSink() {
        public void broadcast(String message) { }
        public void send(Player player, String message) { }
    });

    @Test void everyEnemyPublishesNormalizedFacingAndRetainsDirectionAtRest() throws Exception {
        int id=20000;
        for (String type : GameSession.DEBUG_ENEMY_TYPES) {
            Enemy enemy=new Enemy(id++,type,GameMap.SPAWN_POINTS.get(0),100,20,10,5);
            enemy.faceToward(enemy.x+30,enemy.y-40);
            assertEquals(.6,enemy.facingX,1e-9,type);
            assertEquals(-.8,enemy.facingY,1e-9,type);
            enemy.faceToward(enemy.x,enemy.y);
            game.enemies.add(enemy);
        }
        var snapshot=new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("enemies");
        assertEquals(GameSession.DEBUG_ENEMY_TYPES.size(),snapshot.size());
        for (var enemy : snapshot) {
            assertTrue(enemy.path("facingX").isNumber(),enemy.path("type").asText());
            assertTrue(enemy.path("facingY").isNumber(),enemy.path("type").asText());
            assertEquals(.6,enemy.path("facingX").asDouble(),1e-9);
            assertEquals(-.8,enemy.path("facingY").asDouble(),1e-9);
        }
    }

    @Test void ordinaryEnemyFacesMovementAndMeleeAndFrozenFacingDoesNotChange() throws Exception {
        Enemy enemy=new Enemy(23000,"grunt",GameMap.SPAWN_POINTS.get(0),100,20,10,5);
        enemy.x=1020;enemy.y=1900;game.enemies.add(enemy);
        var move=GameSession.class.getDeclaredMethod("moveEnemyDirect",Enemy.class,double.class,double.class,double.class);
        move.setAccessible(true);move.invoke(game,enemy,1020.,1940.,1.);
        assertEquals(0,enemy.facingX,1e-9);assertEquals(1,enemy.facingY,1e-9);
        var slot=new TrapSlot("facing-test","free",enemy.x-20,enemy.y,null);slot.defense=new Defense("block");
        var attack=GameSession.class.getDeclaredMethod("attackDefense",Enemy.class,TrapSlot.class);
        attack.setAccessible(true);attack.invoke(game,enemy,slot);
        assertEquals(-1,enemy.facingX,1e-9);assertEquals(0,enemy.facingY,1e-9);
        enemy.frozenRemaining=1;move.invoke(game,enemy,1020.,1940.,1.);
        assertEquals(-1,enemy.facingX,1e-9);
        var snapshot=new ObjectMapper().readTree(SnapshotBuilder.build(game)).path("enemies").get(0);
        assertEquals(-1,snapshot.path("facingX").asDouble(),1e-9);
    }
}
