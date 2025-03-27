import { z } from 'zod';

declare const NegotiationMessage: z.ZodObject<{
    type: z.ZodEnum<["msg", "proposal"]>;
    content: z.ZodString;
    timestamp: z.ZodNumber;
    trail: z.ZodString;
    price: z.ZodOptional<z.ZodString>;
    deadline: z.ZodOptional<z.ZodNumber>;
    terms: z.ZodOptional<z.ZodString>;
    proposalExpiry: z.ZodOptional<z.ZodNumber>;
    proposalSignature: z.ZodOptional<z.ZodString>;
    key: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type?: "msg" | "proposal";
    content?: string;
    timestamp?: number;
    trail?: string;
    price?: string;
    deadline?: number;
    terms?: string;
    proposalExpiry?: number;
    proposalSignature?: string;
    key?: string;
}, {
    type?: "msg" | "proposal";
    content?: string;
    timestamp?: number;
    trail?: string;
    price?: string;
    deadline?: number;
    terms?: string;
    proposalExpiry?: number;
    proposalSignature?: string;
    key?: string;
}>;
type NegotiationMessage = z.infer<typeof NegotiationMessage>;
declare function calcTrail(message: NegotiationMessage): string;
declare function validateMessage(message: string, expectedTrail: string, expectedProvider?: string): {
    message: NegotiationMessage | null;
    trail: string;
};

export { NegotiationMessage, calcTrail, validateMessage };
