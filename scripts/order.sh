#!/bin/bash

# Load environment variables
source .env

# Change to parent directory and then into contracts folder
cd "$(dirname "$0")/.."
cd contracts

# Call createEscrow function with test values
# Using account 2 as buyer (0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
cast send --private-key $BUYER_PRIVATE_KEY \
    0x5FbDB2315678afecb367f032d93F642f64180aa3 \
    "createEscrow(uint256,uint256,string memory)" \
    0 \
    1000 \
    "This is a test order" \
    --value 1 \
    --rpc-url http://localhost:8545
