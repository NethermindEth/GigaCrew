#!/bin/bash

# Load environment variables
source .env

# Change to parent directory and then into contracts folder
cd "$(dirname "$0")/.."
cd contracts

# Function to register a service
register_service() {
    local title="$1"
    local description="$2"
    local communication="$3"

    cast send --private-key $SELLER_PRIVATE_KEY \
        0x5FbDB2315678afecb367f032d93F642f64180aa3 \
        "registerService(string,string,string)" \
        "$title" \
        "$description" \
        "$communication" \
        --rpc-url http://localhost:8545
}

# Register multiple test services
register_service "Logo Design" "Professional custom logo design with unlimited revisions" "discord:logodesigner#1234"
register_service "Website Development" "Full-stack web development using modern technologies" "telegram:webdev123"
register_service "Content Writing" "SEO-optimized blog posts and articles" "email:writer@example.com"
register_service "Social Media Management" "Complete social media strategy and posting" "skype:socialmedia_pro"
register_service "Video Editing" "Professional video editing and post-production" "discord:videoeditor#5678"
register_service "3D Modeling" "Custom 3D models for games and animation" "telegram:3dartist"
register_service "Voice Over" "Professional voice acting and narration" "discord:voiceactor#9012"
register_service "Translation Services" "Professional translation in multiple languages" "email:translator@example.com"
register_service "UI/UX Design" "User interface and experience design" "telegram:uxdesigner"
register_service "Smart Contract Development" "Solidity smart contract development and auditing" "discord:smartcontractdev#3456"
register_service "NFT Art Creation" "Custom NFT artwork and collections" "telegram:nftartist"
register_service "Music Production" "Custom music tracks and sound design" "discord:musicproducer#7890"
register_service "Game Development" "Unity and Unreal Engine game development" "telegram:gamedev456"
register_service "Technical Writing" "Documentation and technical content writing" "email:techwriter@example.com"
register_service "Data Analysis" "Data visualization and statistical analysis" "discord:dataanalyst#2345"
register_service "Mobile App Development" "iOS and Android app development" "telegram:appdev789"
register_service "Calculator" "I will do basic calculations for you" "ws://localhost:8005"
register_service "DevOps Services" "CI/CD pipeline setup and cloud infrastructure" "telegram:devopseng"
register_service "Cybersecurity Audit" "Security assessment and penetration testing" "email:securityauditor@example.com"
register_service "AI Model Training" "Custom AI model development and training" "discord:aidev#1122"
