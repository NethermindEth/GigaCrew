// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract GigaCrew {
    // TODO: Maybe make these configurable per escrow?
    uint256 public lockPeriod = 1 minutes;
    uint256 public disputeResolutionPeriod = 1 minutes;

    // TODO: Hardcoded for MVP
    address[] public judges;

    // Technically doesn't have to be a part of this smart contract
    // We only need a decentralized way to store and serve service data for potential buyers to find
    struct Service {
        bool paused;
        address provider;
        string title;
        string description;
        string communicationChannel;
        uint256 rate;
    }

    enum EscrowStatus { Pending, Disputed, BuyerWithdrawn, SellerWithdrawn, Withdrawn }
    struct Escrow {
        address buyer;
        address seller;
        uint256 serviceId;
        uint256 amount;
        uint256 deadline;
        string context;
        EscrowStatus status;
    }

    struct Dispute {
        uint256 buyerShare;
        uint256 votes;
        uint256 timestamp;
    }

    struct PoW {
        string work;
        uint256 timestamp;
    }

    // State variables
    mapping(uint256 => Service) public services;
    mapping(uint256 => Escrow) public escrows; 
    mapping(uint256 => PoW) public pows;
    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => mapping(uint256 => bool)) public judgeVotes;
    uint256 public lastServiceId;
    uint256 public lastOrderId;

    // Events
    event ServiceRegistered(uint256 indexed serviceId, address indexed provider);
    event ServicePaused(uint256 indexed serviceId);
    event ServiceResumed(uint256 indexed serviceId);
    event EscrowCreated(uint256 orderId, uint256 indexed serviceId, address indexed buyer, address indexed seller, string context, uint256 deadline);
    event EscrowDisputed(uint256 indexed orderId, uint256 disputeResolutionPeriod);
    event PoWSubmitted(uint256 indexed orderId, address indexed buyer, address indexed seller, string work, uint256 lockPeriod);
    event FundsWithdrawn(uint256 indexed orderId, address indexed to, uint256 amount);
    event DisputeVote(uint256 indexed orderId, uint256 indexed judgeId, uint256 buyerShare);

    // Errors
    error NoDispute();
    error DisputeResolutionPeriodPassed(uint256 deadline);
    error DisputeResolutionPeriodNotPassed(uint256 deadline);
    error InvalidBuyerShare();
    error MustBeJudge();
    error AlreadyVoted();

    error InvalidServiceId();
    error InvalidOrderId();
    error MustBeBuyer();
    error MustBeSeller();
    
    error EmptyWork();
    error PoWNotSubmitted();
    error PoWAlreadySubmitted(uint256 submissionTimestamp);

    error DeadlineNotPassed(uint256 deadline);
    error DeadlineAlreadyPassed(uint256 deadline);
    error LockPeriodNotPassed(uint256 lockDeadline);

    error EscrowWithoutEnoughFunding();
    error EscrowAlreadyWithdrawn();
    error EscrowNotPending(EscrowStatus status);
    
    // Modifiers
    function _escrowExists(uint256 _orderId) internal view {
        if (_orderId >= lastOrderId) {
            revert InvalidOrderId();
        }
    }

    function _disputeExists(uint256 _orderId) internal view {
        if (disputes[_orderId].timestamp == 0) {
            revert NoDispute();
        }
    }

    modifier escrowExists(uint256 _orderId) {
        _escrowExists(_orderId);
        _;
    }

    modifier disputeExists(uint256 _orderId) {
        _disputeExists(_orderId);
        _;
    }

    modifier onlyBuyer(uint256 _orderId) {
        _escrowExists(_orderId);
        if (msg.sender != escrows[_orderId].buyer) {
            revert MustBeBuyer();
        }
        _;
    }

    modifier onlySeller(uint256 _orderId) {
        _escrowExists(_orderId);
        if (msg.sender != escrows[_orderId].seller) {
            revert MustBeSeller();
        }
        _;
    }

    modifier onlyJudge(uint256 _orderId, uint256 _judgeId) {
        _disputeExists(_orderId);
        if (msg.sender != judges[_judgeId]) {
            revert MustBeJudge();
        }
        _;
    }

    constructor(address[] memory _judges) {
        judges = _judges;
    }

    // Functions
    function registerService(
        string memory _title,
        string memory _description,
        string memory _communicationChannel,
        uint256 _rate
    ) external returns (uint256 service_id) {
        service_id = lastServiceId;
        services[service_id] = Service({
            paused: false,
            provider: msg.sender,
            title: _title,
            description: _description,
            communicationChannel: _communicationChannel,
            rate: _rate
        });
        emit ServiceRegistered(service_id, msg.sender);
        lastServiceId++;
    }

    function pauseService(uint256 _serviceId) external {
        if (services[_serviceId].provider != msg.sender) {
            revert MustBeSeller();
        }
        services[_serviceId].paused = true;
        emit ServicePaused(_serviceId);
    }

    function resumeService(uint256 _serviceId) external {
        if (services[_serviceId].provider != msg.sender) {
            revert MustBeSeller();
        }
        services[_serviceId].paused = false;
        emit ServiceResumed(_serviceId);
    }

    function createEscrow(
        uint256 _serviceId,
        uint256 _deadlinePeriod,
        string memory _context
    ) external payable returns (uint256 order_id) {
        if (_serviceId >= lastServiceId || services[_serviceId].paused) {
            revert InvalidServiceId();
        }

        // TODO: Can pay more if you want
        if (msg.value < services[_serviceId].rate) {
            revert EscrowWithoutEnoughFunding();
        }

        address seller = services[_serviceId].provider;
        uint256 deadline = block.timestamp + _deadlinePeriod;

        order_id = lastOrderId;
        escrows[order_id] = Escrow({
            buyer: msg.sender,
            seller: seller,
            serviceId: _serviceId,
            amount: msg.value,
            deadline: deadline,
            context: _context,
            status: EscrowStatus.Pending
        });
        emit EscrowCreated(order_id, _serviceId, msg.sender, seller, _context, deadline);
        lastOrderId++;
    }

    function submitPoW(
        uint256 _orderId,
        string memory _work
    ) external onlySeller(_orderId) {
        if (pows[_orderId].timestamp > 0) {
            revert PoWAlreadySubmitted(pows[_orderId].timestamp);
        }

        if (escrows[_orderId].deadline < block.timestamp) {
            revert DeadlineAlreadyPassed(escrows[_orderId].deadline);
        }

        if (bytes(_work).length == 0) {
            revert EmptyWork();
        }

        pows[_orderId] = PoW({
            work: _work,
            timestamp: block.timestamp
        });
        emit PoWSubmitted(_orderId, escrows[_orderId].buyer, msg.sender, _work, block.timestamp + lockPeriod);
    }

    function submitDispute(uint256 _orderId) external onlyBuyer(_orderId) {
        if (escrows[_orderId].status != EscrowStatus.Pending) {
            revert EscrowNotPending(escrows[_orderId].status);
        }
        if (pows[_orderId].timestamp == 0) {
            revert PoWNotSubmitted();
        }

        escrows[_orderId].status = EscrowStatus.Disputed;
        disputes[_orderId] = Dispute({
            buyerShare: 0,
            votes: 0,
            timestamp: block.timestamp
        });
        emit EscrowDisputed(_orderId, block.timestamp + disputeResolutionPeriod);
    }

    // TODO: Just an MVP
    function voteOnDispute(uint256 _orderId, uint256 _judgeId, uint256 _buyerShare) external onlyJudge(_orderId, _judgeId) {
        if (judgeVotes[_orderId][_judgeId]) {
            revert AlreadyVoted();
        }

        if (disputes[_orderId].timestamp + disputeResolutionPeriod < block.timestamp) {
            revert DisputeResolutionPeriodPassed(disputes[_orderId].timestamp + disputeResolutionPeriod);
        }

        if (_buyerShare > 100) {
            revert InvalidBuyerShare();
        }

        judgeVotes[_orderId][_judgeId] = true;

        uint256 oldVotes = disputes[_orderId].votes;
        uint256 oldBuyerShare = disputes[_orderId].buyerShare;

        disputes[_orderId].buyerShare = (oldBuyerShare * oldVotes + _buyerShare) / (oldVotes + 1);
        disputes[_orderId].votes++;
        emit DisputeVote(_orderId, _judgeId, _buyerShare);
    }

    function disputeResult(uint256 _orderId) public disputeExists(_orderId) view returns (uint256 buyerShare) {
        if (block.timestamp <= disputes[_orderId].timestamp + disputeResolutionPeriod) {
            revert DisputeResolutionPeriodNotPassed(disputes[_orderId].timestamp + disputeResolutionPeriod);
        }

        // If no one votes, buyer gets nothing
        if (disputes[_orderId].votes == 0) {
            return 0;
        }

        // Otherwise just return the average vote on the share of the buyer
        return disputes[_orderId].buyerShare;
    }

    function withdrawFunds(uint256 _orderId, bytes memory _signature) external escrowExists(_orderId) {
        /*
            1. If withdrawn -> revert
            2. If partially withdrawn -> Other party can withdraw
            3. If multisig -> whoever both buyer and seller agreed on can withdraw no matter what
            4. If dispute -> depending on share buyer and seller can withdraw
                (no one can withdraw if dispute is not resolved yet)
            5. If PoW -> seller can withdraw if lock period passed
            5. If no PoW -> buyer can withdraw if deadline passed
        */
        EscrowStatus escrowStatus = escrows[_orderId].status;
        address seller = escrows[_orderId].seller;
        address buyer = escrows[_orderId].buyer;
        uint256 amount = escrows[_orderId].amount;

        if (escrowStatus == EscrowStatus.Withdrawn) {
            revert EscrowAlreadyWithdrawn();
        }

        if (escrowStatus == EscrowStatus.BuyerWithdrawn) {
            uint256 sellerShare = amount - (amount * disputeResult(_orderId) / 100);
            escrows[_orderId].status = EscrowStatus.Withdrawn;
            payable(seller).transfer(sellerShare);
            emit FundsWithdrawn(_orderId, seller, sellerShare);
            return;
        }

        if (escrowStatus == EscrowStatus.SellerWithdrawn) {
            uint256 buyerShare = amount * disputeResult(_orderId) / 100;
            escrows[_orderId].status = EscrowStatus.Withdrawn;
            payable(buyer).transfer(buyerShare);
            emit FundsWithdrawn(_orderId, buyer, buyerShare);
            return;
        }

        // Current status: FundsAvailable -> Check multisig
        if (_signature.length > 0) {
            // TODO: Implement multisig (No matter what as long as buyer and seller agree on a withdrawal resolution we let that happen)
            revert("Not implemented");
        }

        // Current status: FundsAvailable + NoMultisig -> Check dispute
        if (escrowStatus == EscrowStatus.Disputed) {
            uint256 buyerShare = disputeResult(_orderId); // Will fail if dispute is not resolved yet
            
            // One party gets all the funds
            if (buyerShare == 0) {
                // Seller gets everything
                escrows[_orderId].status = EscrowStatus.Withdrawn;
                payable(seller).transfer(amount);
                emit FundsWithdrawn(_orderId, seller, amount);
                return;
            } else if (buyerShare == 100) {
                // Buyer gets everything
                escrows[_orderId].status = EscrowStatus.Withdrawn;
                payable(buyer).transfer(amount);
                emit FundsWithdrawn(_orderId, buyer, amount);
                return;
            }

            // The parties have to split the funds
            buyerShare = amount * buyerShare / 100;
            uint256 sellerShare = amount - buyerShare;

            // In this case we need to handle withdrawals individually for seller and buyer
            // otherwise one account could be a smart contract that reverts and ruins the escrow
            // for the other party
            if (msg.sender == buyer) {
                escrows[_orderId].status = EscrowStatus.BuyerWithdrawn;
                payable(buyer).transfer(buyerShare);
                emit FundsWithdrawn(_orderId, buyer, buyerShare);
                return;
            } else if (msg.sender == seller) {
                escrows[_orderId].status = EscrowStatus.SellerWithdrawn;
                payable(seller).transfer(sellerShare);
                emit FundsWithdrawn(_orderId, seller, sellerShare);
                return;
            }
        }

        // Current status: FundsAvailable + NoMultisig + NoDispute -> Check PoW
        if (pows[_orderId].timestamp > 0) {
            // PoW -> Seller can withdraw if lock period passed
            if (block.timestamp <= pows[_orderId].timestamp + lockPeriod) {
                revert LockPeriodNotPassed(pows[_orderId].timestamp + lockPeriod);
            }

            escrows[_orderId].status = EscrowStatus.Withdrawn;
            payable(seller).transfer(amount);
            emit FundsWithdrawn(_orderId, seller, amount);
            return;
        } else {
            // No PoW -> Buyer can withdraw if deadline passed
            if (block.timestamp <= escrows[_orderId].deadline) {
                revert DeadlineNotPassed(escrows[_orderId].deadline);
            }

            escrows[_orderId].status = EscrowStatus.Withdrawn;
            payable(buyer).transfer(amount);
            emit FundsWithdrawn(_orderId, buyer, amount);
            return;
        }
    }
}
