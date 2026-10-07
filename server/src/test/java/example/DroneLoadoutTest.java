package example;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DroneLoadoutTest {
    GameSession game;
    Player player;
    List<String> effects = new ArrayList<>();
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { effects.add(message); }
            public void send(Player p, String message) { effects.add(message); }
        });
        player = game.connectPlayer("loadout"); game.setRoomOwner(player);
        game.handleMessage(player, "JOB:drone"); game.handleMessage(player, "START");
        game.players.clear(); game.players.add(player); game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        player.x = 1140; player.y = 1900; game.prepTime = 1000;
    }
    void command(String c) { game.handleMessage(player, c); }
    void launch() { command("EQUIP_BUILD:drone"); command("PLACE_FRONT"); }
    void updatePlayers() throws Exception {
        Method m = GameSession.class.getDeclaredMethod("updatePlayers", double.class);
        m.setAccessible(true); m.invoke(game, .1);
    }
    Enemy enemy(int id, double x) {
        Enemy e = new Enemy(id, "runner", GameMap.SPAWN_POINTS.get(0), 1000, 30, 20, 100);
        e.x = x; e.y = 1900; game.enemies.add(e); return e;
    }
    void grant(String id, int ammo) { player.weapons.setOwned(id, true); player.weapons.setAmmo(id, ammo); }

    @Test void droneIsAnItemAndLaunchRequiresSelectingItThenR() {
        assertEquals(1, player.buildItemCount("drone"));
        command("JOB_ABILITY"); command("PLACE_FRONT"); assertNull(player.drone);
        launch(); assertTrue(DroneRules.controlling(player)); assertEquals(0, player.buildItemCount("drone"));
        assertNull(player.selectedBuild);
        command("EQUIP_BUILD:drone"); assertNull(player.selectedBuild);
    }
    @Test void switchingViewsLeavesDroneDeployedAndRoutesMovementCorrectly() throws Exception {
        launch(); command("MOVE:1:0"); updatePlayers();
        double droneX = player.drone.x; assertEquals(1161, droneX); assertEquals(1140, player.x);
        command("JOB_ABILITY"); assertTrue(player.drone.active); assertFalse(player.drone.controlled);
        command("MOVE:1:0"); updatePlayers(); assertEquals(1155.5, player.x); assertEquals(droneX, player.drone.x);
        command("WEAPON:bat"); command("JOB_ABILITY");
        assertTrue(player.drone.controlled); assertEquals(0, player.moveX);
    }
    @Test void viewSwitchNeverRecoversRemoteDroneAndNearRecoveryPreservesHp() {
        launch(); player.drone.x = 1300; player.drone.hp = 35; player.drone.attackers.add(5);
        command("JOB_ABILITY"); command("DRONE_RECOVER");
        assertTrue(player.drone.active); assertEquals(1300, player.drone.x);
        command("JOB_ABILITY"); assertTrue(player.drone.controlled);
        player.drone.x = 1186; command("DRONE_RECOVER"); assertTrue(player.drone.active);
        player.drone.x = 1185; command("DRONE_RECOVER");
        assertFalse(player.drone.active); assertFalse(player.drone.controlled);
        assertEquals(1, player.buildItemCount("drone")); assertEquals("drone", player.selectedBuild);
        assertEquals(35, player.drone.hp); assertTrue(player.drone.attackers.isEmpty());
    }
    @Test void mountingRequiresOwnedAllowedWeaponAndLandedDrone() {
        command("DRONE_MOUNT:rifle"); assertNull(player.drone);
        for (String id : List.of("rocket", "railgun", "lmg", "bat")) {
            grant(id, 10); command("DRONE_MOUNT:" + id); assertNull(player.drone);
        }
        grant("smg", 10); command("DRONE_MOUNT:smg"); assertEquals("smg", player.drone.weapon);
        launch(); command("DRONE_MOUNT:pistol"); assertEquals("smg", player.drone.weapon);
    }
    @Test void mountedGunUsesSharedAmmoStatsOriginRewardsAndSeparateTrajectoryEvent() throws Exception {
        grant("smg", 2); command("DRONE_MOUNT:smg"); launch(); player.drone.x = 1200;
        Enemy hit = enemy(1, 1260); player.cooldown = 9; effects.clear();
        command("FIRE:1400:1900:1");
        assertEquals(982, hit.hp); assertEquals(1, player.weapons.ammo("smg"));
        assertEquals(.14, player.drone.cooldown, 1e-9); assertEquals("pistol", player.weapon);
        var mapper = new ObjectMapper();
        var hits = effects.stream().filter(s -> s.contains("\"effect\":\"hit\"")).toList();
        assertEquals(2, hits.size());
        var trajectory = mapper.readTree(hits.get(0));
        var impact = mapper.readTree(hits.get(1));
        assertEquals(0, trajectory.get("damage").asDouble()); assertEquals(1200, trajectory.get("fromX").asDouble());
        assertEquals("smg", impact.get("weapon").asText()); assertEquals(18, impact.get("damage").asDouble());
        assertEquals(1200, impact.get("fromX").asDouble()); assertEquals(1, impact.get("enemyId").asInt());
        assertTrue(player.drone.attackers.contains(hit.id));
        assertTrue(effects.stream().anyMatch(s -> s.contains("\"effect\":\"shot\"") && s.contains("\"weapon\":\"smg\"")));
        game.update(.14); assertEquals(0, player.weapons.ammo("smg"));
        double health = hit.hp; game.update(.14); assertEquals(health, hit.hp); assertFalse(player.firing);
    }
    @Test void piercingMountedWeaponHitsBothTargetsAndMarksOnlyTheirHostility() {
        grant("sniper", 2); command("DRONE_MOUNT:sniper"); launch();
        Enemy a = enemy(1, 1200), b = enemy(2, 1260), untouched = enemy(3, 1300); untouched.y = 1980;
        command("FIRE:1800:1900:1");
        assertEquals(720, a.hp); assertEquals(720, b.hp); assertEquals(1000, untouched.hp);
        assertEquals(java.util.Set.of(1, 2), player.drone.attackers);
    }
    @Test void bodyShootingAfterViewSwitchDoesNotProvokeDroneHostility() {
        grant("smg", 2); command("DRONE_MOUNT:smg"); launch(); player.drone.x = 1200;
        Enemy a = enemy(1, 1260); command("FIRE:1400:1900:1");
        command("JOB_ABILITY"); Enemy b = enemy(2, 1160);
        command("FIRE:1400:1900:1"); assertEquals(974, b.hp);
        assertTrue(player.drone.attackers.contains(a.id)); assertFalse(player.drone.attackers.contains(b.id));
        assertEquals(1, player.weapons.ammo("smg"));
    }
    @Test void snapshotPublishesInventoryViewWeaponAndMountRestrictions() throws Exception {
        grant("rifle", 3); command("DRONE_MOUNT:rifle"); launch();
        var root = new ObjectMapper().readTree(SnapshotBuilder.build(game));
        var p = root.get("players").get(0); assertEquals(0, p.get("buildItems").get("drone").asInt());
        assertTrue(p.get("drone").get("controlled").asBoolean()); assertEquals("rifle", p.get("drone").get("weapon").asText());
        assertTrue(root.get("rules").get("weapons").get("smg").get("droneMountable").asBoolean());
        assertFalse(root.get("rules").get("weapons").get("rocket").get("droneMountable").asBoolean());
    }

    @Test void remoteDestructionInPlayerViewDoesNotCancelBodyMovementOrFire() {
        launch(); player.drone.x = 1300; player.drone.hp = 1;
        command("JOB_ABILITY"); command("MOVE:1:0"); player.firing = true;
        Enemy bomber = new Enemy(30, "bomber", GameMap.SPAWN_POINTS.get(0), 1, 30, 20, 10);
        bomber.x = 1300; bomber.y = 1900; game.enemies.add(bomber); player.drone.attackers.add(bomber.id);
        game.combat.damageEnemy(bomber, 100, null);
        assertFalse(player.drone.active); assertEquals(1, player.moveX); assertTrue(player.firing);
    }

    @Test void destructionLosesOnlyMountedWeaponAndAmmoAndRepairDoesNotRestoreIt() throws Exception {
        grant("smg", 9); grant("rifle", 12); command("DRONE_MOUNT:smg"); launch();
        player.drone.hp = 1; command("JOB_ABILITY"); command("WEAPON:smg");
        Method damage = GameSession.class.getDeclaredMethod("damageDrone", Player.class, double.class);
        damage.setAccessible(true); damage.invoke(game, player, 2);
        assertFalse(player.weapons.owns("smg")); assertEquals(0, player.weapons.ammo("smg"));
        assertEquals("bat", player.weapon); assertEquals("", player.drone.weapon);
        assertTrue(player.weapons.owns("pistol")); assertTrue(player.weapons.owns("rifle"));
        assertEquals(12, player.weapons.ammo("rifle"));
        player.ore = DroneRules.REPAIR_ORE; player.copper = DroneRules.REPAIR_COPPER; launch();
        assertTrue(player.drone.active); assertEquals("", player.drone.weapon);
        assertFalse(player.weapons.owns("smg"));
        command("FIRE:1400:1900:1"); assertEquals(12, player.weapons.ammo("rifle"));
        assertDoesNotThrow(() -> new ObjectMapper().readTree(SnapshotBuilder.build(game)));
    }

    @Test void unmountingAndRecoveryKeepOwnedWeaponAndAmmo() {
        grant("smg", 9); command("DRONE_MOUNT:smg"); launch(); command("DRONE_RECOVER");
        assertTrue(player.weapons.owns("smg")); assertEquals(9, player.weapons.ammo("smg"));
        command("DRONE_MOUNT:none"); assertEquals("", player.drone.weapon);
        launch(); assertTrue(player.drone.active); assertEquals("", player.drone.weapon);
    }

    @Test void preflightChoiceAtomicallyMountsAndLaunchesOnlyAnOwnedAllowedGun() {
        grant("smg", 9); command("DRONE_LAUNCH:smg"); assertNull(player.drone);
        command("EQUIP_BUILD:drone");
        command("DRONE_LAUNCH:rifle"); command("DRONE_LAUNCH:rocket"); assertNull(player.drone);
        command("DRONE_LAUNCH:smg");
        assertTrue(player.drone.controlled); assertEquals("smg", player.drone.weapon);
        assertEquals(9, player.weapons.ammo("smg")); assertNull(player.selectedBuild);
        command("DRONE_LAUNCH:pistol"); assertEquals("smg", player.drone.weapon);
    }

    @Test void preflightRepairNeedsMaterialsAndHonorsUnarmedChoice() {
        player.drone = new Drone(); player.drone.hp = 0;
        command("EQUIP_BUILD:drone"); command("DRONE_LAUNCH:none"); assertFalse(player.drone.active);
        player.ore = DroneRules.REPAIR_ORE; player.copper = DroneRules.REPAIR_COPPER;
        command("DRONE_LAUNCH:none"); assertTrue(player.drone.active); assertEquals("", player.drone.weapon);
        assertEquals(0, player.ore); assertEquals(0, player.copper);
    }

    @Test void selectedDroneBlocksPreviousGunAndStopsHeldFireButDeployedDroneCanShoot() {
        grant("smg", 5); command("WEAPON:smg"); Enemy target = enemy(1, 1200);
        command("FIRE:1400:1900:1"); assertEquals(4, player.weapons.ammo("smg"));
        command("EQUIP_BUILD:drone"); assertFalse(player.firing);
        double hp = target.hp; effects.clear();
        command("FIRE:1400:1900:1"); command("ATTACK"); game.update(.5);
        game.combat.attackAt(player, 1400, 1900);
        assertFalse(player.firing); assertEquals(hp, target.hp); assertEquals(4, player.weapons.ammo("smg"));
        assertEquals(0, player.cooldown);
        assertTrue(effects.stream().noneMatch(s -> s.contains("\"effect\":\"shot\"") || s.contains("\"effect\":\"hit\"")));
        command("EQUIP_BUILD:none"); command("FIRE:1400:1900:1");
        assertEquals(3, player.weapons.ammo("smg")); assertTrue(target.hp < hp);
        command("EQUIP_BUILD:drone"); command("DRONE_LAUNCH:smg");
        command("FIRE:1400:1900:1"); assertEquals(2, player.weapons.ammo("smg"));
    }
}
