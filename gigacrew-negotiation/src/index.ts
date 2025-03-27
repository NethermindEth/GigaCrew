import { z } from "zod";
import sha256 from "crypto-js/sha256";
import { ethers } from "ethers";

const NegotiationMessage = z.object({
    type: z.enum(["msg", "proposal"]),
    content: z.string(),
    timestamp: z.number(),
    trail: z.string(),

    price: z.string().regex(/^\d+$/).optional(),
    deadline: z.number().optional(),
    terms: z.string().optional(),
    proposalExpiry: z.number().optional(),

    proposalSignature: z.string().optional(),

    key: z.string().optional(),
});
type NegotiationMessage = z.infer<typeof NegotiationMessage>;

function calcTrail(message: NegotiationMessage) {
    let hash = message.trail;
    for (const key of Object.keys(message).sort()) {
        if (key == "trail" || key == "signature" || key == "proposalSignature") continue;
        const value = message[key as keyof NegotiationMessage];
        const valueHash = sha256(value?.toString() as any).toString();
        hash = sha256(hash + valueHash).toString();
    }
    return hash;
}

const NEGOTIATION_TIMEOUT = 10000;
function validateMessage(message: string, expectedTrail: string, expectedProvider?: string): { message: NegotiationMessage | null, trail: string } {
    let negotiationMessage: NegotiationMessage;
    try {
        negotiationMessage = NegotiationMessage.parse(JSON.parse(message));
    } catch (error) {
        return null;
    }

    if (negotiationMessage.timestamp && negotiationMessage.timestamp < new Date().getTime() - NEGOTIATION_TIMEOUT) {
        return null;
    }

    if (negotiationMessage.trail !== expectedTrail) {
        return null;
    }

    const trail = calcTrail(negotiationMessage);
    const trailBytes = ethers.getBytes("0x" + trail);

    if (negotiationMessage.type == "proposal") {
        if (!expectedProvider) {
            return { message: null, trail };
        }

        const GIGACREW_PROPOSAL_PREFIX = new Uint8Array(32);
        GIGACREW_PROPOSAL_PREFIX.set(ethers.toUtf8Bytes("GigaCrew Proposal: "))
        const abiCoder = new ethers.AbiCoder();
        const proposalBytes = ethers.getBytes(abiCoder.encode(
            ["bytes32", "bytes32", "uint256", "uint256", "uint256"],
            [
                ethers.hexlify(GIGACREW_PROPOSAL_PREFIX),
                trailBytes,
                negotiationMessage.proposalExpiry,
                negotiationMessage.price,
                negotiationMessage.deadline * 60
            ]
        ));
        const extractedUser = ethers.recoverAddress(ethers.keccak256(proposalBytes), negotiationMessage.proposalSignature);
        if (extractedUser != expectedProvider) {
            return { message: null, trail };
        }
    }

    return { message: negotiationMessage, trail };
}

export { NegotiationMessage, calcTrail, validateMessage };
