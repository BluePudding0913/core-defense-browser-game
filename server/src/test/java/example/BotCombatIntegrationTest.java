package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class BotCombatIntegrationTest {
    GameSession game;
    Player bot;
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player p, String message) { }
        });
        game.phase = GamePhase.WAVE;
        game.players.forEach(player -> {player.human = true; player.hp = 100;});
        bot = game.players.get(1); bot.human = false;
        bot.x = 1020; bot.y = 1900; bot.credits = 0; bot.botSpendCooldown = 10;
    }
    Enemy enemy(int id, String type, double x, double hp) {
        var enemy = new Enemy(id, type, GameMap.SPAWN_POINTS.get(0), hp, 0, 0, 0);
        enemy.x = x; enemy.y = 1900; game.enemies.add(enemy); return enemy;
    }
    Object invoke(String name, Class<?>[] types, Object... args) throws Exception {
        var method = GameSession.class.getDeclaredMethod(name, types); method.setAccessible(true);
        return method.invoke(game, args);
    }
    void decide() throws Exception {invoke("updateBots", new Class<?>[]{double.class}, .05);}
    @Test void healerUsesTheSharedAbilityForWoundedAlliesWithoutConsumingKits() throws Exception {
        var ally = game.players.get(0); ally.x = 1060; ally.y = 1900; ally.hp = 50;
        bot.job = "healer";
        decide();
        assertEquals(JobRules.HEAL_DURATION, bot.healRemaining);
        assertEquals(JobRules.HEAL_COOLDOWN, bot.jobCooldown);
        assertEquals(0, bot.medkits);
        game.update(.1); assertTrue(ally.hp > 50);
    }
    @Test void attackerFiresBothWeaponsAndStopsAfterTheTargetDies() throws Exception {
        bot.job = "attacker"; bot.weapons.grant("smg"); bot.equipSecondaryWeapon("smg");
        var target = enemy(1, "grunt", 1120, 10000); bot.botTargetEnemyId = target.id;
        int ammo = bot.weapons.ammo("smg"); decide();
        assertTrue(bot.cooldown > 0); assertTrue(bot.secondaryCooldown > 0);
        assertEquals(ammo - 1, bot.weapons.ammo("smg"));
        target.hp = 0; decide(); assertFalse(bot.secondaryFiring); assertFalse(bot.firing);
    }
    @Test void railgunChargesFiresAndConsumesAmmoThroughTheCommonCombatLoop() {
        bot.weapons.grant("railgun"); var target = enemy(1, "grunt", 1120, 10000);
        bot.botTargetEnemyId = target.id;
        for (int i = 0; i < 40; i++) game.update(.05);
        assertTrue(target.hp < 10000);
        assertEquals(1, bot.weapons.ammo("railgun"));
    }
    @Test void aNearbyCoreThreatOutranksADistantBoss() throws Exception {
        bot.x = game.coreX - 120; bot.y = game.coreY;
        var urgent = enemy(1, "grunt", game.coreX + 30, 1000); urgent.y = game.coreY;
        var boss = enemy(2, "boss", game.coreX + 400, 1000); boss.y = game.coreY;
        assertEquals(urgent, invoke("bestBotCombatTarget", new Class<?>[]{Player.class}, bot));
    }
    @Test void noTargetDoesNotCauseWanderingWhileGuarding() throws Exception {
        game.players.stream().filter(player -> player != bot).forEach(player -> {player.x = 0; player.y = 0;});
        bot.botWanderX = 1; bot.botWanderY = 1;
        invoke("steerBot", new Class<?>[]{Player.class,double.class,double.class}, bot, 0.0, 0.0);
        assertEquals(0, bot.moveX); assertEquals(0, bot.moveY);
    }
}
