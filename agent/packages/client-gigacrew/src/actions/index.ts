import { GigaCrewClient } from "../index.ts";
import { generateMessageResponse, ModelClass } from "@elizaos/core";
import { composeContext, elizaLogger, generateText, HandlerCallback } from "@elizaos/core";
import { Action, IAgentRuntime, Memory, State } from "@elizaos/core";

export const searchServiceTemplate = `
# Context: As {{agentName}} you decided to go ahead and hire a service based on the recent conversation that you had.
# Task: The first step is to search for services that align with the needs. Give me the query that you would use to search for the service that you need so I can provide you with a list of services that you can choose from.
About {{agentName}}:
{{bio}}
{{lore}}
{{knowledge}}

{{providers}}

{{messageDirections}}

{{recentMessages}}

# Instructions: The query should be less than 100 words and explain the type of service that you need. Your response MUST ONLY contain the query.
`;

export const selectServiceTemplate = `
# Context: As {{agentName}} you decided to go ahead and hire a service based on the recent conversation that you had. And then you searched for services that aligned with the needs.
You used this query to search for services: {{serviceQuery}}

# ServiceList:
{{serviceList}}

# Task: Now you need to either 1. Select a service from the list 2. Decide that you want to search again with a different query 3. Decide that maybe you should give up on hiring a service and apologize to the user.
About {{agentName}}:
{{bio}}
{{lore}}
{{knowledge}}

{{providers}}

{{messageDirections}}

{{recentMessages}}

# Instructions
Your response must be formatted in a JSON block.
The possible fields are "chosen_service_id", "new_query" and "apology".
There's also a must include field called "reason" which should explain why you chose the field you chose.
`;

export const workContextTemplate = `
# Context: As {{agentName}} you decided to go ahead and hire a service based on the recent conversation that you had. And then you searched for services that aligned with the needs and decided to hire the following service.
# Service
{{serviceTitle}}
{{serviceDescription}}

# Task: Think of the job that you decided to hire this service for based on your recent conversation. Now you need to provide the service provider of this service with information and details about the job so that he can do the work and complete it for you.
About {{agentName}}:
{{bio}}
{{lore}}
{{knowledge}}

{{providers}}

{{messageDirections}}

{{recentMessages}}

# Instructions: Be concise and to the point. Only provide information and context about the job. No need for any other information or formalities.
`;

export const GigaCrewHireAction: Action = {
    name: "HIRE_AGENT",
    similes: ["HIRE_SERVICE", "SEARCH_SERVICES"],
    description: 
    "Use this action when you have all the data and information you need to do a task or a service HOWEVER you are not able to do it yourself. " + 
    "Keep in mind that this action will hire another agent to process the task or service based on the context you provide so DO NOT use this action if you don't have all the information needed for the task. Instead just ask the user for the information first." + 
    "If you're going to ask the user if they're ok with you hiring someone to do it, DO NOT use this action." +
    "This action is only for when 1. You have all the information 2. You are sure you are going to do it and aren't going to ask for permission."
    ,
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Hey I need help with a calculation!",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'm not confident in maths... I could hire someone to do it for me if you want?",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "Oh ok sure! Please hire someone to do it for me and let me know what they say.",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Ok well first I need to know what the formula is and the numbers you want to use.",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "The formula is 5x^2 + 10x + 15 when x = 2",
                },
            },
            {
                user: "{{user2}}",
                content: { text: "Alright I hired someone to calculate 5x^2 + 10x + 15 when x = 2 for you!", action: "HIRE_AGENT" },
            },
        ],
    ],
    validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        // Always allow hiring
        return true;
    },
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State, options?: { [key: string]: unknown }, callback?: HandlerCallback) => {
        elizaLogger.log("GigaCrew HIRE_AGENT action called", {
            message: message.content.text,
        });
        const client: GigaCrewClient = runtime.clients["gigacrew"] as GigaCrewClient;

        // Generate service query
        const query = await generateServiceQuery(runtime, state);

        // Search for services
        const { services, serviceSelectionResponse } = await searchServices(runtime, query, state);

        // Handle service selection
        const service = await handleServiceSelection(serviceSelectionResponse, services);
        if (typeof service === "string") {
            return callback({
                text: service,
            });
        }

        // Generate context for the service provider
        const workContext = await generateWorkContext(runtime, service, state);

        // Hire agent
        const work = await createAndWaitForWork(client, service, workContext);
        callback({
            text: work,
        });
    }
}

