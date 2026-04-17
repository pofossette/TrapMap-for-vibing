# Plan 01: Docker 快速部署脚本

---

wave: 1
depends_on: []
files_modified:
  - scripts/deploy.sh
  - scripts/deploy-quick.sh
  - .env.production.example
  - README.md

autonomous: true

requirements_addressed: []

## Objective

创建 Docker 快速运维部署脚本，实现一键部署、更新、停止、清理等运维操作。

## Tasks

### Task 01: 创建主部署脚本 deploy.sh

<read_first>
- scripts/deploy.sh (create new)
- docker-compose.yml
- packages/server/Dockerfile
- .env.example
</read_first>

<action>
Create `scripts/deploy.sh` with the following comprehensive deployment functions:

```bash
#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
ENV_FILE="$PROJECT_ROOT/.env"
DATA_DIR="$PROJECT_ROOT/.data"
CONTAINER_NAME="skill-shareer-server"

# Helper functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
}

# Get docker compose command
get_compose_cmd() {
    if docker compose version &> /dev/null; then
        echo "docker compose"
    else
        echo "docker-compose"
    fi
}

# Create .env file if not exists
create_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        log_info "Creating .env file from template..."
        cat > "$ENV_FILE" << EOF
# Server Configuration
NODE_ENV=production
HOST=0.0.0.0
PORT=4000

# API Keys (Required)
OPENAI_API_KEY=your-openai-api-key-here

# Admin Security (Required - generate with: openssl rand -hex 32)
SKILL_SHAREER_SYSTEM_ADMIN_KEY=$(openssl rand -hex 32)

# Data Storage
SKILL_SHAREER_DATA_FILE=/app/.data/skill-shareer.json
EOF
        log_warn ".env file created. Please edit it with your API keys and configuration."
        log_warn "Required: OPENAI_API_KEY"
        return 1
    fi
    return 0
}

# Create data directory
create_data_dir() {
    mkdir -p "$DATA_DIR"
}

# Build the Docker image
build_image() {
    log_info "Building Docker image..."
    cd "$PROJECT_ROOT"
    $(get_compose_cmd) -f "$COMPOSE_FILE" build
    log_info "Build complete."
}

# Deploy (build and start)
deploy() {
    log_info "Starting deployment..."
    check_docker
    create_env_file || {
        log_error "Please configure .env file before deploying."
        exit 1
    }
    create_data_dir
    build_image
    log_info "Starting container..."
    cd "$PROJECT_ROOT"
    $(get_compose_cmd) -f "$COMPOSE_FILE" up -d
    log_info "Deployment complete! Server running at http://localhost:4000"
    log_info "Check logs: $0 logs"
}

# Start the service
start() {
    log_info "Starting service..."
    check_docker
    create_data_dir
    cd "$PROJECT_ROOT"
    $(get_compose_cmd) -f "$COMPOSE_FILE" up -d
    log_info "Service started."
}

# Stop the service
stop() {
    log_info "Stopping service..."
    check_docker
    cd "$PROJECT_ROOT"
    $(get_compose_cmd) -f "$COMPOSE_FILE" down
    log_info "Service stopped."
}

# Restart the service
restart() {
    log_info "Restarting service..."
    stop
    start
}

# View logs
logs() {
    check_docker
    cd "$PROJECT_ROOT"
    $(get_compose_cmd) -f "$COMPOSE_FILE" logs -f "$CONTAINER_NAME"
}

# Show service status
status() {
    check_docker
    cd "$PROJECT_ROOT"
    $(get_compose_cmd) -f "$COMPOSE_FILE" ps
}

# Clean up (remove container, image, and data)
clean() {
    log_warn "This will remove the container, image, and all data. Are you sure?"
    read -p "Type 'yes' to confirm: " confirm
    if [ "$confirm" = "yes" ]; then
        log_info "Stopping and removing container..."
        cd "$PROJECT_ROOT"
        $(get_compose_cmd) -f "$COMPOSE_FILE" down -v --rmi all
        log_info "Removing data directory..."
        rm -rf "$DATA_DIR"
        log_info "Cleanup complete."
    else
        log_info "Cleanup cancelled."
    fi
}

# Update and restart
update() {
    log_info "Updating service..."
    check_docker
    build_image
    log_info "Restarting with new image..."
    restart
    log_info "Update complete."
}

# Shell access to container
shell() {
    check_docker
    docker exec -it "$CONTAINER_NAME" sh
}

# Show help
show_help() {
    cat << EOF
Skill Shareer - Docker Deployment Script

Usage: $0 <command>

Commands:
  deploy      Build and start the service (first-time deployment)
  start       Start the service
  stop        Stop the service
  restart     Restart the service
  logs        View and follow logs
  status      Show service status
  update      Pull latest, rebuild, and restart
  shell       Access container shell
  clean       Remove container, image, and data (DESTRUCTIVE)
  help        Show this help message

Examples:
  $0 deploy      # Initial deployment
  $0 logs        # View logs
  $0 update      # Update to latest version

Configuration:
  Edit .env file to configure API keys and settings
  Data directory: $DATA_DIR

EOF
}

# Main command routing
case "${1:-}" in
    deploy)
        deploy
        ;;
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    status)
        status
        ;;
    update)
        update
        ;;
    shell)
        shell
        ;;
    clean)
        clean
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: ${1:-}"
        show_help
        exit 1
        ;;
esac
```

