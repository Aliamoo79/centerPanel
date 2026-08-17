# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are VPN reseller teams operating and maintaining customer subscriptions across multiple VPN panel servers.

## Product Purpose

Panel gives a reseller team one administrative workspace for managing VPN servers, provisioning customers, monitoring usage and expiry, and issuing a stable subscription link that aggregates each customer's configurations across assigned servers. Success means the team can operate customers and replace or update underlying servers without requiring customers to change their subscription links.

## Positioning

Panel unifies customer provisioning and subscription delivery across heterogeneous VPN panels through a shared adapter model. Customers retain one stable subscription URL even when the reseller changes a server's address, credentials, or panel configuration.

## Operating Context

- The team signs into a Persian, right-to-left administrative dashboard.
- Operators add and test VPN panel servers, create customers on selected servers, set data and IP limits and expiry dates, and copy customer subscription links.
- Operators review aggregate status, users, servers, usage snapshots, and operational logs.
- The application is self-hosted on Linux behind Nginx, with installation and deployment scripts for a systemd-based production setup.
- Customer subscription links are consumed by compatible clients such as v2rayNG, NekoBox, Hiddify App, and Streisand.

## Capabilities and Constraints

- Preserve Persian and right-to-left operation throughout the product.
- Preserve the existing integrations represented in the code: 3x-ui (`THREEXUI`), X4G, and Nahan.
- Preserve self-hosted deployment and the current single-admin access model unless a future product decision explicitly changes it.
- The frontend is React, TypeScript, Vite, and Tailwind CSS; the backend is Node.js, TypeScript, Express, Prisma, and SQLite by default.
- The adapter contract is the extension point for supporting additional VPN panels.
- A customer may be assigned to several servers while retaining one public subscription token.
- Per-server customer links can be enabled independently, and usage is stored as periodically refreshed snapshots.
- Panel credentials are currently stored as plaintext in the database. Production hardening should encrypt them or move them to a secrets manager; future design must not imply this is already solved.

## Brand Commitments

- Official product name: Panel.
- Product language: Persian.
- Interface direction: right-to-left.

## Evidence on Hand

- Working product implementation under `frontend/` and `backend/`.
- Installation, deployment, and domain-change workflows in `install.sh`, `deploy.sh`, and `change-domain.sh`.
- Product and operating documentation in `README.md`.
- No testimonials, customer logos, case studies, press coverage, or independently verified performance claims are present; future work must not fabricate them.

## Product Principles

1. Give the reseller team one coherent control point across different VPN panel technologies.
2. Keep the customer's subscription URL stable while infrastructure changes behind it.
3. Make high-frequency customer and server operations fast, legible, and dependable in Persian RTL.
4. Expose operational state and failures clearly enough for a team to act with confidence.
5. Preserve self-hosting and straightforward deployment as first-class operating requirements.
