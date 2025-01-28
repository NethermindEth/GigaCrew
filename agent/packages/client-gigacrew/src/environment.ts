import { IAgentRuntime } from "@elizaos/core";

export interface GigaCrewConfig {
    GIGACREW_PROVIDER_URL: string;
    GIGACREW_CONTRACT_ADDRESS: string;
    GIGACREW_SELLER_PRIVATE_KEY: string;
    GIGACREW_SELLER_ADDRESS: string;
    GIGACREW_BUYER_PRIVATE_KEY: string;
    GIGACREW_BUYER_ADDRESS: string;
    GIGACREW_SERVICE_ID: string;
    GIGACREW_TIME_PER_SERVICE: number;
    GIGACREW_TIME_BUFFER: number;
    GIGACREW_FROM_BLOCK: number;
    GIGACREW_INDEXER_URL: string;
    GIGACREW_FORCE_FROM_BLOCK: boolean;
}

export async function getGigaCrewConfig(runtime: IAgentRuntime): Promise<GigaCrewConfig> {

    const gigacrewConfig: GigaCrewConfig = {
        GIGACREW_PROVIDER_URL: runtime.getSetting("GIGACREW_PROVIDER_URL") || process.env.GIGACREW_PROVIDER_URL,
        GIGACREW_CONTRACT_ADDRESS: runtime.getSetting("GIGACREW_CONTRACT_ADDRESS") || process.env.GIGACREW_CONTRACT_ADDRESS,
        GIGACREW_SELLER_PRIVATE_KEY: runtime.getSetting("GIGACREW_SELLER_PRIVATE_KEY") || process.env.GIGACREW_SELLER_PRIVATE_KEY,
        GIGACREW_SELLER_ADDRESS: runtime.getSetting("GIGACREW_SELLER_ADDRESS") || process.env.GIGACREW_SELLER_ADDRESS,
        GIGACREW_BUYER_PRIVATE_KEY: runtime.getSetting("GIGACREW_BUYER_PRIVATE_KEY") || process.env.GIGACREW_BUYER_PRIVATE_KEY,
        GIGACREW_BUYER_ADDRESS: runtime.getSetting("GIGACREW_BUYER_ADDRESS") || process.env.GIGACREW_BUYER_ADDRESS,
        GIGACREW_SERVICE_ID: runtime.getSetting("GIGACREW_SERVICE_ID") || process.env.GIGACREW_SERVICE_ID,
        GIGACREW_TIME_PER_SERVICE: parseInt(runtime.getSetting("GIGACREW_TIME_PER_SERVICE") || process.env.GIGACREW_TIME_PER_SERVICE || "0"),
        GIGACREW_TIME_BUFFER: parseInt(runtime.getSetting("GIGACREW_TIME_BUFFER") || process.env.GIGACREW_TIME_BUFFER || "0"),
        GIGACREW_FROM_BLOCK: parseInt(runtime.getSetting("GIGACREW_FROM_BLOCK") || process.env.GIGACREW_FROM_BLOCK || "0"),
        GIGACREW_INDEXER_URL: runtime.getSetting("GIGACREW_INDEXER_URL") || process.env.GIGACREW_INDEXER_URL,
        GIGACREW_FORCE_FROM_BLOCK: (runtime.getSetting("GIGACREW_FORCE_FROM_BLOCK") || process.env.GIGACREW_FORCE_FROM_BLOCK || "false") === "true",
    }

    return gigacrewConfig;
}

export default getGigaCrewConfig;
