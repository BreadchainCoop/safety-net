// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {Breadfund} from "../src/contracts/Breadfund.sol";
import {IBreadfund} from "../src/interfaces/IBreadfund.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract BreadfundEpochTest is Test {
    Breadfund public breadfund;
    MockERC20 public token;
    
    address public owner = address(0x1);
    address public member1 = address(0x2);
    address public member2 = address(0x3);
    address public member3 = address(0x4);
    
    uint256 public constant EPOCH_DURATION = 1 days;
    uint256 public constant INITIAL_DEPOSIT = 1000e18;
    uint256 public constant FIXED_DEPOSIT = 100e18;
    uint256 public constant MEMBER_DEPOSIT = 500e18;
    
    uint256 public breadfundId;
    
    function setUp() public {
        // Deploy contracts
        breadfund = new Breadfund();
        token = new MockERC20("Test Token", "TEST");
        
        // Initialize breadfund
        breadfund.initialize(owner);
        
        // Set token as allowed
        vm.prank(owner);
        breadfund.setTokenAllowed(address(token), true);
        
        // Create members array
        address[] memory members = new address[](3);
        members[0] = member1;
        members[1] = member2;
        members[2] = member3;
        
        // Create breadfund struct
        IBreadfund.Breadfund memory breadfundStruct = IBreadfund.Breadfund({
            owner: owner,
            minimumMembers: 3,
            maximumMembers: 3,
            consensusThreshold: 67,
            breadfundStart: block.timestamp,
            token: address(token),
            members: members,
            initialDeposit: INITIAL_DEPOSIT,
            fixedDeposit: FIXED_DEPOSIT,
            ratio: 120,
            autoThreshold: 100e18,
            contestWindow: 1 days,
            votingWindow: 2 days,
            currentEpoch: 0,
            epochDuration: EPOCH_DURATION
        });
        
        // Create breadfund
        breadfundId = breadfund.create(breadfundStruct);
        
        // Mint tokens to members
        token.mint(member1, 10000e18);
        token.mint(member2, 10000e18);
        token.mint(member3, 10000e18);
        
        // Approve breadfund to spend tokens
        vm.prank(member1);
        token.approve(address(breadfund), type(uint256).max);
        vm.prank(member2);
        token.approve(address(breadfund), type(uint256).max);
        vm.prank(member3);
        token.approve(address(breadfund), type(uint256).max);
    }
    
    function testGetCurrentEpochIndex() public {
        // At start, should be epoch 0
        assertEq(breadfund.getCurrentEpochIndex(breadfundId), 0);
        
        // After 1 day, should be epoch 1
        vm.warp(block.timestamp + EPOCH_DURATION);
        assertEq(breadfund.getCurrentEpochIndex(breadfundId), 1);
        
        // After 2.5 days, should be epoch 2
        vm.warp(block.timestamp + EPOCH_DURATION + (EPOCH_DURATION / 2));
        assertEq(breadfund.getCurrentEpochIndex(breadfundId), 2);
        
        // After 5 days, should be epoch 5
        vm.warp(block.timestamp + 3 * EPOCH_DURATION - (EPOCH_DURATION / 2));
        assertEq(breadfund.getCurrentEpochIndex(breadfundId), 5);
    }
    
    function testMemberDepositInCurrentEpoch() public {
        // Member1 deposits in epoch 0
        vm.prank(member1);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        
        // Check that member1 has deposited in epoch 0
        assertTrue(breadfund.hasMemberDepositedInEpoch(breadfundId, member1, 0));
        assertFalse(breadfund.hasMemberDepositedInEpoch(breadfundId, member2, 0));
        assertFalse(breadfund.hasMemberDepositedInEpoch(breadfundId, member3, 0));
    }
    
    function testDuplicateDepositPrevention() public {
        // Member1 deposits in epoch 0
        vm.prank(member1);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        
        // Member1 tries to deposit again in the same epoch - should fail
        vm.prank(member1);
        vm.expectRevert(IBreadfund.AlreadyDeposited.selector);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
    }
    
    function testDepositInDifferentEpochs() public {
        // Member1 deposits in epoch 0
        vm.prank(member1);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        
        assertTrue(breadfund.hasMemberDepositedInEpoch(breadfundId, member1, 0));
        
        // Move to epoch 1
        vm.warp(block.timestamp + EPOCH_DURATION);
        
        // Member1 can deposit again in epoch 1
        vm.prank(member1);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        
        assertTrue(breadfund.hasMemberDepositedInEpoch(breadfundId, member1, 1));
        assertFalse(breadfund.hasMemberDepositedInEpoch(breadfundId, member2, 1));
    }
    
    function testEpochCompletionEvent() public {
        // Expect EpochCompleted event when all members deposit
        vm.expectEmit(true, true, false, true);
        emit IBreadfund.EpochCompleted(breadfundId, 0, block.timestamp);
        
        // All members deposit in epoch 0
        vm.prank(member1);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        
        vm.prank(member2);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        
        // Last deposit should trigger the event
        vm.prank(member3);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
    }
    
    function testPartialEpochCompletion() public {
        // Only 2 members deposit - no event should be emitted
        vm.prank(member1);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        
        vm.prank(member2);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        
        // Verify deposits are tracked but epoch not completed
        assertTrue(breadfund.hasMemberDepositedInEpoch(breadfundId, member1, 0));
        assertTrue(breadfund.hasMemberDepositedInEpoch(breadfundId, member2, 0));
        assertFalse(breadfund.hasMemberDepositedInEpoch(breadfundId, member3, 0));
    }
    
    function testHasAllMembersDepositedForAllEpochs_SingleEpoch() public {
        // Initially false
        assertFalse(breadfund.hasAllMembersDepositedForAllEpochs(breadfundId));
        
        // After partial deposits, still false
        vm.prank(member1);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        assertFalse(breadfund.hasAllMembersDepositedForAllEpochs(breadfundId));
        
        vm.prank(member2);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        assertFalse(breadfund.hasAllMembersDepositedForAllEpochs(breadfundId));
        
        // After all members deposit, should be true
        vm.prank(member3);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        assertTrue(breadfund.hasAllMembersDepositedForAllEpochs(breadfundId));
    }
    
    function testHasAllMembersDepositedForAllEpochs_MultipleEpochs() public {
        // All members deposit in epoch 0
        vm.prank(member1);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        vm.prank(member2);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        vm.prank(member3);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        
        assertTrue(breadfund.hasAllMembersDepositedForAllEpochs(breadfundId));
        
        // Move to epoch 1
        vm.warp(block.timestamp + EPOCH_DURATION);
        
        // Now false because no one deposited in epoch 1 yet
        assertFalse(breadfund.hasAllMembersDepositedForAllEpochs(breadfundId));
        
        // Partial deposits in epoch 1
        vm.prank(member1);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        assertFalse(breadfund.hasAllMembersDepositedForAllEpochs(breadfundId));
        
        vm.prank(member2);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        assertFalse(breadfund.hasAllMembersDepositedForAllEpochs(breadfundId));
        
        // Complete epoch 1
        vm.prank(member3);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        assertTrue(breadfund.hasAllMembersDepositedForAllEpochs(breadfundId));
    }
    
    function testHasAllMembersDepositedForAllEpochs_SkippedEpoch() public {
        // All members deposit in epoch 0
        vm.prank(member1);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        vm.prank(member2);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        vm.prank(member3);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        
        // Move to epoch 2 (skip epoch 1)
        vm.warp(block.timestamp + 2 * EPOCH_DURATION);
        
        // Should be false because epoch 1 was skipped
        assertFalse(breadfund.hasAllMembersDepositedForAllEpochs(breadfundId));
        
        // Even if all deposit in epoch 2, still false due to missing epoch 1
        vm.prank(member1);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        vm.prank(member2);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        vm.prank(member3);
        breadfund.deposit(breadfundId, MEMBER_DEPOSIT);
        
        assertFalse(breadfund.hasAllMembersDepositedForAllEpochs(breadfundId));
    }
    
    function testEpochIndexBeforeBreadfundStart() public {
        // Create a breadfund that starts in the future
        address[] memory members = new address[](3);
        members[0] = member1;
        members[1] = member2;
        members[2] = member3;
        
        IBreadfund.Breadfund memory futureBreadfund = IBreadfund.Breadfund({
            owner: owner,
            minimumMembers: 3,
            maximumMembers: 3,
            consensusThreshold: 67,
            breadfundStart: block.timestamp + 1 days,
            token: address(token),
            members: members,
            initialDeposit: INITIAL_DEPOSIT,
            fixedDeposit: FIXED_DEPOSIT,
            ratio: 120,
            autoThreshold: 100e18,
            contestWindow: 1 days,
            votingWindow: 2 days,
            currentEpoch: 0,
            epochDuration: EPOCH_DURATION
        });
        
        uint256 futureId = breadfund.create(futureBreadfund);
        
        // Should return 0 before breadfund starts
        assertEq(breadfund.getCurrentEpochIndex(futureId), 0);
    }
    
    function testInvalidBreadfundId() public {
        // Non-existent breadfund should return 0
        assertEq(breadfund.getCurrentEpochIndex(999), 0);
        assertFalse(breadfund.hasAllMembersDepositedForAllEpochs(999));
        assertFalse(breadfund.hasMemberDepositedInEpoch(999, member1, 0));
    }
    
    function testDepositBeforeBreadfundStart() public {
        // Create a breadfund that starts in the future
        address[] memory members = new address[](3);
        members[0] = member1;
        members[1] = member2;
        members[2] = member3;
        
        IBreadfund.Breadfund memory futureBreadfund = IBreadfund.Breadfund({
            owner: owner,
            minimumMembers: 3,
            maximumMembers: 3,
            consensusThreshold: 67,
            breadfundStart: block.timestamp + 1 days,
            token: address(token),
            members: members,
            initialDeposit: INITIAL_DEPOSIT,
            fixedDeposit: FIXED_DEPOSIT,
            ratio: 120,
            autoThreshold: 100e18,
            contestWindow: 1 days,
            votingWindow: 2 days,
            currentEpoch: 0,
            epochDuration: EPOCH_DURATION
        });
        
        uint256 futureId = breadfund.create(futureBreadfund);
        
        // Should revert when trying to deposit before start
        vm.prank(member1);
        vm.expectRevert(IBreadfund.DepositBeforeBreadfundStart.selector);
        breadfund.deposit(futureId, MEMBER_DEPOSIT);
    }
    
    function testLongRunningEpochs() public {
        // Test epochs over a long period
        uint256 startTime = block.timestamp;
        
        // Move forward 100 epochs
        vm.warp(startTime + 100 * EPOCH_DURATION);
        assertEq(breadfund.getCurrentEpochIndex(breadfundId), 100);
        
        // Move forward 365 epochs (1 year)
        vm.warp(startTime + 365 * EPOCH_DURATION);
        assertEq(breadfund.getCurrentEpochIndex(breadfundId), 365);
    }
    
    function testBoundaryConditions() public {
        uint256 startTime = block.timestamp;
        
        // Right before epoch boundary
        vm.warp(startTime + EPOCH_DURATION - 1);
        assertEq(breadfund.getCurrentEpochIndex(breadfundId), 0);
        
        // Right at epoch boundary
        vm.warp(startTime + EPOCH_DURATION);
        assertEq(breadfund.getCurrentEpochIndex(breadfundId), 1);
        
        // One second after epoch boundary
        vm.warp(startTime + EPOCH_DURATION + 1);
        assertEq(breadfund.getCurrentEpochIndex(breadfundId), 1);
    }
}