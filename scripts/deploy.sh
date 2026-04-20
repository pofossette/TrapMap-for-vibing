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
LOGS_DIR="$PROJECT_ROOT/logs"
CONTAINER_NAME="trapmap-server"

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
TRAPMAP_SYSTEM_ADMIN_KEY=$(openssl rand -hex 32)

# Data Storage
TRAPMAP_DATA_FILE=/app/.data/trapmap.json

# Logging Configuration (Phase 24)
LOG_USER_OPS_ENABLED=false
LOG_USER_OPS_DIR=/app/logs/user-ops
LOG_RAG_ENABLED=false
LOG_RAG_DIR=/app/logs/rag
LOG_MAX_FILE_SIZE_MB=10
LOG_MAX_BACKUP_FILES=5
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

# Create logs directory
create_logs_dir() {
    mkdir -p "$LOGS_DIR"
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
    create_logs_dir
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
    create_logs_dir
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
TrapMap - Docker Deployment Script

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
