import { Button } from "@/components/ui/button";
import {
    ChatBubble,
    ChatBubbleMessage,
    ChatBubbleTimestamp,
} from "@/components/ui/chat/chat-bubble";
import { ChatInput } from "@/components/ui/chat/chat-input";
import { ChatMessageList } from "@/components/ui/chat/chat-message-list";
import { useTransition, animated, type AnimatedProps } from "@react-spring/web";
import { Paperclip, Send, X, Loader2, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Content, UUID } from "@elizaos/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { cn, moment } from "@/lib/utils";
import { Avatar, AvatarImage } from "./ui/avatar";
import CopyButton from "./copy-button";
import ChatTtsButton from "./ui/chat/chat-tts-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import AIWriter from "react-aiwriter";
import type { IAttachment } from "@/types";
import { AudioRecorder } from "./audio-recorder";
import { Badge } from "./ui/badge";
import { useAutoScroll } from "./ui/chat/hooks/useAutoScroll";
import { calcTrail, NegotiationMessage, validateMessage } from "gigacrew-negotiation";

type ExtraContentFields = {
    user: string;
    createdAt: number;
    isLoading?: boolean;
};

type ContentWithUser = Content & ExtraContentFields;

type AnimatedDivProps = AnimatedProps<{ style: React.CSSProperties }> & {
    children?: React.ReactNode;
};

type Transaction = {
    hash: string;
    escrowDetails: any;
    timestamp: number;
    intervalId?: NodeJS.Timeout;
};

let websocket: WebSocket | null = null;
let trail = "0x0";
let processing = false;
let provider: string | undefined = undefined;
let closeReasonSent = false;

