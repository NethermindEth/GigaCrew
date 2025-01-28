// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test, console} from "forge-std/Test.sol";
import {GigaCrew} from "../src/GigaCrew.sol";

contract GigaCrewTest is Test {
    GigaCrew public gigaCrew;
    address[] public judges;
    address public buyer;
    address public seller;
    uint256 public constant PRICE = 1 ether;
    bytes32 public constant PR_TRAIL = bytes32("some_pr_trail");

    function setUp() public {
        // Setup judges
        judges = new address[](3);
        judges[0] = makeAddr("judge1");
        judges[1] = makeAddr("judge2");
        judges[2] = makeAddr("judge3");
        
        // Setup main contract
        gigaCrew = new GigaCrew(judges);
        
        // Setup buyer and seller
        buyer = makeAddr("buyer");
        seller = makeAddr("seller");
        vm.deal(buyer, 10 ether);
    }

    function test_RegisterService() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            100
        );

        (
            address provider,
            string memory title,
            string memory description,
            string memory communicationChannel,
            uint256 rate
        ) = gigaCrew.services(serviceId);
        
        assertEq(provider, seller);
        assertEq(title, "title");
        assertEq(description, "description");
        assertEq(communicationChannel, "127.0.0.1:8080");
        assertEq(rate, 100);
    }

    function test_CreateEscrow() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );
        
        (
            address escrowBuyer,
            address escrowSeller,
            uint256 escrowserviceId,
            uint256 amount,
            uint256 deadline,
            string memory context,
            GigaCrew.EscrowStatus status
        ) = gigaCrew.escrows(orderId);
        
        assertEq(escrowBuyer, buyer);
        assertEq(escrowSeller, seller);
        assertEq(escrowserviceId, serviceId);
        assertEq(amount, PRICE);
        assertTrue(deadline > block.timestamp);
        assertEq(uint(status), uint(GigaCrew.EscrowStatus.Pending));
        assertEq(context, "context");
    }

    function test_CreateEscrowWithoutEnoughFunding() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        vm.expectRevert(GigaCrew.EscrowWithoutEnoughFunding.selector);
        gigaCrew.createEscrow{value: 0}(
            serviceId,
            1 weeks,
            "context"
        );
    }

    function test_SubmitPoW() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );
        
        // Submit PoW as seller
        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");
        
        (string memory work, uint256 timestamp) = gigaCrew.pows(orderId);
        assertEq(work, "work_proof");
        assertEq(timestamp, block.timestamp);
    }

    function test_SubmitPoW_RevertIfNoEscrow() public {
        vm.prank(seller);
        vm.expectRevert(GigaCrew.InvalidOrderId.selector);
        gigaCrew.submitPoW(0, "work_proof");
    }

    function test_SubmitPoW_RevertIfNotSeller() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(buyer);
        vm.expectRevert(GigaCrew.MustBeSeller.selector);
        gigaCrew.submitPoW(orderId, "work_proof");
    }

    function test_SubmitPoW_RevertIfAlreadySubmitted() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.startPrank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");
        
        vm.expectRevert(abi.encodeWithSelector(GigaCrew.PoWAlreadySubmitted.selector, block.timestamp));
        gigaCrew.submitPoW(orderId, "work_proof_2");
        vm.stopPrank();
    }

    function test_SubmitPoW_RevertIfDeadlinePassed() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        // Fast forward past deadline
        vm.warp(block.timestamp + 1 weeks + 1);

        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(GigaCrew.DeadlineAlreadyPassed.selector, block.timestamp - 1));
        gigaCrew.submitPoW(orderId, "work_proof");
    }

    function test_SubmitPoW_RevertIfEmptyWork() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        vm.expectRevert(GigaCrew.EmptyWork.selector);
        gigaCrew.submitPoW(orderId, "");
    }

    function test_SubmitDispute() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        (,,,,,, GigaCrew.EscrowStatus status) = gigaCrew.escrows(orderId);
        assertEq(uint256(status), uint256(GigaCrew.EscrowStatus.Disputed));

        (uint256 buyerShare, uint256 votes, uint256 timestamp) = gigaCrew.disputes(orderId);
        assertEq(buyerShare, 0);
        assertEq(votes, 0);
        assertEq(timestamp, block.timestamp);
    }

    function test_SubmitDispute_RevertIfNoEscrow() public {
        vm.prank(buyer);
        vm.expectRevert(GigaCrew.InvalidOrderId.selector);
        gigaCrew.submitDispute(0);
    }

    function test_SubmitDispute_RevertIfNotBuyer() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(seller);
        vm.expectRevert(GigaCrew.MustBeBuyer.selector);
        gigaCrew.submitDispute(orderId);
    }

    function test_SubmitDispute_RevertIfNoPoW() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(buyer);
        vm.expectRevert(GigaCrew.PoWNotSubmitted.selector);
        gigaCrew.submitDispute(orderId);
    }

    function test_SubmitDispute_RevertIfNotPending() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(GigaCrew.EscrowNotPending.selector, GigaCrew.EscrowStatus.Disputed));
        gigaCrew.submitDispute(orderId);
    }

    function test_VoteOnDispute() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        vm.prank(judges[0]);
        gigaCrew.voteOnDispute(orderId, 0, 30);

        (uint256 buyerShare, uint256 votes,) = gigaCrew.disputes(orderId);
        assertEq(buyerShare, 30);
        assertEq(votes, 1);
    }

    function test_VoteOnDispute_RevertIfNoDispute() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(judges[0]);
        vm.expectRevert(GigaCrew.NoDispute.selector);
        gigaCrew.voteOnDispute(999, 0, 30);

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(judges[0]);
        vm.expectRevert(GigaCrew.NoDispute.selector);
        gigaCrew.voteOnDispute(orderId, 0, 30);
    }

    function test_VoteOnDispute_RevertIfNotJudge() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        vm.prank(buyer);
        vm.expectRevert(GigaCrew.MustBeJudge.selector);
        gigaCrew.voteOnDispute(orderId, 0, 30);

        vm.prank(judges[0]);
        vm.expectRevert(GigaCrew.MustBeJudge.selector);
        gigaCrew.voteOnDispute(orderId, 2, 30);
    }

    function test_VoteOnDispute_RevertIfAlreadyVoted() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        vm.prank(judges[0]);
        gigaCrew.voteOnDispute(orderId, 0, 30);

        vm.prank(judges[0]);
        vm.expectRevert(GigaCrew.AlreadyVoted.selector);
        gigaCrew.voteOnDispute(orderId, 0, 40);
    }

    function test_VoteOnDispute_RevertIfResolutionPeriodPassed() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        vm.warp(block.timestamp + gigaCrew.disputeResolutionPeriod() + 1);

        vm.prank(judges[0]);
        vm.expectRevert(abi.encodeWithSelector(GigaCrew.DisputeResolutionPeriodPassed.selector, block.timestamp - 1));
        gigaCrew.voteOnDispute(orderId, 0, 30);
    }

    function test_VoteOnDispute_RevertIfInvalidBuyerShare() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        vm.prank(judges[0]);
        vm.expectRevert(GigaCrew.InvalidBuyerShare.selector);
        gigaCrew.voteOnDispute(orderId, 0, 101);
    }

    function test_DisputeResult() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        // Setup escrow and PoW
        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );
        
        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");
        
        // Submit dispute as buyer
        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);
        
        // Fast forward past deadline
        uint256 time = block.timestamp;
        vm.warp(time + 1 weeks + 1);

        // Check dispute result with no votes
        uint256 buyerShare = gigaCrew.disputeResult(orderId);
        assertEq(buyerShare, 0); // If no one votes it'll default to 0

        // Go back to original time to enable voting
        vm.warp(time);

        // Judges vote
        vm.prank(judges[0]);
        gigaCrew.voteOnDispute(orderId, 0, 30); // 30% to buyer
        
        vm.prank(judges[1]);
        gigaCrew.voteOnDispute(orderId, 1, 40); // 40% to buyer
        
        // Fast forward past deadline
        vm.warp(time + 1 weeks + 1);

        // Check dispute result with votes
        buyerShare = gigaCrew.disputeResult(orderId);
        assertEq(buyerShare, 35); // Average of 30% and 40%
    }

    function test_DisputeResult_RevertIfNoDispute() public {
        vm.expectRevert(GigaCrew.NoDispute.selector);
        gigaCrew.disputeResult(0);
    }

    function test_DisputeResult_RevertIfResolutionPeriodNotPassed() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        vm.expectRevert(abi.encodeWithSelector(GigaCrew.DisputeResolutionPeriodNotPassed.selector, block.timestamp + gigaCrew.disputeResolutionPeriod()));
        gigaCrew.disputeResult(orderId);
    }

    function test_WithdrawFunds_RevertIfOrderIdInvalid() public {
        vm.expectRevert(GigaCrew.InvalidOrderId.selector);
        gigaCrew.withdrawFunds(999, "");
    }

    function test_WithdrawFunds_RevertIfEscrowAlreadyWithdrawn() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        // Fast forward past lock period
        vm.warp(block.timestamp + 1 weeks + 1);

        // First withdrawal succeeds
        vm.prank(seller);
        gigaCrew.withdrawFunds(orderId, "");

        // Second withdrawal should fail
        vm.expectRevert(GigaCrew.EscrowAlreadyWithdrawn.selector);
        vm.prank(seller);
        gigaCrew.withdrawFunds(orderId, "");
    }

    function test_WithdrawFunds_BuyerWithdrawnThenSellerWithdraws() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        // Judges vote 60-40 split
        vm.prank(judges[0]);
        gigaCrew.voteOnDispute(orderId, 0, 60);

        // Fast forward past dispute resolution
        vm.warp(block.timestamp + 1 weeks + 1);

        // Buyer withdraws their 60% first
        uint256 buyerBalanceBefore = buyer.balance;
        vm.prank(buyer);
        gigaCrew.withdrawFunds(orderId, "");
        assertEq(buyer.balance - buyerBalanceBefore, (PRICE * 60) / 100);

        // Seller can withdraw remaining 40%
        uint256 sellerBalanceBefore = seller.balance;
        vm.prank(seller);
        gigaCrew.withdrawFunds(orderId, "");
        assertEq(seller.balance - sellerBalanceBefore, (PRICE * 40) / 100);
    }

    function test_WithdrawFunds_SellerWithdrawnThenBuyerWithdraws() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        // Judges vote 60-40 split
        vm.prank(judges[0]);
        gigaCrew.voteOnDispute(orderId, 0, 60);

        // Fast forward past dispute resolution
        vm.warp(block.timestamp + 1 weeks + 1);

        // Seller withdraws their 40% first
        uint256 sellerBalanceBefore = seller.balance;
        vm.prank(seller);
        gigaCrew.withdrawFunds(orderId, "");
        assertEq(seller.balance - sellerBalanceBefore, (PRICE * 40) / 100);

        // Buyer can withdraw remaining 60%
        uint256 buyerBalanceBefore = buyer.balance;
        vm.prank(buyer);
        gigaCrew.withdrawFunds(orderId, "");
        assertEq(buyer.balance - buyerBalanceBefore, (PRICE * 60) / 100);
    }

    function test_WithdrawFunds_DisputeWithFullBuyerShare() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        // Judge votes 100% to buyer
        vm.prank(judges[0]);
        gigaCrew.voteOnDispute(orderId, 0, 100);

        // Fast forward past dispute resolution
        vm.warp(block.timestamp + 1 weeks + 1);

        uint256 buyerBalanceBefore = buyer.balance;
        gigaCrew.withdrawFunds(orderId, "");
        assertEq(buyer.balance - buyerBalanceBefore, PRICE);
    }

    function test_WithdrawFunds_DisputeWithFullSellerShare() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.prank(buyer);
        gigaCrew.submitDispute(orderId);

        // Judge votes 0% to buyer (100% to seller)
        vm.prank(judges[0]);
        gigaCrew.voteOnDispute(orderId, 0, 0);

        // Fast forward past dispute resolution
        vm.warp(block.timestamp + 1 weeks + 1);

        uint256 sellerBalanceBefore = seller.balance;
        gigaCrew.withdrawFunds(orderId, "");
        assertEq(seller.balance - sellerBalanceBefore, PRICE);
    }

    function test_WithdrawFunds_SellerWithdrawsAfterPoWAndLockPeriod() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        // Fast forward past lock period
        vm.warp(block.timestamp + 1 weeks + 1);

        uint256 sellerBalanceBefore = seller.balance;
        gigaCrew.withdrawFunds(orderId, "");
        assertEq(seller.balance - sellerBalanceBefore, PRICE);
    }

    function test_WithdrawFunds_BuyerWithdrawsAfterDeadline() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        // Fast forward past deadline without PoW
        vm.warp(block.timestamp + 1 weeks + 1);

        uint256 buyerBalanceBefore = buyer.balance;
        gigaCrew.withdrawFunds(orderId, "");
        assertEq(buyer.balance - buyerBalanceBefore, PRICE);
    }

    function test_WithdrawFunds_RevertIfLockPeriodNotPassed() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.prank(seller);
        gigaCrew.submitPoW(orderId, "work_proof");

        vm.expectRevert(abi.encodeWithSelector(GigaCrew.LockPeriodNotPassed.selector, block.timestamp + gigaCrew.lockPeriod()));
        gigaCrew.withdrawFunds(orderId, "");
    }

    function test_WithdrawFunds_RevertIfDeadlineNotPassed() public {
        vm.startPrank(seller);
        uint256 serviceId = gigaCrew.registerService(
            "title",
            "description",
            "127.0.0.1:8080",
            PRICE
        );
        vm.stopPrank();

        vm.prank(buyer);
        uint256 orderId = gigaCrew.createEscrow{value: PRICE}(
            serviceId,
            1 weeks,
            "context"
        );

        vm.expectRevert(abi.encodeWithSelector(GigaCrew.DeadlineNotPassed.selector, block.timestamp + 1 weeks));
        gigaCrew.withdrawFunds(orderId, "");
    }
}
