// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {GigaCrew} from "../src/GigaCrew.sol";

contract GigaCrewScript is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Deploy GigaCrew contract
        address[] memory judges = new address[](2);
        judges[0] = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
        judges[1] = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;
        vm.startBroadcast(deployerPrivateKey);
        new GigaCrew(judges);
        vm.stopBroadcast();
    }
}
