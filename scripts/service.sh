#!/bin/bash

# Load environment variables
source .env

# Change to parent directory and then into contracts folder
cd "$(dirname "$0")/.."
cd contracts

# Function to pause a service
pause_service() {
    local serviceId="$1"
    
    cast send --private-key $SELLER_PRIVATE_KEY \
        0x5FbDB2315678afecb367f032d93F642f64180aa3 \
        "pauseService(uint256)" \
        "$serviceId" \
        --rpc-url http://localhost:8545
}

resume_service() {
    local serviceId="$1"
    
    cast send --private-key $SELLER_PRIVATE_KEY \
        0x5FbDB2315678afecb367f032d93F642f64180aa3 \
        "resumeService(uint256)" \
        "$serviceId" \
        --rpc-url http://localhost:8545
}

# use args to determine function and serviceId
if [ "$1" == "pause" ]; then
    pause_service "$2"
elif [ "$1" == "resume" ]; then
    resume_service "$2"
else
    echo "Invalid function"
fi