export async function generateServiceQuery(runtime: IAgentRuntime, state: State) {
    const searchContext = composeContext({
        state,
        template: searchServiceTemplate,
    });
    const query = await generateText({ runtime, context: searchContext, modelClass: ModelClass.SMALL });
    elizaLogger.log("GigaCrew: Generated service query", {
        serviceQuery: query,
    });
    return query;
}

export async function searchServices(runtime: IAgentRuntime, query: string, state: State) {
    let services = null;
    let serviceSelectionResponse = null;
    let retries = 0;
    const client: GigaCrewClient = runtime.clients["gigacrew"] as GigaCrewClient;
    do {
        services = await client.buyerHandler.searchServices(query);
        elizaLogger.log("GigaCrew HIRE_AGENT action searched for services", {
            services,
        });

        // Decide which service to hire if any
        state["serviceQuery"] = query;
        state["serviceList"] = !Array.isArray(services) || services.length == 0 ? "NO SERVICES FOUND" : services.map(service => `ID: ${service.serviceId} - Title: ${service.title.replace(/\\n/g, " ")} - Description: ${service.description.replace(/\\n/g, " ")}`).join("\n");
        const serviceContext = composeContext({
            state,
            template: selectServiceTemplate,
        });
        serviceSelectionResponse = await generateMessageResponse({
            runtime,
            context: serviceContext,
            modelClass: ModelClass.SMALL,
        });

        elizaLogger.log("GigaCrew: Service selection response", serviceSelectionResponse);

        if (serviceSelectionResponse.new_query && serviceSelectionResponse.new_query.length > 0) {
            query = serviceSelectionResponse.new_query as string;
        } else {
            query = null;
        }
        retries++;
    } while (query && retries < 3);
    return { services, serviceSelectionResponse };
}

export async function handleServiceSelection(serviceSelectionResponse: any, services: any[]) {
    let service = null;
    if (serviceSelectionResponse.chosen_service_id != null && serviceSelectionResponse.chosen_service_id != undefined) {
        const service_id = serviceSelectionResponse.chosen_service_id.toString();
        service = services.find(service => service.serviceId === service_id);
    } else if (serviceSelectionResponse.apology && serviceSelectionResponse.apology.length > 0) {
        // APOLOGIZE
        elizaLogger.log("GigaCrew HIRE_AGENT action no service selected... using apology");
        return serviceSelectionResponse.apology as string;
    }

    if (!service) {
        // APOLOGIZE
        elizaLogger.log("GigaCrew HIRE_AGENT action bad serviceId... using fallback apology");
        return "I couldn't find a service that does what's needed. I'm sorry.";
    }

    return service;
}

export async function generateWorkContext(runtime: IAgentRuntime, service: any, state: State) {
    state["serviceTitle"] = service.title;
    state["serviceDescription"] = service.description;
    const context = composeContext({
        state,
        template: workContextTemplate,
    });
    const workContext = await generateText({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
    });
    elizaLogger.log("GigaCrew: Generated work context", {
        workContext,
    });
    return workContext;
}

export async function createAndWaitForWork(client: GigaCrewClient, service: any, workContext: string) {
    const orderId = await client.buyerHandler.createEscrow(service, 100, workContext);
    elizaLogger.log("GigaCrew: Waiting for work to be done", {
        orderId,
    });
    return await client.buyerHandler.waitForWork(orderId);
}
