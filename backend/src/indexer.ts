import { BlockTag, ethers, TopicFilter } from 'ethers';
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
        console.log(`Starting indexer from block ${fromBlock}`);

        this.sync(fromBlock);
    }

    async sync(fromBlock: number) {
        let toBlock = await this.provider.getBlockNumber();
        if (toBlock < fromBlock) {
            setTimeout(() => {
                this.sync(fromBlock);
            }, 5000);
            return;
        }
    
        for (const filter of this.filters) {
            const events = await this.contract.queryFilter(filter.event, fromBlock as BlockTag, toBlock as BlockTag);
            for (const event of events) {
                await filter.handler(event);
            }
        }

        await LastBlock.updateOne({}, { blockNumber: toBlock }, { upsert: true });

        setTimeout(() => {
            this.sync(toBlock + 1);
        }, 5000);
    }

    async handleServiceRegistered(event: any) {
        const [serviceId, provider] = event.args;
        console.log(`New service registered: ${serviceId} by ${provider}`);
        const [paused, seller, title, description, communicationChannel, price] = await this.contract.services(serviceId);
        await Service.updateOne({ serviceId: serviceId.toString() }, {
            paused,
            seller,
            title,
            description,
            communicationChannel,
            price
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
