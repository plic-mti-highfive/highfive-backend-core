# HighFive! - Core Backend

NestJS backend for project execution, identity management, and discovery features. Built with TypeScript and PostgreSQL.

## Prerequisites

- Node.js >= 18
- pnpm
- Docker & Docker Compose (for development with PostgreSQL)

## Local Setup

### 1. Clone and install dependencies

```bash
git clone <repository>
cd highfive-backend-core
pnpm install
```

### 2. Environment variables

Create a `.env` file at the root with required configurations for your environment.

### 3. Start with Docker Compose (development)

```bash
docker-compose up --build
```

### Development

```bash
pnpm start:dev
```

The server will start on `http://localhost:3000` with hot reload enabled.

### Production

```bash
pnpm build
pnpm start:prod
```

## npm Scripts

| Command            | Description                    |
| ------------------ | ------------------------------ |
| `pnpm start`       | Start compiled server          |
| `pnpm start:dev`   | Start in watch mode (auto-reload) |
| `pnpm build`       | Compile TypeScript to JavaScript |
| `pnpm test`        | Run unit tests                 |
| `pnpm test:e2e`    | Run e2e tests                  |
| `pnpm test:cov`    | Run tests with coverage report |
| `pnpm lint`        | ESLint check                   |
| `pnpm format`      | Prettier formatting            |

## Project Structure

```
src/
├── main.ts                    # Entry point
├── app.module.ts              # Root module
├── identity/                  # Identity & authentication
│   ├── user-profiles/
│   ├── user-connections/
│   ├── auth/
│   └── skills/
├── project-execution/         # Project management
│   ├── projects/
│   ├── project-members/
│   ├── project-messages/
│   └── tickets/
├── discovery/                 # Discovery features
├── shared/                    # Shared utilities
│   ├── decorators/
│   ├── filters/
│   └── ...
└── showcase/                  # Showcase features

test/                          # E2E tests
```

## Architecture

The application follows NestJS best practices with modular structure, dependency injection, and comprehensive error handling.

### Key Features

- JWT authentication
- Role-based access control via decorators
- Centralized HTTP exception filtering
- Modular organization by domain
- E2E testing setup
