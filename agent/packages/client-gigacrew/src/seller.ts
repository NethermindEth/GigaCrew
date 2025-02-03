import { IAgentRuntime } from "@elizaos/core";
import { elizaLogger } from "@elizaos/core";
import { GigaCrewDatabase } from "./db";
import { ethers, EventLog, Log } from "ethers";
import { GigaCrewConfig } from "./environment";

type WorkFunction = (runtime: IAgentRuntime, orderId: string, buyer: string, context: string) => Promise<string>;

export class GigaCrewSellerHandler {
    runtime: IAgentRuntime;
    contract: ethers.Contract;
    provider: ethers.Provider;
    seller: ethers.Wallet;
    serviceId: string;
    config: GigaCrewConfig;
    db: GigaCrewDatabase;
    totalTime: number;
    work: WorkFunction;

    constructor(runtime: IAgentRuntime, seller: ethers.Wallet, contract: ethers.Contract, config: GigaCrewConfig, db: GigaCrewDatabase, work: WorkFunction) {
        this.runtime = runtime;
        this.contract = contract.connect(seller) as ethers.Contract;
        this.seller = seller;
        this.provider = contract.runner.provider;
        this.serviceId = config.GIGACREW_SERVICE_ID;
        this.totalTime = config.GIGACREW_TIME_PER_SERVICE + config.GIGACREW_TIME_BUFFER;
        this.config = config;
        this.work = work;
        this.db = db;
    }

    async filters() {
        return [
            {
                event: await this.contract.filters.EscrowCreated(null, this.serviceId, null, this.seller.address, null, null).getTopicFilter(),
                handler: this.EscrowCreatedHandler.bind(this)
            }
        ];
    }

    isExpired(deadline: any) {
        const start = new Date();
        const end = new Date(parseInt(deadline) * 1000 - this.totalTime * 1000);
        return start > end;
    }

    EscrowCreatedHandler(event: EventLog | Log) {
        const [orderId, serviceId, buyer, seller, context, deadline] = (event as EventLog).args;
        this.saveNewOrder(orderId, serviceId, buyer, seller, context, deadline);
    }

    saveNewOrder(orderId: string, serviceId: string, buyer: string, seller: string, context: string, deadline: string) {
        if (this.isExpired(deadline)) {
            elizaLogger.log("Can't handle this order! Skipping", {
                orderId,
                serviceId,
                buyer,
                seller,
                context,
                deadline
            });
            return;
        }
        elizaLogger.log("Order Received! Saving to DB", {
            orderId,
            serviceId,
            buyer,
            seller,
            context,
            deadline
        });
        this.db.insertOrder(orderId.toString(), serviceId.toString(), buyer, seller, "0", context, deadline.toString());
    }

    async start() {
        this.handleOrders();    
        this.handleWithdrawals();
    }

    async handleOrders() {
        const orders = await this.db.getActiveOrdersForSeller(this.seller.address);
        for (const order of orders) {
            const { order_id: orderId, service_id: serviceId, buyer_address: buyer, seller_address: seller, context, deadline } = order;
            const deadlineTimestamp = new Date(deadline + 'Z').getTime() / 1000;
            if (this.isExpired(deadlineTimestamp)) {
                elizaLogger.log("Order is expired, skipping", { orderId, serviceId, buyer, seller, context, deadline });
                continue;
            }

            let response = (await this.db.getOrder(orderId))?.work;
            if (!response) {
                try {
                    response = await this.work(this.runtime, orderId, buyer, context);
                    await this.db.setWork(orderId, response);
                } catch (error) {
                    await this.db.incrementFailedAttempts(orderId);
                    elizaLogger.error("Error doing work", {
                        orderId,
                        error
                    });
                    continue;
                }
            }
            
            try {
                const tx = await (await this.contract.submitPoW(orderId, response)).wait();

                elizaLogger.log("Work Submitted!", {
                    orderId,
                    response,
                    tx
                });

                const lockPeriod = tx.logs[0].args[4].toString();
                await this.db.setLockPeriod(orderId, lockPeriod);
            } catch (error) {
                elizaLogger.error("Error submitting work", {
                    orderId,
                    error
                });
            }
        }
        setTimeout(() => {
            this.handleOrders();
        }, 2000);
    }

    async handleWithdrawals() {
        const withdrawals = await this.db.getWithdrawableOrdersForSeller(this.seller.address);
        const cantWithdrawIds = [];

        for (const withdrawal of withdrawals) {
            const { order_id: orderId } = withdrawal;
            try {
                // Make sure seller can withdraw funds by checking for dispute / dispute result
                try {
                    const buyerShare = await this.contract.disputeResult(orderId);
                    if (buyerShare == 100) {
                        // Fully resolved in favor of buyer
                        cantWithdrawIds.push(orderId);
                        continue;
                    }
                } catch (error) {
                    if (error.revert?.name == "DisputeResolutionPeriodNotPassed") {
                        // Dispute resolution period not passed
                        await this.db.setResolutionPeriod(orderId, error.revert.args[0].toString());
                        continue;
                    }
                    // No dispute found
                }

                const tx = await (await this.contract.withdrawFunds(orderId, "0x")).wait();

                elizaLogger.log("Withdrawal successful!", {
                    orderId,
                    tx
                });

                cantWithdrawIds.push(orderId);
            } catch (error) {
                elizaLogger.error("Error withdrawing funds", {
                    orderId,
                    error
                });

                if (error.action == "estimateGas" && error.data?.startsWith("0x32c6b2c3")) {
                    const resolutionPeriod = ethers.toBigInt("0x" + error.data.slice(10)).toString();
                    await this.db.setResolutionPeriod(orderId, resolutionPeriod);
                }
            }
        }

        await this.db.setCanSellerWithdraw(cantWithdrawIds, false);
        setTimeout(() => {
            this.handleWithdrawals();
        }, 2000);
    }
}
