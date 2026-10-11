package example;
import java.util.function.DoubleSupplier;
/** Keeps geometry, damage and timing fixtures separate from the shot-distribution tests. */
final class CombatTestRandom {
    static void use(GameSession game, DoubleSupplier random) {
        try { var field=CombatSystem.class.getDeclaredField("random");field.setAccessible(true);field.set(game.combat,random); }
        catch(ReflectiveOperationException e){throw new AssertionError(e);}
    }
    static void center(GameSession game){use(game,()->0);}
}
