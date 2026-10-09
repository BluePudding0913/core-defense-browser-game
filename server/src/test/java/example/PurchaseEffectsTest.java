package example;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class PurchaseEffectsTest {
    @Test void successfulPurchasesNotifyOwnerAndOnlyNewWeaponsCloseMenu() {
        List<String> messages = new ArrayList<>();
        GameSession game = new GameSession(new GameEventSink() {
            public void broadcast(String message) { }
            public void send(Player player, String message) { messages.add(message); }
        });
        Player player = game.connectPlayer("purchase-test");
        game.setRoomOwner(player); game.handleMessage(player, "START");
        player.credits = 100000;
        for (String item : List.of("medkit", "woodFactory", "shotgun")) {
            ShopUnit shop = GameMap.shopByItem(item);
            player.x = shop.x(); player.y = shop.y();
            game.unlockedAreas.addAll(GameMap.AREAS.stream().map(UnlockArea::id).toList());
            messages.clear();
            game.handleMessage(player, "BUY:" + item);
            assertTrue(messages.stream().anyMatch(m -> m.contains("purchase-complete")
                    && m.contains("\"closeMenu\":" + item.equals("shotgun"))), item);
        }
        messages.clear(); player.credits = 0;
        game.handleMessage(player, "BUY:shotgun");
        assertTrue(messages.stream().noneMatch(m -> m.contains("purchase-complete")));
    }
}
