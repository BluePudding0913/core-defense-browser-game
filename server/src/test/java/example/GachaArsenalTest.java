package example;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class GachaArsenalTest {
    GameSession game; Player player;
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player p, String message) { }
        });
        player=game.connectPlayer("gacha-arsenal"); game.setRoomOwner(player);
        game.handleMessage(player,"START"); game.players.clear(); game.players.add(player);
        game.trapSlots.clear(); game.enemies.clear(); game.phase=GamePhase.WAVE;
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.x=1020; player.y=1900; player.credits=1000000;
    }
    Enemy enemy(int id, double x, double y) {
        Enemy e=new Enemy(id,"grunt",GameMap.SPAWN_POINTS.get(0),10000,0,0,1000);
        e.x=x; e.y=y; game.enemies.add(e); return e;
    }
    void equip(String weapon) {
        player.weapons.clear(); player.weapons.grant(weapon); player.equipWeapon(weapon); player.cooldown=0;
    }
    void fire(double x, double y) { game.combat.attackAt(player,x,y); }
    void atGacha() {var shop=GameMap.shopByItem("gacha");player.x=shop.x();player.y=shop.y();}
    @Test void gachaOnlyRollsExclusiveWeaponsAndEveryExclusiveWeaponCanBeClaimed() {
        assertEquals(Set.of("hook","laserCannon","poisonGas","repulsor"),new HashSet<>(GachaRules.POOL));
        assertEquals(4,GachaRules.POOL.size());
        atGacha();
        for(int i=0;i<100;i++) {
            game.handleMessage(player,"BUY:gacha:roll");
            assertTrue(WeaponCatalog.find(player.gachaWeapon).gachaOnly());
            assertNull(GameMap.shopByItem(player.gachaWeapon));
            game.handleMessage(player,"BUY:gacha:skip");
        }
        for(String weapon:GachaRules.POOL) {
            player.weapons.clear(); player.gachaWeapon=weapon;
            game.handleMessage(player,"BUY:gacha:take");
            assertTrue(player.weapons.owns(weapon));assertEquals(weapon,player.weapon);
            assertEquals(player.weapons.capacity(weapon),player.weapons.ammo(weapon));
            assertFalse(DroneRules.mountable(weapon));
        }
    }
    @Test void duplicateExclusiveWeaponsRefillWithoutDuplicatingOrUpgradingAndCanBeSkipped() {
        atGacha(); player.weapons.grant("laserCannon"); player.enchantments.put("laserCannon",2);
        player.weapons.setAmmo("laserCannon",1);player.gachaWeapon="laserCannon";
        int gold=player.credits; game.handleMessage(player,"BUY:gacha:take");
        assertEquals(30,player.weapons.ammo("laserCannon"));assertEquals(2,player.weapons.weaponCount());
        assertEquals(2,player.enchantments.get("laserCannon"));assertEquals(gold,player.credits);
        player.gachaWeapon="poisonGas";game.handleMessage(player,"BUY:gacha:skip");
        assertFalse(player.weapons.owns("poisonGas"));assertNull(player.gachaWeapon);
        player.gachaWeapon="rifle";game.handleMessage(player,"BUY:gacha:take");
        assertFalse(player.weapons.owns("rifle"));
    }
    @Test void laserPiercesEnemiesButStopsAtWallConsumesOneAmmoAndRespectsCooldown() {
        equip("laserCannon");
        Enemy first=enemy(1,1100,1900),second=enemy(2,1180,1900),blocked=enemy(3,1300,1900);
        fire(1400,1900);
        assertEquals(9350,first.hp);assertEquals(9350,second.hp);assertEquals(10000,blocked.hp);
        assertEquals(29,player.weapons.ammo("laserCannon")); assertEquals(1.4,player.cooldown);
        fire(1400,1900);assertEquals(9350,first.hp);
        player.cooldown=0;player.weapons.setAmmo("laserCannon",0);fire(1400,1900);
        assertEquals(9350,first.hp);
    }
    @Test void poisonRemainsAfterWeaponSwitchAndExpiresWithoutExtraTicks() {
        equip("poisonGas");Enemy e=enemy(1,1140,1900);player.credits=0;
        fire(1140,1900);assertEquals(9910,e.hp);assertEquals(11,player.weapons.ammo("poisonGas"));
        assertEquals(1,game.poisonClouds.size());
        game.combat.updatePoisonGas(.24);assertEquals(9910,e.hp);
        game.combat.updatePoisonGas(.26);assertEquals(9820,e.hp);
        int before=player.credits;player.equipWeapon("bat");
        game.combat.updatePoisonGas(.5);assertEquals(9730,e.hp);
        assertTrue(player.credits-before<=7,"gas gold multiplier must survive switching to the bat");
        game.combat.updatePoisonGas(100);assertEquals(8830,e.hp);assertTrue(game.poisonClouds.isEmpty());
        game.combat.updatePoisonGas(100);assertEquals(8830,e.hp);assertFalse(player.down);
    }
    @Test void poisonStopsAtWallAndCannotDamageEnemiesThroughIt() {
        equip("poisonGas");Enemy blocked=enemy(1,1300,1900),near=enemy(2,1220,1900);
        fire(1400,1900);var cloud=game.poisonClouds.get(0);
        assertTrue(GameMap.canOccupy(cloud.x,cloud.y,0,game.unlockedAreas));
        assertEquals(10000,blocked.hp);assertTrue(near.hp<10000);
        game.combat.updatePoisonGas(1);assertEquals(10000,blocked.hp);
    }
    @Test void poisonBoundaryAndOverlappingCloudsAndUpgradeUseCommonDamageRules() {
        equip("poisonGas");player.enchantments.put("poisonGas",1);
        var cloud=new PoisonGasRules.Cloud(player.id,1020,1900,90);
        game.poisonClouds.add(cloud);
        Enemy edge=enemy(1,1161,1900),outside=enemy(2,1161.01,1900);
        game.combat.updatePoisonGas(.5);
        assertEquals(9887.5,edge.hp);assertEquals(10000,outside.hp);
        game.poisonClouds.add(new PoisonGasRules.Cloud(player.id,1020,1900,90));
        game.combat.updatePoisonGas(.5);assertEquals(9662.5,edge.hp);
    }
    @Test void poisonClockIsIndependentOfFrameSizeAndCapsLongFramesAtExpiry() {
        var small=new PoisonGasRules.Cloud("p",0,0,90);
        var large=new PoisonGasRules.Cloud("p",0,0,90);
        int ticks=0;for(int i=0;i<60;i++)ticks+=PoisonGasRules.advance(small,.1);
        assertEquals(12,ticks);assertEquals(ticks,PoisonGasRules.advance(large,100));
        assertEquals(0,PoisonGasRules.advance(large,1));
    }
    @Test void repulsorPushesWideFrontArcWithNoDamageGoldOrAmmoAndStopsAtDefenses() {
        equip("repulsor");player.credits=0;
        Enemy front=enemy(1,1120,1900),side=enemy(2,1100,1980),behind=enemy(3,980,1900);
        fire(1400,1900);assertTrue(front.x>1120);assertTrue(side.y>1980);assertEquals(980,behind.x);
        for(int i=0;i<200;i++){player.cooldown=0;fire(1400,1900);}
        assertEquals(10000,front.hp);assertEquals(10000,side.hp);assertEquals(0,player.credits);
        assertEquals(0,player.weapons.ammo("repulsor"));assertTrue(player.weapons.owns("repulsor"));
        assertTrue(GameMap.canOccupy(front.x,front.y,17,game.unlockedAreas));
        front.x=1120;front.y=1900;
        TrapSlot wall=new TrapSlot("wall","free",1180,1900,null);wall.defense=new Defense("barricade");
        game.trapSlots.add(wall);
        for(int i=0;i<20;i++){player.cooldown=0;fire(1400,1900);}
        assertTrue(front.x<=1145);assertEquals(1200,wall.defense.hp);
    }
    @Test void repulsorContinuesWhileHeldAndReleaseStopsIt() throws Exception {
        equip("repulsor");Enemy e=enemy(1,1120,1900);
        game.queuedEnemies=100;
        var timer=GameSession.class.getDeclaredField("spawnTimer");timer.setAccessible(true);timer.setDouble(game,1000);
        game.handleMessage(player,"FIRE:1400:1900:1");double first=e.x;
        for(int i=0;i<8;i++)game.update(.05);
        assertTrue(e.x>first+35);assertEquals(10000,e.hp);
        game.handleMessage(player,"FIRE:1400:1900:0");double stopped=e.x;
        for(int i=0;i<8;i++)game.update(.05);
        assertEquals(stopped,e.x);assertEquals(1000000,player.credits);
    }
    @Test void gasStatePublishesAndRestartClearsItAndRefillUsesExclusivePrices() throws Exception {
        equip("poisonGas");fire(1140,1900);
        var state=new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(120,state.path("poisonClouds").get(0).path("radius").asInt());
        assertTrue(state.path("rules").path("weapons").path("poisonGas").path("gachaOnly").asBoolean());
        assertEquals("LASER CANNON",state.path("rules").path("weapons").path("laserCannon").path("name").asText());
        var ammo=GameMap.shopByItem("ammo");player.x=ammo.x();player.y=ammo.y();player.credits=10000;
        game.handleMessage(player,"BUY:ammo");assertEquals(9000,player.credits);assertEquals(12,player.weapons.ammo("poisonGas"));
        game.phase=GamePhase.LOST;game.handleMessage(player,"START");assertTrue(game.poisonClouds.isEmpty());
    }
    @Test void gasCloudCountIsBoundedAndDisconnectedOwnersStopDealingDamage() {
        equip("poisonGas");
        for(int i=0;i<30;i++){player.cooldown=0;player.weapons.setAmmo("poisonGas",12);fire(1140,1900);}
        assertEquals(PoisonGasRules.MAX_CLOUDS,game.poisonClouds.size());
        Enemy e=enemy(1,1140,1900);game.players.clear();game.combat.updatePoisonGas(1);
        assertTrue(game.poisonClouds.isEmpty());assertEquals(10000,e.hp);
    }
}
