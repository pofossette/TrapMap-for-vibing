#!/bin/bash
# Quick deploy script for TrapMap server
# Usage: ./scripts/deploy-quick.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 TrapMap - Quick Deployment${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cat > .env << EOF
# API Keys (Required)
OPENAI_API_KEY=your-openai-api-key-here
# GEMINI_API_KEY=

# Admin Security (Optional unless you need system-admin bootstrap)
TRAPMAP_SYSTEM_ADMIN_KEY=$(openssl rand -hex 32)

# Server Config
NODE_ENV=production
HOST=0.0.0.0
PORT=4000

# Database (recommended)
POSTGRES_PASSWORD=trapmap
TRAPMAP_DATABASE_URL=postgres://trapmap:\${POSTGRES_PASSWORD}@postgres:5432/trapmap
EOF
    echo -e "${YELLOW}⚠️  Please edit .env and add your OPENAI_API_KEY${NC}"
    echo ""
    read -p "Press Enter after configuring .env to continue..."
fi

# Check for API key
if grep -q "your-openai-api-key-here" .env; then
    echo -e "${YELLOW}⚠️  OPENAI_API_KEY not set in .env${NC}"
    echo "Please edit .env and add your API key, then run this script again."
    exit 1
fi

# Create data directory
mkdir -p .data

# Build and start
echo -e "${GREEN}Building Docker image...${NC}"
docker compose build

echo -e "${GREEN}Starting service...${NC}"
docker compose up -d

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Server: http://localhost:4000"
echo "Logs: docker compose logs -f"
echo "Stop: docker compose down"
echo ""
