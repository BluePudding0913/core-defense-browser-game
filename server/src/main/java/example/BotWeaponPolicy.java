package example;

/** CPU decisions use the same ownership, ammo, cooldown and weapon definitions as people. */
final class BotWeaponPolicy {
    static void select(Player bot, double distance) {
        select(bot, distance, Double.POSITIVE_INFINITY, 1);
    }
    static void select(Player bot, double distance, double targetHp, int nearbyEnemies) {
        if (bot.railgunCharge > 0 || bot.railgunRemaining > 0) return;
        var choices = WeaponCatalog.ALL.stream().filter(weapon -> available(bot, weapon))
                .filter(weapon -> !bot.job.equals("attacker") || !weapon.id().equals(bot.secondaryWeapon)).toList();
        boolean inRange = choices.stream().anyMatch(weapon -> distance <= weapon.stats().range() - 8);
        var selected = choices.stream().max(java.util.Comparator.comparingDouble(weapon -> {
            if (inRange && distance > weapon.stats().range() - 8) return -1_000_000.0;
            return score(bot, weapon, distance, targetHp, nearbyEnemies);
        })).orElse(WeaponCatalog.find("bat"));
        bot.equipWeapon(selected.id()); bot.selectedBuild = null;
    }
    private static boolean available(Player bot, WeaponCatalog.Definition weapon) {
        return weapon.stats().damage() > 0 && bot.weapons.owns(weapon.id()) && (!weapon.usesAmmo() || bot.weapons.ammo(weapon.id()) > 0)
                && !DroneRules.mounted(bot, weapon.id());
    }
    private static double score(Player bot, WeaponCatalog.Definition weapon, double distance, double hp, int count) {
        var stats = weapon.stats();
        double pellets = weapon.mode() == WeaponCatalog.AttackMode.SPREAD ? (distance < 150 ? 3 : 1.5) : 1;
        double targets = switch (weapon.mode()) {
            case FLAME, ROCKET, BEAM, GAS -> Math.min(4, Math.max(1, count));
            default -> weapon.piercing() ? Math.min(3, Math.max(1, count)) : 1;
        };
        double cycle = stats.cooldown() + (weapon.mode() == WeaponCatalog.AttackMode.BEAM ? GameConfig.RAILGUN_CHARGE : 0);
        double score = Math.min(hp, stats.damage() * pellets) * targets / Math.max(.15, cycle);
        if (weapon.mode() == WeaponCatalog.AttackMode.MELEE)
            score += bot.hp >= JobRules.maxHp(bot.job) * .7 && distance <= 72 ? 60 : -100;
        // Conserve heavy ammunition against isolated targets ordinary guns can finish.
        if ((weapon.mode() == WeaponCatalog.AttackMode.ROCKET || weapon.mode() == WeaponCatalog.AttackMode.BEAM)
                && hp < stats.damage() * .2 && count < 2) score *= .25;
        double cooldown = bot.weapon.equals(weapon.id()) ? bot.cooldown : bot.weaponCooldowns.getOrDefault(weapon.id(), 0.0);
        score /= 1 + cooldown * 2;
        return score / (1 + Math.max(0, distance - stats.range() + 8) / 50);
    }
    static double preferredRange(String weapon) {
        return switch (weapon) {
            case "bat" -> 54;
            case "shotgun" -> 135;
            case "sniper", "railgun" -> 650;
            case "rocket" -> 500;
            default -> WeaponCatalog.stats(weapon).range() * .72;
        };
    }
    static boolean hasRangedAmmo(Player bot) {
        return WeaponCatalog.ALL.stream().filter(WeaponCatalog.Definition::usesAmmo).anyMatch(weapon -> available(bot, weapon));
    }
    static boolean worthwhileUpgrade(Player bot, String item) {
        var candidate = WeaponCatalog.find(item);
        if (candidate == null || bot.weapons.owns(item) || !bot.weapons.canAcquire(item)) return false;
        var current = WeaponCatalog.ALL.stream().filter(WeaponCatalog.Definition::usesAmmo)
                .filter(weapon -> available(bot, weapon)).toList();
        if (current.isEmpty()) return true;
        double dps = current.stream().mapToDouble(weapon -> weapon.stats().damage() / weapon.stats().cooldown()).max().orElse(0);
        double range = current.stream().mapToDouble(weapon -> weapon.stats().range()).max().orElse(0);
        return candidate.stats().damage() / candidate.stats().cooldown() > dps * 1.3 || candidate.stats().range() > range * 1.3;
    }
    private BotWeaponPolicy() { }
}
