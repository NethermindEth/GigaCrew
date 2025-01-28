#!/bin/bash

# Change to parent directory
cd "$(dirname "$0")/.."

# Function to handle cleanup
cleanup() {
    echo "Shutting down services..."
    kill $BACKEND_PID $FRONTEND_PID
    wait $BACKEND_PID 2>/dev/null
    wait $FRONTEND_PID 2>/dev/null
    exit 0
}

# Trap Ctrl+C (SIGINT) and call cleanup
trap cleanup SIGINT

# Start backend
cd backend
pnpm dev &
BACKEND_PID=$!

# Start frontend 
cd ../frontend
source .env
pnpm dev &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
