#!/bin/bash
set -euo pipefail
echo "Building frontend..."
npm run build --workspace=frontend
echo "Building backend..."
npm run build --workspace=backend
echo "Build complete."
