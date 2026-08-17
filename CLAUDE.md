# CLAUDE.md

Engineering and product principles for this repository. These apply to almost every task, regardless of which module is being worked on. Module-specific business specifications live under `docs/modules/`, not here.

## PROJECT

This repository is a modular-monolith ERP platform.
Export Order Management is the first module, not a standalone application.

## STACK

- React + TypeScript + Ant Design
- Django REST Framework
- PostgreSQL
- Docker Compose

## ARCHITECTURE

- Backend owns business logic.
- React must not independently implement business calculations.
- Keep modules clearly separated.
- Use shared/common modules for reusable ERP capabilities.
- Do not introduce microservices unless explicitly approved.
- Do not add infrastructure without a demonstrated requirement.
- Avoid premature abstraction.

## BUSINESS DATA

- Transaction records are authoritative.
- Preserve auditability.
- Important calculations are derived from underlying transactions, not stored or edited independently.
- Important business-rule changes require tests.

## EXPORT ORDER CRITICAL RULE

Production tracks: Produced, Accepted, Rejected.
Export Order availability uses **Accepted Production quantity only**.

Procurement tracks: Received, Accepted, Rejected.
Export Order availability uses **Accepted Procurement quantity only**.

## UX

The application is used by coordinators and factory floor operators.

User-facing UI must be:

- simple
- minimalist
- low cognitive load
- clear
- task-oriented
- mobile/tablet conscious where practical
- built using familiar business terminology

Avoid exposing technical ERP terminology to operators.

## DEVELOPMENT

- Important business rules require automated tests.
- Do not weaken a test just to make code pass.
- Run relevant tests before declaring work complete.
- Explain major architectural changes before implementing them.
- Prefer the simplest solution that preserves future module boundaries.