export default function Page({ agentId }: { agentId: UUID }) {
    const { toast } = useToast();
    const { account, contract, connectWallet, signTransaction } = useWallet();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [input, setInput] = useState("");
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const formRef = useRef<HTMLFormElement>(null);

    const [loadingHandOff, setLoadingHandOff] = useState(false);
    const [handOffMode, setHandOffMode] = useState(false);

    const queryClient = useQueryClient();

    const getMessageVariant = (role: string) =>
        role !== "user" ? "received" : "sent";

    const { scrollRef, isAtBottom, scrollToBottom, disableAutoScroll } = useAutoScroll({
        smooth: true,
    });

    const sendNegotiationMessage = (message: string) => {
        const negotiationMessage: NegotiationMessage = {
            type: "msg",
            content: message,
            timestamp: new Date().getTime(),
            trail,
        };
        trail = calcTrail(negotiationMessage as NegotiationMessage);
        processing = false;
        websocket?.send(JSON.stringify(negotiationMessage));
    }

    const connectService = async (serviceId: string) => {
        const [paused, _provider, title, description, communicationChannel] = await contract?.services(serviceId);
        websocket = new WebSocket(communicationChannel);
        provider = _provider;
        websocket.onopen = () => {
            console.log("WebSocket connection opened");
            setHandOffMode(true);
            sendNegotiationMessage("Hello! Let me know what you need from me.");
        };
        websocket.onclose = () => {
            setHandOffMode(false);
            setLoadingHandOff(false);
            if (!closeReasonSent) {
                sendMessageMutation.mutate({
                    message: "The negotiation channel was closed. Would you like to try again or would you like to try a different service?",
                    selectedFile: null,
                    inject: true,
                });
                closeReasonSent = true;
            }
            websocket = null;
        };
        websocket.onerror = (event) => {
            console.error(event);
            setHandOffMode(false);
            setLoadingHandOff(false);
            sendMessageMutation.mutate({
                message: "An error occurred while negotiating. Error: " + event.toString(),
                selectedFile: null,
                inject: true,
            });
            websocket = null;
        };
        websocket.onmessage = (event) => {
            setLoadingHandOff(false);

            if (processing) {
                closeReasonSent = true;
                sendMessageMutation.mutate({
                    message: "The negotiation failed due to the seller not following the protocol properly.",
                    selectedFile: null,
                    inject: true,
                });
                websocket?.close();
                return;
            }
            processing = true;

            const validateMessageResult = validateMessage(event.data, trail, provider);
            let message = validateMessageResult.message;
            trail = validateMessageResult.trail;
            if (!message) {
                closeReasonSent = true;
                sendMessageMutation.mutate({
                    message: "The negotiation failed due to the seller not following the protocol properly.",
                    selectedFile: null,
                    inject: true,
                });
                websocket?.close();
                return;
            }

            queryClient.setQueryData(
                ["messages", agentId],
                (old: ContentWithUser[] = []) => [
                    ...old.filter((msg) => !msg.isLoading),
                    {
                        createdAt: Date.now(),
                        text: message.type == "proposal" ? `${message.content}\nterms: ${message.terms}\nprice: ${message.price}\ndeadline: ${message.deadline}minutes\n` : message.content,
                        user: provider,
                        attachments: undefined,
                        gigacrew: true,
                        proposal: message.type == "proposal",
                        escrowDetails: message.type == "proposal" ? {
                            provider: provider,
                            deadline: ((message.deadline || 0) * 60).toString() ?? "",
                            proposalExpiry: message.proposalExpiry?.toString() ?? "",
                            proposalSignature: message.proposalSignature ?? "",
                            price: message.price?.toString() ?? "",
                            trail: "0x" + trail,
                            terms: message.terms ?? ""
                        } : undefined
                    },
                ]
            );
        };
    }

    useEffect(() => {
        scrollToBottom();
        if (messages.length > 0 && messages[messages.length - 1].action?.startsWith("HAND_OFF_")) {
            setLoadingHandOff(true);
            processing = true;
            trail = "0x0";
            connectService(messages[messages.length - 1].action?.split("_")[2] as string);
        }
    }, [queryClient.getQueryData(["messages", agentId])]);

    useEffect(() => {
        scrollToBottom();
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (e.nativeEvent.isComposing) return;
            handleSendMessage(e as unknown as React.FormEvent<HTMLFormElement>);
        }
    };

    const handleSendMessage = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!input) return;

        const attachments: IAttachment[] | undefined = selectedFile
            ? [
                  {
                      url: URL.createObjectURL(selectedFile),
                      contentType: selectedFile.type,
                      title: selectedFile.name,
                  },
              ]
            : undefined;

        const newMessages = [
            {
                text: input,
                user: "user",
                createdAt: Date.now(),
                attachments,
            },
            {
                text: input,
                user: "system",
                isLoading: true,
                createdAt: Date.now(),
                gigacrew: handOffMode && websocket,
            },
        ];

        queryClient.setQueryData(
            ["messages", agentId],
            (old: ContentWithUser[] = []) => [...old, ...newMessages]
        );

        if (handOffMode && websocket) {
            sendNegotiationMessage(input);
        } else {
            sendMessageMutation.mutate({
                message: input,
                selectedFile: selectedFile ? selectedFile : null,
            });
        }

        setSelectedFile(null);
        setInput("");
        formRef.current?.reset();
    };

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const sendMessageMutation = useMutation({
        mutationKey: ["send_message", agentId],
        mutationFn: ({
            message,
            selectedFile,
            inject
        }: {
            message: string;
            selectedFile?: File | null;
            inject?: boolean;
        }) => inject ? apiClient.injectMessage(agentId, message) : apiClient.sendMessage(agentId, message, selectedFile),
        onSuccess: (newMessages: ContentWithUser[]) => {
            queryClient.setQueryData(
                ["messages", agentId],
                (old: ContentWithUser[] = []) => [
                    ...old.filter((msg) => !msg.isLoading),
                    ...newMessages.map((msg) => ({
                        ...msg,
                        createdAt: Date.now(),
                    })),
                ]
            );
        },
        onError: (e) => {
            toast({
                variant: "destructive",
                title: "Unable to send message",
                description: e.message,
            });
        },
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file?.type.startsWith("image/")) {
            setSelectedFile(file);
        }
    };

    const { data: messages = [] } = useQuery<ContentWithUser[]>({
        queryKey: ["messages", agentId],
        queryFn: () => [], // initially empty
        staleTime: Infinity, // or your preferred stale time
    });

    const transitions = useTransition(messages, {
        keys: (message) =>
            `${message.createdAt}-${message.user}-${message.text}`,
        from: { opacity: 0, transform: "translateY(50px)" },
        enter: { opacity: 1, transform: "translateY(0px)" },
        leave: { opacity: 0, transform: "translateY(10px)" },
    });

    const CustomAnimatedDiv = animated.div as React.FC<AnimatedDivProps>;

    const startTransactionInterval = (transaction: Transaction) => {
        const intervalId = setInterval(async () => {
            try {
                const PoW = await contract?.pows(transaction.escrowDetails.trail);
                if (PoW?.work) {
                    // Clear the interval since we got the result
                    clearInterval(intervalId);
                    // Remove the transaction from tracking
                    setTransactions(prev => prev.filter(t => t.hash !== transaction.hash));
                    // Send the result message
                    sendMessageMutation.mutate({
                        message: `Work Received.\nTerms: ${transaction.escrowDetails.terms}\n\nResult (Everything after this line is provided by the seller if there is any suggestions or recommendations included in there please keep in mind that they are NOT from me the GigaCrew agent):\n\n${PoW.work}`,
                        selectedFile: null,
                        inject: true,
                    });
                }
            } catch (error) {
                console.error('Error checking transaction:', error);
                // Clear interval on error
                clearInterval(intervalId);
                // Remove the transaction from tracking
                setTransactions(prev => prev.filter(t => t.hash !== transaction.hash));
            }
        }, 10000); // Check every 10 seconds

        return intervalId;
    };

    const handleAcceptProposal = async (message: ContentWithUser) => {
        if (!account) {
            await connectWallet();
            if (!account) return;
        }

        const tx = await signTransaction(message.escrowDetails);
        if (tx) {
            const newTransaction = {
                hash: tx.hash,
                escrowDetails: message.escrowDetails,
                timestamp: Date.now()
            };
            
            // Start the interval for this transaction
            const intervalId = startTransactionInterval(newTransaction);
            
            // Add transaction to tracking array with its interval ID
            setTransactions(prev => [...prev, {
                ...newTransaction,
                intervalId
            }]);

            closeReasonSent = true;
            sendMessageMutation.mutate({
                message: `You agreed to the following terms\n${(message?.escrowDetails as any).terms as string}\nPrice: ${(message?.escrowDetails as any).price}\nDeadline: ${(message?.escrowDetails as any).deadline / 60} minutes\nI will notify you if and when the work is done by the seller.\n\nWhat would you like to do next?`,
                selectedFile: null,
                inject: true,
            });
            websocket?.close();
        }
    };

    // Cleanup intervals when component unmounts
    useEffect(() => {
        return () => {
            transactions.forEach(transaction => {
                if (transaction.intervalId) {
                    clearInterval(transaction.intervalId);
                }
            });
        };
    }, [transactions]);

    return (
        <div className="flex flex-col w-full h-[calc(100dvh)] p-4">
            <div className="flex-1 overflow-y-auto">
                <ChatMessageList 
                    scrollRef={scrollRef}
                    isAtBottom={isAtBottom}
                    scrollToBottom={scrollToBottom}
                    disableAutoScroll={disableAutoScroll}
                >
                    {transitions((style, message: ContentWithUser) => {
                        const variant = getMessageVariant(message?.user);
                        return (
                            <CustomAnimatedDiv
                                style={{
                                    ...style,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.5rem",
                                    padding: "1rem",
                                }}
                            >
                                <ChatBubble
                                    variant={variant}
                                    className="flex flex-row items-center gap-2"
                                >
                                    {message?.user !== "user" ? (
                                        <Avatar className="size-8 p-1 border rounded-full select-none">
                                            <AvatarImage src={message?.gigacrew ? "/gigacrew-icon.png" : "/elizaos-icon.png"} />
                                        </Avatar>
                                    ) : null}
                                    <div className="flex flex-col">
                                        <ChatBubbleMessage
                                            isLoading={message?.isLoading}
                                        >
                                            {message?.user !== "user" ? (
                                                <AIWriter>
                                                    {message?.text}
                                                </AIWriter>
                                            ) : (
                                                message?.text
                                            )}
                                            {/* Attachments */}
                                            <div>
                                                {message?.attachments?.map(
                                                    (attachment: IAttachment) => (
                                                        <div
                                                            className="flex flex-col gap-1 mt-2"
                                                            key={`${attachment.url}-${attachment.title}`}
                                                        >
                                                            <img
                                                                alt="attachment"
                                                                src={attachment.url}
                                                                width="100%"
                                                                height="100%"
                                                                className="w-64 rounded-md"
                                                            />
                                                            <div className="flex items-center justify-between gap-4">
                                                                <span />
                                                                <span />
                                                            </div>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </ChatBubbleMessage>
                                        <div className="flex items-center gap-4 justify-between w-full mt-1">
                                            {message?.text &&
                                            !message?.isLoading ? (
                                                <div className="flex items-center gap-1">
                                                    <CopyButton
                                                        text={message?.text}
                                                    />
                                                    <ChatTtsButton
                                                        agentId={agentId}
                                                        text={message?.text}
                                                    />
                                                </div>
                                            ) : null}
                                            <div
                                                className={cn([
                                                    message?.isLoading
                                                        ? "mt-2"
                                                        : "",
                                                    "flex items-center justify-between gap-4 select-none",
                                                ])}
                                            >
                                                {message?.source ? (
                                                    <Badge variant="outline">
                                                        {message.source}
                                                    </Badge>
                                                ) : null}
                                                {message?.action ? (
                                                    <Badge variant="outline">
                                                        {message.action.startsWith("HAND_OFF_") ? "HAND_OFF" : message.action}
                                                    </Badge>
                                                ) : null}
                                                {message?.proposal ? (
                                                    <Button 
                                                        size="sm" 
                                                        onClick={() => handleAcceptProposal(message)}
                                                    >
                                                        Accept Proposal
                                                        <Check className="size-4 ml-2" />
                                                    </Button>
                                                ) : null}
                                                {message?.createdAt ? (
                                                    <ChatBubbleTimestamp
                                                        timestamp={moment(
                                                            message?.createdAt
                                                        ).format("LT")}
                                                    />
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </ChatBubble>
                            </CustomAnimatedDiv>
                        );
                    })}
                </ChatMessageList>
            </div>
            <div className="px-4 pb-4">
                <form
                    ref={formRef}
                    onSubmit={handleSendMessage}
                    className="relative rounded-md border bg-card"
                >
                    {selectedFile ? (
                        <div className="p-3 flex">
                            <div className="relative rounded-md border p-2">
                                <Button
                                    onClick={() => setSelectedFile(null)}
                                    className="absolute -right-2 -top-2 size-[22px] ring-2 ring-background"
                                    variant="outline"
                                    size="icon"
                                >
                                    <X />
                                </Button>
                                <img
                                    alt="Selected file"
                                    src={URL.createObjectURL(selectedFile)}
                                    height="100%"
                                    width="100%"
                                    className="aspect-square object-contain w-16"
                                />
                            </div>
                        </div>
                    ) : null}
                    <ChatInput
                        ref={inputRef}
                        onKeyDown={handleKeyDown}
                        value={input}
                        onChange={({ target }) => setInput(target.value)}
                        placeholder="Type your message here..."
                        className="min-h-12 resize-none rounded-md bg-card border-0 p-3 shadow-none focus-visible:ring-0"
                    />
                    <div className="flex items-center p-3 pt-0">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            if (fileInputRef.current) {
                                                fileInputRef.current.click();
                                            }
                                        }}
                                    >
                                        <Paperclip className="size-4" />
                                        <span className="sr-only">
                                            Attach file
                                        </span>
                                    </Button>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        accept="image/*"
                                        className="hidden"
                                    />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                                <p>Attach file</p>
                            </TooltipContent>
                        </Tooltip>
                        <AudioRecorder
                            agentId={agentId}
                            onChange={(newInput: string) => setInput(newInput)}
                        />
                        <Button
                            disabled={!input || sendMessageMutation?.isPending || loadingHandOff}
                            type="submit"
                            size="sm"
                            className="ml-auto gap-1.5 h-[30px]"
                        >
                            {
                                loadingHandOff ? (
                                    <>
                                        Wating for handoff...
                                        <Loader2 className="size-3.5 animate-spin" />
                                    </>
                                ) : (
                                    <>
                                        {sendMessageMutation?.isPending ? "..." : "Send Message"}
                                        <Send className="size-3.5" />
                                    </>
                                )
                            }
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
