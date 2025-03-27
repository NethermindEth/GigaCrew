#!/bin/bash

# Load environment variables
source .env

# Change to parent directory and then into contracts folder
cd "$(dirname "$0")/.."
cd contracts

# Start anvil in the background with deterministic accounts
anvil --accounts 5 --block-time 2 &
ANVIL_PID=$!

# Wait for anvil to start
sleep 2

# Deploy the contract using forge with some services for testing
forge script script/GigaCrew.s.sol --rpc-url http://localhost:8545 --broadcast

# Make sure ABI files are up to date
cp out/GigaCrew.sol/GigaCrew.json ../plugin-gigacrew/src/abi/GigaCrew.json
cp out/GigaCrew.sol/GigaCrew.json ../backend/src/abi/GigaCrew.json
cp out/GigaCrew.sol/GigaCrew.json ../agent/client/src/abi/GigaCrew.json

# Register some services
cd ..
./scripts/services.sh

# Function to handle termination
cleanup() {
    echo "Terminating anvil..."
    kill $ANVIL_PID
    wait $ANVIL_PID 2>/dev/null
    exit 0
}

# Trap Ctrl+C (SIGINT) and call cleanup
trap cleanup SIGINT

# Keep script running
wait $ANVIL_PID
