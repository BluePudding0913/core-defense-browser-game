package example;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class GameplayRevisionTest {
    GameSession game;
    Player player;
    final java.util.List<String> broadcasts = new java.util.ArrayList<>();

    @Test void openingWaveWaitsEightSecondsAndClearGrantsFifteenSeconds() {
        game.prepTime = 0;
        game.update(.05);
        assertEquals(1, game.round);
        for (int i = 0; i < 159; i++) game.update(.05);
        assertTrue(game.enemies.isEmpty(), "ROUND1 must allow time before spawning");
        assertEquals(9, game.queuedEnemies);
        game.update(.1);
        assertFalse(game.enemies.isEmpty());
        assertEquals(8, game.queuedEnemies);
        game.enemies.clear(); game.queuedEnemies = 0;
        game.update(.05);
        assertEquals(GamePhase.PREPARING, game.phase);
        assertEquals(15, game.prepTime);
    }

    @Test void revolverCannotBeUnlockedFromEntryButCanFromSecurity() {
        player.credits = 10_000;
        game.unlockedAreas.add("entry-room");
        player.x = 940; player.y = 1580;
        game.handleMessage(player, "UNLOCK:revolver-room");
        assertFalse(game.unlockedAreas.contains("revolver-room"));
        assertEquals(10_000, player.credits);
        game.unlockedAreas.add("security-hall");
        player.x = 500; player.y = 380;
        game.handleMessage(player, "UNLOCK:revolver-room");
        assertTrue(game.unlockedAreas.contains("revolver-room"));
    }

    @Test void ricochetConsumesOneRoundAndSupportsRefillSnapshotAndRestart() throws Exception {
        ShopUnit shop = GameMap.shopByItem("ricochet");
        player.x = shop.x(); player.y = shop.y(); player.credits = 1000;
        game.handleMessage(player, "BUY:ricochet");
        assertFalse(player.ownsRicochet);
        game.unlockedAreas.add("ricochet-room");
        game.handleMessage(player, "BUY:ricochet");
        assertEquals(600, player.credits);
        assertTrue(player.ownsRicochet);
        assertEquals(240, player.ricochetAmmo);
        player.x = 1020; player.y = 1900;
        Enemy enemy = new Enemy(9300, "grunt", GameMap.SPAWN_POINTS.get(0), 500, 0, 0, 50);
        enemy.x = 1120; enemy.y = 1900;
        game.enemies.add(enemy);
        game.handleMessage(player, "FIRE:" + enemy.x + ":" + enemy.y + ":1");
        game.handleMessage(player, "FIRE:" + enemy.x + ":" + enemy.y + ":0");
        assertEquals(470, enemy.hp);
        assertEquals(239, player.ricochetAmmo);
        assertEquals(.30, player.cooldown);
        player.cooldown = 0; player.ricochetAmmo = 0;
        game.handleMessage(player, "FIRE:" + enemy.x + ":" + enemy.y + ":1");
        game.handleMessage(player, "FIRE:" + enemy.x + ":" + enemy.y + ":0");
        assertEquals(470, enemy.hp, "an empty weapon cannot fire");
        player.x = shop.x(); player.y = shop.y();
        game.handleMessage(player, "BUY:ricochet");
        assertEquals(240, player.ricochetAmmo);
        player.ricochetAmmo = 0;
        game.unlockedAreas.add("forest");
        ShopUnit ammo = GameMap.shopByItem("ammo");
        player.x = ammo.x(); player.y = ammo.y();
        player.credits = 1000;
        game.handleMessage(player, "BUY:ammo");
        assertEquals(240, player.ricochetAmmo);
        var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        var self = snapshot.path("players").get(player.slot - 1);
        assertTrue(self.path("ownsRicochet").asBoolean());
        assertEquals(240, self.path("ricochetAmmo").asInt());
        game.phase = GamePhase.WON;
        game.players.forEach(p -> p.roomReady = true);
        game.handleMessage(player, "START");
        assertFalse(player.ownsRicochet);
        assertEquals(0, player.ricochetAmmo);
    }

    @Test void headshotsAddThreeGoldEvenWhenTheEnemyDies() {
        player.x = 1020; player.y = 1900;
        Enemy enemy = new Enemy(9301, "grunt", GameMap.SPAWN_POINTS.get(0), 40, 0, 0, 10);
        enemy.x = 1120; enemy.y = 1900;
        game.enemies.add(enemy);
        game.handleMessage(player, "FIRE:1120:1889.5:1");
        assertEquals(0, enemy.hp);
        assertEquals(13, player.credits);
        assertTrue(broadcasts.stream().anyMatch(message -> message.contains("\"headshot\":true")
                && message.contains("\"damage\":52.0") && message.contains("\"credits\":13")));
    }

    @Test void ammoUnitFillsEveryOwnedWeaponToItsCapAndNeverChargesWhenFull() {
        game.unlockedAreas.add("forest");
        ShopUnit ammo = GameMap.shopByItem("ammo");
        player.x = ammo.x(); player.y = ammo.y(); player.credits = 1000;
        game.handleMessage(player, "BUY:ammo");
        assertEquals(1000, player.credits, "no owned weapon means no purchase");
        player.ownsShotgun = player.ownsSmg = player.ownsRifle = true;
        player.ownsSniper = player.ownsRevolver = player.ownsLmg = true;
        player.shotgunAmmo = 29; player.smgAmmo = 1; player.rifleAmmo = 12;
        player.sniperAmmo = 0; player.revolverAmmo = 25; player.lmgAmmo = 150;
        game.handleMessage(player, "BUY:ammo");
        assertEquals(0, player.credits);
        assertEquals(List.of(90, 240, 96, 48, 30, 600), List.of(player.shotgunAmmo,
                player.smgAmmo, player.rifleAmmo, player.sniperAmmo, player.revolverAmmo, player.lmgAmmo));
        for (int i = 0; i < 3; i++) game.handleMessage(player, "BUY:ammo");
        assertEquals(0, player.credits);
        assertEquals(600, player.lmgAmmo);
        player.shotgunAmmo = 0; player.credits = 999;
        game.handleMessage(player, "BUY:ammo");
        assertEquals(0, player.shotgunAmmo);
        assertEquals(999, player.credits);
    }

    @Test void allRoomsCanBeUnlockedFromReachableFloorWithoutRelocatingTerminals() throws Exception {
        Method canInteract = GameSession.class.getDeclaredMethod("canInteract", Player.class,
                double.class, double.class, double.class);
        canInteract.setAccessible(true);
        game.unlockedAreas.clear();
        player.credits = 100_000;
        for (UnlockArea area : GameMap.AREAS) {
            Set<AreaTile> visited = new java.util.HashSet<>();
            var queue = new java.util.ArrayDeque<AreaTile>();
            queue.add(GameMap.TILE_MAP.cellAt(GameMap.CORE_X, GameMap.CORE_Y));
            boolean used = false;
            while (!queue.isEmpty()) {
                AreaTile cell = queue.remove();
                if (!visited.add(cell)) continue;
                MapPoint point = GameMap.TILE_MAP.center(cell);
                if (!GameMap.canOccupy(point.x(), point.y(), 5, game.unlockedAreas)) continue;
                player.x = point.x(); player.y = point.y();
                if ((boolean) canInteract.invoke(game, player, area.terminalX(), area.terminalY(), 100)) {
                    game.handleMessage(player, "UNLOCK:" + area.id());
                    used = game.unlockedAreas.contains(area.id());
                    if (used) break;
                }
                for (int[] delta : new int[][]{{1,0},{-1,0},{0,1},{0,-1}}) {
                    queue.add(new AreaTile(cell.column() + delta[0], cell.row() + delta[1]));
                }
            }
            assertTrue(used, area.id() + " must be unlockable from the entrance via open floor");
        }
    }

    @Test void ricochetUsesTheFormerRevolverRoom() {
        UnlockArea terminal = GameMap.areaById("ricochet-room");
        assertEquals(860 + GameMap.TILE_SIZE, terminal.terminalX());
        assertEquals(1660, terminal.terminalY());
        game.unlockedAreas.add("entry-room");
        player.x = 940; player.y = 1660; player.credits = 1000;
        game.handleMessage(player, "UNLOCK:ricochet-room");
        assertTrue(game.unlockedAreas.contains("ricochet-room"));
        assertEquals(550, player.credits);
    }

    @Test void matchesAndRestartsBeginWithZeroGoldAndNoPurchasedWeapons() {
        assertTrue(game.players.stream().allMatch(p -> p.credits == 0));
        player.credits = 1234;
        player.ownsRevolver = true; player.revolverAmmo = 36;
        player.ownsLmg = true; player.lmgAmmo = 150;
        game.phase = GamePhase.WON;
        game.players.forEach(p -> p.roomReady = true);
        game.handleMessage(player, "START");
        assertEquals(GamePhase.PREPARING, game.phase);
        assertTrue(game.players.stream().allMatch(p -> p.credits == 0));
        assertFalse(player.ownsRevolver);
        assertFalse(player.ownsLmg);
        assertEquals(0, player.revolverAmmo + player.lmgAmmo);
    }

    @Test void newWeaponsRequireUnlockedShopsAndSupportCombatRefillsAndSnapshots() throws Exception {
        for (String weapon : List.of("revolver", "lmg")) {
            ShopUnit shop = GameMap.shopByItem(weapon);
            int capacity = GameSession.weaponAmmoCapacity(weapon);
            int damage = weapon.equals("revolver") ? 320 : 18;
            player.credits = 2000;
            player.x = shop.x(); player.y = shop.y();
            game.handleMessage(player, "BUY:" + weapon);
            assertEquals(2000, player.credits, "locked weapon rooms cannot sell weapons");
            game.unlockedAreas.add(weapon + "-room");
            player.credits = 0;
            game.handleMessage(player, "BUY:" + weapon);
            assertNotEquals(weapon, player.weapon, "zero gold cannot purchase a weapon");
            player.credits = 2000;
            game.handleMessage(player, "BUY:" + weapon);
            assertEquals(weapon, player.weapon);
            assertEquals(2000 - shop.cost(), player.credits);
            player.x = 1020; player.y = 1900; player.cooldown = 0;
            Enemy enemy = new Enemy(9001, "grunt", GameMap.SPAWN_POINTS.get(0), 1000, 0, 0, 0);
            enemy.x = 1120; enemy.y = 1900;
            game.enemies.clear(); game.enemies.add(enemy);
            game.handleMessage(player, "FIRE:" + enemy.x + ":" + enemy.y + ":1");
        game.handleMessage(player, "FIRE:" + enemy.x + ":" + enemy.y + ":0");
            assertEquals(1000 - damage, enemy.hp);
            assertEquals(weapon.equals("revolver") ? 1.6 : .18, player.cooldown, 1e-9);
            assertEquals(capacity - 1, weapon.equals("revolver") ? player.revolverAmmo : player.lmgAmmo);
            game.handleMessage(player, "FIRE:" + enemy.x + ":" + enemy.y + ":1");
        game.handleMessage(player, "FIRE:" + enemy.x + ":" + enemy.y + ":0");
            assertEquals(1000 - damage, enemy.hp, "cooldown prevents an immediate second shot");
            player.x = shop.x(); player.y = shop.y();
            game.handleMessage(player, "BUY:" + weapon);
            assertEquals(capacity, weapon.equals("revolver") ? player.revolverAmmo : player.lmgAmmo);
            int afterRefill = player.credits;
            game.handleMessage(player, "BUY:" + weapon);
            assertEquals(afterRefill, player.credits, "full ammo must not be charged");
            var snapshot = new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
            var self = snapshot.path("players").get(player.slot - 1);
            assertEquals(capacity, self.path(weapon + "Ammo").asInt());
            assertTrue(self.path(weapon.equals("revolver") ? "ownsRevolver" : "ownsLmg").asBoolean());
            if (weapon.equals("revolver")) player.revolverAmmo = 0; else player.lmgAmmo = 0;
            player.cooldown = 0; player.x = 1020; player.y = 1900;
            game.handleMessage(player, "FIRE:" + enemy.x + ":" + enemy.y + ":1");
        game.handleMessage(player, "FIRE:" + enemy.x + ":" + enemy.y + ":0");
            assertEquals(1000 - damage, enemy.hp, "empty weapon cannot deal damage");
            game.handleMessage(player, "WEAPON:pistol");
            game.handleMessage(player, "WEAPON:" + weapon);
            assertEquals(weapon, player.weapon);
        }
        game.unlockedAreas.add("forest");
        ShopUnit ammo = GameMap.shopByItem("ammo");
        player.x = ammo.x(); player.y = ammo.y();
        game.handleMessage(player, "BUY:ammo");
        assertEquals(30, player.revolverAmmo);
        assertEquals(600, player.lmgAmmo);
    }

    @Test void frontPlacementAtTileEdgeSkipsTheTileOverlappingThePlayer() {
        player.x = 1119; player.y = 1900;
        player.facingX = 1; player.facingY = 0;
        player.addBuildItem("block", 2); player.selectedBuild = "block";
        game.handleMessage(player, "PLACE_FRONT");
        assertEquals(1, player.buildItemCount("block"));
        assertTrue(game.trapSlots.stream().anyMatch(slot -> slot.defense != null
                && slot.x == 1180 && slot.y == 1900));
        game.handleMessage(player, "PLACE_FRONT");
        assertEquals(1, player.buildItemCount("block"), "occupied tiles still reject placement");
    }

    @Test void skippingSelfOverlapDoesNotAllowPlacementInWallsOrOtherPlayers() {
        player.addBuildItem("block", 2); player.selectedBuild = "block";
        player.x = 1039; player.y = 1220; player.facingX = 1; player.facingY = 0;
        game.handleMessage(player, "PLACE_FRONT");
        assertEquals(2, player.buildItemCount("block"), "walls remain blocked");
        player.x = 1119; player.y = 1900;
        game.players.get(1).x = 1180; game.players.get(1).y = 1900;
        game.handleMessage(player, "PLACE_FRONT");
        assertEquals(2, player.buildItemCount("block"), "another player remains protected");
    }

    @Test void runnerActuallyTravelsMoreThanTwiceAsFarAsGrunt() throws Exception {
        Method spawn = GameSession.class.getDeclaredMethod("spawnEnemy", String.class, SpawnPoint.class);
        spawn.setAccessible(true);
        Method move = GameSession.class.getDeclaredMethod("moveEnemyToward", Enemy.class, double.class, double.class, double.class);
        move.setAccessible(true);
        for (int round : new int[]{3, 10, 20}) {
            game.round = round;
            game.enemies.clear();
            SpawnPoint entrance = GameMap.SPAWN_POINTS.get(0);
            spawn.invoke(game, "grunt", entrance);
            spawn.invoke(game, "runner", entrance);
            Enemy grunt = game.enemies.get(0), runner = game.enemies.get(1);
            for (Enemy enemy : game.enemies) {
                enemy.x = 1020; enemy.y = 1980;
                for (int tick = 0; tick < 20; tick++) move.invoke(game, enemy, 1020.0, 1820.0, enemy.speed * .05);
            }
            assertTrue(1980 - runner.y > (1980 - grunt.y) * 2.3, "round " + round);
            assertEquals(runner.speed, 1980 - runner.y, 1e-6);
        }
    }

    @Test void regularWavePopulationIsReducedByOneQuarterBeforeLateRounds() {
        for (int round : new int[]{1, 3, 10, 20}) {
            game.phase = GamePhase.PREPARING;
            game.round = round - 1;
            game.prepTime = 0;
            game.update(.05);
            assertEquals((8 + round * 4) * .75, game.queuedEnemies);
            assertEquals(round % 4 == 0 ? round / 4 : 0, game.queuedBosses);
        }
    }

    @Test void diagonalApproachToLockedTerminalCanUnlock() {
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.unlockedAreas.remove("relay-gallery");
        player.x = 1425; player.y = 365;
        player.credits = 5000;
        assertTrue(GameMap.canOccupy(player.x, player.y, 5, game.unlockedAreas));
        game.handleMessage(player, "UNLOCK:relay-gallery");
        assertTrue(game.unlockedAreas.contains("relay-gallery"));
    }

    @Test void terminalCannotBeUsedThroughInterveningLockedTiles() {
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.unlockedAreas.remove("relay-gallery");
        player.x = 1380; player.y = 435;
        player.credits = 5000;
        game.handleMessage(player, "UNLOCK:relay-gallery");
        assertFalse(game.unlockedAreas.contains("relay-gallery"));
        assertEquals(5000, player.credits);
    }

    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { broadcasts.add(message); }
            public void send(Player recipient, String message) { }
        });
        player = game.connectPlayer("revision-session");
        game.setRoomOwner(player);
        game.handleMessage(player, "ROOM_READY:1");
        game.handleMessage(player, "START");
        game.players.forEach(p -> p.human = true);
        game.prepTime = 1000;
    }

    @Test void invalidMovementCannotPoisonOrPartiallyChangeState() {
        game.handleMessage(player, "MOVE:0.5:0.25");
        for (String bad : List.of("NaN", "Infinity", "-Infinity", "1e999")) {
            game.handleMessage(player, "MOVE:" + bad + ":0");
            game.handleMessage(player, "MOVE:0:" + bad);
            assertEquals(.5, player.moveX);
            assertEquals(.25, player.moveY);
        }
        game.handleMessage(player, "MOVE:100:100");
        assertEquals(1, Math.hypot(player.moveX, player.moveY), 1e-9);
        game.update(.05);
        assertTrue(Double.isFinite(player.x) && Double.isFinite(player.y));
    }

    @Test void proximityReviveContinuesWhileShootingAndMoving() {
        player.x = 1020; player.y = 1900;
        Player downed = game.players.get(1);
        downed.x = 1060; downed.y = 1900; downed.hp = 0; downed.down = true;
        for (int i = 0; i < 81; i++) {
            game.handleMessage(player, "FIRE:1020:1800:1");
            game.handleMessage(player, "MOVE:" + (i % 2 == 0 ? ".1" : "-.1") + ":0");
            game.update(.05);
        }
        assertFalse(downed.down);
        assertEquals(45, downed.hp);
        assertTrue(player.cooldown > 0);
    }

    @Test void leavingReviveRangeResetsProgressAndWallsPreventRevives() {
        Player downed = game.players.get(1);
        player.x = 1020; player.y = 1900;
        downed.x = 1060; downed.y = 1900; downed.hp = 0; downed.down = true;
        game.players.get(2).x = 820; game.players.get(3).x = 820;
        game.update(3);
        player.x = 900;
        game.update(.05);
        assertNull(player.actionTarget);
        player.x = 1020;
        game.update(2);
        assertTrue(downed.down);
        player.x = 900; player.y = 600;
        downed.x = 940; downed.y = 600;
        game.update(5);
        assertTrue(downed.down);
    }

    @Test void enemyHealthSpeedAndFullKillGoldMatchRequestedBalance() throws Exception {
        Method spawn = GameSession.class.getDeclaredMethod("spawnEnemy", String.class, SpawnPoint.class);
        spawn.setAccessible(true);
        Method damage = GameSession.class.getDeclaredMethod("damageEnemy", Enemy.class, double.class, Player.class);
        damage.setAccessible(true);
        game.round = 8;
        double[] hp = {106, 67, 254, 1727};
        double[] speed = {70, 168, 46, 32};
        int[] gold = {35, 45, 100, 1188};
        String[] types = {"grunt", "runner", "brute", "boss"};
        SpawnPoint point = GameMap.SPAWN_POINTS.get(0);
        for (int i = 0; i < types.length; i++) {
            spawn.invoke(game, types[i], point);
            Enemy enemy = game.enemies.get(i);
            assertEquals(hp[i] * 2, enemy.maxHp, 1e-6);
            assertEquals(speed[i] * .5 * point.speedMultiplier(), enemy.speed, 1e-6);
            int before = player.credits;
            damage.invoke(game, enemy, enemy.maxHp / 4, player);
            assertEquals(gold[i] / 4, player.credits - before,
                    "partial hits must pay the increased reward before the kill");
            for (int hit = 0; hit < 13; hit++) damage.invoke(game, enemy, enemy.maxHp / 12, player);
            assertEquals(gold[i], player.credits - before);
        }
    }

    @Test void unlockedRoomsJoinSpawnsWithoutIncreasingEnemyBudget() throws Exception {
        game.unlockedAreas.add("entry-room");
        game.round = 7;
        game.handleMessage(player, "READY");
        game.update(.05);
        assertTrue(game.activeSpawnIds.contains("area-entry-room"));
        assertFalse(game.activeSpawnIds.contains("area-forest"));
        assertEquals(30, game.queuedEnemies);
        game.coreHp = 100000;
        for (int i = 0; i < 240; i++) game.update(.05);
        assertTrue(game.enemies.stream().anyMatch(e -> e.spawnId.equals("area-entry-room")));
        Enemy interior = game.enemies.stream().filter(e -> e.spawnId.equals("area-entry-room")).findFirst().orElseThrow();
        assertTrue(GameMap.canOccupy(interior.x, interior.y, 17, game.unlockedAreas));
        assertTrue(interior.route.size() > 1);
    }

    @Test void earlyRoundsStayOutsideAndUtilityRoomsNeverBecomeEntrances() throws Exception {
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        Method select = GameSession.class.getDeclaredMethod("selectRoundSpawns", int.class);
        select.setAccessible(true);
        for (int round = 1; round <= 20; round++) {
            select.invoke(game, round);
            long indoors = game.activeSpawnIds.stream().filter(id -> id.startsWith("area-")).count();
            long interiorEntrances = GameMap.SPAWN_POINTS.stream().filter(s -> GameMap.spawnArea(s) != null).count();
            assertTrue(indoors <= (round < 8 ? 0 : round < 12 ? 3 : interiorEntrances));
            assertFalse(game.activeSpawnIds.contains("area-operations-room"));
            assertFalse(game.activeSpawnIds.contains("area-wood-room"));
            assertFalse(game.activeSpawnIds.contains("area-ore-room"));
            if (round < 10) assertFalse(game.activeSpawnIds.contains("area-transit-hall"));
        }
        Method eligible = GameSession.class.getDeclaredMethod("interiorSpawnEligible", SpawnPoint.class, int.class);
        eligible.setAccessible(true);
        SpawnPoint transit = GameMap.spawnById("area-transit-hall");
        assertFalse((boolean) eligible.invoke(game, transit, 9));
        assertTrue((boolean) eligible.invoke(game, transit, 10));
        game.unlockedAreas.remove("transit-hall");
        assertFalse((boolean) eligible.invoke(game, transit, 20));
    }

    @Test void openingAnAreaDuringCombatDoesNotAddAnEntranceMidWave() {
        player.credits = 700;
        game.round = 9;
        game.unlockedAreas.add("entry-room");
        game.handleMessage(player, "READY");
        game.update(.05);
        List<String> before = List.copyOf(game.activeSpawnIds);
        UnlockArea transit = GameMap.areaById("transit-hall");
        for (int[] offset : new int[][]{{40,0},{-40,0},{0,40},{0,-40}}) {
            double x = transit.terminalX() + offset[0], y = transit.terminalY() + offset[1];
            if (GameMap.canOccupy(x, y, 5, game.unlockedAreas)) {
                player.x = x; player.y = y; break;
            }
        }
        game.handleMessage(player, "UNLOCK:transit-hall");
        assertTrue(game.unlockedAreas.contains("transit-hall"));
        assertEquals(before, game.activeSpawnIds);
    }

    @Test void droppingAgainstAWallDoesNotImmediatelyReturnItemsToSender() {
        player.x = 845; player.y = 1980; player.facingX = -1; player.facingY = 0;
        player.wood = 4;
        game.handleMessage(player, "DROP_RESOURCE:wood:4");
        assertEquals(0, player.wood);
        game.update(5);
        assertEquals(0, player.wood);
        assertEquals(1, game.droppedResources.size());
        player.x = 900;
        game.update(.05);
        player.x = 845;
        game.update(.05);
        assertEquals(4, player.wood);
        assertTrue(game.droppedResources.isEmpty());
    }

    @Test void teammateCanReceiveDroppedItemsWithoutSenderMovingAndAmountsCannotBeForged() {
        player.x = 845; player.y = 1980; player.facingX = -1; player.facingY = 0;
        player.ore = 3;
        game.handleMessage(player, "DROP_RESOURCE:ore:-1");
        game.handleMessage(player, "DROP_RESOURCE:ore:NaN");
        assertEquals(3, player.ore);
        assertTrue(game.droppedResources.isEmpty());
        game.handleMessage(player, "DROP_RESOURCE:ore:999");
        assertEquals(0, player.ore);
        assertEquals(3, game.droppedResources.get(0).amount);
        Player receiver = game.players.get(1);
        receiver.x = 865; receiver.y = 1980;
        game.update(3);
        assertEquals(3, receiver.ore);
        assertEquals(0, player.ore);
        assertTrue(game.droppedResources.isEmpty());
    }

    @Test void everyTerminalHasAnOutsideApproach() {
        for (UnlockArea area : GameMap.AREAS) {
            int col = (int) area.terminalX() / 40, row = (int) area.terminalY() / 40;
            String symbol = String.valueOf(GameMap.TILE_MAP.rows().get(row).charAt(col));
            assertNotNull(GameMap.TILE_MAP.legend().get(symbol), area.id());
            Set<String> otherAreas = GameMap.AREAS.stream().filter(a -> a != area)
                    .map(UnlockArea::id).collect(java.util.stream.Collectors.toSet());
            boolean accessible = false;
            for (int[] offset : new int[][]{{40,0},{-40,0},{0,40},{0,-40}}) {
                accessible |= GameMap.canOccupy(area.terminalX() + offset[0], area.terminalY() + offset[1], 5, otherAreas);
            }
            assertTrue(accessible, area.id());
        }
    }

    @Test void lockedShopAndRemoteActionsCannotGrantItemsOrSpendGold() {
        ShopUnit shop = GameMap.shopByItem("shotgun");
        player.x = shop.x(); player.y = shop.y();
        game.handleMessage(player, "BUY:shotgun");
        assertFalse(player.ownsShotgun);
        assertEquals(0, player.credits);
        player.x = 1020; player.y = 1900;
        game.handleMessage(player, "CRAFT:turret");
        game.handleMessage(player, "GATHER:ore");
        game.handleMessage(player, "UNLOCK:command-room");
        game.handleMessage(player, "WEAPON:sniper");
        assertEquals(0, player.turretItems);
        assertEquals(0, player.ore);
        assertEquals("pistol", player.weapon);
        assertFalse(game.unlockedAreas.contains("command-room"));
        game.handleMessage(game.players.get(1), "READY");
        assertEquals(1000, game.prepTime);
    }

    @Test void adjacentPlayersNoLongerExcludeWholeNeighborTiles() throws Exception {
        Method valid = GameSession.class.getDeclaredMethod("canPlaceDefenseAt", MapPoint.class, TrapSlot.class);
        valid.setAccessible(true);
        MapPoint point = null;
        for (int y = 1700; y < 2040 && point == null; y += 40) {
            for (int x = 820; x < 1300; x += 40) {
                MapPoint candidate = new MapPoint(x, y);
                if ((boolean) valid.invoke(game, candidate, null)) { point = candidate; break; }
            }
        }
        assertNotNull(point);
        player.x = point.x() + 24; player.y = point.y();
        assertTrue((boolean) valid.invoke(game, point, null));
        player.x = point.x() + 22;
        assertFalse((boolean) valid.invoke(game, point, null));
    }

    @Test void cpuRestoresPowerAndRepairsUsingPlayerCosts() {
        Player bot = game.players.get(1); bot.human = false; bot.botSpendCooldown = 0;
        BreakerTerminal breaker = GameMap.BREAKER_TERMINALS.get(0);
        bot.x = breaker.x(); bot.y = breaker.y();
        game.blackoutActive = true; game.trippedBreakers.add(breaker.id());
        game.update(.05);
        assertFalse(game.blackoutActive);
        TrapSlot slot = new TrapSlot("repair-test", "free", bot.x + 40, bot.y, null);
        slot.defense = new Defense("turret"); slot.defense.hp = 10;
        game.trapSlots.add(slot); bot.ore = 1; bot.botSpendCooldown = 0;
        game.update(.05);
        assertEquals(slot.defense.maxHp, slot.defense.hp);
        assertEquals(0, bot.ore);
    }

    @Test void messageBudgetRejectsFloodsAndRecoversWithTime() {
        MessageBudget budget = new MessageBudget();
        for (int i = 0; i < 180; i++) assertTrue(budget.take(1_000_000_000L));
        assertFalse(budget.take(1_000_000_000L));
        for (int i = 0; i < 120; i++) assertTrue(budget.take(2_000_000_000L));
        assertFalse(budget.take(2_000_000_000L));
    }

    @Test void cpuCraftsAndPlacesAllFiveDefenseTypesThroughNormalRules() throws Exception {
        Player bot = game.players.get(1); bot.human = false;
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        bot.credits = 0;
        game.coreX += 100; // Isolate crafting from the separate core relocation priority.
        bot.wood = 10; bot.ore = 10;
        Method tasks = GameSession.class.getDeclaredMethod("updateBotTasks", Player.class);
        tasks.setAccessible(true);
        for (int round = 0; round < 5; round++) {
            game.round = round;
            String type = List.of("block", "turret", "wire", "mine", "barricade").get((round + bot.slot) % 5);
            WorkbenchUnit bench = GameMap.WORKBENCH_UNITS.get(0);
            bot.x = bench.x(); bot.y = bench.y(); bot.botSpendCooldown = 0;
            bot.wood = 10; bot.ore = 10;
            assertTrue((boolean) tasks.invoke(game, bot));
            assertEquals(1, bot.buildItemCount(type), type);
            assertEquals(10 - GameConfig.BUILD_RECIPES.get(type).getOrDefault("wood", 0), bot.wood);
            // Approach the same legal site the planner selected; action must consume one item.
            Method site = GameSession.class.getDeclaredMethod("botBuildSite", Player.class);
            site.setAccessible(true);
            MapPoint target = (MapPoint) site.invoke(game, bot);
            assertNotNull(target, type);
            bot.x = target.x() + 40; bot.y = target.y(); bot.botSpendCooldown = 0;
            tasks.invoke(game, bot);
            assertEquals(0, bot.buildItemCount(type), type);
            assertTrue(game.trapSlots.stream().anyMatch(slot -> slot.defense != null
                    && slot.defense.type.equals(type) && bot.id.equals(slot.ownerId)), type);
        }
    }

    @Test void cpuUnlocksReachableAreasAndMovesCoreInPreparation() throws Exception {
        Player bot = game.players.get(1); bot.human = false; bot.credits = 700;
        UnlockArea entry = GameMap.areaById("entry-room");
        bot.botSpendCooldown = 0;
        boolean approach = false;
        for (int[] delta : new int[][]{{40,0},{-40,0},{0,40},{0,-40}}) {
            double x = entry.terminalX() + delta[0], y = entry.terminalY() + delta[1];
            if (GameMap.canOccupy(x, y, 5, game.unlockedAreas)) {
                bot.x = x; bot.y = y; approach = true; break;
            }
        }
        assertTrue(approach);
        game.update(.05);
        assertTrue(game.unlockedAreas.contains("entry-room"));
        assertEquals(350, bot.credits);
        bot.credits = 0;
        game.round = 2;
        bot.x = game.coreX; bot.y = game.coreY; bot.botSpendCooldown = 0;
        game.update(.05);
        assertTrue(bot.movingCore);
        for (int tick = 0; tick < 500 && bot.movingCore; tick++) game.update(.05);
        assertFalse(bot.movingCore);
        assertEquals(1020, game.coreX);
        assertEquals(1540, game.coreY);
    }

    @Test void weaponCooldownsStayIndependentAndContinueWhileUnequipped() {
        player.ownsShotgun = true;
        player.shotgunAmmo = 10;
        game.handleMessage(player, "WEAPON:shotgun");
        game.handleMessage(player, "FIRE:1020:1800:1");
        double shotgunWait = player.cooldown;
        assertTrue(shotgunWait > 0);
        assertEquals(9, player.shotgunAmmo);
        game.handleMessage(player, "WEAPON:pistol");
        assertEquals(0, player.cooldown);
        game.handleMessage(player, "FIRE:1020:1800:1");
        assertTrue(player.cooldown > 0);
        game.handleMessage(player, "WEAPON:shotgun");
        assertEquals(shotgunWait, player.cooldown);
        game.handleMessage(player, "FIRE:1020:1800:1");
        assertEquals(9, player.shotgunAmmo);
        game.handleMessage(player, "WEAPON:bat");
        game.update(.1);
        game.handleMessage(player, "WEAPON:shotgun");
        assertEquals(shotgunWait - .1, player.cooldown, 1e-6);
        game.handleMessage(player, "WEAPON:bat");
        game.update(shotgunWait);
        game.handleMessage(player, "WEAPON:shotgun");
        assertEquals(0, player.cooldown);
    }

    @Test void facilitiesAllowAdjacentPlacementButRejectTheirOwnTile() {
        Set<String> unlocked = GameMap.AREAS.stream().map(UnlockArea::id)
                .collect(java.util.stream.Collectors.toSet());
        for (MapPoint station : List.of(new MapPoint(GameMap.MED_X, GameMap.MED_Y),
                new MapPoint(GameMap.WORKBENCH_X, GameMap.WORKBENCH_Y))) {
            assertFalse(GameMap.canPlaceDefense(station.x(), station.y(), unlocked));
            assertFalse(GameMap.canPlaceCore(station.x(), station.y(), unlocked));
            assertTrue(GameMap.canPlaceDefense(station.x(), station.y() + 40, unlocked));
            assertTrue(GameMap.canPlaceCore(station.x(), station.y() + 40, unlocked));
        }
    }

    @Test void playerDamageBroadcastsAnEffectIncludingTheVictim() throws Exception {
        Method damage = GameSession.class.getDeclaredMethod("damagePlayer", Player.class, double.class);
        damage.setAccessible(true);
        broadcasts.clear();
        damage.invoke(game, player, 10.0);
        assertTrue(broadcasts.stream().anyMatch(message -> message.contains("player-hit")
                && message.contains(player.id)));
        broadcasts.clear();
        damage.invoke(game, player, 0.0);
        assertTrue(broadcasts.isEmpty());
    }

    @Test void shotgunFiresFourStraightRaysAndMissesBetweenThem() throws Exception {
        player.x=1020; player.y=1900; player.ownsShotgun=true; player.shotgunAmmo=10;
        game.handleMessage(player,"WEAPON:shotgun");
        for (int i=0;i<4;i++) {
            double angle=(i-1.5)*.14;
            Enemy enemy=new Enemy(9400+i,"runner",GameMap.SPAWN_POINTS.get(0),2000,0,0,0);
            enemy.x=player.x+200*Math.cos(angle); enemy.y=player.y+200*Math.sin(angle);
            game.enemies.add(enemy);
        }
        Enemy gap=new Enemy(9410,"runner",GameMap.SPAWN_POINTS.get(0),2000,0,0,0);
        gap.x=player.x+210*Math.cos(.32); gap.y=player.y+210*Math.sin(.32); game.enemies.add(gap);
        game.handleMessage(player,"FIRE:1250:1900:1");
        assertEquals(4,game.enemies.stream().filter(e -> e.hp<e.maxHp).count());
        assertEquals(2000,gap.hp,"a target inside the old auto-hit cone must miss between rays");
        assertEquals(9,player.shotgunAmmo);
        var json=new com.fasterxml.jackson.databind.ObjectMapper();
        long rays=0;
        for(String message:broadcasts) {
            var effect=json.readTree(message);
            if(effect.path("effect").asText().equals("hit") && effect.path("weapon").asText().equals("shotgun") && effect.path("damage").asDouble()==0) rays++;
        }
        assertEquals(4,rays,"every pellet has a visible straight trajectory");
    }

    @Test void sniperAndRevolverPierceAlignedEnemiesButRespectRangeAndWalls() {
        for(String weapon:List.of("sniper","revolver")) {
            game.enemies.clear(); player.x=1020; player.y=1900; player.cooldown=0; player.firing=false;
            player.weapon=weapon; player.sniperAmmo=10; player.revolverAmmo=10;
            for(int i=0;i<2;i++) {
                Enemy enemy=new Enemy(9500+i,"grunt",GameMap.SPAWN_POINTS.get(0),2000,0,0,0);
                enemy.x=1100+i*80; enemy.y=1900; game.enemies.add(enemy);
            }
            Enemy outside=new Enemy(9502,"grunt",GameMap.SPAWN_POINTS.get(0),2000,0,0,0);
            outside.x=player.x+GameSession.weaponStats(weapon).range()+40; outside.y=1900; game.enemies.add(outside);
            game.handleMessage(player,"FIRE:1400:1900:1");
            assertTrue(game.enemies.get(0).hp<2000); assertTrue(game.enemies.get(1).hp<2000);
            assertEquals(2000,outside.hp);
            player.x=1020; player.y=1580; player.cooldown=0; player.firing=false;
            game.enemies.clear();
            Enemy behindWall=new Enemy(9503,"grunt",GameMap.SPAWN_POINTS.get(0),2000,0,0,0);
            behindWall.x=1340; behindWall.y=1580; game.enemies.add(behindWall);
            game.handleMessage(player,"FIRE:1340:1580:1");
            assertEquals(2000,behindWall.hp);
        }
    }

    @Test void weaponChangesPreserveReviveProgress() {
        player.x=1020; player.y=1900;
        Player downed=game.players.get(1); downed.x=1060; downed.y=1900; downed.down=true; downed.hp=0;
        game.update(2); double progress=player.actionProgress;
        game.handleMessage(player,"WEAPON:bat"); assertEquals(progress,player.actionProgress);
        game.handleMessage(player,"WEAPON:pistol"); game.update(2.1);
        assertFalse(downed.down);
    }

    @Test void medkitsRequirePurchaseAndAreConsumedOnlyWhenUseful() throws Exception {
        player.hp=40; game.handleMessage(player,"USE:medkit"); assertEquals(40,player.hp);
        player.credits=500; player.x=GameMap.shopByItem("medkit").x(); player.y=GameMap.shopByItem("medkit").y();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        game.handleMessage(player,"BUY:medkit"); assertEquals(1,player.medkits); assertEquals(380,player.credits);
        player.x=1020; player.y=1900; game.handleMessage(player,"USE:medkit");
        assertEquals(100,player.hp); assertEquals(0,player.medkits);
        player.medkits=1; game.handleMessage(player,"USE:medkit"); assertEquals(1,player.medkits);
        assertTrue(broadcasts.stream().anyMatch(m -> m.contains("item-use") && m.contains(player.id)));
    }

    @Test void copperAndSilverNodesCraftStrongerTurretsWithValidatedCosts() throws Exception {
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        for(String type:List.of("copper","silver")) {
            ResourceNode node=game.resourceNodes.stream().filter(n -> n.type.equals(type)).findFirst().orElseThrow();
            player.x=node.x; player.y=node.y; game.update(.05);
        }
        assertEquals(1,player.copper); assertEquals(1,player.silver);
        WorkbenchUnit bench=GameMap.WORKBENCH_UNITS.get(0); player.x=bench.x();player.y=bench.y();
        player.wood=10;player.ore=20;player.copper=10;player.silver=10;
        game.handleMessage(player,"CRAFT:silverTurret");
        assertEquals(1,player.silverTurretItems); assertEquals(6,player.copper); assertEquals(2,player.silver);
        player.silver=0; game.handleMessage(player,"CRAFT:silverTurret"); assertEquals(1,player.silverTurretItems);
        var snapshot=new com.fasterxml.jackson.databind.ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(50,snapshot.path("maxRounds").asInt());
        assertEquals(GameSession.weaponAmmoCapacity("ricochet"),snapshot.path("rules").path("weapons").path("ricochet").path("capacity").asInt());
        assertEquals(8,snapshot.path("rules").path("recipes").path("silverTurret").path("silver").asInt());
    }

    @Test void directCarryTargetsNearbyObjectsAndRejectsRemoteObjects() {
        player.x=game.coreX;player.y=game.coreY;
        game.handleMessage(player,"CARRY_NEAREST:core"); assertTrue(player.movingCore);
        game.handleMessage(player,"WEAPON:pistol");
        TrapSlot slot=new TrapSlot("carry-test","free",player.x+40,player.y,null);slot.defense=new Defense("copperTurret");game.trapSlots.add(slot);
        player.x-=200; game.handleMessage(player,"CARRY_NEAREST:carry-test"); assertNotNull(slot.defense);assertEquals(0,player.copperTurretItems);
        player.x+=200;game.handleMessage(player,"CARRY_NEAREST:carry-test");assertEquals(1,player.copperTurretItems);assertEquals("copperTurret",player.selectedBuild);
    }

    @Test void fundedCpuUnlocksBeforeWeaponsRegardlessOfCoreLocationOrPoorerNearbyCpu() throws Exception {
        Player bot=game.players.get(1);bot.human=false;bot.credits=1000;bot.botSpendCooldown=0;
        game.coreX=300;game.coreY=300;
        UnlockArea entry=GameMap.areaById("entry-room");
        for(int[] delta:new int[][]{{40,0},{-40,0},{0,40},{0,-40}}) {
            if(GameMap.canOccupy(entry.terminalX()+delta[0],entry.terminalY()+delta[1],5,game.unlockedAreas)) {
                bot.x=entry.terminalX()+delta[0];bot.y=entry.terminalY()+delta[1];break;
            }
        }
        Player poor=game.players.get(2);poor.human=false;poor.credits=0;poor.x=bot.x;poor.y=bot.y;
        game.phase=GamePhase.WAVE;
        Method tasks=GameSession.class.getDeclaredMethod("updateBotTasks",Player.class);tasks.setAccessible(true);
        assertTrue((boolean)tasks.invoke(game,bot));assertTrue(game.unlockedAreas.contains("entry-room"));assertEquals(650,bot.credits);
    }

    @Test void recoveringDamagedDefensePreservesHpAcrossWeaponSwitchAndReinstallation() {
        player.x=1020; player.y=1900; player.facingX=1; player.facingY=0;
        TrapSlot slot=new TrapSlot("damaged-carry","free",1060,1900,null);
        slot.defense=new Defense("silverTurret"); slot.defense.hp=37; game.trapSlots.add(slot);
        game.handleMessage(player,"CARRY_NEAREST:damaged-carry");
        assertEquals(1,player.silverTurretItems);
        game.handleMessage(player,"WEAPON:bat");
        assertEquals(1,player.silverTurretItems);
        game.handleMessage(player,"EQUIP_BUILD:silverTurret"); game.handleMessage(player,"PLACE_FRONT");
        TrapSlot placed=game.trapSlots.stream().filter(u -> u.defense!=null && u.defense.type.equals("silverTurret")).findFirst().orElseThrow();
        assertEquals(37,placed.defense.hp);
        assertEquals(0,player.silverTurretItems);
    }

    @Test void upgradedTurretsDealMoreDamageAndSilverFiresFaster() throws Exception {
        Method update = GameSession.class.getDeclaredMethod("updateDefenses", double.class);
        update.setAccessible(true);
        double[] damage = new double[3];
        String[] types = {"turret", "copperTurret", "silverTurret"};
        for (int i = 0; i < types.length; i++) {
            game.trapSlots.clear(); game.enemies.clear();
            TrapSlot slot = new TrapSlot("tier-test", "free", 1020, 1900, null);
            slot.defense = new Defense(types[i]); game.trapSlots.add(slot);
            Enemy enemy = new Enemy(9500, "grunt", GameMap.SPAWN_POINTS.get(0), 1000, 0, 0, 0);
            enemy.x = 1140; enemy.y = 1900; game.enemies.add(enemy);
            update.invoke(game, .05);
            damage[i] = 1000 - enemy.hp;
            assertEquals(i == 2 ? .45 : .7, slot.defense.cooldown, 1e-9);
        }
        assertEquals(damage[0] * 2, damage[1], 1e-9);
        assertEquals(damage[0] * 3.5, damage[2], 1e-9);
    }
    @Test void allEntrancesAreAtWallsAndWeaponRoomsJoinByRoundTwelve() throws Exception {
        for(SpawnPoint spawn:GameMap.SPAWN_POINTS) {
            assertTrue(GameMap.isWallEntrance(GameMap.TILE_MAP.cellAt(spawn.x(),spawn.y())),spawn.id());
        }
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
        Method select=GameSession.class.getDeclaredMethod("selectRoundSpawns",int.class); select.setAccessible(true);
        select.invoke(game,12);
        for(String room:List.of("shotgun-room","smg-room","rifle-room","sniper-room","revolver-room","lmg-room","ricochet-room")) {
            assertTrue(game.activeSpawnIds.contains("area-"+room),room);
        }
        assertTrue(game.activeSpawnIds.stream().filter(id -> id.startsWith("area-")).count()>7);
    }

    @Test void roundClearRevivesDownedPlayersIncludingFinalRound() throws Exception {
        Method finish=GameSession.class.getDeclaredMethod("finishRound"); finish.setAccessible(true);
        for(int round:List.of(12,50)) {
            game.round=round;
            Player downed=game.players.get(1); downed.down=true; downed.hp=0;
            player.hp=72; player.actionTarget=downed.id; player.actionProgress=2;
            finish.invoke(game);
            assertFalse(downed.down); assertEquals(45,downed.hp); assertEquals(72,player.hp);
            assertNull(player.actionTarget); assertEquals(0,player.actionProgress);
        }
        assertTrue(broadcasts.stream().noneMatch(message -> message.contains("報酬は")));
    }

}
