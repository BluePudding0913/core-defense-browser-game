package example;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.*;
import com.fasterxml.jackson.databind.ObjectMapper;

class PreparationBackupTest {
 GameSession game; Player hacker; final List<String> events=new ArrayList<>();
 @BeforeEach void setup() {
  game=new GameSession(new GameEventSink(){public void broadcast(String s){events.add(s);} public void send(Player p,String s){events.add(s);}});
  hacker=game.connectPlayer("backup-test"); game.setRoomOwner(hacker); game.handleMessage(hacker,"JOB:hacker"); game.handleMessage(hacker,"START");
  game.players.forEach(p->p.human=true); game.prepTime=120; hacker.credits=300000;
 }
 void save(){game.unlockedAreas.add("command-room");hacker.x=GameMap.BACKUP_TERMINAL.x();hacker.y=GameMap.BACKUP_TERMINAL.y();game.handleMessage(hacker,"HACKER_BACKUP");}
 void restore(){if(game.phase==GamePhase.LOST && game.backup!=null && !game.backupUsed)game.rewindRemaining=6;game.update(6);}
 @Test void savesOnlyDuringPreparationWithEnoughMoneyAndReplacesPaidCheckpoint(){
  hacker.credits=99999;save();assertNull(game.backup);assertEquals(99999,hacker.credits);
  hacker.credits=300000;game.phase=GamePhase.WAVE;save();assertNull(game.backup);assertEquals(300000,hacker.credits);
  game.phase=GamePhase.PREPARING;hacker.job="builder";save();assertNull(game.backup);
  hacker.job="hacker";hacker.down=true;save();assertNull(game.backup);hacker.down=false;
  save();assertNotNull(game.backup);assertEquals(200000,hacker.credits);
  assertEquals(200000,game.backup.players().get(0).credits);var first=game.backup;
  game.round=8;save();assertNotSame(first,game.backup);assertEquals(100000,hacker.credits);assertEquals(8,game.backup.world().round());
  assertTrue(SnapshotBuilder.build(game).contains("\"backupRound\":9"));
 }
 @Test void restoresDeepWorldAndInventoryStateWhileKeepingLiveRoomConnections() throws Exception {
  game.round=15;game.elapsedSeconds=550;game.coreHp=123;game.coreMaxHp=2500;game.coreShield=65;game.teamBuffRemaining=99;
  hacker.x=1020;hacker.y=1900;hacker.weapons.grant("plasmaBlade");hacker.weapons.grant("freezeGun");hacker.weapons.setAmmo("freezeGun",7);
  hacker.weapons.addSilverAmmo(200);hacker.enchantments.put("freezeGun",2);hacker.armorTops=true;hacker.wood=17;
  hacker.recoverDefense(new Defense("silverTurret"));hacker.recoveredDefenses.get("silverTurret").peek().hp=12;
  hacker.teleportPads.add(new MapPoint(1100,1900));hacker.teleportPairs.put(hacker.teleportPads.get(0),1);
  hacker.drone=new Drone();hacker.drone.hp=13;hacker.drone.attackers.add(32);
  game.unlockedAreas.add("heavy-arms-area");game.blackoutActive=true;game.trippedBreakers.add("saved-breaker");
  game.resourceNodes.get(0).available=false;game.resourceNodes.get(0).respawnTimer=5;
  game.trapSlots.get(0).defense=new Defense("turret");game.trapSlots.get(0).defense.hp=13;
  var factory=new MaterialFactory("quarry-7",GameMap.shopByItem("woodFactory"),new MapPoint(1100,1820));factory.elapsed=7;game.factories.add(factory);
  game.droppedResources.add(new DroppedResource(7,"silver",1100,1900,3,hacker.id));
  game.poisonClouds.add(new PoisonGasRules.Cloud(hacker.id,1100,1900,90));
  game.decoys.add(new Decoy(hacker,new MapPoint(1,0)));game.decoys.get(0).travelRemaining=22;
  game.missiles.add(new MissileStrike(hacker,1100,1900));game.missiles.get(0).remaining=.4;
  save();var saved=game.backup;double rng=BackupCopies.random(saved.random()).nextDouble();
  hacker.credits=1;hacker.wood=0;hacker.weapons.clear();hacker.enchantments.clear();hacker.drone.hp=0;hacker.recoveredDefenses.clear();
  hacker.teleportPads.clear();hacker.teleportPairs.clear();game.trapSlots.get(0).defense.hp=0;game.resourceNodes.get(0).available=true;
  factory.elapsed=0;game.droppedResources.clear();game.decoys.clear();game.missiles.clear();game.poisonClouds.clear();game.unlockedAreas.clear();game.trippedBreakers.clear();
  hacker.name="Renamed";hacker.sessionId="live-session";hacker.lastProcessedInput=99;hacker.human=false;hacker.reconnectGrace=12;hacker.roomReady=true;
  game.setRoomOwner(game.players.get(1));String liveOwner=game.roomOwnerId;
  game.phase=GamePhase.LOST;game.round=30;game.coreHp=0;game.coreShield=0;game.elapsedSeconds=900;hacker.down=true;
  restore();assertEquals(GamePhase.PREPARING,game.phase);assertTrue(game.backupUsed);assertNull(game.backup);assertEquals(1,game.rewindVersion);
  assertSame(hacker,game.players.get(0));assertEquals("Renamed",hacker.name);assertEquals("live-session",hacker.sessionId);assertEquals(99,hacker.lastProcessedInput);
  assertFalse(hacker.human);assertEquals(6,hacker.reconnectGrace);assertTrue(hacker.roomReady);assertEquals(liveOwner,game.roomOwnerId);
  assertEquals(15,game.round);assertEquals(550,game.elapsedSeconds);assertEquals(120,game.prepTime);assertEquals(123,game.coreHp);assertEquals(2500,game.coreMaxHp);
  assertEquals(65,game.coreShield);assertEquals(99,game.teamBuffRemaining);assertEquals(200000,hacker.credits);assertEquals(17,hacker.wood);assertFalse(hacker.down);
  assertTrue(hacker.armorTops);assertTrue(hacker.weapons.owns("plasmaBlade"));assertFalse(hacker.weapons.owns("bat"));assertEquals(7,hacker.weapons.ammo("freezeGun"));
  assertEquals(200,hacker.weapons.silverAmmo());assertEquals(2,hacker.enchantments.get("freezeGun"));assertEquals(13,hacker.drone.hp);assertTrue(hacker.drone.attackers.contains(32));
  assertEquals(12,hacker.recoveredDefenses.get("silverTurret").peek().hp);assertEquals(1,hacker.teleportPairs.get(hacker.teleportPads.get(0)));
  assertEquals(13,game.trapSlots.get(0).defense.hp);assertNotSame(saved.slots().get(0).defense,game.trapSlots.get(0).defense);
  assertFalse(game.resourceNodes.get(0).available);assertEquals(5,game.resourceNodes.get(0).respawnTimer);assertEquals(7,game.factories.get(0).elapsed);
  assertEquals(3,game.droppedResources.get(0).amount);assertEquals(1,game.poisonClouds.size());assertEquals(22,game.decoys.get(0).travelRemaining);
  assertSame(hacker,game.missiles.get(0).owner);assertEquals(.4,game.missiles.get(0).remaining);assertTrue(game.unlockedAreas.contains("heavy-arms-area"));assertTrue(game.trippedBreakers.contains("saved-breaker"));
  var field=GameSession.class.getDeclaredField("random");field.setAccessible(true);assertEquals(rng,((Random)field.get(game)).nextDouble());
  var snapshot=new ObjectMapper().readTree(SnapshotBuilder.build(game));assertTrue(snapshot.path("backupUsed").asBoolean());assertEquals(1,snapshot.path("rewindVersion").asInt());
 }
 @Test void rewindIsOncePerMatchAndCannotRunBeforeLossOrFromUnrelatedJob(){
  save();restore();assertEquals(GamePhase.PREPARING,game.phase);assertFalse(game.backupUsed);
  var ally=game.players.get(1);ally.job="builder";game.phase=GamePhase.LOST;game.handleMessage(ally,"HACKER_RESTORE");assertEquals(GamePhase.LOST,game.phase);
  hacker.job="scout";restore();assertEquals(GamePhase.PREPARING,game.phase);assertEquals("hacker",hacker.job);
  int gold=hacker.credits;save();assertNull(game.backup);assertEquals(gold,hacker.credits);
  game.phase=GamePhase.LOST;restore();assertEquals(GamePhase.LOST,game.phase);
  game.players.forEach(p->p.roomReady=true);game.setRoomOwner(hacker);game.handleMessage(hacker,"START");assertFalse(game.backupUsed);assertNull(game.backup);
 }
 @Test void checkpointsBelongToTheirRoomAndRejectPreparationWithPendingEnemies(){
  var other=new GameSession(new GameEventSink(){public void broadcast(String s){}public void send(Player p,String s){}});
  var e=new Enemy(1,"grunt",GameMap.SPAWN_POINTS.get(0),1,0,0,0);game.enemies.add(e);save();assertNull(game.backup);assertEquals(300000,hacker.credits);
  game.enemies.clear();save();assertNotNull(game.backup);assertNull(other.backup);
 }
}
