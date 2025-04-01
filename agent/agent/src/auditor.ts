import { elizaLogger } from "@elizaos/core";

export function auditWorkerGenerator(baseUrl: string, apiKey: string) {
    return async (workerRuntime: any, orderId: string, buyer: string, inputContext: string) => {
        elizaLogger.info("GigaCrew worker processing request", { orderId, buyer });
        // Process as a Solidity request with modified template
        
        elizaLogger.info("The solidity code is: ", inputContext);

        // Send the contract code to the audit API
        try {
            // Extract the contract code from the work
            const contractCode = inputContext;
            const contractName = "smart_contract.sol";
            
            // Prepare the request payload
            const payload = JSON.stringify({
                contractCode: contractCode,
                contractName: contractName
            });
            
            // Send the initial scan request
            const scanResponse = await fetch(`${baseUrl}/api/v1/scanner/single-contract/scan-per-contract`, {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json'
                },
                body: payload
            });
            
            const scanData = await scanResponse.json();
            elizaLogger.info("Scan initiated with ID:", scanData.scanId);
            
            // Get the scan ID from the response
            const scanId = scanData.scanId;
            
            // Poll for results every 30 seconds for up to 10 minutes
            let resultData = null;
            const maxAttempts = 20; // 10 minutes ÷ 30 seconds = 20 attempts
            let attempts = 0;
            
            while (attempts < maxAttempts) {
                // Wait 30 seconds before checking for results
                await new Promise(resolve => setTimeout(resolve, 30000));
                
                // Request the scan results
                const resultResponse = await fetch(`${baseUrl}/api/v1/scanner/single-contract/result/${scanId}`, {
                    method: 'GET',
                    headers: {
                        'x-api-key': apiKey
                    }
                });
                
                resultData = await resultResponse.json();
                elizaLogger.info("Scan result status:", resultData.status);
                
                // If the scan is complete and we have 100% result, return it
                if (resultData.status === 'COMPLETED' || resultData.progress === 100) {
                    return JSON.stringify(resultData);
                }
                
                attempts++;
            }
            
            // Return whatever result we have after timeout
            return JSON.stringify(resultData);
        } catch (error) {
            elizaLogger.error("Error in audit process:", error);
            return JSON.stringify({ error: "Failed to complete the audit process" });
        }  
    };
}
