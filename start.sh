#!/bin/sh

# Exit immediately if a command exits with a non-zero status
set -e

SERVICE=$1

echo "Starting service: $SERVICE"

if [ "$SERVICE" = "auth" ]; then
    echo "Running Auth database migrations..."
    alembic -c services/auth_service/alembic.ini upgrade head
    echo "Starting Auth Service..."
    exec uvicorn services.auth_service.app.main:app --host 0.0.0.0 --port 8000

elif [ "$SERVICE" = "inventory" ]; then
    echo "Starting Inventory Service..."
    exec uvicorn services.inventory_service.app.main:app --host 0.0.0.0 --port 8000

elif [ "$SERVICE" = "sales" ]; then
    echo "Starting Sales Service..."
    exec uvicorn services.sales_service.app.main:app --host 0.0.0.0 --port 8000

elif [ "$SERVICE" = "gateway" ]; then
    echo "Starting API Gateway..."
    exec uvicorn services.api_gateway.app.main:app --host 0.0.0.0 --port 8000

else
    echo "Error: Unknown service type '$SERVICE'"
    echo "Usage: start.sh [auth|inventory|sales|gateway]"
    exit 1
fi
