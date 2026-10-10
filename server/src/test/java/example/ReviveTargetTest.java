package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import org.junit.jupiter.api.Test;

class ReviveTargetTest extends JobsTest {
    Player downed(int id, double x, double y) {
        Player ally = new Player(id); ally.x = x; ally.y = y; ally.down = true; ally.hp = 0;
        return ally;
    }
    @Test void targetStaysSelectedWhenDistancesChangeButInvalidTargetsAreReplaced() {
        Player rescuer = new Player(0);
        Player first = downed(1, 30, 0), second = downed(2, 40, 0);
        List<Player> allies = List.of(rescuer, first, second);
        assertSame(first, JobRules.reviveTarget(rescuer, allies, p -> true));
        rescuer.actionTarget = first.id; second.x = 20; first.x = 50;
        assertSame(first, JobRules.reviveTarget(rescuer, allies, p -> true));
        rescuer.x = 5;
        assertSame(first, JobRules.reviveTarget(rescuer, allies, p -> true));
        assertSame(second, JobRules.reviveTarget(rescuer, allies, p -> p != first));
        first.x = 84;
        assertSame(second, JobRules.reviveTarget(rescuer, allies, p -> true));
        first.x = 30; first.down = false;
        assertSame(second, JobRules.reviveTarget(rescuer, allies, p -> true));
        rescuer.down = true;
        assertNull(JobRules.reviveTarget(rescuer, allies, p -> true));
    }
    @Test void movingAlliesDoNotResetGaugeAndBothCanBeRevivedInSequence() throws Exception {
        start("healer"); game.players.clear(); game.players.add(player);
        Player first = downed(11, player.x + 30, player.y), second = downed(12, player.x + 40, player.y);
        game.players.addAll(List.of(first, second));
        call("updateRevives", new Class<?>[]{double.class}, .75);
        second.x = player.x + 20; first.x += 10; player.x += 1;
        call("updateRevives", new Class<?>[]{double.class}, .75);
        assertEquals(first.id, player.actionTarget); assertEquals(1.5, player.actionProgress);
        call("updateRevives", new Class<?>[]{double.class}, .5);
        assertFalse(first.down); assertTrue(second.down); assertEquals(45, first.hp);
        assertNull(player.actionTarget); assertEquals(0, player.actionProgress);
        call("updateRevives", new Class<?>[]{double.class}, .5);
        second.x += 1;
        call("updateRevives", new Class<?>[]{double.class}, 1.5);
        assertFalse(second.down); assertEquals(45, second.hp);
    }
    @Test void leavingRangeResetsProgressForTheNewTarget() throws Exception {
        start("healer"); game.players.clear(); game.players.add(player);
        Player first = downed(11, player.x + 30, player.y), second = downed(12, player.x + 40, player.y);
        game.players.addAll(List.of(first, second));
        call("updateRevives", new Class<?>[]{double.class}, 1.5);
        first.x = player.x + 79;
        call("updateRevives", new Class<?>[]{double.class}, .25);
        assertEquals(second.id, player.actionTarget); assertEquals(.25, player.actionProgress);
        assertTrue(first.down); assertTrue(second.down);
    }
}
