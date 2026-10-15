package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

class DefenseSpatialIndexTest {
    @Test void rangeQueriesMatchFullListAfterMovementAndThresholdChanges() {
        EnemySpatialIndex index = new EnemySpatialIndex();
        Random random = new Random(7281);
        for (int count : new int[]{32, 65, 512}) {
            index.clear();
            for (int i = 0; i < count; i++) index.add(EnemySpatialIndexTest.enemy(i, i % 3 == 0 ? "carrier" : "grunt", random.nextDouble()*2080, random.nextDouble()*2080));
            for (int q = 0; q < 300; q++) {
                if (q % 5 == 0) index.get(random.nextInt(count)).moveTo(random.nextDouble()*2080, random.nextDouble()*2080);
                double x = random.nextDouble()*2080, y = random.nextDouble()*2080, radius = q % 4 == 0 ? 0 : 58 + random.nextDouble()*450;
                var expected = index.stream().filter(e -> Math.hypot(e.x-x, e.y-y) <= radius).toList();
                var actual = index.nearbyCandidates(x,y,radius).stream().filter(e -> Math.hypot(e.x-x, e.y-y) <= radius).toList();
                assertEquals(expected, actual);
                var candidates = index.nearbyCandidates(x,y,radius);
                for (int i = 1; i < candidates.size(); i++) assertTrue(index.orderOf(candidates.get(i-1)) < index.orderOf(candidates.get(i)));
            }
            while (index.size() > 32) index.remove(index.size()-1);
            assertSame(index, index.nearbyCandidates(1000,1000,120), "Small groups avoid allocating/maintaining a range index");
        }
    }

    @Test void indexedDefensesPreserveDamageConsumptionSlowingAndEventOrder() throws Exception {
        List<String> reference = run(false), indexed = run(true);
        assertEquals(reference,indexed);
    }

    private List<String> run(boolean large) throws Exception {
        List<String> result = new ArrayList<>();
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { result.add(message); }
            public void send(Player player, String message) { }
        });
        game.trapSlots.clear();
        // Deliberately reverse cell order so target/event order cannot follow buckets.
        for (int offset : new int[]{100,30,-30,130}) game.enemies.add(EnemySpatialIndexTest.enemy(offset,"grunt",1020+offset,1900));
        if (large) for (int i=0;i<100;i++) game.enemies.add(EnemySpatialIndexTest.enemy(1000+i,"grunt",100+i,100));
        for (String type : List.of("wire","turret","mine")) {
            var slot = new TrapSlot(type,"free",1020,1900,null);slot.defense=new Defense(type);game.trapSlots.add(slot);
        }
        Method update=GameSession.class.getDeclaredMethod("updateDefenses",double.class);update.setAccessible(true);
        update.invoke(game,.05);
        for(int i=0;i<4;i++) { Enemy e=game.enemies.get(i); result.add(e.id+":"+e.hp+":"+e.slow); }
        for(var slot:game.trapSlots)result.add(slot.id+":"+(slot.defense==null?"consumed":slot.defense.hp+":"+slot.defense.cooldown));
        assertNull(game.trapSlots.get(2).defense);assertEquals(.48,game.enemies.get(1).slow);
        return result;
    }
}
