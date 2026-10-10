package example;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class EnemyHookGachaTest {
    GameSession game; Player player;
    Object invoke(String name, Class<?>[] types, Object... args) throws Exception {
        var method = GameSession.class.getDeclaredMethod(name, types);
        method.setAccessible(true); return method.invoke(game, args);
    }
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String s) { }
            public void send(Player p, String s) { }
        });
        player = game.connectPlayer("new-enemies");
        game.setRoomOwner(player); game.handleMessage(player, "START");
        game.players.clear(); game.players.add(player); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.credits = 100_000; game.prepTime = 1000;
    }
    Enemy enemy(String type, double x, double y) throws Exception {
        invoke("spawnEnemy", new Class<?>[]{String.class, SpawnPoint.class}, type, GameMap.SPAWN_POINTS.get(0));
        Enemy e = game.enemies.get(game.enemies.size()-1); e.x=x; e.y=y; return e;
    }
    void atGacha() {
        var shop = GameMap.shopByItem("gacha"); player.x=shop.x(); player.y=shop.y();
    }
    @Test void gachaChargesOnceAndCanDeclineWithoutReceiving() {
        atGacha(); game.handleMessage(player,"BUY:gacha:roll");
        assertEquals(90_000, player.credits); assertTrue(GachaRules.POOL.contains(player.gachaWeapon));
        String result=player.gachaWeapon;
        game.handleMessage(player,"BUY:gacha:roll");
        assertEquals(90_000, player.credits); assertEquals(result,player.gachaWeapon);
        game.handleMessage(player,"BUY:gacha:skip");
        assertNull(player.gachaWeapon); assertEquals(1,player.weapons.weaponCount());
        assertEquals(90_000,player.credits);
    }
    @Test void hookOnlyComesFromGachaAndRepeatedClaimDoesNotDuplicate() {
        atGacha(); game.handleMessage(player,"BUY:hook"); assertFalse(player.weapons.owns("hook"));
        player.gachaWeapon="hook"; game.handleMessage(player,"BUY:gacha:take");
        assertTrue(player.weapons.owns("hook")); assertEquals("hook",player.weapon);
        assertNull(player.gachaWeapon); assertEquals(2,player.weapons.weaponCount());
        game.handleMessage(player,"BUY:gacha:take"); assertEquals(2,player.weapons.weaponCount());
        assertEquals(100_000,player.credits);
    }
    @Test void ownedWeaponOnlyRefillsAndPreservesUpgradeAndSelection() {
        atGacha(); player.weapons.grant("laserCannon"); player.weapons.setAmmo("laserCannon",1);
        player.enchantments.put("laserCannon",2); player.gachaWeapon="laserCannon";
        game.handleMessage(player,"BUY:gacha:take");
        assertEquals(player.weapons.capacity("laserCannon"),player.weapons.ammo("laserCannon"));
        assertEquals(2,player.enchantments.get("laserCannon")); assertEquals("pistol",player.weapon);
        assertEquals(100_000,player.credits); assertEquals(2,player.weapons.weaponCount());
    }
    @Test void attackerTakesFourthGachaWeaponButMustExchangeTheFifth() {
        player.job = "attacker";
        atGacha(); player.weapons.grant("rifle"); player.weapons.grant("smg");
        player.gachaWeapon = "hook";
        game.handleMessage(player, "BUY:gacha:take");
        assertNull(player.gachaWeapon); assertTrue(player.weapons.owns("hook"));
        assertEquals(4, player.weapons.weaponCount());
        player.gachaWeapon = "laserCannon";
        game.handleMessage(player, "BUY:gacha:take");
        assertEquals("laserCannon", player.gachaWeapon); assertFalse(player.weapons.owns("laserCannon"));
        game.handleMessage(player, "BUY:gacha:rifle");
        assertNull(player.gachaWeapon); assertTrue(player.weapons.owns("laserCannon"));
        assertFalse(player.weapons.owns("rifle")); assertEquals(4, player.weapons.weaponCount());
    }
    @Test void fullInventoryRequiresValidExchangeAndPendingResultSurvivesDistance() {
        atGacha(); player.weapons.grant("rifle"); player.weapons.grant("smg");
        player.gachaWeapon="hook"; player.enchantments.put("rifle",1);
        game.handleMessage(player,"BUY:gacha:take"); assertEquals("hook",player.gachaWeapon);
        game.handleMessage(player,"BUY:gacha:bat"); assertFalse(player.weapons.owns("hook"));
        player.x=1020; player.y=1900;
        game.handleMessage(player,"BUY:gacha:rifle"); assertFalse(player.weapons.owns("hook"));
        atGacha(); game.handleMessage(player,"BUY:gacha:rifle");
        assertTrue(player.weapons.owns("hook")); assertFalse(player.weapons.owns("rifle"));
        assertFalse(player.enchantments.containsKey("rifle")); assertEquals(3,player.weapons.weaponCount());
    }
    @Test void hookClickHoldReelReleaseAndWeaponSwitchNeverDamage() throws Exception {
        player.x=1020; player.y=1900; player.weapons.grant("hook"); player.equipWeapon("hook");
        game.phase=GamePhase.WAVE;
        Enemy target=enemy("explosionBoss",1180,1900);
        double hp=target.hp;
        game.handleMessage(player,"FIRE:1180:1900:1");
        assertEquals(target.id,player.hookTargetId); assertFalse(player.hookReeling);
        player.cooldown=0; game.combat.attackAt(player,1180,1900); assertFalse(player.hookReeling);
        game.handleMessage(player,"FIRE:1180:1900:0"); game.handleMessage(player,"FIRE:1180:1900:1");
        assertTrue(player.hookReeling);
        game.combat.updateHooks(.5); assertEquals(1090,target.x,.001); assertEquals(hp,target.hp);
        target.fuse=2; invoke("updateEnemies",new Class<?>[]{double.class},.5);
        assertEquals(1.5,target.fuse,.001); assertEquals(1090,target.x,.001);
        game.handleMessage(player,"FIRE:1180:1900:0"); player.cooldown=0;
        game.handleMessage(player,"FIRE:1180:1900:1"); assertEquals(-1,player.hookTargetId);
        game.handleMessage(player,"FIRE:1090:1900:0"); player.cooldown=0;
        game.handleMessage(player,"FIRE:1090:1900:1");
        player.equipWeapon("pistol"); game.combat.updateHooks(.1); assertEquals(-1,player.hookTargetId);
    }
    @Test void blueEnemyRoundCountAndStatsAndGoldEnemyReward() throws Exception {
        game.round=38; invoke("beginRound",new Class<?>[]{}); assertEquals(0,game.queuedBlueEnemies);
        for(int i=0;i<12;i++) {
            game.round=39+i; invoke("beginRound",new Class<?>[]{});
            int planned=game.queuedBlueEnemies; assertTrue(planned>=0&&planned<=2);
            game.enemies.clear();
            invoke("updateSpawning",new Class<?>[]{double.class},10.);
            assertEquals(planned,game.enemies.stream().filter(e->e.type.equals("blueAce")).count());
        }
        game.enemies.clear(); game.round=40;
        Enemy blue=enemy("blueAce",1120,1900); Enemy boss=enemy("boss",1200,1900);
        assertTrue(blue.maxHp>=10000 && blue.maxHp<boss.maxHp); assertEquals(9,CombatSystem.enemyRadius(blue));
        assertTrue(blue.speed>100); assertTrue(blue.damage>=50&&blue.damage<100);
        Enemy gold=enemy("gilded",1300,1900), grunt=enemy("grunt",1400,1900);
        assertTrue(gold.reward>grunt.reward*20);
    }
    @Test void carrierRequiresVisibleLivePlayerAndReleasesSixOnlyOnce() throws Exception {
        Enemy carrier=enemy("carrier",1120,1900);
        player.x=1020; player.y=1900; player.down=true;
        invoke("updateEnemies",new Class<?>[]{double.class},2.);
        assertEquals(0,carrier.releaseProgress); assertEquals(1,game.enemies.size());
        player.down=false; player.job="spy"; player.spyRemaining=10;
        invoke("updateEnemies",new Class<?>[]{double.class},2.); assertEquals(1,game.enemies.size());
        player.spyRemaining=0;
        invoke("updateEnemies",new Class<?>[]{double.class},1.);
        assertEquals(1,game.enemies.size());
        invoke("updateEnemies",new Class<?>[]{double.class},.5);
        assertEquals(6,game.enemies.stream().filter(e->e.type.equals("hunter")).count());
        invoke("updateEnemies",new Class<?>[]{double.class},2.);
        assertEquals(6,game.enemies.stream().filter(e->e.type.equals("hunter")).count());
    }
    @Test void shootingBackpackDestroysItWithoutHurtingBodyAndPreventsRelease() throws Exception {
        player.x=1020; player.y=1900; player.weapons.grant("revolver"); player.equipWeapon("revolver");
        Enemy carrier=enemy("carrier",1120,1900); carrier.facingX=1; carrier.facingY=0;
        double hp=carrier.hp;
        for(int i=0;i<2;i++)game.combat.fireRay(player,WeaponCatalog.stats("revolver"),1,0);
        assertEquals(0,carrier.bagHp); assertEquals(hp,carrier.hp);
        invoke("updateEnemies",new Class<?>[]{double.class},2.);
        assertEquals(1,game.enemies.size());
        assertFalse(SpecialEnemyRules.canRelease(carrier,player,true));
    }
    @Test void firstBossWarnsLocksHeadingAndChargesOnceIntoPlayer() throws Exception {
        player.x=1220; player.y=1900;
        Enemy boss=enemy("boss",1020,1900); boss.chargeCooldown=0;
        invoke("updateEnemies",new Class<?>[]{double.class},.05);
        assertTrue(boss.chargeWarning>0); assertEquals(1020,boss.x);
        invoke("updateEnemies",new Class<?>[]{double.class},.44); assertEquals(0,boss.chargeRemaining);
        invoke("updateEnemies",new Class<?>[]{double.class},.02); assertTrue(boss.chargeRemaining>0);
        invoke("updateEnemies",new Class<?>[]{double.class},.65);
        assertTrue(boss.x>1100); assertEquals(28,player.hp,.001); assertEquals(0,boss.chargeRemaining);
        assertTrue(boss.chargeCooldown>0);
    }
    @Test void secondaryHookIgnoresPrimaryHandReleaseWhileHeld() throws Exception {
        game.phase=GamePhase.WAVE; player.job="attacker"; player.x=1020; player.y=1900;
        player.weapons.grant("hook"); player.equipSecondaryWeapon("hook");
        Enemy e=enemy("grunt",1120,1900);
        game.handleMessage(player,"SECONDARY_FIRE:1120:1900:1");
        assertEquals(e.id,player.hookTargetId);
        game.handleMessage(player,"FIRE:1120:1900:0");
        player.secondaryCooldown=0;
        game.combat.attackSecondary(player,1120,1900);
        assertFalse(player.hookReeling);
        game.handleMessage(player,"SECONDARY_FIRE:1120:1900:0");
        game.handleMessage(player,"SECONDARY_FIRE:1120:1900:1");
        assertTrue(player.hookReeling);
    }

    @Test void hookCannotSelectEnemyThroughWallAndCarrierCannotReleaseThroughWall() throws Exception {
        player.x=1020; player.y=1900; player.weapons.grant("hook"); player.equipWeapon("hook");
        game.phase=GamePhase.WAVE; Enemy e=enemy("carrier",1300,1900);
        assertFalse(GameMap.hasClearLine(player.x,player.y,e.x,e.y,game.unlockedAreas));
        game.handleMessage(player,"FIRE:1300:1900:1"); assertEquals(-1,player.hookTargetId);
        invoke("updateEnemies",new Class<?>[]{double.class},2.);
        assertEquals(1,game.enemies.size()); assertEquals(0,e.releaseProgress);
    }

    @Test void snapshotPublishesPendingResultRopeBackpackAndCharge() throws Exception {
        player.gachaWeapon="hook"; Enemy carrier=enemy("carrier",1120,1900);
        Enemy boss=enemy("boss",1220,1900); boss.chargeWarning=.7; boss.chargeDx=-1;
        player.hookTargetId=carrier.id; player.hookReeling=true;
        var state=new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals("hook",state.path("players").get(0).path("gachaWeapon").asText());
        assertEquals(carrier.id,state.path("players").get(0).path("hookTargetId").asInt());
        assertEquals(600,state.path("enemies").get(0).path("bagHp").asInt());
        assertEquals(.7,state.path("enemies").get(1).path("chargeWarning").asDouble());
        assertFalse(state.path("rules").path("weapons").path("hook").path("droneMountable").asBoolean());
    }

    @Test void firstBossChargeStopsAtBlockingDefense() throws Exception {
        player.x=1220;player.y=1900;
        Enemy boss=enemy("boss",1020,1900); boss.chargeCooldown=0;
        TrapSlot wall=new TrapSlot("wall","free",1140,1900,null); wall.defense=new Defense("barricade");
        game.trapSlots.add(wall);
        invoke("updateEnemies",new Class<?>[]{double.class},.05);
        invoke("updateEnemies",new Class<?>[]{double.class},.7);
        invoke("updateEnemies",new Class<?>[]{double.class},.65);
        assertTrue(boss.x<1140); assertEquals(100,player.hp);
        assertEquals(1104,wall.defense.hp,.001); assertEquals(0,boss.chargeRemaining);
    }
}
