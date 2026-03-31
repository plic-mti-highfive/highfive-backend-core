# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Docker support with `Dockerfile` for containerized deployment
- `.dockerignore` file to optimize Docker builds
- `docker-compose.yml` for local development environment setup
- GitHub Actions CI/CD pipeline (`.github/workflows/pipeline.yml`)
- `pnpm-lock.yaml` for lock file management with pnpm

### Changed
- Migrated from npm to pnpm for dependency management
- Updated `.gitignore` configuration
- Enhanced `README.md` with additional documentation
- Modified authentication service and tests:
  - `src/identity/auth/auth.service.ts`
  - `src/identity/auth/auth.service.spec.ts`
- Updated user identity modules:
  - `src/identity/skills/skills.controller.ts`
  - `src/identity/user-connections/user-connections.service.ts`
  - `src/identity/user-profiles/entities/user-profile.entity.ts`
  - `src/identity/user-profiles/user-profiles.service.ts`
- Enhanced project execution modules:
  - `src/project-execution/project-members/project-members.controller.ts`
  - `src/project-execution/project-messages/entities/project-message.entity.ts`
  - `src/project-execution/projects/projects.service.spec.ts`
  - `src/project-execution/tickets/tickets.service.spec.ts`
- Updated shared utilities:
  - `src/shared/decorators/roles.decorator.ts`
  - `src/shared/filters/http-exception.filter.ts`
- Enhanced main application entry point (`src/main.ts`)
- Updated `package.json` configuration

### Removed
- `package-lock.json` (replaced by pnpm-lock.yaml)
- `test/jest-e2e.json` (E2E test configuration)
