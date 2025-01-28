import { Client, IAgentRuntime, elizaLogger } from "@elizaos/core";
import { BlockTag, ethers } from "ethers";
import { getGigaCrewConfig, GigaCrewConfig } from "./environment";
import GigaCrewJSON from "./abi/GigaCrew.json";
import { GigaCrewSellerHandler } from "./seller";
import { GigaCrewBuyerHandler } from "./buyer";
import { workResponseGenerator } from "./worker";
import { GigaCrewDatabase } from "./db";
export * from "./actions";

const GigaCrewABI = GigaCrewJSON.abi;

export class GigaCrewClient {
    runtime: IAgentRuntime;
    config: GigaCrewConfig;
    provider: ethers.Provider;
    contract: ethers.Contract;
    seller: ethers.Wallet | null;
    buyer: ethers.Wallet | null;
    db: GigaCrewDatabase;
    filters: any[];

    sellerHandler: GigaCrewSellerHandler | null;
    buyerHandler: GigaCrewBuyerHandler | null;

    constructor(runtime: IAgentRuntime, config: GigaCrewConfig) {
        this.runtime = runtime;
        this.config = config;

        if (!this.config.GIGACREW_PROVIDER_URL || !this.config.GIGACREW_CONTRACT_ADDRESS) {
            throw new Error("GigaCrew client requires GIGACREW_PROVIDER_URL and GIGACREW_CONTRACT_ADDRESS");
        }

        const provider_url = this.config.GIGACREW_PROVIDER_URL;
        if (provider_url.startsWith("ws://") || provider_url.startsWith("wss://")) {
            this.provider = new ethers.WebSocketProvider(provider_url);
        } else if (provider_url.startsWith("http://") || provider_url.startsWith("https://")) {
            this.provider = new ethers.JsonRpcProvider(provider_url);
        } else {
            throw new Error("Invalid provider URL. Must start with ws://, wss://, http://, or https://");
        }

        this.contract = new ethers.Contract(this.config.GIGACREW_CONTRACT_ADDRESS, GigaCrewABI, this.provider);

        this.seller = this.config.GIGACREW_SELLER_PRIVATE_KEY ? new ethers.Wallet(this.config.GIGACREW_SELLER_PRIVATE_KEY, this.provider) : null;
        this.buyer = this.config.GIGACREW_BUYER_PRIVATE_KEY ? new ethers.Wallet(this.config.GIGACREW_BUYER_PRIVATE_KEY, this.provider) : null;
        if (!this.seller && !this.buyer) {
            throw new Error("GigaCrew client requires at least one of GIGACREW_SELLER_PRIVATE_KEY or GIGACREW_BUYER_PRIVATE_KEY");
        }

        this.db = new GigaCrewDatabase(this.runtime.databaseAdapter.db);

        if (this.seller) {
            if (!this.config.GIGACREW_SERVICE_ID) {
                throw new Error("GigaCrew client requires GIGACREW_SERVICE_ID when acting as a seller");
            }
            this.sellerHandler = new GigaCrewSellerHandler(this.runtime, this.seller, this.contract, this.config, this.db, workResponseGenerator);
        }

        if (this.buyer) {
            if (!this.config.GIGACREW_INDEXER_URL) {
                throw new Error("GigaCrew client requires GIGACREW_INDEXER_URL when acting as a buyer");
            }
            this.buyerHandler = new GigaCrewBuyerHandler(this.runtime, this.buyer, this.contract, this.config, this.db);
        }

        this.filters = [];
    }

    async start() {
        if (this.seller && this.runtime.character.name !== "NoCalc") {
            this.filters.push(...await this.sellerHandler.filters());
            this.sellerHandler.start();
        }
        if (this.buyer && this.runtime.character.name !== "Calc") {
            this.filters.push(...await this.buyerHandler.filters());
            this.buyerHandler.start();
        }

        let fromBlock = 0;
        if (this.config.GIGACREW_FORCE_FROM_BLOCK) {
            fromBlock = this.config.GIGACREW_FROM_BLOCK;
        } else {
            fromBlock = Math.max(this.config.GIGACREW_FROM_BLOCK, await this.runtime.cacheManager.get("gigacrew_last_block") || 0);
        }
        elizaLogger.log("Gigacrew Event Listener: Start", { lastBlock: fromBlock });
        this.listen(fromBlock);
    }

    async listen(fromBlock: number) {
        let toBlock = await this.provider.getBlockNumber();
        if (toBlock < fromBlock) {
            setTimeout(() => {
                this.listen(fromBlock);
            }, 5000);
            return;
        }

        for (const filter of this.filters) {
            const events = await this.contract.queryFilter(filter.event, fromBlock as BlockTag, toBlock as BlockTag);
            events.forEach(filter.handler);
        }

        await this.runtime.cacheManager.set("gigacrew_last_block", toBlock);

        setTimeout(() => {
            this.listen(toBlock + 1);
        }, 5000);
    }
}

export const GigaCrewClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        const config = await getGigaCrewConfig(runtime);
        const client = new GigaCrewClient(runtime, config);
        await client.start();
        return client;
    },
    stop: async (_runtime: IAgentRuntime) => {
        console.warn("GigaCrew client does not support stopping yet");
    },
};
