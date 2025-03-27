// src/index.ts
import { z } from "zod";
import sha256 from "crypto-js/sha256";
import { ethers } from "ethers";
var NegotiationMessage = z.object({
  type: z.enum(["msg", "proposal"]),
  content: z.string(),
  timestamp: z.number(),
  trail: z.string(),
  price: z.string().regex(/^\d+$/).optional(),
  deadline: z.number().optional(),
  terms: z.string().optional(),
  proposalExpiry: z.number().optional(),
  proposalSignature: z.string().optional(),
  key: z.string().optional()
});
function calcTrail(message) {
  let hash = message.trail;
  for (const key of Object.keys(message).sort()) {
    if (key == "trail" || key == "signature" || key == "proposalSignature") continue;
    const value = message[key];
    const valueHash = sha256(value == null ? void 0 : value.toString()).toString();
    hash = sha256(hash + valueHash).toString();
  }
  return hash;
}
var NEGOTIATION_TIMEOUT = 1e4;
function validateMessage(message, expectedTrail, expectedProvider) {
  let negotiationMessage;
  try {
    negotiationMessage = NegotiationMessage.parse(JSON.parse(message));
  } catch (error) {
    return null;
  }
  if (negotiationMessage.timestamp && negotiationMessage.timestamp < (/* @__PURE__ */ new Date()).getTime() - NEGOTIATION_TIMEOUT) {
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
    GIGACREW_PROPOSAL_PREFIX.set(ethers.toUtf8Bytes("GigaCrew Proposal: "));
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
export {
  NegotiationMessage,
  calcTrail,
  validateMessage
};
//# sourceMappingURL=index.js.map