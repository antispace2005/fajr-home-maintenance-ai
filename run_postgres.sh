#!/bin/bash
set -e

CONTAINER_NAME="home_maintenance_pg"

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
      -e POSTGRES_DB=home_maintenance_db \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgrespassword \
      -p 5432:5432 \
      -v postgres_data:/var/lib/postgresql/data \
      --restart unless-stopped \
      postgres:16
fi

echo "Waiting for PostgreSQL to be ready..."
until docker exec ${CONTAINER_NAME} pg_isready -U postgres -d home_maintenance_db; do
  sleep 1
done

echo "PostgreSQL is ready and accepting connections!"
