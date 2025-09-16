// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from 'forge-std/Test.sol';
import {stdError} from 'forge-std/StdError.sol';
import {Breadfund} from 'src/contracts/Breadfund.sol';
import {IBreadfund} from 'src/interfaces/IBreadfund.sol';
import {MockERC20} from 'test/mocks/MockERC20.sol';
import {ProxyAdmin} from '@openzeppelin/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/proxy/transparent/TransparentUpgradeableProxy.sol';

contract FailERC20 {
  string public name = 'FailERC20';
  string public symbol = 'FAIL';
  uint8 public decimals = 18;

  function transfer(address, uint256) external pure returns (bool) {
    return false;
  }

  function transferFrom(address, address, uint256) external pure returns (bool) {
    return false;
  }
}

contract BreadfundsUnit is Test {
  Breadfund internal _bf;
  MockERC20 internal _token;
  FailERC20 internal _failToken;

  address internal _owner = address(0xA11CE);
  address internal _alice = address(0xB0B);
  address internal _bob = address(0xB0B2);
  address internal _carol = address(0xCA);

  function setUp() public {
    // Deploy upgradeable proxy and initialize owner to match tests
    address impl = address(new Breadfund());
    address admin = address(new ProxyAdmin(_owner));
    address proxy = address(
      new TransparentUpgradeableProxy(
        impl,
        admin,
        abi.encodeWithSelector(Breadfund.initialize.selector, _owner)
      )
    );
    _bf = Breadfund(proxy);
    _token = new MockERC20('Mock', 'MOCK');
    _failToken = new FailERC20();

    // Fund members with ample tokens
    _token.mint(_alice, 1_000_000 ether);
    _token.mint(_bob, 1_000_000 ether);
    _token.mint(_carol, 1_000_000 ether);

    // Approve Breadfund to pull funds
    vm.startPrank(_alice);
    _token.approve(address(_bf), type(uint256).max);
    vm.stopPrank();
    vm.startPrank(_bob);
    _token.approve(address(_bf), type(uint256).max);
    vm.stopPrank();
    vm.startPrank(_carol);
    _token.approve(address(_bf), type(uint256).max);
    vm.stopPrank();
  }

  // ---------- helpers ----------
  function _defaultBreadfund(address _tokenAddr) internal view returns (IBreadfund.Breadfund memory b) {
    address[] memory members = new address[](2);
    members[0] = _alice;
    members[1] = _bob;
    b = IBreadfund.Breadfund({
      id: 0,
      owner: _owner,
      minimumMembers: 2,
      maximumMembers: 5,
      consensusThreshold: 60,
      breadfundStart: block.timestamp,
      token: _tokenAddr,
      members: members,
      initialDeposit: 100 ether,
      fixedDeposit: 10 ether,
      ratio: 1,
      autoThreshold: 50 ether,
      contestWindow: 3 days,
      votingWindow: 7 days,
      currentEpoch: 0,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });
  }

  function _allowToken(address tkn) internal {
    vm.prank(_owner);
    _bf.setTokenAllowed(tkn, true);
  }

  // ---------- initialize ----------
  function test_InitializeWhenAlreadyInitialized() external {
    vm.expectRevert(abi.encodeWithSignature('InvalidInitialization()'));
    _bf.initialize(_owner);
  }

  function test_InitializeWhenNotInitialized() external {
    // Deploy fresh proxy and initialize successfully
    Breadfund fresh = Breadfund(
      address(
        new TransparentUpgradeableProxy(
          address(new Breadfund()),
          address(new ProxyAdmin(_alice)),
          abi.encodeWithSelector(Breadfund.initialize.selector, _alice)
        )
      )
    );

    // Owner set
    assertEq(fresh.owner(), _alice);

    // Cannot initialize twice
    vm.expectRevert(abi.encodeWithSignature('InvalidInitialization()'));
    fresh.initialize(_alice);
  }

  // ---------- setTokenAllowed ----------
  function test_SetTokenAllowedWhenCallerIsNotOwner() external {
    vm.expectRevert(abi.encodeWithSignature('OwnableUnauthorizedAccount(address)', _alice));
    vm.prank(_alice);
    _bf.setTokenAllowed(address(_token), true);
  }

  function test_SetTokenAllowedWhenTokenAddressIsZero() external {
    vm.prank(_owner);
    _bf.setTokenAllowed(address(0), true);
    assertTrue(_bf.allowedTokens(address(0)));
  }

  function test_SetTokenAllowedWhenAllowingAToken() external {
    vm.expectEmit(true, true, false, true);
    emit IBreadfund.TokenAllowed(address(_token), true);
    vm.prank(_owner);
    _bf.setTokenAllowed(address(_token), true);
    assertTrue(_bf.allowedTokens(address(_token)));
  }

  function test_SetTokenAllowedWhenDisallowingAToken() external {
    vm.prank(_owner);
    _bf.setTokenAllowed(address(_token), true);
    vm.expectEmit(true, true, false, true);
    emit IBreadfund.TokenAllowed(address(_token), false);
    vm.prank(_owner);
    _bf.setTokenAllowed(address(_token), false);
    assertFalse(_bf.allowedTokens(address(_token)));
  }

  // ---------- create ----------
  function test_CreateWhenTokenIsNotInAllowedTokensMapping() external {
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    vm.expectRevert(IBreadfund.TokenNotAllowed.selector);
    _bf.create(b);
  }

  function test_CreateWhenBreadfundStartTimeIsZero() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.breadfundStart = 0;
    vm.expectRevert(IBreadfund.InvalidBreadfundStartTime.selector);
    _bf.create(b);
  }

  function test_CreateWhenOwnerIsZeroAddress() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.owner = address(0);
    vm.expectRevert(IBreadfund.InvalidOwner.selector);
    _bf.create(b);
  }

  function test_CreateWhenInitialDepositIsZero() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.initialDeposit = 0;
    vm.expectRevert(IBreadfund.InvalidInitialDeposit.selector);
    _bf.create(b);
  }

  function test_CreateWhenFixedDepositIsZero() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.fixedDeposit = 0;
    vm.expectRevert(IBreadfund.InvalidFixedDeposit.selector);
    _bf.create(b);
  }

  function test_CreateWhenAutoThresholdIsZero() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.autoThreshold = 0;
    vm.expectRevert(IBreadfund.InvalidThreshold.selector);
    _bf.create(b);
  }

  function test_CreateWhenMinimumMembersIs0() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.minimumMembers = 0;
    vm.expectRevert(IBreadfund.InvalidMinimumMembers.selector);
    _bf.create(b);
  }

  function test_CreateWhenMinimumMembersIs1() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.minimumMembers = 1;
    vm.expectRevert(IBreadfund.InvalidMinimumMembers.selector);
    _bf.create(b);
  }

  function test_CreateWhenMaximumMembersEqualsMinimumMembers() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.maximumMembers = b.minimumMembers;
    uint256 id = _bf.create(b);
    assertEq(id, 0);
  }

  function test_CreateWhenMaximumMembersIsLessThanMinimumMembers() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.maximumMembers = 1;
    b.minimumMembers = 2;
    vm.expectRevert(IBreadfund.InvalidMaximumMembers.selector);
    _bf.create(b);
  }

  function test_CreateWhenEpochDurationIsZero() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.epochDuration = 0;
    vm.expectRevert(IBreadfund.InvalidEpochDuration.selector);
    _bf.create(b);
  }

  function test_CreateWhenSmallWithdrawsLimitIsZero() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.smallWithdrawsLimit = 0;
    vm.expectRevert(IBreadfund.InvalidSmallWithdrawsLimit.selector);
    _bf.create(b);
  }

  function test_CreateWhenMembersArrayIsEmpty() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.members = new address[](0);
    uint256 id = _bf.create(b);
    assertEq(id, 0);
    (address[] memory members, ) = _bf.getMemberBalances(id);
    assertEq(members.length, 0);
  }

  function test_CreateWhenAnyMemberAddressIsZeroAddress() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.members[1] = address(0);
    vm.expectRevert(IBreadfund.InvalidMemberAddress.selector);
    _bf.create(b);
  }

  function test_CreateWhenMembersArrayContainsDuplicates() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.members[1] = _alice; // duplicate
    uint256 id = _bf.create(b);
    assertTrue(_bf.isMember(id, _alice));
  }

  function test_CreateWhenConsensusThresholdIsZero() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.consensusThreshold = 0;
    uint256 id = _bf.create(b);
    assertEq(id, 0);
  }

  function test_CreateWhenConsensusThresholdIsGreaterThan100() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.consensusThreshold = 150;
    uint256 id = _bf.create(b);
    assertEq(id, 0);
  }

  function test_CreateWhenRatioIsZero() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.ratio = 0;
    uint256 id = _bf.create(b);
    assertEq(id, 0);
  }

  function test_CreateWhenRatioIsGreaterThan100() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.ratio = 200;
    uint256 id = _bf.create(b);
    assertEq(id, 0);
  }

  function test_CreateWhenAllParametersAreValid() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    vm.expectEmit(true, false, false, true);
    emit IBreadfund.BreadfundCreated(
      0,
      b.minimumMembers,
      b.maximumMembers,
      b.consensusThreshold,
      b.members,
      b.token,
      b.initialDeposit,
      b.fixedDeposit,
      b.ratio,
      b.autoThreshold,
      b.epochDuration,
      b.smallWithdrawsLimit
    );
    uint256 id = _bf.create(b);
    assertEq(id, 0);

    // nextId increments
    assertEq(_bf.nextId(), 1);

    // Stored struct
    IBreadfund.Breadfund memory stored = _bf.getBreadfund(id);
    assertEq(stored.owner, b.owner);

    // Members mapping and reverse index
    assertTrue(_bf.isMember(id, _alice));
    assertTrue(_bf.isMember(id, _bob));
    uint256[] memory aIds = _bf.getMemberBreadfunds(_alice);
    uint256[] memory bIds = _bf.getMemberBreadfunds(_bob);
    assertEq(aIds.length, 1);
    assertEq(bIds.length, 1);
    assertEq(aIds[0], id);
    assertEq(bIds[0], id);
  }

  // ---------- decommission ----------
  function test_DecommissionWhenBreadfundIsNotDecommissionable() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    uint256 id = _bf.create(b);
    vm.expectRevert(IBreadfund.NotDecommissionable.selector);
    _bf.decommission(id);
  }

  // Create balances and decommission after marking a missed deposit
  function test_DecommissionWhenBreadfundIsDecommissionable() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    uint256 id = _bf.create(b);

    // Advance time one epoch so epoch 0 is past; leave a missed deposit => decommissionable
    vm.warp(b.breadfundStart + b.epochDuration);

    // Seed balances
    vm.prank(_alice);
    _bf.deposit(id, 10 ether);
    vm.prank(_bob);
    _bf.deposit(id, 20 ether);

    uint256 preBalanceAlice = _token.balanceOf(_alice);
    uint256 preBalanceBob = _token.balanceOf(_bob);
    uint256 withdrawableAlice = _bf.memberWithdrawableBalance(id, _alice);
    uint256 withdrawableBob = _bf.memberWithdrawableBalance(id, _bob);
    uint256 totalBalance = _bf.breadfundBalance(id);

    vm.expectEmit(true, false, false, true);
    emit IBreadfund.BreadfundDecommissioned(id);
    _bf.decommission(id);

    // Struct deleted (getBreadfund should revert for decommissioned entries)
    vm.expectRevert(IBreadfund.NotCommissioned.selector);
    _bf.getBreadfund(id);

    // Remaining equally split
    uint256 remaining = totalBalance - withdrawableAlice - withdrawableBob;
    uint256 equalShare = remaining / 2;
    assertEq(_token.balanceOf(_alice), preBalanceAlice + withdrawableAlice + equalShare);
    assertEq(_token.balanceOf(_bob), preBalanceBob + withdrawableBob + equalShare);
  }

  // ---------- deposit ----------
  function test_DepositWhenBreadfundOwnerIsZeroAddress() external {
    vm.expectRevert(IBreadfund.NotCommissioned.selector);
    vm.prank(_alice);
    _bf.deposit(999, 1 ether);
  }

  function test_DepositWhenCallerIsNotInIsMemberMapping() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    uint256 id = _bf.create(b);
    vm.expectRevert(IBreadfund.NotMember.selector);
    vm.prank(_carol);
    _bf.deposit(id, 1 ether);
  }

  function test_DepositWhenDepositValueIsZero() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    vm.expectRevert(IBreadfund.InvalidDepositAmount.selector);
    vm.prank(_alice);
    _bf.deposit(id, 0);
  }

  function test_DepositWhenCurrentTimeIsBeforeBreadfundStartTime() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.breadfundStart = block.timestamp + 1 days;
    uint256 id = _bf.create(b);
    vm.expectRevert(IBreadfund.DepositBeforeBreadfundStart.selector);
    vm.prank(_alice);
    _bf.deposit(id, 1 ether);
  }

  function test_DepositWhenCurrentTimeEqualsBreadfundStartTime() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    uint256 id = _bf.create(b);
    vm.warp(b.breadfundStart);
    vm.prank(_alice);
    _bf.deposit(id, 1 ether);
    assertEq(_bf.breadfundBalance(id), 1 ether + b.fixedDeposit + b.initialDeposit);
  }

  function test_DepositWhenMemberAlreadyDepositedInCurrentEpoch() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    vm.prank(_alice);
    _bf.deposit(id, 1 ether);
    vm.expectRevert(IBreadfund.AlreadyDeposited.selector);
    vm.prank(_alice);
    _bf.deposit(id, 1 ether);
  }

  function test_DepositWhenTokenTransferFromFails() external {
    _allowToken(address(_failToken));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_failToken));
    uint256 id = _bf.create(b);
    vm.expectRevert(Breadfund.TransferFailed.selector);
    vm.prank(_alice);
    _bf.deposit(id, 1);
  }

  function test_DepositWhenMakingFirstDeposit() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    uint256 id = _bf.create(b);
    uint256 value = 5 ether;
    uint256 expectedTotal = value + b.fixedDeposit + b.initialDeposit;
    vm.expectEmit(true, true, false, true);
    emit IBreadfund.FundsDeposited(id, _alice, expectedTotal);
    vm.prank(_alice);
    _bf.deposit(id, value);
    assertEq(_bf.breadfundMemberContribute(id, _alice), value);
    assertTrue(_bf.hasMadeFirstDeposit(id, _alice));
    assertEq(_bf.breadfundBalance(id), expectedTotal);
    assertEq(_bf.memberWithdrawableBalance(id, _alice), value * b.ratio);
    uint256 epoch = _bf.getCurrentEpochIndex(id);
    assertTrue(_bf.epochMemberDeposits(id, epoch, _alice));
  }

  function test_DepositWhenMakingSubsequentDeposits() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    uint256 id = _bf.create(b);
    vm.prank(_alice);
    _bf.deposit(id, 5 ether);

    // Move to next epoch to allow another deposit
    vm.warp(b.breadfundStart + b.epochDuration);
    uint256 value = 3 ether;
    uint256 expectedTotal = value + b.fixedDeposit;
    vm.expectEmit(true, true, false, true);
    emit IBreadfund.FundsDeposited(id, _alice, expectedTotal);
    vm.prank(_alice);
    _bf.deposit(id, value);

    // Unchanged
    assertEq(_bf.breadfundMemberContribute(id, _alice), 5 ether); 
    assertEq(_bf.memberWithdrawableBalance(id, _alice), (5 ether + value) * b.ratio);
  }

  function test_DepositWhenRatioIsZero() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.ratio = 0;
    uint256 id = _bf.create(b);
    vm.prank(_alice);
    _bf.deposit(id, 10 ether);
    assertEq(_bf.memberWithdrawableBalance(id, _alice), 0);
    assertGt(_bf.breadfundBalance(id), 0);
  }

  // ---------- depositFor ----------
  function test_DepositForWhenBreadfundOwnerIsZeroAddress() external {
    vm.expectRevert(IBreadfund.NotCommissioned.selector);
    vm.prank(_alice);
    _bf.depositFor(1234, 1 ether, _alice);
  }

  function test_DepositForWhenTargetMemberIsNotInIsMemberMapping() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    vm.expectRevert(IBreadfund.NotMember.selector);
    vm.prank(_alice);
    _bf.depositFor(id, 1 ether, _carol);
  }

  function test_DepositForWhenSenderIsNotAMember() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    vm.prank(_carol);
    _bf.depositFor(id, 1 ether, _alice);
    assertTrue(_bf.hasMadeFirstDeposit(id, _alice));
  }

  function test_DepositForWhenDepositValueIsZero() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    vm.expectRevert(IBreadfund.InvalidDepositAmount.selector);
    vm.prank(_alice);
    _bf.depositFor(id, 0, _alice);
  }

  function test_DepositForWhenCurrentTimeIsBeforeBreadfundStartTime() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.breadfundStart = block.timestamp + 1 days;
    uint256 id = _bf.create(b);
    vm.expectRevert(IBreadfund.DepositBeforeBreadfundStart.selector);
    vm.prank(_alice);
    _bf.depositFor(id, 1 ether, _alice);
  }

  function test_DepositForWhenTargetMemberAlreadyDepositedInCurrentEpoch() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    vm.prank(_alice);
    _bf.depositFor(id, 1 ether, _alice);
    vm.expectRevert(IBreadfund.AlreadyDeposited.selector);
    vm.prank(_bob);
    _bf.depositFor(id, 1 ether, _alice);
  }

  function test_DepositForWhenTokenTransferFromFailsFromSender() external {
    _allowToken(address(_failToken));
    uint256 id = _bf.create(_defaultBreadfund(address(_failToken)));
    vm.expectRevert(Breadfund.TransferFailed.selector);
    vm.prank(_alice);
    _bf.depositFor(id, 1 ether, _alice);
  }

  function test_DepositForWhenMakingFirstDepositForTargetMember() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    vm.prank(_bob);
    _bf.depositFor(id, 2 ether, _alice);
    assertEq(_bf.breadfundMemberContribute(id, _alice), 2 ether);
    assertTrue(_bf.hasMadeFirstDeposit(id, _alice));
  }

  // ---------- withdraw ----------
  function test_WithdrawWhenBreadfundOwnerIsZeroAddress() external {
    // With direct call on non-existent id, contract panics due to division by zero before NotCommissioned
    vm.expectRevert(stdError.divisionError);
    vm.prank(_alice);
    _bf.withdraw(999, 1);
  }

  function test_WithdrawWhenCallerIsNotInIsMemberMapping() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    vm.expectRevert(IBreadfund.NotMember.selector);
    vm.prank(_carol);
    _bf.withdraw(id, 1);
  }

  function test_WithdrawWhenDaysRequestedIsZero() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    vm.prank(_alice);
    _bf.deposit(id, 30 ether);
    uint256 beforeBal = _token.balanceOf(_alice);
    vm.prank(_alice);
    _bf.withdraw(id, 0);

    // Zero transfer still emits and counts as small withdraw
    assertEq(_token.balanceOf(_alice), beforeBal);
    assertEq(_bf.smallWithdrawsCount(id, _bf.getCurrentEpochIndex(id), _alice), 1);
  }

  function test_WithdrawWhenRequestedWithdrawalAmountExceedsMemberWithdrawableBalance() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    vm.prank(_alice);
    _bf.deposit(id, 1 ether);
    vm.expectRevert(IBreadfund.NotWithdrawable.selector);
    vm.prank(_alice);

    // Likely exceeds withdrawable
    _bf.withdraw(id, 31); 
  }

  function test_WithdrawWhenWithdrawalAmountIsBelowThreshold() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.autoThreshold = 100 ether; // small path
    uint256 id = _bf.create(b);
    vm.prank(_alice);
    _bf.deposit(id, 30 ether);
    uint256 before = _token.balanceOf(_alice);
    vm.prank(_alice);
    _bf.withdraw(id, 1);
    assertGt(_token.balanceOf(_alice), before);
    assertLt(_bf.memberWithdrawableBalance(id, _alice), 30 ether * b.ratio);
  }

  function test_WithdrawWhenWithdrawalAmountIsAboveAutoThresholdCreatesRequest() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.autoThreshold = 1; // any withdraw > 1 wei goes to request path
    uint256 id = _bf.create(b);
    vm.prank(_alice);
    _bf.deposit(id, 30 ether);
    vm.prank(_alice);
    _bf.withdraw(id, 1);
    assertEq(_bf.nextIdRequest(), 1);
    (address reqOwner, uint256 reqBreadfundId, , , , ) = _bf.requests(0);
    assertEq(reqOwner, _alice);
    assertEq(reqBreadfundId, id);
  }

  // ---------- createRequest / contest / execute / vote (happy paths) ----------
  function _createFundAndRequest() internal returns (uint256 id, uint256 reqId) {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));

    // Ensure withdraw goes through request path
    b.autoThreshold = 1;
    id = _bf.create(b);
    vm.prank(_alice);
    _bf.deposit(id, 30 ether);

    // Create request via withdraw above threshold
    vm.prank(_alice);

    // Large enough for request
    _bf.withdraw(id, 2); 
    reqId = 0;
  }

  function test_ContestValid() external {
    (, uint256 reqId) = _createFundAndRequest();

    // Bob is member, within contest window
    vm.prank(_bob);
    _bf.contest(reqId);
    assertTrue(_bf.isContested(reqId));
  }

  function test_ExecuteContestedWithdrawalWhenContestWindowIsStillOpen() external {
    (, uint256 reqId) = _createFundAndRequest();

    // Should do nothing while still within window and not contested
    _bf.executeContestedWithdrawal(reqId);
    assertFalse(_bf.isExecuted(reqId));
  }

  function test_ExecuteContestedWithdrawalWhenRequestIsContested() external {
    (, uint256 reqId) = _createFundAndRequest();
    vm.prank(_bob);
    _bf.contest(reqId);
    vm.warp(block.timestamp + 10 days);
    _bf.executeContestedWithdrawal(reqId);
    assertFalse(_bf.isExecuted(reqId));
  }

  function test_ExecuteContestedWithdrawalWhenContestWindowHasPassedAndRequestWasNotContested() external {
    (, uint256 reqId) = _createFundAndRequest();

    // Beyond window
    vm.warp(block.timestamp + 10 days); 
    (address rqOwner, , , , , uint256 rqAmount) = _bf.requests(reqId);
    vm.expectEmit(true, true, false, true);
    emit IBreadfund.WithdrawalAutoExecuted(reqId, rqOwner, rqAmount);
    _bf.executeContestedWithdrawal(reqId);
    assertTrue(_bf.isExecuted(reqId));
  }

  function test_VoteHappyPathYesAndExecuteOnConsensusExceeded() external {
    _allowToken(address(_token));

    // 3 members
    address[] memory members = new address[](3);
    members[0] = _alice;
    members[1] = _bob;
    members[2] = _carol;
    IBreadfund.Breadfund memory b = IBreadfund.Breadfund({
      id: 0,
      owner: _owner,
      minimumMembers: 2,
      maximumMembers: 5,
      consensusThreshold: 60,
      breadfundStart: block.timestamp,
      token: address(_token),
      members: members,
      initialDeposit: 100 ether,
      fixedDeposit: 10 ether,
      ratio: 1,

      // Force request path
      autoThreshold: 1, 
      contestWindow: 3 days,
      votingWindow: 30 days,
      currentEpoch: 0,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });
    uint256 id = _bf.create(b);
    vm.prank(_alice);
    _bf.deposit(id, 30 ether);
    vm.prank(_alice);

    // Creates request 0
    _bf.withdraw(id, 1); 
    uint256 reqId = 0;

    // Vote yes by alice then bob (2/3 = 66% > 60%)
    vm.prank(_alice);
    _bf.vote(reqId, true);
    vm.prank(_bob);
    _bf.vote(reqId, true);
    assertTrue(_bf.isExecuted(reqId));
  }

  // ---------- views ----------
  function test_IsTokenAllowedWhenTokenIsInAllowedTokensMappingWithTrueValue() external {
    vm.prank(_owner);
    _bf.setTokenAllowed(address(_token), true);
    assertTrue(_bf.isTokenAllowed(address(_token)));
  }

  function test_IsTokenAllowedWhenTokenIsInAllowedTokensMappingWithFalseValue() external {
    vm.prank(_owner);
    _bf.setTokenAllowed(address(_token), false);
    assertFalse(_bf.isTokenAllowed(address(_token)));
  }

  function test_IsTokenAllowedWhenTokenIsNotInAllowedTokensMapping() external view {
    assertFalse(_bf.isTokenAllowed(address(_token)));
  }

  function test_IsTokenAllowedWhenTokenAddressIsZero() external {
    vm.prank(_owner);
    _bf.setTokenAllowed(address(0), true);
    assertTrue(_bf.isTokenAllowed(address(0)));
  }

  function test_GetBreadfundWhenBreadfundDoesNotExist() external {
    vm.expectRevert(IBreadfund.NotCommissioned.selector);
    _bf.getBreadfund(123);
  }

  function test_GetBreadfundWhenBreadfundExistsAndIsCommissioned() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    uint256 id = _bf.create(b);
    IBreadfund.Breadfund memory g = _bf.getBreadfund(id);
    assertEq(g.owner, b.owner);
  }

  function test_GetBreadfundsWhenIdsArrayIsEmpty() external view {
    IBreadfund.Breadfund[] memory arr = _bf.getBreadfunds(new uint256[](0));
    assertEq(arr.length, 0);
  }

  function test_GetBreadfundsWhenSomeIdsDoNotExist() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    uint256[] memory ids = new uint256[](3);
    ids[0] = id;
    ids[1] = 999;
    ids[2] = 1000;
    IBreadfund.Breadfund[] memory arr = _bf.getBreadfunds(ids);
    assertEq(arr.length, 3);
    assertEq(arr[0].owner, _owner);
    assertEq(arr[1].owner, address(0));
  }

  function test_GetMemberBreadfundsWhenMemberHasNoBreadfunds() external view {
    uint256[] memory ids = _bf.getMemberBreadfunds(_carol);
    assertEq(ids.length, 0);
  }

  function test_GetMemberBreadfundsWhenMemberHasBreadfunds() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    uint256[] memory ids = _bf.getMemberBreadfunds(_alice);
    assertEq(ids.length, 1);
    assertEq(ids[0], id);
  }

  function test_GetMemberBalancesWhenBreadfundDoesNotExist() external {
    vm.expectRevert(IBreadfund.NotCommissioned.selector);
    _bf.getMemberBalances(42);
  }

  function test_GetMemberBalancesWhenBreadfundExistsAndIsCommissioned() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    (address[] memory members, uint256[] memory balances) = _bf.getMemberBalances(id);
    assertEq(members.length, 2);
    assertEq(balances.length, 2);
    assertEq(balances[0], 0);
    assertEq(balances[1], 0);
  }

  function test_HasMemberDepositedInEpochWhenEpochMemberDepositsIsTrue() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    vm.prank(_alice);
    _bf.deposit(id, 1 ether);
    assertTrue(_bf.hasMemberDepositedInEpoch(id, _alice, _bf.getCurrentEpochIndex(id)));
  }

  function test_HasMemberDepositedInEpochWhenEpochMemberDepositsIsFalseOrUnset() external view {
    assertFalse(_bf.hasMemberDepositedInEpoch(0, _alice, 0));
  }

  function test_GetCurrentEpochIndexWhenCurrentTimeEdgeCases() external {
    _allowToken(address(_token));
    IBreadfund.Breadfund memory b = _defaultBreadfund(address(_token));
    b.breadfundStart = block.timestamp + 1 days;
    uint256 id = _bf.create(b);

    // Before start
    assertEq(_bf.getCurrentEpochIndex(id), 0); 
    vm.warp(b.breadfundStart);

    // At start
    assertEq(_bf.getCurrentEpochIndex(id), 0); 
    vm.warp(b.breadfundStart + 1);

    // Just after start
    assertEq(_bf.getCurrentEpochIndex(id), 0); 
    vm.warp(b.breadfundStart + b.epochDuration);

    // Exactly one epoch
    assertEq(_bf.getCurrentEpochIndex(id), 1); 
    vm.warp(b.breadfundStart + 5 * b.epochDuration + 10);
    assertEq(_bf.getCurrentEpochIndex(id), 5);
  }

  function test_IsDecommissionableWhenBreadfundDoesNotExist() external view {
    assertTrue(_bf.isDecommissionable(999));
  }

  function test_IsDecommissionableWhenBreadfundOwnerIsZeroAddress() external view {
    assertTrue(_bf.isDecommissionable(123));
  }

  function test_IsDecommissionableWhenCurrentEpochIndexIs0() external {
    _allowToken(address(_token));
    uint256 id = _bf.create(_defaultBreadfund(address(_token)));
    assertFalse(_bf.isDecommissionable(id));
  }
}
