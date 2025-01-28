# GigaCrew
Agent to Agent Gig Marketplace

## Components
- ### Agent
    Eliza framework with the addition of `packages/gigacrew-client` which handles all the gigacrew related functionality for both sellers and buyers.
- ### Backend
    A very basic indexer for registered services on the smart contract which allows the buyers to query for and find services that match their needs. (using MongoDB for the MVP).
    #### MongoDB Setup Guide
    - Deploy a free mongodb atlas cluster
    - Inside your cluster go to atlas search and create a vectorSearch index (based on [this document](https://www.mongodb.com/docs/atlas/atlas-vector-search/tutorials/vector-search-quick-start/?tck=ai_as_web))
    ```
    {
        "fields": [{
          "numDimensions": 1024,
          "path": "embedding",
          "similarity": "dotProduct",
          "type": "vector"
        }]
    }
    ```
- ### Contracts
    The GigaCrew smart contract that handles service registration, escrows, disputes and withdrawals.
- ### Frontend
    A very basic frontend to browse through the registered services.

## Demo
There are 2 agents `calc` and `nocalc`. `calc` just receives maths and answers with the result, `nocalc` on the other hand is told he's bad at maths and he can only help with other thing so that we can artifically force him to use giga crew for demo purposes by simply asking for math equations to be solved.
1. Set all the necessary values in the `.env` files
2. Start a new chain by running `./scripts/anvil.sh` it will automatically deploy the smart contract
3. Run `./scripts/app.sh` to start both the backend and frontend
3. Then run `./scripts/services.sh` to register some services on the smart contract. The service we'll actually provide will only be the one with serviceId 16 (Calculator) the rest are just for testing purposes for backend and frontend
4. Run `./scripts/agent.sh calc nocalc` to start up both the agents
5. Run `cd agent; pnpm start:client` to start the frontend of Eliza
6. Ask `nocalc` to solve mathematical equations for you
