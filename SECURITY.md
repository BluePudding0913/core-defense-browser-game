# Security Policy

## Supported version

This repository is an in-development game prototype. Only the latest source on the default branch is supported.

## Reporting a vulnerability

Please use GitHub's private security advisory feature instead of opening a public issue containing exploit details or sensitive information.

## Deployment warning

The included server is intended for local testing or play on a trusted private network. It does not currently provide user authentication, encrypted WebSocket connections, origin restrictions, persistent accounts, or production-grade rate limiting.

Do not expose port `8887` directly to the public internet. A public deployment should place the service behind a properly configured TLS reverse proxy and add authentication, origin validation, rate limiting, logging, and operational monitoring.
