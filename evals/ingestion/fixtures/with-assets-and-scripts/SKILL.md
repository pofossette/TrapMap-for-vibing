---
name: fullstack-app
description: Full-stack application setup with build scripts and configuration
labels:
  - fullstack
  - typescript
  - deployment
---

# Full-Stack Application Setup

## Situation

Setting up a new full-stack TypeScript project requires coordinating frontend and backend build processes, shared type definitions, and deployment scripts that work across development and production environments.

## Problem

Monorepo setups often have inconsistent build configurations between packages. Deployment scripts may not properly handle the build order dependency between frontend assets and the backend server that serves them.

## Goal

Establish a reliable monorepo build pipeline with shared TypeScript config, proper build ordering, and a single deployment script that handles both frontend and backend artifacts.
