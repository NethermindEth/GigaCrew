import { getEmbeddingZeroVector, ModelClass } from "@elizaos/core";
import { Memory, Content, IAgentRuntime, messageCompletionFooter, stringToUuid, composeContext, generateMessageResponse } from "@elizaos/core";
import { ethers } from "ethers";

export const messageHandlerTemplate = `
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Respond with what is expected of {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

{{actions}}

# Instructions: Write the next message for {{agentName}}.
` + messageCompletionFooter;


export async function workResponseGenerator(runtime: IAgentRuntime, orderId: string, buyerAddress: string, text: string) {
    const roomId = stringToUuid(orderId);
    const userId = stringToUuid(buyerAddress);

    await runtime.ensureConnection(
        userId,
        roomId,
    );

    const messageId = stringToUuid(Date.now().toString());

    const content: Content = {
        text,
    };

    const userMessage = {
        content,
        userId,
        roomId,
        agentId: runtime.agentId,
    };

    const memory: Memory = {
        id: stringToUuid(messageId + "-" + userId),
        ...userMessage,
        agentId: runtime.agentId,
        userId,
        roomId,
        content,
        createdAt: Date.now(),
    };

    await runtime.messageManager.addEmbeddingToMemory(memory);
    await runtime.messageManager.createMemory(memory);

    let state = await runtime.composeState(userMessage, {
        agentName: runtime.character.name,
    });

    const context = composeContext({
        state,
        template: messageHandlerTemplate,
    });

    const response = await generateMessageResponse({
        runtime: runtime,
        context,
        modelClass: ModelClass.LARGE,
    });

    if (!response) {
        throw new Error("No response from generateMessageResponse");
    }

    // save response to memory
    const responseMessage: Memory = {
        id: stringToUuid(messageId + "-" + runtime.agentId),
        ...userMessage,
        userId: runtime.agentId,
        content: response,
        embedding: getEmbeddingZeroVector(),
        createdAt: Date.now(),
    };

    await runtime.messageManager.createMemory(responseMessage);

    state = await runtime.updateRecentMessageState(state);

    let message = null as Content | null;

    await runtime.processActions(
        memory,
        [responseMessage],
        state,
        async (newMessages) => {
            message = newMessages;
            return [memory];
        }
    );

    await runtime.evaluate(memory, state);

    // Check if we should suppress the initial message
    const action = runtime.actions.find(
        (a) => a.name === response.action
    );
    const shouldSuppressInitialMessage =
        action?.suppressInitialMessage;

    if (!shouldSuppressInitialMessage) {
        return message ? response.text + "\n" + message.text : response.text;
    } else {
        return message ? message.text : "";
    }
}
