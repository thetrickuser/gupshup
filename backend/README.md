# Backend (intended)

Intent: Java 21 Spring Boot 3.x service for the volatile relay server. This directory will host a Gradle-managed Spring Boot project using `spring-boot-starter-websocket` and a transient PostgreSQL-backed pending queue (24h TTL). Do NOT initialize the project until explicit confirmation as per Plan & Confirm Protocol.

Next steps (after confirmation):
- gradle init / Spring Boot skeleton
- WebSocket handler scaffolding
- Database schema for transient PENDING queue
- ACK-delete workflow and scheduled TTL cleanup

See .github/copilot-instructions.md for mandatory constraints (ZERO persistent message storage, E2EE, Plan & Confirm Protocol).