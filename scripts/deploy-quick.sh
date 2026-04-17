#!/bin/bash
# Quick deploy script for Skill Shareer server
# Usage: ./scripts/deploy-quick.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 Skill Shareer - Quick Deployment${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cat > .env << EOF
# API Keys (Required)
OPENAI_API_KEY=your-openai-api-key-here

# Admin Security
SKILL_SHAREER_SYSTEM_ADMIN_KEY=$(openssl rand -hex 32)

# Server Config
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
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
