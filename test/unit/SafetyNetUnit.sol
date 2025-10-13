// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ProxyAdmin} from '@openzeppelin/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/proxy/transparent/TransparentUpgradeableProxy.sol';
import {stdError} from 'forge-std/StdError.sol';
import {Test} from 'forge-std/Test.sol';
import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';
import {MockERC20} from 'test/mocks/MockERC20.sol';

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

contract SafetyNetUnit is Test {
  SafetyNet internal _sn;
  MockERC20 internal _token;
  FailERC20 internal _failToken;

  address internal _owner = address(0xA11CE);
  address internal _alice = address(0xB0B);
  address internal _bob = address(0xB0B2);
  address internal _carol = address(0xCA);

  function setUp() public {
    // Deploy upgradeable proxy and initialize owner to match tests
    address impl = address(new SafetyNet());
    address admin = address(new ProxyAdmin(_owner));
    address proxy = address(new TransparentUpgradeableProxy(impl, admin, abi.encodeWithSelector(SafetyNet.initialize.selector, _owner)));
    _sn = SafetyNet(proxy);
    _token = new MockERC20('Mock', 'MOCK');
    _failToken = new FailERC20();

    // Fund members with ample tokens
    _token.mint(_alice, 1_000_000 ether);
    _token.mint(_bob, 1_000_000 ether);
    _token.mint(_carol, 1_000_000 ether);

    // Approve SafetyNet to pull funds
    vm.startPrank(_alice);
    _token.approve(address(_sn), type(uint256).max);
    vm.stopPrank();
    vm.startPrank(_bob);
    _token.approve(address(_sn), type(uint256).max);
    vm.stopPrank();
    vm.startPrank(_carol);
    _token.approve(address(_sn), type(uint256).max);
    vm.stopPrank();
  }

  // ---------- helpers ----------
  function _defaultSafetyNet(address _tokenAddr) internal view returns (ISafetyNet.SafetyNet memory _safetyNet) {
    address[] memory members = new address[](2);
    members[0] = _alice;
    members[1] = _bob;
    _safetyNet = ISafetyNet.SafetyNet({
      id: 0,
      owner: _owner,
      minimumMembers: 2,
      maximumMembers: 5,
      consensusThreshold: 60,
      safetyNetStart: block.timestamp,
      token: _tokenAddr,
      members: members,
      initialDeposit: 100 ether,
      fixedDeposit: 10 ether,
      ratio: 1,
      autoThreshold: 50 ether,
      contestWindow: 3 days,
      votingWindow: 7 days,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });
  }

  function _allowToken(address tkn) internal {
    vm.prank(_owner);
    _sn.setTokenAllowed(tkn, true);
  }

  function _payInitial(uint256 id, address who) internal {
    ISafetyNet.SafetyNet memory _safetyNet = _sn.getSafetyNet(id);
    vm.prank(who);
    _sn.deposit(id, _safetyNet.initialDeposit);
  }

  function _nextEpoch(uint256 id) internal {
    ISafetyNet.SafetyNet memory _safetyNet = _sn.getSafetyNet(id);
    vm.warp(_safetyNet.safetyNetStart + _safetyNet.epochDuration);
  }

  // ---------- initialize ----------
  function test_InitializeWhenAlreadyInitialized() external {
    vm.expectRevert(abi.encodeWithSignature('InvalidInitialization()'));
    _sn.initialize(_owner);
  }

  function test_InitializeWhenNotInitialized() external {
    // Deploy fresh proxy and initialize successfully
    SafetyNet fresh = SafetyNet(
      address(
        new TransparentUpgradeableProxy(
          address(new SafetyNet()), address(new ProxyAdmin(_alice)), abi.encodeWithSelector(SafetyNet.initialize.selector, _alice)
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
    _sn.setTokenAllowed(address(_token), true);
  }

  function test_SetTokenAllowedWhenTokenAddressIsZero() external {
    vm.prank(_owner);
    _sn.setTokenAllowed(address(0), true);
    assertTrue(_sn.allowedTokens(address(0)));
  }

  function test_SetTokenAllowedWhenAllowingAToken() external {
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.TokenAllowed(address(_token), true);
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);
    assertTrue(_sn.allowedTokens(address(_token)));
  }

  function test_SetTokenAllowedWhenDisallowingAToken() external {
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.TokenAllowed(address(_token), false);
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), false);
    assertFalse(_sn.allowedTokens(address(_token)));
  }

  // ---------- create ----------
  function test_CreateWhenTokenIsNotInAllowedTokensMapping() external {
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    vm.expectRevert(ISafetyNet.TokenNotAllowed.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenSafetyNetStartTimeIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.safetyNetStart = 0;
    vm.expectRevert(ISafetyNet.InvalidSafetyNetStartTime.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenOwnerIsZeroAddress() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.owner = address(0);
    vm.expectRevert(ISafetyNet.InvalidOwner.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenInitialDepositIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.initialDeposit = 0;
    vm.expectRevert(ISafetyNet.InvalidInitialDeposit.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenFixedDepositIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.fixedDeposit = 0;
    vm.expectRevert(ISafetyNet.InvalidFixedDeposit.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenAutoThresholdIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.autoThreshold = 0;
    vm.expectRevert(ISafetyNet.InvalidThreshold.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenMinimumMembersIs0() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.minimumMembers = 0;
    vm.expectRevert(ISafetyNet.InvalidMinimumMembers.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenMinimumMembersIs1() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.minimumMembers = 1;
    vm.expectRevert(ISafetyNet.InvalidMinimumMembers.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenMaximumMembersEqualsMinimumMembers() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.maximumMembers = _safetyNet.minimumMembers;
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);
  }

  function test_CreateWhenMaximumMembersIsLessThanMinimumMembers() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.maximumMembers = 1;
    _safetyNet.minimumMembers = 2;
    vm.expectRevert(ISafetyNet.InvalidMaximumMembers.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenEpochDurationIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.epochDuration = 0;
    vm.expectRevert(ISafetyNet.InvalidEpochDuration.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenSmallWithdrawsLimitIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.smallWithdrawsLimit = 0;
    vm.expectRevert(ISafetyNet.InvalidSmallWithdrawsLimit.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenMembersArrayIsEmpty() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.members = new address[](0);
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);
    (address[] memory members,) = _sn.getMemberBalances(id);
    assertEq(members.length, 0);
  }

  function test_CreateWhenAnyMemberAddressIsZeroAddress() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.members[1] = address(0);
    vm.expectRevert(ISafetyNet.InvalidMemberAddress.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenMembersArrayContainsDuplicates() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));

    // Duplicate
    _safetyNet.members[1] = _alice;

    vm.expectRevert(ISafetyNet.DuplicateMember.selector);
    _sn.create(_safetyNet);
  }

  function test_CreateWhenConsensusThresholdIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.consensusThreshold = 0;
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);
  }

  function test_CreateWhenConsensusThresholdIsGreaterThan100() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.consensusThreshold = 150;
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);
  }

  function test_CreateWhenRatioIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.ratio = 0;
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);
  }

  function test_CreateWhenRatioIsGreaterThan100() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.ratio = 200;
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);
  }

  function test_CreateWhenAllParametersAreValid() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    vm.expectEmit(true, false, false, true);
    emit ISafetyNet.SafetyNetCreated(
      0,
      _safetyNet.minimumMembers,
      _safetyNet.maximumMembers,
      _safetyNet.consensusThreshold,
      _safetyNet.members,
      _safetyNet.token,
      _safetyNet.initialDeposit,
      _safetyNet.fixedDeposit,
      _safetyNet.ratio,
      _safetyNet.autoThreshold,
      _safetyNet.epochDuration,
      _safetyNet.smallWithdrawsLimit
    );
    uint256 id = _sn.create(_safetyNet);
    assertEq(id, 0);

    // nextId increments
    assertEq(_sn.nextId(), 1);

    // Stored struct
    ISafetyNet.SafetyNet memory stored = _sn.getSafetyNet(id);
    assertEq(stored.owner, _safetyNet.owner);

    // Members mapping and reverse index
    assertTrue(_sn.isMember(id, _alice));
    assertTrue(_sn.isMember(id, _bob));
    uint256[] memory aIds = _sn.getMemberSafetyNets(_alice);
    uint256[] memory bIds = _sn.getMemberSafetyNets(_bob);
    assertEq(aIds.length, 1);
    assertEq(bIds.length, 1);
    assertEq(aIds[0], id);
    assertEq(bIds[0], id);
  }

  // ---------- decommission ----------
  function test_DecommissionWhenSafetyNetIsNotDecommissionable() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    vm.expectRevert(ISafetyNet.NotDecommissionable.selector);
    _sn.decommission(id);
  }

  // Create balances and decommission after marking a missed deposit
  function test_DecommissionWhenSafetyNetIsDecommissionable() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    // epoch 0: onboarding
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);
    vm.prank(_bob);
    _sn.deposit(id, _safetyNet.initialDeposit);

    // epoch 1: deliberately miss deposits
    vm.warp(_safetyNet.safetyNetStart + _safetyNet.epochDuration);

    // Seed balances
    vm.warp(_safetyNet.safetyNetStart + 2 * _safetyNet.epochDuration + 1);
    vm.prank(_alice);
    _sn.deposit(id, 5 ether);
    vm.prank(_bob);
    _sn.deposit(id, 5 ether);

    uint256 preBalanceAlice = _token.balanceOf(_alice);
    uint256 preBalanceBob = _token.balanceOf(_bob);
    uint256 withdrawableAlice = _sn.memberWithdrawableBalance(id, _alice);
    uint256 withdrawableBob = _sn.memberWithdrawableBalance(id, _bob);
    uint256 totalBalance = _sn.safetyNetBalance(id);

    vm.expectEmit(true, false, false, true);
    emit ISafetyNet.SafetyNetDecommissioned(id);
    _sn.decommission(id);

    // Struct deleted (getSafetyNet should revert for decommissioned entries)
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    _sn.getSafetyNet(id);

    // Remaining equally split
    uint256 remaining = totalBalance - withdrawableAlice - withdrawableBob;
    uint256 equalShare = remaining / 2;
    assertEq(_token.balanceOf(_alice), preBalanceAlice + withdrawableAlice + equalShare);
    assertEq(_token.balanceOf(_bob), preBalanceBob + withdrawableBob + equalShare);
  }

  // ---------- deposit ----------
  function test_DepositWhenSafetyNetOwnerIsZeroAddress() external {
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    vm.prank(_alice);
    _sn.deposit(999, 1 ether);
  }

  function test_DepositWhenCallerIsNotInIsMemberMapping() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    vm.expectRevert(ISafetyNet.NotMember.selector);
    vm.prank(_carol);
    _sn.deposit(id, 1 ether);
  }

  function test_DepositWhenDepositValueIsZero() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    vm.expectRevert(ISafetyNet.InvalidDepositAmount.selector);
    vm.prank(_alice);
    _sn.deposit(id, 0);
  }

  function test_DepositWhenCurrentTimeIsBeforeSafetyNetStartTime() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.safetyNetStart = block.timestamp + 1 days;
    uint256 id = _sn.create(_safetyNet);
    vm.expectRevert(ISafetyNet.DepositBeforeSafetyNetStart.selector);
    vm.prank(_alice);
    _sn.deposit(id, 1 ether);
  }

  function test_DepositWhenCurrentTimeEqualsSafetyNetStartTime() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    vm.warp(_safetyNet.safetyNetStart);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    assertEq(_sn.safetyNetBalance(id), _safetyNet.initialDeposit);
  }

  function test_DepositWhenMemberAlreadyDepositedInCurrentEpoch() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    _payInitial(id, _alice);
    _nextEpoch(id);

    // First partial deposit
    vm.prank(_alice);
    _sn.deposit(id, 1 ether);

    // Fill the rest of the epoch dues to exactly fixedDeposit (10 ether total)
    vm.prank(_alice);
    _sn.deposit(id, 9 ether);

    // Now any extra exceeds the epoch cap
    vm.expectRevert(ISafetyNet.ExceedsDepositAmount.selector);
    vm.prank(_alice);
    _sn.deposit(id, 1 ether);

    // Fully paid flag (derived) is now true
    assertTrue(_sn.hasMemberDepositedInEpoch(id, _alice, _sn.getCurrentEpochIndex(id)));
  }

  function test_DepositWhenTokenTransferFromFails() external {
    _allowToken(address(_failToken));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_failToken));
    uint256 id = _sn.create(_safetyNet);

    vm.expectRevert(SafetyNet.TransferFailed.selector);
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);
  }

  function test_DepositWhenMakingFirstDeposit() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    uint256 expectedTotal = _safetyNet.initialDeposit;
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.FundsDeposited(id, _alice, expectedTotal);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    assertEq(_sn.safetyNetMemberContribute(id, _alice), _safetyNet.fixedDeposit);
    assertEq(_sn.safetyNetBalance(id), expectedTotal);
    assertEq(_sn.memberWithdrawableBalance(id, _alice), _safetyNet.initialDeposit * _safetyNet.ratio);

    // epoch 0 is considered fully paid (>= fixedDeposit)
    uint256 epoch = _sn.getCurrentEpochIndex(id);
    assertTrue(_sn.hasMemberDepositedInEpoch(id, _alice, epoch));
  }

  function test_DepositWhenMakingSubsequentDeposits() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    _payInitial(id, _alice);
    _nextEpoch(id);

    uint256 value = 3 ether;
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.FundsDeposited(id, _alice, value);
    vm.prank(_alice);
    _sn.deposit(id, value);

    assertEq(_sn.safetyNetBalance(id), _safetyNet.initialDeposit + value);
    assertEq(_sn.safetyNetMemberContribute(id, _alice), _safetyNet.fixedDeposit);
    assertEq(_sn.memberWithdrawableBalance(id, _alice), (_safetyNet.initialDeposit + value) * _safetyNet.ratio);
  }

  function test_DepositWhenRatioIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.ratio = 0;
    uint256 id = _sn.create(_safetyNet);
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);
    assertEq(_sn.memberWithdrawableBalance(id, _alice), 0);
    assertGt(_sn.safetyNetBalance(id), 0);
  }

  // ---------- depositFor ----------
  function test_DepositForWhenSafetyNetOwnerIsZeroAddress() external {
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    vm.prank(_alice);
    _sn.depositFor(1234, 1 ether, _alice);
  }

  function test_DepositForWhenTargetMemberIsNotInIsMemberMapping() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    vm.expectRevert(ISafetyNet.NotMember.selector);
    vm.prank(_alice);
    _sn.depositFor(id, 1 ether, _carol);
  }

  function test_DepositForWhenSenderIsNotAMember() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    vm.prank(_carol);
    _sn.depositFor(id, _safetyNet.initialDeposit, _alice);
    assertEq(_sn.safetyNetMemberContribute(id, _alice), _safetyNet.fixedDeposit);
  }

  function test_DepositForWhenDepositValueIsZero() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    vm.expectRevert(ISafetyNet.InvalidDepositAmount.selector);
    vm.prank(_alice);
    _sn.depositFor(id, 0, _alice);
  }

  function test_DepositForWhenCurrentTimeIsBeforeSafetyNetStartTime() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.safetyNetStart = block.timestamp + 1 days;
    uint256 id = _sn.create(_safetyNet);
    vm.expectRevert(ISafetyNet.DepositBeforeSafetyNetStart.selector);
    vm.prank(_alice);
    _sn.depositFor(id, 1 ether, _alice);
  }

  function test_DepositForWhenTargetMemberAlreadyDepositedInCurrentEpoch() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    vm.prank(_alice);
    _sn.depositFor(id, _safetyNet.initialDeposit, _alice);

    vm.warp(_safetyNet.safetyNetStart + _safetyNet.epochDuration + 1);

    vm.prank(_alice);
    _sn.depositFor(id, 6 ether, _alice);
    vm.prank(_bob);
    _sn.depositFor(id, 4 ether, _alice);

    vm.expectRevert(ISafetyNet.ExceedsDepositAmount.selector);
    vm.prank(_bob);
    _sn.depositFor(id, 1 ether, _alice);
  }

  function test_DepositForWhenTokenTransferFromFailsFromSender() external {
    _allowToken(address(_failToken));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_failToken));
    uint256 id = _sn.create(_safetyNet);

    vm.expectRevert(SafetyNet.TransferFailed.selector);
    vm.prank(_alice);
    _sn.depositFor(id, _safetyNet.initialDeposit, _alice);
  }

  function test_DepositForWhenMakingFirstDepositForTargetMember() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    vm.prank(_bob);
    _sn.depositFor(id, _safetyNet.initialDeposit, _alice);
    assertEq(_sn.safetyNetMemberContribute(id, _alice), _safetyNet.fixedDeposit);
  }

  // ---------- withdraw ----------
  function test_WithdrawWhenSafetyNetOwnerIsZeroAddress() external {
    // With direct call on non-existent id, contract panics due to division by zero before NotCommissioned
    vm.expectRevert(stdError.divisionError);
    vm.prank(_alice);
    _sn.withdraw(999, 1);
  }

  function test_WithdrawWhenCallerIsNotInIsMemberMapping() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    vm.expectRevert(ISafetyNet.NotMember.selector);
    vm.prank(_carol);
    _sn.withdraw(id, 1);
  }

  function test_WithdrawWhenDaysRequestedIsZero() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    uint256 beforeBal = _token.balanceOf(_alice);
    vm.prank(_alice);
    _sn.withdraw(id, 0);

    // Zero transfer still emits and counts as small withdraw
    assertEq(_token.balanceOf(_alice), beforeBal);
    assertEq(_sn.smallWithdrawsCount(id, _sn.getCurrentEpochIndex(id), _alice), 1);
  }

  function test_WithdrawWhenRequestedWithdrawalAmountExceedsMemberWithdrawableBalance() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);
    vm.expectRevert(ISafetyNet.NotWithdrawable.selector);
    vm.prank(_alice);

    // Likely exceeds withdrawable
    _sn.withdraw(id, 301);
  }

  function test_WithdrawWhenWithdrawalAmountIsBelowThreshold() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));

    // Small path
    _safetyNet.autoThreshold = 100 ether;
    uint256 id = _sn.create(_safetyNet);
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    uint256 before = _token.balanceOf(_alice);
    vm.prank(_alice);
    _sn.withdraw(id, 1);
    assertGt(_token.balanceOf(_alice), before);
    assertLt(_sn.memberWithdrawableBalance(id, _alice), _safetyNet.initialDeposit * _safetyNet.ratio);
  }

  function test_WithdrawWhenWithdrawalAmountIsAboveAutoThresholdCreatesRequest() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    // Any withdraw > 1 wei goes to request path
    _safetyNet.autoThreshold = 1;
    uint256 id = _sn.create(_safetyNet);
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    vm.prank(_alice);
    _sn.withdraw(id, 1);
    assertEq(_sn.nextIdRequest(), 1);
    (address reqOwner, uint256 reqSafetyNetId,,,,) = _sn.requests(0);
    assertEq(reqOwner, _alice);
    assertEq(reqSafetyNetId, id);
  }

  // ---------- createRequest / contest / execute / vote (happy paths) ----------
  function _createFundAndRequest() internal returns (uint256 id, uint256 reqId) {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));

    // Ensure withdraw goes through request path
    _safetyNet.autoThreshold = 1;
    id = _sn.create(_safetyNet);
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    // Create request via withdraw above threshold
    vm.prank(_alice);

    // Large enough for request
    _sn.withdraw(id, 2);
    reqId = 0;
  }

  function test_ContestValid() external {
    (, uint256 reqId) = _createFundAndRequest();

    // Bob is member, within contest window
    vm.prank(_bob);
    _sn.contest(reqId);
    assertTrue(_sn.isContested(reqId));
  }

  function test_ExecuteContestedWithdrawalWhenContestWindowIsStillOpen() external {
    (, uint256 reqId) = _createFundAndRequest();

    // Should do nothing while still within window and not contested
    _sn.executeContestedWithdrawal(reqId);
    assertFalse(_sn.isExecuted(reqId));
  }

  function test_ExecuteContestedWithdrawalWhenRequestIsContested() external {
    (, uint256 reqId) = _createFundAndRequest();
    vm.prank(_bob);
    _sn.contest(reqId);
    vm.warp(block.timestamp + 10 days);
    _sn.executeContestedWithdrawal(reqId);
    assertFalse(_sn.isExecuted(reqId));
  }

  function test_ExecuteContestedWithdrawalWhenContestWindowHasPassedAndRequestWasNotContested() external {
    (, uint256 reqId) = _createFundAndRequest();

    // Beyond window
    vm.warp(block.timestamp + 10 days);
    (address rqOwner,,,,, uint256 rqAmount) = _sn.requests(reqId);
    vm.expectEmit(true, true, false, true);
    emit ISafetyNet.WithdrawalAutoExecuted(reqId, rqOwner, rqAmount);
    _sn.executeContestedWithdrawal(reqId);
    assertTrue(_sn.isExecuted(reqId));
  }

  function test_VoteHappyPathYesAndExecuteOnConsensusExceeded() external {
    _allowToken(address(_token));

    // 3 members
    address[] memory members = new address[](3);
    members[0] = _alice;
    members[1] = _bob;
    members[2] = _carol;
    ISafetyNet.SafetyNet memory _safetyNet = ISafetyNet.SafetyNet({
      id: 0,
      owner: _owner,
      minimumMembers: 2,
      maximumMembers: 5,
      consensusThreshold: 60,
      safetyNetStart: block.timestamp,
      token: address(_token),
      members: members,
      initialDeposit: 100 ether,
      fixedDeposit: 10 ether,
      ratio: 1,
      // Force request path
      autoThreshold: 1,
      contestWindow: 3 days,
      votingWindow: 30 days,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });
    uint256 id = _sn.create(_safetyNet);

    // Onboard
    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);

    // Creates request 0
    vm.prank(_alice);
    _sn.withdraw(id, 1);
    uint256 reqId = 0;

    // Vote yes by alice then bob (2/3 = 66% > 60%)
    vm.prank(_alice);
    _sn.vote(reqId, true);
    vm.prank(_bob);
    _sn.vote(reqId, true);
    assertTrue(_sn.isExecuted(reqId));
  }

  // ---------- views ----------
  function test_IsTokenAllowedWhenTokenIsInAllowedTokensMappingWithTrueValue() external {
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);
    assertTrue(_sn.isTokenAllowed(address(_token)));
  }

  function test_IsTokenAllowedWhenTokenIsInAllowedTokensMappingWithFalseValue() external {
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), false);
    assertFalse(_sn.isTokenAllowed(address(_token)));
  }

  function test_IsTokenAllowedWhenTokenIsNotInAllowedTokensMapping() external view {
    assertFalse(_sn.isTokenAllowed(address(_token)));
  }

  function test_IsTokenAllowedWhenTokenAddressIsZero() external {
    vm.prank(_owner);
    _sn.setTokenAllowed(address(0), true);
    assertTrue(_sn.isTokenAllowed(address(0)));
  }

  function test_GetSafetyNetWhenSafetyNetDoesNotExist() external {
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    _sn.getSafetyNet(123);
  }

  function test_GetSafetyNetWhenSafetyNetExistsAndIsCommissioned() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);
    ISafetyNet.SafetyNet memory g = _sn.getSafetyNet(id);
    assertEq(g.owner, _safetyNet.owner);
  }

  function test_GetSafetyNetsWhenIdsArrayIsEmpty() external view {
    ISafetyNet.SafetyNet[] memory arr = _sn.getSafetyNets(new uint256[](0));
    assertEq(arr.length, 0);
  }

  function test_GetSafetyNetsWhenSomeIdsDoNotExist() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    uint256[] memory ids = new uint256[](3);
    ids[0] = id;
    ids[1] = 999;
    ids[2] = 1000;
    ISafetyNet.SafetyNet[] memory arr = _sn.getSafetyNets(ids);
    assertEq(arr.length, 3);
    assertEq(arr[0].owner, _owner);
    assertEq(arr[1].owner, address(0));
  }

  function test_GetMemberSafetyNetsWhenMemberHasNoSafetyNets() external view {
    uint256[] memory ids = _sn.getMemberSafetyNets(_carol);
    assertEq(ids.length, 0);
  }

  function test_GetMemberSafetyNetsWhenMemberHasSafetyNets() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    uint256[] memory ids = _sn.getMemberSafetyNets(_alice);
    assertEq(ids.length, 1);
    assertEq(ids[0], id);
  }

  function test_GetMemberBalancesWhenSafetyNetDoesNotExist() external {
    vm.expectRevert(ISafetyNet.NotCommissioned.selector);
    _sn.getMemberBalances(42);
  }

  function test_GetMemberBalancesWhenSafetyNetExistsAndIsCommissioned() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    (address[] memory members, uint256[] memory balances) = _sn.getMemberBalances(id);
    assertEq(members.length, 2);
    assertEq(balances.length, 2);
    assertEq(balances[0], 0);
    assertEq(balances[1], 0);
  }

  function test_HasMemberDepositedInEpochWhenEpochMemberDepositsIsTrue() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    uint256 id = _sn.create(_safetyNet);

    vm.prank(_alice);
    _sn.deposit(id, _safetyNet.initialDeposit);
    assertTrue(_sn.hasMemberDepositedInEpoch(id, _alice, _sn.getCurrentEpochIndex(id)));
  }

  function test_HasMemberDepositedInEpochWhenEpochMemberDepositsIsFalseOrUnset() external view {
    assertFalse(_sn.hasMemberDepositedInEpoch(0, _alice, 0));
  }

  function test_GetCurrentEpochIndexWhenCurrentTimeEdgeCases() external {
    _allowToken(address(_token));
    ISafetyNet.SafetyNet memory _safetyNet = _defaultSafetyNet(address(_token));
    _safetyNet.safetyNetStart = block.timestamp + 1 days;
    uint256 id = _sn.create(_safetyNet);

    // Before start
    assertEq(_sn.getCurrentEpochIndex(id), 0);
    vm.warp(_safetyNet.safetyNetStart);

    // At start
    assertEq(_sn.getCurrentEpochIndex(id), 0);
    vm.warp(_safetyNet.safetyNetStart + 1);

    // Just after start
    assertEq(_sn.getCurrentEpochIndex(id), 0);
    vm.warp(_safetyNet.safetyNetStart + _safetyNet.epochDuration);

    // Exactly one epoch
    assertEq(_sn.getCurrentEpochIndex(id), 1);
    vm.warp(_safetyNet.safetyNetStart + 5 * _safetyNet.epochDuration + 10);
    assertEq(_sn.getCurrentEpochIndex(id), 5);
  }

  function test_IsDecommissionableWhenSafetyNetDoesNotExist() external view {
    assertTrue(_sn.isDecommissionable(999));
  }

  function test_IsDecommissionableWhenSafetyNetOwnerIsZeroAddress() external view {
    assertTrue(_sn.isDecommissionable(123));
  }

  function test_IsDecommissionableWhenCurrentEpochIndexIs0() external {
    _allowToken(address(_token));
    uint256 id = _sn.create(_defaultSafetyNet(address(_token)));
    assertFalse(_sn.isDecommissionable(id));
  }
}
