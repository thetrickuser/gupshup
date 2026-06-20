package com.gupshup.relay.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gupshup.relay.model.PendingMessage;
import com.gupshup.relay.repo.MessageRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RelayWebSocketHandler extends TextWebSocketHandler {

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final ObjectMapper mapper = new ObjectMapper();
    private final MessageRepository messageRepository;

    public RelayWebSocketHandler(MessageRepository messageRepository) {
        this.messageRepository = messageRepository;
    }

    private String extractUserId(WebSocketSession session) {
        try {
            URI uri = session.getUri();
            if (uri == null) return null;
            String query = uri.getQuery();
            if (query == null) return null;
            for (String part : query.split("&")) {
                String[] kv = part.split("=");
                if (kv.length == 2 && "user".equals(kv[0])) return kv[1];
            }
        } catch (Exception ignored) {}
        return null;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String user = extractUserId(session);
        if (user != null) {
            sessions.put(user, session);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode node = mapper.readTree(message.getPayload());
        String type = Optional.ofNullable(node.get("type")).map(JsonNode::asText).orElse("MSG");

        if ("ACK".equalsIgnoreCase(type)) {
            String id = node.get("id").asText();
            try {
                messageRepository.deleteById(UUID.fromString(id));
            } catch (Exception ignore) {}
            return;
        }

        // Default: MSG
        String to = node.get("to").asText();
        String id = node.has("id") ? node.get("id").asText() : UUID.randomUUID().toString();

        WebSocketSession dest = sessions.get(to);
        if (dest != null && dest.isOpen()) {
            // forward as-is (ciphertext opaque)
            dest.sendMessage(new TextMessage(message.getPayload()));
        } else {
            // persist to pending queue (cipher stored opaque)
            PendingMessage pm = new PendingMessage();
            pm.setId(UUID.fromString(id));
            pm.setFromUser(node.has("from") ? node.get("from").asText() : null);
            pm.setToUser(to);
            pm.setCipher(node.has("cipher") ? node.get("cipher").asText() : node.toString());
            pm.setCreatedAt(Instant.now());
            messageRepository.save(pm);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, org.springframework.web.socket.CloseStatus status) throws Exception {
        String user = extractUserId(session);
        if (user != null) sessions.remove(user);
    }
}
