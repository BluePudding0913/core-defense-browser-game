package example;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.*;
class JobReworkTest {
 GameSession game;Player player;
 @BeforeEach void setup(){
  game=new GameSession(new GameEventSink(){public void broadcast(String s){}public void send(Player p,String s){}});
  player=game.connectPlayer("job-rework");game.setRoomOwner(player);game.handleMessage(player,"START");game.prepTime=1000;
  game.players.forEach(p->{p.human=true;p.x=820;p.y=1900;});game.trapSlots.clear();game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
 }
 @Test void builderHalvesRecipesAndQuarryAndCompressedTurretCostsWithRounding(){
  assertEquals(3,JobRules.buildingCost("builder",5));assertEquals(5,JobRules.buildingCost("scout",5));
  assertEquals(Map.of("wood",2,"ore",3),JobRules.recipe("builder",Map.of("wood",4,"ore",5)));
  player.x=GameMap.JOB_STATION.x();player.y=GameMap.JOB_STATION.y();game.handleMessage(player,"JOB:builder");assertEquals("builder",player.job);player.credits=100000;
  var workbench=GameMap.WORKBENCH_UNITS.get(0);player.x=workbench.x();player.y=workbench.y();player.wood=100;player.ore=100;
  var recipe=JobRules.recipe("builder",GameConfig.BUILD_RECIPES.get("turret"));game.handleMessage(player,"CRAFT:turret");
  assertEquals(1,player.turretItems);assertEquals(100-recipe.getOrDefault("wood",0),player.wood);assertEquals(100-recipe.getOrDefault("ore",0),player.ore);
  var quarry=GameMap.shopByItem("woodFactory");assertEquals(22500,quarry.cost());player.x=quarry.x();player.y=quarry.y();
  game.handleMessage(player,"BUY:woodFactory");assertEquals(88750,player.credits);assertEquals(1,player.buildItemCount("woodFactory"));
  var bench=GameMap.shopByItem("overclockSilver");player.x=bench.x();player.y=bench.y();player.silverTurretItems=16;
  game.handleMessage(player,"BUY:overclockSilver");assertEquals(0,player.silverTurretItems);assertEquals(1,player.overclockSilverItems);
 }
 @Test void spyCooldownIsFifteenAndScoutDamageIsStandard(){
  assertEquals(1.5,JobRules.damageMultiplier("attacker"));assertEquals(1,JobRules.damageMultiplier("scout"));
  player.job="spy";game.handleMessage(player,"JOB_ABILITY");assertEquals(0,player.jobCooldown);assertEquals(8,player.spyRemaining);
  game.handleMessage(player,"JOB_ABILITY");assertEquals(8,player.spyRemaining);
  JobRules.updateDisguise(player,7.5);assertEquals(.5,player.spyRemaining);assertEquals(0,player.jobCooldown);
  JobRules.updateDisguise(player,.5);assertEquals(0,player.spyRemaining);assertEquals(15,player.jobCooldown);
  game.handleMessage(player,"JOB_ABILITY");assertEquals(0,player.spyRemaining);
  JobRules.updateDisguise(player,15);game.handleMessage(player,"JOB_ABILITY");assertEquals(8,player.spyRemaining);
 }
 void pad(double x,double y){player.x=x;player.y=y;player.facingX=1;player.facingY=0;game.handleMessage(player,"EQUIP_BUILD:teleporter");game.handleMessage(player,"PLACE_FRONT");}
 @Test void twoTeleportPairsKeepTheirPartnersAfterRecoveryAndReplacement(){
  player.job="tp";pad(1020,1900);pad(1100,1900);pad(1020,1820);pad(1100,1820);
  assertEquals(4,player.teleportPads.size());assertEquals(0,player.buildItemCount("teleporter"));
  pad(1020,1740);assertEquals(4,player.teleportPads.size());
  player.x=1060;player.y=1900;game.handleMessage(player,"TELEPORT");assertEquals(1140,player.x);
  player.teleportCooldown=0;player.x=1060;game.handleMessage(player,"PICKUP_TELEPORT:1060:1900");assertEquals(3,player.teleportPads.size());
  player.x=1060;player.y=1820;game.handleMessage(player,"TELEPORT");assertEquals(1140,player.x);assertEquals(1820,player.y);
  pad(1020,1740);assertEquals(4,player.teleportPads.size());
  player.teleportCooldown=0;player.x=1140;player.y=1900;game.handleMessage(player,"TELEPORT");assertEquals(1060,player.x);assertEquals(1740,player.y);
 }
 void simultaneousHit(boolean healer){
  game.phase=GamePhase.WAVE;game.queuedEnemies=100;
  game.players.forEach(p->{p.x=1020;p.y=1900;p.hp=1;p.job="scout";});
  if(healer){player.healX=1020;player.healY=1900;player.healRemaining=10;}
  var shell=new ArtilleryShell(1100,1900,1020,1900,100);shell.remaining=0;game.artilleryShells.add(shell);
  game.update(.01);
 }
 @Test void activeHealingAreaPreventsLossWhenOneBlastDownsEverybodyThenRevives(){
  simultaneousHit(true);assertTrue(game.players.stream().allMatch(p->p.down));assertEquals(GamePhase.WAVE,game.phase);
  game.update(.01);assertTrue(game.players.stream().noneMatch(p->p.down));assertEquals(GamePhase.WAVE,game.phase);
 }
 @Test void allDownWithoutActiveHealingStillLoses(){simultaneousHit(false);assertEquals(GamePhase.LOST,game.phase);}
 @Test void healingNeverPreventsCoreDefeat(){game.coreHp=0;simultaneousHit(true);assertEquals(GamePhase.LOST,game.phase);}
}
