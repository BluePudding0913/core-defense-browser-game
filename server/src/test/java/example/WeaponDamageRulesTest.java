package example;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
class WeaponDamageRulesTest {
    @Test void stanceBonusRequiresAnActuallyFixedSniper() {
        assertEquals(350,WeaponDamageRules.atStance("sniper",280,true));
        assertEquals(280,WeaponDamageRules.atStance("sniper",280,false));
        assertEquals(120,WeaponDamageRules.atStance("rifle",120,true));
        assertEquals(525,WeaponDamageRules.atDistance("sniper",WeaponDamageRules.atStance("sniper",280,true),1200));
    }
    @Test void sniperKeepsDistanceDamageScaleWhenReachExtends() {
        assertEquals(280, WeaponCatalog.stats("sniper").damage());
        assertEquals(30, WeaponCatalog.capacity("sniper"));
        assertEquals(280, WeaponDamageRules.atDistance("sniper", 280, 0));
        assertEquals(420, WeaponDamageRules.atDistance("sniper", 280, 1200));
        assertEquals(560, WeaponDamageRules.atDistance("sniper", 280, 2400));
        assertEquals(560, WeaponDamageRules.atDistance("sniper", 280, 3000));
        assertEquals(560, WeaponDamageRules.atDistance("sniper", 280, WeaponCatalog.stats("sniper").range()));
        assertEquals(18, WeaponDamageRules.atDistance("smg", 18, 2400));
    }
    @Test void piercingSniperAppliesDistanceBonusToEachEnemyAndConsumesOneRound() {
        var game = new GameSession(new GameEventSink() {
            public void broadcast(String s) {} public void send(Player p, String s) {}
        });
        CombatTestRandom.center(game);
        var player = game.connectPlayer("distance-test"); game.setRoomOwner(player);
        game.handleMessage(player, "START"); game.phase = GamePhase.WAVE;
        game.enemies.clear(); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.x = 1020; player.y = 1900;
        player.weapons.grant("sniper"); player.equipWeapon("sniper");
        var near = new Enemy(100, "grunt", GameMap.SPAWN_POINTS.get(0), 10000, 0, 0, 0);
        var far = new Enemy(101, "grunt", GameMap.SPAWN_POINTS.get(0), 10000, 0, 0, 0);
        near.x = 1070; near.y = 1900; far.x = 1170; far.y = 1900;
        game.enemies.add(near); game.enemies.add(far);
        game.combat.attackAt(player, 1220, 1900);
        assertEquals(29, player.weapons.ammo("sniper"));
        assertTrue(near.hp < 10000); assertTrue(far.hp < near.hp);
        assertEquals((10000 - near.hp) * (1 + 150.0 / 2400) / (1 + 50.0 / 2400),
                10000 - far.hp, 1e-6);
    }
    @Test void lmgHasHigherShotDamageAndSustainedDamageThanSmg() {
        var lmg = WeaponCatalog.stats("lmg"); var smg = WeaponCatalog.stats("smg");
        assertTrue(lmg.damage() > smg.damage());
        assertTrue(lmg.damage() / lmg.cooldown() > smg.damage() / smg.cooldown());
    }
}
