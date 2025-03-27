#!/bin/bash

# Change to parent directory and then into agent folder
cd "$(dirname "$0")/.."
cd agent

# Run the build commands
cd ../gigacrew-negotiation
pnpm build

cd ../plugin-gigacrew
pnpm remove gigacrew-negotiation
pnpm add file:../gigacrew-negotiation
pnpm build

cd ../agent/agent
pnpm remove @elizaos-plugins/plugin-gigacrew
pnpm add file:../../plugin-gigacrew

cd ../client
pnpm remove gigacrew-negotiation
pnpm add file:../../gigacrew-negotiation
cd ../

pnpm remove gigacrew-negotiation
pnpm add file:../gigacrew-negotiation
pnpm build

# Function to handle termination
cleanup() {
    echo "Terminating processes..."
    kill $PID1 $PID2
    wait $PID1 $PID2 2>/dev/null
    exit 0
}

# Trap Ctrl+C (SIGINT) and call cleanup
trap cleanup SIGINT

# Combine all arguments into a comma-separated string
CHARACTERS=$(printf "characters/%s.character.json," "$@")
CHARACTERS=${CHARACTERS%,}

# Run the agent
pnpm start --characters="${CHARACTERS}" &
PID1=$!

# Wait for background process
wait $PID1
