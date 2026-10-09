package example;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class AttackSourceTest {
 @Test void combatExplosionsIdentifyAllyAndEnemySources() {
  var events=new ArrayList<String>();var effects=new GameEffects(new GameEventSink(){public void broadcast(String s){events.add(s);}public void send(Player p,String s){}});
  effects.explosion(1,2,3);effects.alliedExplosion(1,2,3);assertTrue(events.get(0).contains("\"source\":\"enemy\""));assertTrue(events.get(1).contains("\"source\":\"ally\""));
  var game=new GameSession(new GameEventSink(){public void broadcast(String s){events.add(s);}public void send(Player p,String s){}});
  var p=game.connectPlayer("colors");game.setRoomOwner(p);game.handleMessage(p,"START");game.phase=GamePhase.WAVE;p.x=1020;p.y=1900;
  game.combat.missileImpact(p,1100,1900);assertTrue(events.stream().filter(s->s.contains("\"effect\":\"explosion\"")).reduce((a,b)->b).orElseThrow().contains("\"source\":\"ally\""));
  p.weapons.grant("rocket");p.equipWeapon("rocket");game.combat.attackAt(p,1100,1900);assertTrue(events.stream().filter(s->s.contains("\"effect\":\"explosion\"")).reduce((a,b)->b).orElseThrow().contains("\"source\":\"ally\""));
 }
}
