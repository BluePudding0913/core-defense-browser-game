package example;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Proxy;
import java.util.concurrent.atomic.AtomicInteger;
import org.java_websocket.WebSocket;
import org.java_websocket.exceptions.WebsocketNotConnectedException;
import org.junit.jupiter.api.Test;

class WasdServerTest {
    @Test void aDisconnectDuringSendDoesNotInterruptOtherClients() {
        WebSocket disconnecting = socket(true, message -> { throw new WebsocketNotConnectedException(); });
        AtomicInteger delivered = new AtomicInteger();
        WebSocket connected = socket(true, message -> delivered.incrementAndGet());
        assertDoesNotThrow(() -> {
            WasdServer.sendIfOpen(disconnecting, "state");
            WasdServer.sendIfOpen(connected, "state");
        });
        assertEquals(1, delivered.get());
        WasdServer.sendIfOpen(socket(false, message -> fail("Closed sockets must not receive data")), "state");
        WasdServer.sendIfOpen(null, "state");
    }

    private WebSocket socket(boolean open, java.util.function.Consumer<String> onSend) {
        return (WebSocket) Proxy.newProxyInstance(WebSocket.class.getClassLoader(), new Class<?>[] { WebSocket.class },
                (proxy, method, args) -> {
                    if (method.getName().equals("isOpen")) return open;
                    if (method.getName().equals("send")) { onSend.accept((String) args[0]); return null; }
                    throw new UnsupportedOperationException(method.getName());
                });
    }
}