Make the script executable:
```bash
chmod +x scripts/deploy.sh
```
</action>

<acceptance_criteria>
- File `scripts/deploy.sh` exists and is executable (permission 755)
- File contains all functions: deploy, start, stop, restart, logs, status, update, shell, clean, help
- `./scripts/deploy.sh help` displays the help message
- `grep -q "check_docker" scripts/deploy.sh` - Docker check function exists
- `grep -q "create_env_file" scripts/deploy.sh` - Env file creation exists
- `grep -q "openssl rand -hex 32" scripts/deploy.sh` - Auto-generates admin key
</acceptance_criteria>

### Task 02: 创建快速部署脚本 deploy-quick.sh

<read_first>
- scripts/deploy-quick.sh (create new)
- scripts/deploy.sh
- .env.example
</read_first>

<action>
Create `scripts/deploy-quick.sh` - a simplified single-command deployment script:

```bash
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
```

Make the script executable:
```bash
chmod +x scripts/deploy-quick.sh
```
</action>

<acceptance_criteria>
- File `scripts/deploy-quick.sh` exists and is executable
- Script checks for OPENAI_API_KEY before deploying
- Script auto-creates .env with random admin key
- `./scripts/deploy-quick.sh` completes without errors when .env is configured
</acceptance_criteria>

### Task 03: 创建生产环境配置模板

<read_first>
- .env.production.example (create new)
- .env.example
</read_first>

<action>
Create `.env.production.example` with production-ready configuration:

```bash
# ============================================
# Skill Shareer - Production Environment
# ============================================
# Copy this file to .env and update values
# cp .env.production.example .env

# --------------------------------------------
# Server Configuration
# --------------------------------------------
NODE_ENV=production
HOST=0.0.0.0
PORT=4000

# --------------------------------------------
# Required API Keys
# --------------------------------------------
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-openai-api-key-here

# --------------------------------------------
# Security
# --------------------------------------------
# Generate with: openssl rand -hex 32
SKILL_SHAREER_SYSTEM_ADMIN_KEY=generate-with-openssl-rand-hex-32

# --------------------------------------------
# Data Storage
# --------------------------------------------
# Data file path (inside container)
SKILL_SHAREER_DATA_FILE=/app/.data/skill-shareer.json

# --------------------------------------------
# Optional: Rate Limiting
# --------------------------------------------
# Max requests per minute (0 = unlimited)
# RATE_LIMIT_MAX=100

# --------------------------------------------
# Optional: CORS
# --------------------------------------------
# Allowed origins (comma-separated, * for all)
# CORS_ALLOWED_ORIGINS=*
```
</action>

