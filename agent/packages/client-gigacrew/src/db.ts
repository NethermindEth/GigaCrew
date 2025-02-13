import { elizaLogger } from "@elizaos/core";

enum Status {
    Pending = 0,
    Disputed = 1,
    BuyerWithdrawn = 2,
    SellerWithdrawn = 3,
    Withdrawn = 4
}

export class GigaCrewDatabase {
    db: any;

    constructor(db: any) {
        this.db = db;
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS gigacrew_orders (
                order_id TEXT PRIMARY KEY,
                service_id TEXT,
                buyer_address TEXT,
                seller_address TEXT,
                status INTEGER,
                context TEXT,
                work TEXT,
                deadline DATETIME,
                lock_period DATETIME,
                resolution_period DATETIME,
                callback_data TEXT,
                failed_attempts INTEGER DEFAULT 0,
                can_seller_withdraw BOOL DEFAULT TRUE,
                can_buyer_withdraw BOOL DEFAULT TRUE
            );
        `);
    }

    async insertOrder(orderId: string, serviceId: string, buyer: string, seller: string, status: string, context: string, deadline: string, callbackData?: string) {
        await this.db.prepare(`
            INSERT INTO gigacrew_orders (order_id, service_id, buyer_address, seller_address, status, context, deadline, callback_data) 
            VALUES (?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), ?)
            ON CONFLICT(order_id) DO UPDATE SET
                service_id=excluded.service_id,
                buyer_address=excluded.buyer_address,
                seller_address=excluded.seller_address,
                context=excluded.context,
                deadline=excluded.deadline;
        `).run(orderId, serviceId, buyer, seller, status, context, deadline, callbackData);
    }

    async setStatus(orderId: string, status: string) {
        return await this.db.prepare(`
            UPDATE gigacrew_orders SET status = ? WHERE order_id = ?;
        `).run(status, orderId);
    }

    async setWork(orderId: string, work: string) {
        return await this.db.prepare(`
            UPDATE gigacrew_orders SET work = ? WHERE order_id = ?;
        `).run(work, orderId);
    }

    async setWorkAndReturn(orderId: string, work: string, lockPeriod: string) {
        return await this.db.prepare(`
            UPDATE gigacrew_orders SET work = ?, lock_period = datetime(?, 'unixepoch') WHERE order_id = ? RETURNING *;
        `).get(work, lockPeriod, orderId);
    }

    async setLockPeriod(orderId: string, lockPeriod: string) {
        return await this.db.prepare(`
            UPDATE gigacrew_orders SET lock_period = datetime(?, 'unixepoch') WHERE order_id = ?;
        `).run(lockPeriod, orderId);
    }

    async setResolutionPeriod(orderId: string, resolutionPeriod: string) {
        return await this.db.prepare(`
            UPDATE gigacrew_orders SET resolution_period = datetime(?, 'unixepoch') WHERE order_id = ?;
        `).run(resolutionPeriod, orderId);
    }

    async getOrder(orderId: string) {
        return await this.db.prepare(`
            SELECT * FROM gigacrew_orders WHERE order_id = ?;
        `).get(orderId);
    }

    async deleteOrdersById(orderIds: string[]) {
        const placeholders = orderIds.map(id => `?`).join(",");
        return await this.db.prepare(`
            DELETE FROM gigacrew_orders WHERE order_id IN (${placeholders});
        `).run(...orderIds);
    }

    async getActiveOrdersForSeller(seller: string) {
        return await this.db.prepare(`
            SELECT * FROM gigacrew_orders WHERE
                status = ${Status.Pending} AND
                failed_attempts < 3 AND
                seller_address = ? AND
                deadline > datetime('now') AND lock_period IS NULL
                    ORDER BY deadline ASC;
        `).all(seller);
    }

    async getWithdrawableOrdersForSeller(seller: string) {
        return await this.db.prepare(`
            SELECT * FROM gigacrew_orders WHERE
                seller_address = ? AND
                can_seller_withdraw = TRUE AND
                (status = ${Status.Pending} OR status = ${Status.BuyerWithdrawn}) AND
                (lock_period < datetime('now') OR resolution_period < datetime('now'));
        `).all(seller);
    }

    async getWithdrawableOrdersForBuyer(buyer: string) {
        return await this.db.prepare(`
            SELECT * FROM gigacrew_orders WHERE
                buyer_address = ? AND
                can_buyer_withdraw = TRUE AND
                (status = ${Status.Pending} OR status = ${Status.SellerWithdrawn}) AND
                (
                    (deadline < datetime('now') AND lock_period is NULL) OR
                    resolution_period < datetime('now')
                );
        `).all(buyer);
    }

    async incrementFailedAttempts(orderId: string) {
        return await this.db.prepare(`
            UPDATE gigacrew_orders SET failed_attempts = failed_attempts + 1 WHERE order_id = ?;
        `).run(orderId);
    }

    async setCanSellerWithdraw(orderIds: string[], canSellerWithdraw: boolean) {
        const placeholders = orderIds.map(id => `?`).join(",");
        return await this.db.prepare(`
            UPDATE gigacrew_orders SET can_seller_withdraw = ? WHERE order_id IN (${placeholders});
        `).run(canSellerWithdraw ? 1 : 0, ...orderIds);
    }

    async setCanBuyerWithdraw(orderIds: string[], canBuyerWithdraw: boolean) {
        const placeholders = orderIds.map(id => `?`).join(",");
        return await this.db.prepare(`
            UPDATE gigacrew_orders SET can_buyer_withdraw = ? WHERE order_id IN (${placeholders});
        `).run(canBuyerWithdraw ? 1 : 0, ...orderIds);
    }
}
