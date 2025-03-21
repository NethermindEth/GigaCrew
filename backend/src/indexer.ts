import { BlockTag, ethers, EventLog, TopicFilter } from 'ethers';
import LastBlock from './models/LastBlock';
import GigaCrewJSON from './abi/GigaCrew.json';
import { Service } from './models/Service';

const GigaCrewABI = GigaCrewJSON.abi;

async function getLastBlock() {
    if (process.env.FORCE_FROM_BLOCK === 'true') {
        return process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : 0;
    } else {
        const lastBlock = await LastBlock.findOne();
        return Math.max(lastBlock?.blockNumber || 0, process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : 0);
    }
}

class ServiceIndexer {
    provider: ethers.Provider;
    contract: ethers.Contract;
    filters: any[];
    max_range: number;
    batch_size: number;
    
    constructor(rpc_url: string) {
        if (rpc_url.startsWith("ws://") || rpc_url.startsWith("wss://")) {
            this.provider = new ethers.WebSocketProvider(rpc_url);
        } else if (rpc_url.startsWith("http://") || rpc_url.startsWith("https://")) {
            this.provider = new ethers.JsonRpcProvider(rpc_url);
        } else {
            throw new Error("Invalid provider URL. Must start with ws://, wss://, http://, or https://");
        }

        this.contract = new ethers.Contract(process.env.GIGACREW_CONTRACT_ADDRESS!, GigaCrewABI, this.provider);
        this.filters = [];
        this.max_range = process.env.MAX_BLOCK_RANGE_PER_REQUEST ? parseInt(process.env.MAX_BLOCK_RANGE_PER_REQUEST) : 50;
        this.batch_size = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 10;
    }

    async start() {
        this.filters.push({
            event: await this.contract.filters.ServiceRegistered().getTopicFilter(),
            handler: this.handleServiceRegistered.bind(this)
        });
        this.filters.push({
            event: await this.contract.filters.ServicePaused().getTopicFilter(),
            handler: this.handleServicePaused.bind(this)
        });
        this.filters.push({
            event: await this.contract.filters.ServiceResumed().getTopicFilter(),
            handler: this.handleServiceResumed.bind(this)
        });
        const fromBlock = await getLastBlock();
        console.log(`Starting indexer from block ${fromBlock + 1}`);

        this.sync(fromBlock + 1);
    }

    async sync(fromBlock: number) {
        let toBlock = await this.provider.getBlockNumber();
        if (toBlock < fromBlock) {
            setTimeout(() => {
                this.sync(fromBlock);
            }, 5000);
            return;
        }

        for (let i = fromBlock; i <= toBlock; i += this.max_range) {
            const endBlock = Math.min(i + this.max_range - 1, toBlock);
            for (const filter of this.filters) {
                const events = await this.contract.queryFilter(filter.event, i as BlockTag, endBlock as BlockTag) as EventLog[];
                
                let promises = [];
                const serviceSet = new Set();

                for (let j = events.length - 1; j >= 0; j--) {
                    const event = events[j];
                    if (!serviceSet.has(event.args[0])) {
                        serviceSet.add(event.args[0]);
                        promises.push(filter.handler(event));
                    }

                    if (promises.length >= this.batch_size) {
                        await Promise.all(promises);
                        promises = [];
                    }
                }

                if (promises.length > 0) {
                    await Promise.all(promises);
                    promises = [];
                }

                await LastBlock.updateOne({}, { blockNumber: endBlock }, { upsert: true });
            }
        }

        setTimeout(() => {
            this.sync(toBlock + 1);
        }, 5000);
    }

    async handleServiceRegistered(event: any) {
        const [serviceId, _provider] = event.args;
        console.log(`New service registered: ${serviceId} by ${_provider}`);
        const [paused, provider, title, description, communicationChannel] = await this.contract.services(serviceId);
        await Service.updateOne({ serviceId: serviceId.toString() }, {
            paused,
            provider,
            title,
            description,
            communicationChannel
        }, { upsert: true });
    }

    async handleServicePaused(event: any) {
        const [serviceId] = event.args;
        console.log(`Service paused: ${serviceId}`);
        await Service.updateOne({ serviceId: serviceId.toString() }, { paused: true }, { upsert: true });
    }

    async handleServiceResumed(event: any) {
        const [serviceId] = event.args;
        console.log(`Service resumed: ${serviceId}`);
        await Service.updateOne({ serviceId: serviceId.toString() }, { paused: false }, { upsert: true });
    }
};

const indexer = new ServiceIndexer(process.env.RPC_URL!);
export default indexer;
