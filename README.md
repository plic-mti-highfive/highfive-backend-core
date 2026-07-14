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

### 4. MinIO setup

You need to setup a MinIO bucket and lauch some command to setup it.

### Create Bucket

First, access the MinIO admin panel at `http://localhost:9001` and login (`minioadmin` by default).
Then, click on `Create Bucket` and enter `highfive-core-bucket`, or the name specified in yout .env if you changed it.

### Change Security Access

By default, every bucket are PRIVATE. You need to give anonymous read access to allow the lecture from it. Follow these commands :

```bash
docker exec -it dev_highfive_minio bash
mc alias set mon-minio http://localhost:9000 minioadmin minioadmin
mc anonymous set download mon-minio/highfive-core-bucket
```

Change the bucket name if needed. You should have something like that :

```bash
bash-5.1# mc alias set mon-minio http://localhost:9000 minioadmin minioadmin
Added `mon-minio` successfully.

bash-5.1# mc anonymous set download mon-minio/highfive-core-bucket
Access permission for `mon-minio/highfive-core-bucket` is set to `download`
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
