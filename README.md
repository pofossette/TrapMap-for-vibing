# TrapMap

A monorepo for skill sharing platform with server, CLI, and contracts packages.

## 🚀 Quick Deploy

The fastest way to deploy:

```bash
# 1. Configure environment
cp .env.production.example .env
# Edit .env and add your OPENAI_API_KEY

# 2. Run quick deploy
./scripts/deploy-quick.sh
```

Server will be available at http://localhost:4000

---

## 📋 Deployment Options

### Option 1: Quick Deploy (Recommended)

For simple deployments, use the quick deploy script:

```bash
./scripts/deploy-quick.sh
```

### Option 2: Full Deploy Script

For more control over deployment:

```bash
./scripts/deploy.sh deploy
```

### Available Commands

| Command | Description |
|---------|-------------|
| `./scripts/deploy.sh deploy` | Initial deployment |
| `./scripts/deploy.sh start` | Start service |
| `./scripts/deploy.sh stop` | Stop service |
| `./scripts/deploy.sh restart` | Restart service |
| `./scripts/deploy.sh logs` | View logs |
| `./scripts/deploy.sh status` | Check status |
| `./scripts/deploy.sh update` | Update and restart |
| `./scripts/deploy.sh shell` | Access container |
| `./scripts/deploy.sh clean` | Remove everything |

### Using Docker Compose Directly

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

---

## 🔧 Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `TRAPMAP_SYSTEM_ADMIN_KEY` | Admin secret key | Generate with `openssl rand -hex 32` |

### Optional Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `HOST` | Bind address | `0.0.0.0` |
| `PORT` | Server port | `4000` |

---

## 📊 Health Check

The service includes a health check endpoint:

```bash
curl http://localhost:4000/health
```

Expected response:
```json
{"status":"ok","timestamp":"..."}
```

---

## 📁 Project Structure

```
trapmap/
├── packages/
│   ├── server/      # Main server application
│   ├── cli/         # Command-line interface
│   └── contracts/   # Shared contracts
├── scripts/
│   ├── deploy.sh          # Full deployment script
│   └── deploy-quick.sh    # Quick deployment script
├── docker-compose.yml
└── README.md
```

---

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run server in development
pnpm dev:server

# Run CLI in development
pnpm dev:cli

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```
