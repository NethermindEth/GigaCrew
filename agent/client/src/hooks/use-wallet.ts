import { useState, useEffect } from 'react';
import { useToast } from './use-toast';
import { Contract, ethers } from 'ethers';
import GigaCrew from '../abi/GigaCrew.json';

const GIGACREW_ABI = GigaCrew.abi;

declare global {
    interface Window {
        ethereum?: {
            request: (args: { method: string; params?: any[] }) => Promise<any>;
            on: (event: string, callback: (params: any) => void) => void;
            removeListener: (event: string, callback: (params: any) => void) => void;
            isConnected: () => boolean;
            networkVersion: string;
        };
    }
}

// Network configurations
const NETWORKS = {
    LOCALHOST: {
        chainId: '0x7a69',
        chainName: 'Anvil Local',
        nativeCurrency: {
            name: 'Ethereum',
            symbol: 'ETH',
            decimals: 18
        },
        rpcUrls: ['http://localhost:8545'],
        blockExplorerUrls: []
    }
};

export function useWallet() {
    const [account, setAccount] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
    const [contract, setContract] = useState<Contract | null>(null);
    const { toast } = useToast();

    const switchToAnvilLocal = async () => {
        if (!window.ethereum) return false;

        try {
            setIsSwitchingNetwork(true);
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: NETWORKS.LOCALHOST.chainId }],
            });
            return true;
        } catch (error: any) {
            // This error code indicates that the chain has not been added to MetaMask
            if (error.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [NETWORKS.LOCALHOST],
                    });
                    return true;
                } catch (addError) {
                    toast({
                        variant: "destructive",
                        title: "Network switch failed",
                        description: "Failed to add Anvil Local network to MetaMask.",
                    });
                    return false;
                }
            }
            toast({
                variant: "destructive",
                title: "Network switch failed",
                description: "Failed to switch to Anvil Local network.",
            });
            return false;
        } finally {
            setIsSwitchingNetwork(false);
        }
    };

    const connectWallet = async () => {
        if (!window.ethereum) {
            toast({
                variant: "destructive",
                title: "MetaMask not found",
                description: "Please install MetaMask to use this feature.",
            });
            return;
        }

        try {
            setIsConnecting(true);
            
            // First switch to Anvil Local network
            const networkSwitched = await switchToAnvilLocal();
            if (!networkSwitched) {
                return;
            }

            // Then request account access
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts',
            });
            setAccount(accounts[0]);
            const provider = new ethers.BrowserProvider(window.ethereum as any);
            const signer = await provider.getSigner();
            setContract(new Contract("0x5FbDB2315678afecb367f032d93F642f64180aa3", GIGACREW_ABI, signer));
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Connection failed",
                description: "Failed to connect to MetaMask wallet.",
            });
        } finally {
            setIsConnecting(false);
        }
    };

    const signTransaction = async (escrowDetails: any) => {
        if (!window.ethereum || !account || !contract) {
            toast({
                variant: "destructive",
                title: "Wallet not connected",
                description: "Please connect your wallet first.",
            });
            return false;
        }

        // Check if we're on the correct network
        if (window.ethereum.networkVersion !== '0x7a69') { // Anvil Local chainId
            const networkSwitched = await switchToAnvilLocal();
            if (!networkSwitched) {
                return false;
            }
        }

        try {
            const tx = await contract?.createEscrow(
                escrowDetails.trail,
                escrowDetails.provider,
                escrowDetails.deadline,
                escrowDetails.proposalExpiry,
                escrowDetails.proposalSignature,
                { value: escrowDetails.price }
            );
            return tx;
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Transaction failed",
                description: error.toString(),
            });
            return false;
        }
    };

    useEffect(() => {
        if (window.ethereum) {
            const handleAccountsChanged = (accounts: string[]) => {
                setAccount(accounts[0] || null);
                if (accounts[0]) {
                    const provider = new ethers.BrowserProvider(window.ethereum as any);
                    provider.getSigner().then(signer => {
                        setContract(new Contract("0x5FbDB2315678afecb367f032d93F642f64180aa3", GIGACREW_ABI, signer));
                    }).catch(error => {
                        console.error(error);
                    });
                } else {
                    setContract(null);
                }
            };

            const handleChainChanged = (chainId: string) => {
                if (chainId !== NETWORKS.LOCALHOST.chainId) {
                    toast({
                        variant: "destructive",
                        title: "Wrong network",
                        description: "Please switch to Anvil Local network to continue.",
                    });
                }
            };

            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);

            connectWallet();

            return () => {
                window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
                window.ethereum?.removeListener('chainChanged', handleChainChanged);
            };
        } else {
            toast({
                variant: "destructive",
                title: "MetaMask not found",
                description: "Please install MetaMask.",
            });
        }
    }, []);

    return {
        account,
        contract,
        isConnecting,
        isSwitchingNetwork,
        connectWallet,
        signTransaction,
    };
} 