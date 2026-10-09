package example;

import java.util.Comparator;
import java.util.List;
import java.util.function.Predicate;

/** MAX ultimate targeting uses weapon reach and visibility, shared by every shooter. */
final class AutoAimRules {
    static Enemy target(int level, double x, double y, double aimX, double aimY, double range,
            List<Enemy> enemies, Predicate<Enemy> visible) {
        if (!UpgradeRules.autoAim(level)) return null;
        return enemies.stream().filter(enemy -> enemy.hp > 0
                && Math.hypot(enemy.x - x, enemy.y - y) <= range && visible.test(enemy))
                .min(Comparator.comparingDouble((Enemy enemy) -> Math.hypot(enemy.x - aimX, enemy.y - aimY))
                        .thenComparingDouble(enemy -> Math.hypot(enemy.x - x, enemy.y - y))
                        .thenComparingInt(enemy -> enemy.id))
                .orElse(null);
    }
    private AutoAimRules() { }
}
