# Gupshup - A private, Zero-Retention Chat Application

A high-privacy, real-time chat application engineered for zero message retention. This project features a React Native mobile client running on Expo with a synchronized local SQLite cache, communicating via WebSockets with a Spring Boot and Java 21 backend backed by PostgreSQL.

The primary architectural goal is strict privacy: messages are treated as transient payloads, surviving in the central database only while a user is offline, and wiped entirely upon client acknowledgment (ACK) or after a 24-hour expiration time-to-live (TTL).

## Current Project State (Phase 4 Completed)
- **Real-Time Duplex Synchronization:** End-to-end multi-device relaying tested successfully using concurrent instances on an Android Emulator and a physical Android phone over local Wi-Fi.
- **Dynamic Handshake Routing:** Reconfigured mobile client connection endpoints to dynamically parse host network gateway environments using `expo-constants`, eliminating loopback routing issues across diverse physical environments.
- **Reliable Store-and-Forward:** Implemented a Wait-for-ACK strategy. Messages targeting offline users rest securely in the database and flush instantly upon connection, deleting only when the receiver issues an explicit cryptographic acknowledgment.

---

## Technical Architecture

### Backend Core
- **Runtime Environment:** Java 21 / Spring Boot 4.x / Gradle
- **Storage Layer:** PostgreSQL (Containerized via Docker Compose)
- **Network Pipeline:** Standard Native Java WebSockets (`/ws`)
- **Retention Lifecycle Scheduler:** Automated `@EnableScheduling` execution loops running every 5 minutes to sweep and purge unacknowledged records exceeding a 24-hour TTL threshold.

### Mobile Client
- **Framework Stack:** React Native / TypeScript / Expo SDK
- **Local Cache Engine:** `expo-sqlite` managing sandboxed session-isolated messaging remnants.
- **State Cleanup:** Automatic full-table local erasure hooks attached to active system `AppState` background transitions.
- **Cryptographic Layer:** Symmetric payload obfuscation utilities via `crypto-js`.

---

## Repository Directory Map

```text
├── backend/                  # Spring Boot Configuration & Infrastructure
│   ├── src/main/java/        # WebSocket handlers, Clean-up Tasks, Repositories
│   ├── src/test/java/        # Integration test pipelines
│   ├── build.gradle          # Modularized Gradle dependencies (Spring Boot 4.1 platform BOM)
│   └── docker-compose.yml    # Local PostgreSQL service definition
└── frontend/                 # React Native / Expo Mobile Core
    ├── src/components/       # UI Layer & Views (ChatScreen.tsx)
    ├── src/storage/          # SQLite Client initialization layers
    └── package.json          # Dependency configuration manifest