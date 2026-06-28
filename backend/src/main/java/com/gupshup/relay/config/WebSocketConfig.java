package com.gupshup.relay.config;

import com.gupshup.relay.handler.RelayWebSocketHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebSocketConfig.class);
    private final RelayWebSocketHandler relayWebSocketHandler;

    public WebSocketConfig(RelayWebSocketHandler relayWebSocketHandler) {
        this.relayWebSocketHandler = relayWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        log.info("Registering WebSocket endpoint /ws");
        registry.addHandler(relayWebSocketHandler, "/ws").setAllowedOrigins("*");
    }
}
