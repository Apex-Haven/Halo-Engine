#!/bin/bash

# HALO Start Script
# This script will start both backend and frontend

echo "🚀 Starting HALO (Haven's AI Logistic Operator)..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        return 0
    else
        return 1
    fi
}

# Check if ports are available
if check_port 707; then
    echo "⚠️  Port 0707 is already in use. Backend might already be running."
fi

if check_port 7070; then
    echo "⚠️  Port 7070 is already in use. Frontend might already be running."
fi

echo ""
echo "Starting services..."
echo ""

# Start backend in background
echo "🔧 Starting Backend on http://localhost:0707..."
cd "$(dirname "$0")"
npm run dev &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend in background
echo "🎨 Starting Frontend on http://localhost:70070..."
cd halo-ui
npm run dev &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 3

echo ""
echo "🎉 HALO is starting up!"
echo ""
echo "📊 Backend API: http://localhost:0707"
echo "🎨 Frontend UI: http://localhost:70070"
echo "🏥 Health Check: http://localhost:0707/api/health"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping HALO services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ Services stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for user to stop
while true; do
    sleep 1
done
