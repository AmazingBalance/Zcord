# Zcord Docker Setup

This project can be run using Docker for both development and production environments.

## Prerequisites

- Docker
- Docker Compose

## Project Structure

- **Frontend**: Next.js application (port 3000)
- **Backend**: Go server (port 8000)
- **Database**: PostgreSQL (port 5435)

## Quick Start

### Production Environment

1. Build and start all services:

```bash
docker-compose up --build
```

2. Access the application:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Database: localhost:5435

### Development Environment

1. Build and start development services:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

2. The development setup includes:

- Hot reload for Next.js frontend
- Volume mounting for live code changes
- Development-optimized configurations

## Individual Service Management

### Database Only

```bash
docker-compose up postgres
```

### Backend Only

```bash
docker-compose up postgres backend
```

### Frontend Only (requires backend running)

```bash
docker-compose up frontend
```

## Environment Variables

The following environment variables are configured in docker-compose.yml:

### Database

- `POSTGRES_DB=zcord`
- `POSTGRES_USER=nikdimer`
- `POSTGRES_PASSWORD=technocraft2000`

### Backend

- `DATABASE_URL=postgres://nikdimer:technocraft2000@postgres:5432/zcord?sslmode=disable`

### Frontend

- `NODE_ENV=production` (or `development` in dev mode)
- `NEXT_PUBLIC_API_URL=http://localhost:8000`

## Data Persistence

- PostgreSQL data is persisted using the existing `my_postgres_data` directory
- Backend uploads are stored in `server/uploads` directory
- Both are mounted as volumes for data persistence

## Useful Commands

### Stop all services

```bash
docker-compose down
```

### Rebuild specific service

```bash
docker-compose build backend
docker-compose build frontend
```

### View logs

```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### Clean up

```bash
# Remove containers and networks
docker-compose down

# Remove containers, networks, and volumes
docker-compose down -v

# Remove all unused Docker resources
docker system prune -a
```

## Troubleshooting

### Database Connection Issues

- Ensure PostgreSQL container is running: `docker-compose ps`
- Check database logs: `docker-compose logs postgres`
- Verify database credentials in docker-compose.yml

### Port Conflicts

- If ports 3000, 8000, or 5435 are in use, modify the port mappings in docker-compose.yml
- Format: `"host_port:container_port"`

### Build Issues

- Clear Docker cache: `docker builder prune`
- Rebuild without cache: `docker-compose build --no-cache`

### File Permissions (Linux/macOS)

- Ensure proper permissions for uploads directory:

```bash
chmod -R 755 server/uploads
```

## Development Tips

1. Use the development compose file for active development
2. Backend changes require container restart in production mode
3. Frontend changes are automatically reflected in development mode
4. Database schema changes may require volume recreation
