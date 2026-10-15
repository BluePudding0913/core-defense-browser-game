package example;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
class ShotSpreadCombatTest {
    GameSession game;Player player;List<String> messages=new ArrayList<>();ObjectMapper json=new ObjectMapper();
    @BeforeEach void setup(){
        game=new GameSession(new GameEventSink(){public void broadcast(String m){messages.add(m);}public void send(Player p,String m){}});
        player=game.connectPlayer("spread-test");game.setRoomOwner(player);game.handleMessage(player,"START:DEBUG");
        game.players.forEach(p->p.human=true);game.enemies.clear();game.trapSlots.clear();
        game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());player.x=1020;player.y=1900;messages.clear();
    }
    void equip(String id){player.weapons.setOwned(id,true);player.weapons.setAmmo(id,20);player.equipWeapon(id);player.cooldown=0;player.firing=false;messages.clear();}
    void fire(double pitch){game.handleMessage(player,"FIRE:"+(player.x+200)+":"+player.y+":1:"+pitch);}
    List<JsonNode> rays()throws Exception{List<JsonNode> result=new ArrayList<>();for(String m:messages){var e=json.readTree(m);if(e.path("effect").asText().equals("hit")&&e.path("damage").asDouble()==0)result.add(e);}return result;}
    double slope(JsonNode e){double x=e.path("x").asDouble()-e.path("fromX").asDouble(),y=e.path("y").asDouble()-e.path("fromY").asDouble(),z=e.path("hitHeight").asDouble()-e.path("fromHeight").asDouble();return Math.hypot(y,z)/x;}
    @Test void ordinaryShotsSampleTheActualThreeDimensionalDiskAndRestoreManualAim()throws Exception{
        for(String id:List.of("pistol","smg","rifle","revolver","lmg","laserCannon","freezeGun")){
            equip(id);int[] n={0};CombatTestRandom.use(game,()->n[0]++%2==0?.81:.25);fire(0);
            var trace=rays().get(0);assertEquals(2,n[0]);assertEquals(ShotSpreadRules.slope(id)*.9,slope(trace),.002,id);
            assertTrue(trace.path("hitHeight").asDouble()>26);assertEquals(0,player.aimPitch);
            if(WeaponCatalog.capacity(id)>0)assertEquals(19,player.weapons.ammo(id));
        }
    }
    @Test void shotgunSamplesEachPelletIndependentlyInsideOneDiskAndSpendsOneRound()throws Exception{
        equip("shotgun");int[] n={0};CombatTestRandom.use(game,()->{int i=n[0]++;return i%2==0?.81:(i/2)/4.;});fire(0);
        var rays=rays();assertEquals(4,rays.size());assertEquals(8,n[0]);Set<String> points=new HashSet<>();
        for(var e:rays){assertTrue(slope(e)<=ShotSpreadRules.slope("shotgun")+.002);points.add(e.path("y")+":"+e.path("hitHeight"));}
        assertEquals(4,points.size());assertEquals(19,player.weapons.ammo("shotgun"));
    }
    @Test void shotgunTracesMatchCompactPublishedConeThroughBreathingAndMovement() throws Exception {
        for (double elapsed : new double[]{0,.5,1.5}) for (double movement : new double[]{0,1}) {
            equip("shotgun");
            player.aimControl.elapsed=elapsed;player.aimControl.inputTime=null;
            player.aimControl.movement=movement;player.aimControl.speedRatio=0;
            player.aimControl.turn=0;player.aimControl.airborne=false;player.aimControl.hasLook=false;
            // Sample the edge of the disk in all four directions, including vertical spread.
            int[] n={0};CombatTestRandom.use(game,()->{int i=n[0]++;return i%2==0?1-1e-9:(i/2)/4.;});
            double published=json.readTree(SnapshotBuilder.build(game)).path("rules").path("weapons")
                    .path("shotgun").path("spreadSlope").asDouble();
            assertEquals(72.8*SniperRules.PIXEL_SLOPE,published,1e-12);
            double expected=published*AimControlRules.breath(elapsed)*(1+1.25*movement);
            fire(0);
            assertEquals(4,rays().size());
            for (var ray:rays()) assertEquals(expected,slope(ray),.002,"Pellet trace must reach the displayed cone edge");
            assertEquals(19,player.weapons.ammo("shotgun"));
        }
    }
    @Test void ricochetSamplesOnceBeforeReflectionsAndRailgunHoldsOneSampleForTheBeam()throws Exception{
        equip("ricochet");int[] n={0};CombatTestRandom.use(game,()->n[0]++%2==0?.81:.25);fire(0);
        assertEquals(2,n[0]);assertEquals(ShotSpreadRules.slope("ricochet")*.9,slope(rays().get(0)),.002);assertEquals(0,player.aimPitch);
        equip("railgun");n[0]=0;fire(0);game.combat.updateRailgun(player,GameConfig.RAILGUN_CHARGE+.1);
        assertEquals(2,n[0]);double pitch=player.railgunPitch,dx=player.railgunDx,dy=player.railgunDy;
        assertTrue(pitch>0);player.aimPitch=-.5;player.aimX=player.x-200;game.combat.updateRailgun(player,.2);
        assertEquals(pitch,player.railgunPitch);assertEquals(dx,player.railgunDx);assertEquals(dy,player.railgunDy);assertEquals(2,n[0]);assertEquals(1,player.weapons.ammo("railgun"));
    }
    @Test void rocketsCarryTheirSampledHeightIntoTravelAndSnapshots()throws Exception{
        equip("rocket");int[] n={0};CombatTestRandom.use(game,()->n[0]++%2==0?.81:.25);fire(0);
        var flight=game.rockets.get(0);assertEquals(ShotSpreadRules.slope("rocket")*.9,flight.slope,1e-9);assertEquals(26,flight.height);
        game.combat.updateRockets(.1);assertTrue(flight.height>26);assertEquals(7,player.weapons.ammo("rocket"));
        var shot=json.readTree(SnapshotBuilder.build(game)).path("projectiles").get(0);assertEquals(flight.height,shot.path("height").asDouble(),1e-9);
    }
    @Test void definitionsMatchPublishedDebugConesAndProneSniperIsMostPrecise()throws Exception{
        var rules=json.readTree(SnapshotBuilder.build(game)).path("rules").path("weapons");
        var sniper=new SniperRules.State();sniper.start(()->.1);sniper.elapsed=.7;
        for(var def:WeaponCatalog.ALL){assertEquals(ShotSpreadRules.slope(def.id()),rules.path(def.id()).path("spreadSlope").asDouble(),1e-12);if(ShotSpreadRules.radius(def.id())>0&&!def.id().equals("sniper"))assertTrue(ShotSpreadRules.radius(def.id())>SniperRules.radius(sniper,.7),def.id());}
        assertEquals(0,ShotSpreadRules.radius("bat"));assertEquals(0,ShotSpreadRules.radius("repulsor"));
    }
}
