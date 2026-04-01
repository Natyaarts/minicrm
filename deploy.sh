#!/bin/bash

# Configuration
PROJECT_DIR="/home/ubuntu/minicrm"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
SERVICE_NAME="minicrm-backend"

echo "🚀 Starting Deployment..."

# 1. Pull latest changes
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# 2. Backend Updates
echo "🐍 Updating Backend..."
if [ -d "$VENV_DIR" ]; then
    source "$VENV_DIR/bin/activate"
    pip install -r "$BACKEND_DIR/requirements.txt"
    python "$BACKEND_DIR/manage.py" migrate
    deactivate
else
    echo "⚠️  Warning: Virtual environment not found at $VENV_DIR"
fi

# 3. Frontend Updates
echo "⚛️  Building Frontend..."
cd "$FRONTEND_DIR"
if [ -d "node_modules" ]; then
    npm run build
else
    echo "📦 node_modules missing, running npm install first..."
    npm install
    npm run build
fi
cd "$PROJECT_DIR"

# 4. Restart Services
echo "🔄 Restarting Services..."
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager

echo "✅ Deployment Successful!"
