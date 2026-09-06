# Zcord Podman Setup

This project can be run using Podman for both development and production environments.

## Prerequisites

- Podman
- Podman Compose (or docker-compose with Podman compatibility)

## Project Structure

- **Frontend**: Next.js application (port 3000)
- **Backend**: Go server (port 8000)
- **Database**: PostgreSQL (port 5435)

## Quick Start

### Production Environment

1. Build and start all services:

```bash
podman-compose -f podman-compose.yml up --build
```

Or using podman compose:

```bash
podman compose -f podman-compose.yml up --build
```

2. Access the application:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Database: localhost:5435

### Development Environment

1. Build and start development services:

```bash
podman-compose -f podman-compose.dev.yml up --build
```

Or using podman compose:

```bash
podman compose -f podman-compose.dev.yml up --build
```

2. The development setup includes:

- Hot reload for Next.js frontend
- Volume mounting for live code changes
- Development-optimized configurations

## Individual Service Management

### Database Only

```bash
podman-compose -f podman-compose.yml up postgres
```

### Backend Only

```bash
podman-compose -f podman-compose.yml up postgres backend
```

### Frontend Only (requires backend running)

```bash
podman-compose -f podman-compose.yml up frontend
```

## Environment Variables

The following environment variables are configured in podman-compose.yml:

### Database

- `POSTGRES_DB=zcord`
- `POSTGRES_USER=zcord`
- `POSTGRES_PASSWORD=<POSTGRES_PASSWORD>`

### Backend

- `DATABASE_URL=postgres://zcord:<POSTGRES_PASSWORD>@postgres:5432/zcord?sslmode=disable`

### Frontend

- `NODE_ENV=production` (or `development` in dev mode)
- `NEXT_PUBLIC_API_URL=http://localhost:8000`

## Data Persistence

- PostgreSQL data is persisted using the existing `my_postgres_data` directory
- Backend uploads are stored in `server/uploads` directory
- Both are mounted as volumes for data persistence with SELinux labels (`:Z`)

## Useful Commands

### Stop all services

```bash
podman-compose -f podman-compose.yml down
```

### Rebuild specific service

```bash
podman-compose -f podman-compose.yml build backend
podman-compose -f podman-compose.yml build frontend
```

### View logs

```bash
podman-compose -f podman-compose.yml logs -f backend
podman-compose -f podman-compose.yml logs -f frontend
podman-compose -f podman-compose.yml logs -f postgres
```

### Clean up

```bash
# Remove containers and networks
podman-compose -f podman-compose.yml down

# Remove containers, networks, and volumes
podman-compose -f podman-compose.yml down -v

# Remove all unused Podman resources
podman system prune -a
```

## Podman-Specific Features

### Rootless Containers

Podman runs containers without root privileges by default, providing better security:

```bash
# Check if running rootless
podman info --format "{{.Host.Security.Rootless}}"
```

### SELinux Support

The compose files include SELinux labels (`:Z`) for proper volume mounting on SELinux-enabled systems.

### User Namespace Mapping

The compose files use `userns_mode: keep-id` to maintain proper file ownership between host and containers.

## Troubleshooting

### Database Connection Issues

- Ensure PostgreSQL container is running: `podman-compose -f podman-compose.yml ps`
- Check database logs: `podman-compose -f podman-compose.yml logs postgres`
- Verify database credentials in podman-compose.yml

### Port Conflicts

- If ports 3000, 8000, or 5435 are in use, modify the port mappings in podman-compose.yml
- Format: `"host_port:container_port"`

### Build Issues

- Clear Podman cache: `podman builder prune`
- Rebuild without cache: `podman-compose -f podman-compose.yml build --no-cache`

### File Permissions

- Ensure proper permissions for uploads directory:

```bash
chmod -R 755 server/uploads
```

### SELinux Issues

If you encounter SELinux-related permission issues:

```bash
# Set SELinux context for volumes
sudo setsebool -P container_manage_cgroup on
```

## Migration from Docker

If migrating from Docker:

1. Stop Docker services:

```bash
docker-compose down
```

2. Start Podman services:

```bash
podman-compose -f podman-compose.yml up -d
```

3. Data should be preserved as volumes use the same paths

## Development Tips

1. Use the development compose file for active development
2. Backend changes require container restart in production mode
3. Frontend changes are automatically reflected in development mode
4. Database schema changes may require volume recreation
5. Podman provides better security with rootless containers
6. Use `podman logs <container-name>` for individual container logs