<acceptance_criteria>
- File `.env.production.example` exists
- Contains all required environment variables with descriptions
- `grep -q "OPENAI_API_KEY" .env.production.example` - API key documented
- `grep -q "openssl rand -hex 32" .env.production.example` - Admin key generation documented
</acceptance_criteria>

### Task 04: 更新 README.md 添加部署说明

<read_first>
- README.md
- scripts/deploy.sh
- scripts/deploy-quick.sh
</read_first>

<action>
Update README.md with deployment section. Add after the project description:

```markdown
## 🚀 Quick Deploy

The fastest way to deploy:

\`\`\`bash
# 1. Configure environment
cp .env.production.example .env
# Edit .env and add your OPENAI_API_KEY

# 2. Run quick deploy
./scripts/deploy-quick.sh
\`\`\`

Server will be available at http://localhost:4000

---

## 📋 Deployment Options

### Option 1: Quick Deploy (Recommended)

For simple deployments, use the quick deploy script:

\`\`\`bash
./scripts/deploy-quick.sh
\`\`\`

### Option 2: Full Deploy Script

For more control over deployment:

\`\`\`bash
./scripts/deploy.sh deploy
\`\`\`

### Available Commands

| Command | Description |
|---------|-------------|
| \`./scripts/deploy.sh deploy\` | Initial deployment |
| \`./scripts/deploy.sh start\` | Start service |
| \`./scripts/deploy.sh stop\` | Stop service |
| \`./scripts/deploy.sh restart\` | Restart service |
| \`./scripts/deploy.sh logs\` | View logs |
| \`./scripts/deploy.sh status\` | Check status |
| \`./scripts/deploy.sh update\` | Update and restart |
| \`./scripts/deploy.sh shell\` | Access container |
| \`./scripts/deploy.sh clean\` | Remove everything |

### Using Docker Compose Directly

\`\`\`bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
\`\`\`

---

## 🔧 Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| \`OPENAI_API_KEY\` | OpenAI API key | \`sk-...\` |
| \`SKILL_SHAREER_SYSTEM_ADMIN_KEY\` | Admin secret key | Generate with \`openssl rand -hex 32\` |

### Optional Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| \`NODE_ENV\` | Environment | \`production\` |
| \`HOST\` | Bind address | \`0.0.0.0\` |
| \`PORT\` | Server port | \`4000\` |

---

## 📊 Health Check

The service includes a health check endpoint:

\`\`\`bash
curl http://localhost:4000/health
\`\`\`

Expected response:
\`\`\`json
{"status":"ok","timestamp":"..."}
\`\`\`
```
</action>

<acceptance_criteria>
- README.md contains "## 🚀 Quick Deploy" section
- README.md contains "## 📋 Deployment Options" section
- README.md contains "## 🔧 Configuration" section with environment variables
- `grep -q "deploy-quick.sh" README.md` - Quick deploy documented
- `grep -q "OPENAI_API_KEY" README.md` - API key requirement documented
</acceptance_criteria>

---

## Verification Criteria

1. **Scripts exist and are executable**
   - `test -x scripts/deploy.sh` returns 0
   - `test -x scripts/deploy-quick.sh` returns 0

2. **Help command works**
   - Running `./scripts/deploy.sh help` displays all available commands

3. **Environment validation**
   - `.env.production.example` exists with all required variables documented
   - Scripts validate OPENAI_API_KEY before deploying

4. **Documentation complete**
   - README.md has deployment section with quick start
   - All commands are documented in README

5. **Functional test** (manual)
   - `./scripts/deploy-quick.sh` builds and starts the service
   - Service is accessible at http://localhost:4000
   - `./scripts/deploy.sh status` shows running container

## Must-Haves

1. ✅ One-command deployment: `./scripts/deploy-quick.sh`
2. ✅ Comprehensive deployment script with all lifecycle commands
3. ✅ Auto-configuration: .env file creation with secure defaults
4. ✅ Health check validation after deployment
5. ✅ Complete documentation in README.md
