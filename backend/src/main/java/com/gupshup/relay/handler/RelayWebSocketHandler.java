package com.gupshup.relay.handler;

import com.gupshup.relay.model.PendingMessage;
import com.gupshup.relay.repo.MessageRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RelayWebSocketHandler extends TextWebSocketHandler {

    private static final Logger logger = LoggerFactory.getLogger(RelayWebSocketHandler.class);
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

    private void persistPendingMessage(String id, String fromUser, String toUser, String payload) {
        try {
            PendingMessage pm = new PendingMessage();
            pm.setId(UUID.fromString(id));
            pm.setFromUser(fromUser);
            pm.setToUser(toUser);
            pm.setCipher(payload);
            pm.setCreatedAt(Instant.now());
            messageRepository.save(pm);
        } catch (Exception ex) {
            logger.warn("Failed to persist pending message for {} -> {}: {}", fromUser, toUser, ex.getMessage());
        }
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        // Enhanced user extraction: attributes, headers, then URI query
        String user = null;
        try {
            Object attrUser = session.getAttributes().get("user");
            if (attrUser instanceof String) user = (String) attrUser;
        } catch (Exception ignored) {}

        if (user == null) {
            try {
                String headerUser = session.getHandshakeHeaders().getFirst("X-User");
                if (headerUser != null && !headerUser.isBlank()) user = headerUser;
            } catch (Exception ignored) {}
        }

        if (user == null) {
            user = extractUserId(session);
        }

        if (user != null) {
            sessions.put(user, session);

            // Fetch pending messages and forward them to the connected client.
            try {
                List<PendingMessage> pending = messageRepository.findByToUser(user);
                if (pending != null && !pending.isEmpty()) {
                    for (PendingMessage pm : pending) {
                        try {
                            ObjectNode node = mapper.createObjectNode();
                            node.put("type", "MSG");
                            String idStr = pm.getId() != null ? pm.getId().toString() : UUID.randomUUID().toString();
                            node.put("id", idStr);
                            if (pm.getFromUser() != null) node.put("from", pm.getFromUser());
                            node.put("to", pm.getToUser());
                            if (pm.getCipher() != null) node.put("cipher", pm.getCipher());

                            String payload = mapper.writeValueAsString(node);
                            if (session.isOpen()) {
                                session.sendMessage(new TextMessage(payload));
                                messageRepository.deleteById(pm.getId());
                            }
                        } catch (Exception sendEx) {
                            logger.warn("Failed to deliver pending message to user {}: {}", user, sendEx.getMessage());
                        }
                    }
                }
            } catch (Exception dbEx) {
                logger.warn("Error fetching pending messages for user {}: {}", user, dbEx.getMessage());
            }
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
        String fromUser = node.has("from") ? node.get("from").asText() : null;
        String cipherPayload = node.has("cipher") ? node.get("cipher").asText() : node.toString();

        if (dest != null && dest.isOpen()) {
            try {
                // forward as-is (ciphertext opaque)
                dest.sendMessage(new TextMessage(message.getPayload()));
            } catch (Exception sendEx) {
                logger.warn("Live delivery failed for {} -> {}: {}. Queueing message instead.", fromUser, to, sendEx.getMessage());
                persistPendingMessage(id, fromUser, to, cipherPayload);
            }
        } else {
            // persist to pending queue (cipher stored opaque)
            persistPendingMessage(id, fromUser, to, cipherPayload);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, org.springframework.web.socket.CloseStatus status) throws Exception {
        String user = extractUserId(session);
        if (user != null) sessions.remove(user);
    }
}
