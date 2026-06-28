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
import tools.jackson.databind.node.ArrayNode;
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
            logger.info("Queued pending message id={} for user={} from={}", id, toUser, fromUser);
        } catch (Exception ex) {
            logger.warn("Failed to persist pending message for {} -> {}: {}", fromUser, toUser, ex.getMessage());
        }
    }

    private void broadcastPresence(String user, String status) {
        try {
            logger.debug("Broadcasting presence update for user={} status={}", user, status);
            ObjectNode presenceNode = mapper.createObjectNode();
            presenceNode.put("type", "PRESENCE");
            presenceNode.put("user", user);
            presenceNode.put("status", status);
            String payload = mapper.writeValueAsString(presenceNode);
            TextMessage message = new TextMessage(payload);

            sessions.forEach((u, s) -> {
                if (!u.equals(user) && s.isOpen()) {
                    try {
                        s.sendMessage(message);
                    } catch (Exception ignored) {}
                }
            });
        } catch (Exception ignored) {}
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String sessionId = session.getId();
        logger.info("WebSocket connection established: session={}", sessionId);

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
            session.getAttributes().put("user", user);
            sessions.put(user, session);
            logger.info("Registered session={} for user={} (activeSessions={})", sessionId, user, sessions.size());

            // Broadcast presence update
            broadcastPresence(user, "ONLINE");

            // Push current online directory to user
            try {
                ObjectNode listNode = mapper.createObjectNode();
                listNode.put("type", "PRESENCE_LIST");
                ArrayNode usersArray = listNode.putArray("users");
                sessions.keySet().forEach(usersArray::add);
                session.sendMessage(new TextMessage(mapper.writeValueAsString(listNode)));
            } catch (Exception ignored) {}

            // Fetch and forward pending messages (clearing queue upon delivery check)
            try {
                List<PendingMessage> pending = messageRepository.findByToUser(user);
                if (pending != null && !pending.isEmpty()) {
                    logger.info("Delivering {} pending message(s) to user={}", pending.size(), user);
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
                                // Do NOT delete immediately. Wait for client ACK.
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
        String sessionId = session.getId();
        JsonNode node = mapper.readTree(message.getPayload());
        String type = Optional.ofNullable(node.get("type")).map(JsonNode::asText).orElse("MSG");
        logger.debug("Received {} message on session={}", type, sessionId);

        if ("PING".equalsIgnoreCase(type)) {
            try {
                ObjectNode pongNode = mapper.createObjectNode();
                pongNode.put("type", "PONG");
                session.sendMessage(new TextMessage(mapper.writeValueAsString(pongNode)));
            } catch (Exception ignored) {}
            return;
        }

        if ("ACK".equalsIgnoreCase(type)) {
            String id = node.get("id").asText();
            logger.info("Received ACK for messageId={} from session={}", id, sessionId);
            try {
                messageRepository.deleteById(UUID.fromString(id));
                logger.debug("Deleted pending message id={} after ACK", id);
            } catch (Exception ex) {
                logger.warn("Failed to delete pending message id={} after ACK: {}", id, ex.getMessage());
            }
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
                logger.info("Forwarding message id={} from={} to={} via active session={}", id, fromUser, to, sessionId);
                // Forward directly (zero-retention: does NOT touch the database)
                dest.sendMessage(new TextMessage(message.getPayload()));
            } catch (Exception sendEx) {
                // Write to database ONLY if direct delivery fails
                logger.warn("Live delivery failed for {} -> {}: {}. Saving to queue.", fromUser, to, sendEx.getMessage());
                persistPendingMessage(id, fromUser, to, cipherPayload);
            }
        } else {
            logger.info("Recipient {} is offline for message id={} from={}. Queuing message.", to, id, fromUser);
            // Recipient is offline, write to queue
            persistPendingMessage(id, fromUser, to, cipherPayload);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, org.springframework.web.socket.CloseStatus status) throws Exception {
        String user = (String) session.getAttributes().get("user");
        logger.info("WebSocket connection closed: session={} user={} status={}", session.getId(), user, status);
        if (user == null) {
            user = extractUserId(session);
        }
        if (user != null) {
            sessions.remove(user);
            broadcastPresence(user, "OFFLINE");
        }
    }
}
