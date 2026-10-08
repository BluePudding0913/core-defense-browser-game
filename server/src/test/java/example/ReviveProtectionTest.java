package example;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;

class ReviveProtectionTest {
    GameSession game; Player player;
    @BeforeEach void setup() {
        game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { }
        });
        player = game.connectPlayer("revive"); game.setRoomOwner(player); game.handleMessage(player,"START");
        game.players.clear(); game.players.add(player); game.prepTime=1000;
        player.x=1140; player.y=1900;
    }
    void call(String name, Class<?>[] types, Object... values) throws Exception {
        var method=GameSession.class.getDeclaredMethod(name,types); method.setAccessible(true); method.invoke(game,values);
    }
    @Test void revivedPlayersIgnoreDamageForExactlyOneAndAHalfSecondsAndCanAttack() throws Exception {
        player.down=true; player.hp=0;
        call("revivePlayer",new Class<?>[]{Player.class},player);
        assertEquals(1.5,player.reviveInvulnerableRemaining);
        call("damagePlayer",new Class<?>[]{Player.class,double.class},player,1000.0);
        assertEquals(45,player.hp); assertFalse(player.down);
        game.handleMessage(player,"FIRE:1240:1900:1"); assertTrue(player.firing); assertTrue(player.cooldown>0);
        game.handleMessage(player,"FIRE:1240:1900:0");
        game.update(1.49); assertTrue(JobRules.invulnerable(player));
        game.update(.01); assertFalse(JobRules.invulnerable(player));
        call("damagePlayer",new Class<?>[]{Player.class,double.class},player,10.0);
        assertEquals(35,player.hp);
    }
    @Test void healingRevivePublishesProtectionAndReplayResetsIt() throws Exception {
        player.healX=player.x; player.healY=player.y; player.healRemaining=10; player.down=true; player.hp=0;
        call("updateHealingAreas",new Class<?>[]{double.class},.1);
        assertFalse(player.down); assertEquals(1.5,player.reviveInvulnerableRemaining);
        var snapshot=new ObjectMapper().readTree(SnapshotBuilder.build(game));
        assertEquals(1.5,snapshot.path("players").get(0).path("reviveInvulnerableRemaining").asDouble());
        game.phase=GamePhase.WON; game.handleMessage(player,"START");
        assertEquals(0,player.reviveInvulnerableRemaining);
    }
    @Test void roundEndRevivalAlsoGrantsProtection() throws Exception {
        player.down=true; player.hp=0; game.round=1;
        call("finishRound",new Class<?>[]{});
        assertEquals(1.5,player.reviveInvulnerableRemaining); assertTrue(JobRules.invulnerable(player));
    }
}
