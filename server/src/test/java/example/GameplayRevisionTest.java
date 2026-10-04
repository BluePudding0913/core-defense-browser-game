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

    @Test void regularWavePopulationIsReducedByOneQuarterThroughoutMatch() {
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
            assertTrue(indoors <= (round < 8 ? 0 : round < 14 ? 1 : 2));
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
        player.x = 805; player.y = 1860; player.facingX = -1; player.facingY = 0;
        player.wood = 4;
        game.handleMessage(player, "DROP_RESOURCE:wood:4");
        assertEquals(0, player.wood);
        game.update(5);
        assertEquals(0, player.wood);
        assertEquals(1, game.droppedResources.size());
        player.x = 900;
        game.update(.05);
        player.x = 805;
        game.update(.05);
        assertEquals(4, player.wood);
        assertTrue(game.droppedResources.isEmpty());
    }

    @Test void teammateCanReceiveDroppedItemsWithoutSenderMovingAndAmountsCannotBeForged() {
        player.x = 805; player.y = 1860; player.facingX = -1; player.facingY = 0;
        player.ore = 3;
        game.handleMessage(player, "DROP_RESOURCE:ore:-1");
        game.handleMessage(player, "DROP_RESOURCE:ore:NaN");
        assertEquals(3, player.ore);
        assertTrue(game.droppedResources.isEmpty());
        game.handleMessage(player, "DROP_RESOURCE:ore:999");
        assertEquals(0, player.ore);
        assertEquals(3, game.droppedResources.get(0).amount);
        Player receiver = game.players.get(1);
        receiver.x = 825; receiver.y = 1860;
        game.update(3);
        assertEquals(3, receiver.ore);
        assertEquals(0, player.ore);
        assertTrue(game.droppedResources.isEmpty());
    }

    @Test void everyTerminalIsEmbeddedInAWallWithAnOutsideApproach() {
        for (UnlockArea area : GameMap.AREAS) {
            int col = (int) area.terminalX() / 40, row = (int) area.terminalY() / 40;
            String symbol = String.valueOf(GameMap.TILE_MAP.rows().get(row).charAt(col));
            assertTrue(GameMap.TILE_MAP.legend().get(symbol).solid(), area.id());
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
        assertEquals(700, player.credits);
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
        Player bot = game.players.get(1); bot.human = false;
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
}
