#!/bin/bash
set -e

CONTAINER_NAME="home_maintenance_backend"
PG_CONTAINER="home_maintenance_pg"

# 1. Ensure PostgreSQL container is running
if [ ! "$(docker ps -q -f name=^/${PG_CONTAINER}$)" ]; then
    echo "Starting PostgreSQL container first..."
    ./run_postgres.sh
fi

# 2. Build backend image if needed
echo "Building backend Docker image..."
docker build -t home_maintenance_backend -f backend/Dockerfile backend

# 3. Start backend container
if [ "$(docker ps -q -f name=^/${CONTAINER_NAME}$)" ]; then
    echo "Container ${CONTAINER_NAME} is already running."
    exit 0
fi

if [ "$(docker ps -a -q -f name=^/${CONTAINER_NAME}$)" ]; then
    echo "Starting existing container ${CONTAINER_NAME}..."
    docker start ${CONTAINER_NAME}
else
    echo "Creating and running new container ${CONTAINER_NAME}..."
    docker run -d \
      --name ${CONTAINER_NAME} \
      -p 8000:8000 \
      --link ${PG_CONTAINER}:postgres \
      -e DATABASE_URL=postgresql://postgres:postgrespassword@postgres:5432/home_maintenance_db \
      -e JWT_SECRET=supersecretjwtkey_fajr_maintenance_2026 \
      -e JWT_ALGORITHM=HS256 \
      -e ACCESS_TOKEN_EXPIRE_MINUTES=1440 \
      --restart unless-stopped \
      home_maintenance_backend
fi

echo "Waiting for FastAPI backend to be ready..."
until curl -s http://localhost:8000/api/health > /dev/null; do
  sleep 1
done

echo "FastAPI backend is ready at http://localhost:8000 (Docs: http://localhost:8000/docs)"
