import { IAgentRuntime } from "@elizaos/core";
import { elizaLogger } from "@elizaos/core";
import { GigaCrewDatabase } from "./db";
import { ethers, EventLog } from "ethers";
import { GigaCrewConfig } from "./environment";
import { Log } from "ethers";

export class GigaCrewBuyerHandler {
    runtime: IAgentRuntime;
    contract: ethers.Contract;
    provider: ethers.Provider;
    buyer: ethers.Wallet;
    serviceId: string;
    config: GigaCrewConfig;
    db: GigaCrewDatabase;

    orderlessWorks: any;
    orders: any;

    constructor(runtime: IAgentRuntime, buyer: ethers.Wallet, contract: ethers.Contract, config: GigaCrewConfig, db: GigaCrewDatabase) {
        this.runtime = runtime;
        this.contract = contract.connect(buyer) as ethers.Contract;
        this.buyer = buyer;
        this.provider = contract.runner.provider;
        this.serviceId = config.GIGACREW_SERVICE_ID;
        this.config = config;
        this.db = db;

        this.orderlessWorks = {};
        this.orders = {};
    }

    async filters() {
        return [
            {
                event: await this.contract.filters.PoWSubmitted(null, this.buyer.address, null, null, null).getTopicFilter(),
                handler: this.PoWHandler.bind(this)
            }
        ];
    }

    start() {}

    PoWHandler(event: EventLog | Log) {
        const [orderId, buyer, seller, work, lockPeriod] = (event as EventLog).args;
        elizaLogger.log("Work Received!", {
            orderId,
            work
        });
        const resolve = this.orders[orderId];
        if (resolve) {
            delete this.orders[orderId];
            resolve(work);
        } else {
            this.orderlessWorks[orderId] = work;
        }
    }

    async createEscrow(service: any, deadlinePeriod: number, context: string) {
        let deadlineSeconds = Math.max(deadlinePeriod, 100);
        const tx = await (await this.contract.createEscrow(service.serviceId, deadlineSeconds, context, { value: service.price })).wait();
        const orderId = tx.logs[0].args[0].toString();
        return orderId;
    }
    
    async waitForWork(orderId: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.orders[orderId] = resolve;
            if (this.orderlessWorks[orderId]) {
                const work = this.orderlessWorks[orderId];
                delete this.orderlessWorks[orderId];
                delete this.orders[orderId];
                resolve(work);
            }
        });
    }

    async searchServices(query: string) {
        const endpoint = this.config.GIGACREW_INDEXER_URL + "/api/services/search";
        const response = await fetch(`${endpoint}?query=${encodeURIComponent(query)}&limit=10`);
        const data = await response.json();
        return data;
    }
}
