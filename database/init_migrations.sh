#!/bin/bash
# Initialize database migrations for a fresh installation

set -e

echo "🔧 Initializing database migrations..."

cd backend

# For Alembic
if [ -f "alembic.ini" ]; then
    echo "Using Alembic for migrations..."
    alembic init migrations
    alembic revision --autogenerate -m "Initial schema"
    alembic upgrade head
    echo "✅ Alembic migrations initialized"
fi

# For Aerich (Tortoise ORM)
if [ -f "aerich.ini" ]; then
    echo "Using Aerich for migrations..."
    aerich init -t app.core.config.TORTOISE_ORM
    aerich init-db
    echo "✅ Aerich migrations initialized"
fi

echo "✅ Database migrations setup complete!"
