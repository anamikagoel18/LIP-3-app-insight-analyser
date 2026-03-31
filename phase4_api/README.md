# Phase 4: API & Email

## Overview
The central hub of the system, providing REST endpoints and automated email delivery.

## Files
- `app.js`: Express server entry point.
- `routes.js`: Defines `/fetch`, `/report`, `/email`, and `/status` endpoints.
- `email.js`: SMTP service via `nodemailer` with idempotency checks.

## Connections
- **Frontend**: Serves data to **Phase 5 (Frontend)**.
- **Integration**: Orchestrates the flow between Phases 1, 2, and 3.
