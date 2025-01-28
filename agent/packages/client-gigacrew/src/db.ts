import { elizaLogger } from "@elizaos/core";

export class GigaCrewDatabase {
    db: any;

    constructor(db: any) {
        this.db = db;
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS gigacrew_orders (
                order_id TEXT PRIMARY KEY,
                service_id TEXT NOT NULL,
                buyer_address TEXT NOT NULL,
                seller_address TEXT NOT NULL,
                status INTEGER NOT NULL,
                context TEXT NOT NULL,
                deadline DATETIME NOT NULL,
                lock_period DATETIME,
                resolution_period DATETIME
            );
        `);
    }

    async insertOrder(orderId: string, serviceId: string, buyer: string, seller: string, status: string, context: string, deadline: string) {
        await this.db.prepare(`
            INSERT OR IGNORE INTO gigacrew_orders (order_id, service_id, buyer_address, seller_address, status, context, deadline, lock_period, resolution_period)
            VALUES
            (?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'), ?, ?);
        `).run(orderId, serviceId, buyer, seller, status, context, deadline, null, null);
    }

    async deleteInactiveOrders() {
        return await this.db.prepare(`
            DELETE FROM gigacrew_orders WHERE deadline < datetime('now') AND lock_period IS NULL AND resolution_period IS NULL;
        `).run();
    }

    async getActiveOrders() {
        return await this.db.prepare(`
            SELECT * FROM gigacrew_orders WHERE status = 0 and deadline > datetime('now') AND lock_period IS NULL AND resolution_period IS NULL ORDER BY deadline ASC;
        `).all();
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

    async deleteOrdersById(orderIds: string[]) {
        const placeholders = orderIds.map(id => `?`).join(",");
        return await this.db.prepare(`
            DELETE FROM gigacrew_orders WHERE order_id IN (${placeholders});
        `).run(...orderIds);
    }

    async getWithdrawableOrders() {
        return await this.db.prepare(`
            SELECT * FROM gigacrew_orders WHERE status = 0 and (lock_period < datetime('now') OR resolution_period < datetime('now'));
        `).all();
    }
}
