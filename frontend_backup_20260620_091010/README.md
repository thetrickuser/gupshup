# Frontend (intended)

Intent: Expo React Native (TypeScript) app implementing a single-device UI and local encrypted SQLite storage (SQLCipher). This directory will host the Expo project (bare/prebuild) and the initial Chat UI screen. Do NOT run `expo init` until explicit confirmation.

Next steps (after confirmation):
- Initialize Expo TypeScript project
- Create Chat UI skeleton and navigation
- Integrate encrypted SQLite and session key lifecycle cleanup

See .github/copilot-instructions.md for mandatory constraints (local ephemeral storage, AES-256 encryption in later phases, Plan & Confirm Protocol).