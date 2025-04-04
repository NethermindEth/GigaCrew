import { elizaLogger } from "@elizaos/core";

export function auditWorkerGenerator(baseUrl: string, apiKey: string) {
    return async (workerRuntime: any, orderId: string, buyer: string, inputContext: string) => {
        elizaLogger.info("GigaCrew worker processing request", { orderId, buyer });
        // Process as a Solidity request with modified template
        
        if (inputContext.startsWith("```solidity") || inputContext.startsWith("```")) {
            inputContext = inputContext.replace("```solidity", "").replace("```", "");
        }
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
            elizaLogger.info("Scan initiated", scanData);
            
            // Get the scan ID from the response
            const scanId = scanData.data.scan_id;
            
            // Poll for results every 30 seconds for up to 2 hours
            let resultData = null;
            const maxAttempts = 24; // 2 hours / 5 minutes = 24 attempts
            let attempts = 0;

            while (attempts < maxAttempts) {
                // Wait 5 minutes before checking for results
                await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
                
                // Request the scan results
                const resultResponse = await fetch(`${baseUrl}/api/v1/scanner/single-contract/result/${scanId}`, {
                    method: 'GET',
                    headers: {
                        'x-api-key': apiKey
                    }
                });
                
                resultData = await resultResponse.json();
                elizaLogger.info("Scan result", resultData);
                
                // If the scan is complete and we have 100% result, return it
                if (resultData.data.scan.status === 'completed' && resultData.data.scan.progress === 100) {
                    const downloadUrl = resultData.data.result.downloadUrl;
                    return `Your contract's audit report is available at: ${downloadUrl}`;
                }

                attempts++;
            }
            
            // Return whatever result we have after timeout
            return "Scan did not finish in time";
        } catch (error) {
            elizaLogger.error("Error in audit process:", error);
            return "Failed to complete the audit process";
        }
    };
}
