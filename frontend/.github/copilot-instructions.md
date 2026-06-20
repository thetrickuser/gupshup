# Project Directive: Ultra-Private P2P/Relay Chat Application
## Developer Context: Java Backend Engineer (5 YoE), Fluent in React, 0% Android Experience

You are an expert software engineering agent executing a multi-phased project development plan. You must strictly adhere to the technical parameters, system architecture rules, and sequential operational constraints outlined below.

---

## 1. Core Operating Constraints (Non-Negotiable)

*   **Rule 1: ZERO Persistent Online Message Storage**
    *   The server MUST NOT persist messages long-term.
    *   Messages are strictly "Delete-on-Delivery" (DoD).
    *   If a recipient is offline, messages may only live in a temporary database queue with a strict maximum 24-hour Time-To-Live (TTL) expiration window.
*   **Rule 2: End-to-End Encryption (E2EE)**
    *   All message payloads must be encrypted client-side using AES-256 before transmission.
    *   The backend server must only see, process, and temporarily store unreadable ciphertext.
*   **Rule 3: Local Ephemeral Storage & Session-Based Auto-Deletion**
    *   Client-side message logs are stored locally using SQLite (encrypted via SQLCipher).
    *   The app must track messages under ephemeral session keys. When a user explicitly closes a chat or terminates the app lifecycle, a local trigger must fire to immediately drop that session's data from SQLite.
*   **Rule 4: Interactive Milestone Execution Pattern**
    *   You are strictly forbidden from implementing code asynchronously or executing multi-step generations autonomously.
    *   For every discrete milestone and sub-task, you MUST follow the **Plan & Confirm Protocol**:
        1. Present a clear, granular `/plan` detailing exactly what directories, configurations, or lines of code you intend to modify.
        2. Explicitly stop and print: `"Awaiting confirmation to proceed with Milestone X, Step Y."`
        3. Wait for the user's explicit verification before executing commands or writing files.

---

## 2. Technology Stack & Environment Blueprint

*   **Operating System Environment:** Fedora 44 Linux.
*   **Backend Subsystem (`/backend`):** Java 21, Spring Boot 3.x, `spring-boot-starter-websocket`, PostgreSQL (temporary queue), Managed via IntelliJ IDEA.
*   **Frontend Mobile Subsystem (`/frontend`):** React Native (TypeScript) utilizing the **Expo Framework** (Bare Workflow/Prebuild ecosystem).
*   **Local Network Gateway Integration:** The React Native Android emulator maps host machine `localhost` to IP address `10.0.2.2`. Network connectivity parameters must respect this routing boundary.

---

## 3. Phased Implementation Roadmap

You must step through these phases sequentially, invoking the **Plan & Confirm Protocol** at every transition point.

### Phase 1: Local Monolithic UI & Encrypted Database Scaffolding
*   **Goal:** Establish the workspace structure and a working single-device UI with a local DB.
*   **Tasks:**
    1. Scaffold a split repository architecture (`/backend` and `/frontend`).
    2. Initialize an Expo React Native TypeScript project in `/frontend`.
    3. Set up a foundational Chat UI Screen tracking basic states.
    4. Integrate local SQLite persistence with session tracking keys.
    5. Implement the local lifecycle cleanup hooks (Auto-delete when app state changes to background/inactive).

### Phase 2: Client-Side Cryptographic Layers (E2EE)
*   **Goal:** Secure data on-device and prepare payload encapsulation wrappers.
*   **Tasks:**
    1. Integrate a native cryptographic package capable of secure AES-256-GCM handling inside React Native.
    2. Build local utility wrappers to handle encryption of plain text string states into cipher payloads before they leave the state machine layer.

### Phase 3: The Volatile Relay Server (Spring Boot Backend)
*   **Goal:** Build the message queuing and routing system.
*   **Tasks:**
    1. Initialize the Spring Boot project inside `/backend` with Gradle.
    2. Configure WebSocket protocol handshakes (`WebSocketHandler`).
    3. Use docker to pull postgres image. Set up a localized PostgreSQL schema dedicated solely to the transient `PENDING` queue.
    4. Implement the strict `ACK` receipt workflow: On receipt delivery acknowledgment from a WebSocket client, trigger an instantaneous SQL `DELETE` row execution.
    5. Configure a Spring `@Scheduled` task to hard-flush any expired items matching the 24-hour TTL constraint.

### Phase 4: Network Bridge & Integration Testing
*   **Goal:** Stitch the frontend and backend layers together.
*   **Tasks:**
    1. Hook the React Native WebSocket client hook up to the local backend using the emulator proxy IP (`ws://10.0.2.2:8080`).
    2. Run end-to-end multi-device functional validation (Local Emulator interacting with a physical Android device bridged via local Wi-Fi router IP profiles).

---

## 4. Current Target Objective
Initiate the workflow by scanning the current environment and prepping Phase 1, Task 1. Do not generate code yet. Formulate the high-level plan for structure setup, and halt for user authorization.
