// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ProxyAdmin} from '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';
import {Test} from 'forge-std/Test.sol';

import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {SafetyNetViewer} from 'src/contracts/SafetyNetViewer.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';
import {ISafetyNetViewer} from 'src/interfaces/ISafetyNetViewer.sol';
import {MockERC20} from 'test/mocks/MockERC20.sol';

contract SafetyNetViewerTest is Test {
  SafetyNet internal _sn;
  SafetyNetViewer internal _viewer;
  MockERC20 internal _token;

  address internal _owner;
  address internal _alice = makeAddr('alice');
  address internal _bob = makeAddr('bob');

  uint256 internal _snId;

  function setUp() public {
    (_owner,) = makeAddrAndKey('owner');

    // Deploy upgradeable proxy
    address impl = address(new SafetyNet());
    address admin = address(new ProxyAdmin(_owner));
    address proxy = address(
      new TransparentUpgradeableProxy(impl, admin, abi.encodeWithSelector(SafetyNet.initialize.selector, _owner))
    );
    _sn = SafetyNet(proxy);

    // Deploy viewer pointing at the proxy
    _viewer = new SafetyNetViewer(proxy);

    // Setup token
    _token = new MockERC20('Mock', 'MOCK');
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);

    // Fund and approve
    _token.mint(_alice, 1_000_000 ether);
    _token.mint(_bob, 1_000_000 ether);
    vm.prank(_alice);
    _token.approve(address(_sn), type(uint256).max);
    vm.prank(_bob);
    _token.approve(address(_sn), type(uint256).max);

    // Create a safety net with alice and bob
    address[] memory members = new address[](2);
    members[0] = _alice;
    members[1] = _bob;
    ISafetyNet.SafetyNet memory snConfig = ISafetyNet.SafetyNet({
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
      redeemRatio: 1,
      autoThreshold: 50 ether,
      contestWindow: 3 days,
      votingWindow: 7 days,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });
    _snId = _sn.create(snConfig);
  }

  // ---------- getMemberEpochStatus ----------

  function test_GetMemberEpochStatus_BeforeDeposit() external view {
    ISafetyNetViewer.MemberEpochStatus memory status = _viewer.getMemberEpochStatus(_snId, _alice);

    assertEq(status.currentEpoch, 0, 'epoch should be 0');
    assertFalse(status.hasDeposited, 'alice should not have deposited yet');
    assertGt(status.duesRemaining, 0, 'dues remaining should be > 0 before deposit');
    assertEq(status.smallWithdrawsUsed, 0, 'no small withdraws yet');
    assertEq(status.withdrawableBalance, 0, 'no withdrawable balance yet');
  }

  function test_GetMemberEpochStatus_AfterInitialDeposit() external {
    // Alice makes the initial deposit
    vm.prank(_alice);
    _sn.deposit(_snId, 100 ether);

    ISafetyNetViewer.MemberEpochStatus memory status = _viewer.getMemberEpochStatus(_snId, _alice);

    assertEq(status.currentEpoch, 0, 'epoch should be 0');
    assertTrue(status.hasDeposited, 'alice should have deposited');
    assertEq(status.duesRemaining, 0, 'no more dues after full initial deposit');
  }

  function test_GetMemberEpochStatus_PartialDeposit() external {
    // Pay initial deposits for both members to complete epoch 0
    vm.prank(_alice);
    _sn.deposit(_snId, 100 ether);
    vm.prank(_bob);
    _sn.deposit(_snId, 100 ether);

    // Advance to epoch 1 where fixedDeposit (10 ether) applies
    ISafetyNet.SafetyNet memory snConfig = _sn.getSafetyNet(_snId);
    vm.warp(snConfig.safetyNetStart + snConfig.epochDuration);

    // Alice makes a partial deposit (5 out of 10 ether)
    vm.prank(_alice);
    _sn.deposit(_snId, 5 ether);

    ISafetyNetViewer.MemberEpochStatus memory status = _viewer.getMemberEpochStatus(_snId, _alice);

    assertFalse(status.hasDeposited, 'partial deposit is not a full deposit');
    assertGt(status.duesRemaining, 0, 'still has dues remaining');
  }

  // ---------- getPoolLiquidity ----------

  function test_GetPoolLiquidity_BeforeDeposits() external view {
    ISafetyNetViewer.PoolLiquidity memory pool = _viewer.getPoolLiquidity(_snId);

    assertEq(pool.totalBalance, 0, 'no balance yet');
    assertEq(pool.memberCount, 2, 'alice and bob are members');
    assertEq(pool.activeMemberCount, 0, 'no active members yet (no deposits)');
  }

  function test_GetPoolLiquidity_AfterOneDeposit() external {
    vm.prank(_alice);
    _sn.deposit(_snId, 100 ether);

    ISafetyNetViewer.PoolLiquidity memory pool = _viewer.getPoolLiquidity(_snId);

    assertEq(pool.totalBalance, 100 ether, 'total should be 100 ether');
    assertEq(pool.memberCount, 2, 'still 2 members');
    assertEq(pool.activeMemberCount, 1, 'only alice is active');
  }

  function test_GetPoolLiquidity_AfterBothDeposit() external {
    vm.prank(_alice);
    _sn.deposit(_snId, 100 ether);
    vm.prank(_bob);
    _sn.deposit(_snId, 100 ether);

    ISafetyNetViewer.PoolLiquidity memory pool = _viewer.getPoolLiquidity(_snId);

    assertEq(pool.totalBalance, 200 ether, 'total should be 200 ether');
    assertEq(pool.memberCount, 2, 'still 2 members');
    assertEq(pool.activeMemberCount, 2, 'both members are active');
  }

  // ---------- getMemberDashboard ----------

  function test_GetMemberDashboard_BeforeDeposit() external view {
    ISafetyNetViewer.MemberDashboard memory dashboard = _viewer.getMemberDashboard(_snId, _alice);

    // Epoch status checks
    assertEq(dashboard.epochStatus.currentEpoch, 0, 'epoch should be 0');
    assertFalse(dashboard.epochStatus.hasDeposited, 'alice has not deposited');
    assertGt(dashboard.epochStatus.duesRemaining, 0, 'dues remaining > 0');
    assertEq(dashboard.epochStatus.smallWithdrawsUsed, 0, 'no small withdraws');
    assertEq(dashboard.epochStatus.withdrawableBalance, 0, 'no withdrawable balance');

    // Pool liquidity checks
    assertEq(dashboard.poolLiquidity.totalBalance, 0, 'no total balance');
    assertEq(dashboard.poolLiquidity.memberCount, 2, '2 members');
    assertEq(dashboard.poolLiquidity.activeMemberCount, 0, 'no active members');

    // Safety net IDs for alice
    assertEq(dashboard.memberSafetyNetIds.length, 1, 'alice has 1 safety net');
    assertEq(dashboard.memberSafetyNetIds[0], _snId, 'safety net id matches');
  }

  function test_GetMemberDashboard_AfterBothDeposit() external {
    vm.prank(_alice);
    _sn.deposit(_snId, 100 ether);
    vm.prank(_bob);
    _sn.deposit(_snId, 100 ether);

    ISafetyNetViewer.MemberDashboard memory dashboard = _viewer.getMemberDashboard(_snId, _alice);

    assertTrue(dashboard.epochStatus.hasDeposited, 'alice has deposited');
    assertEq(dashboard.epochStatus.duesRemaining, 0, 'no dues remaining');
    assertEq(dashboard.poolLiquidity.totalBalance, 200 ether, '200 ether total');
    assertEq(dashboard.poolLiquidity.activeMemberCount, 2, 'both active');
    assertEq(dashboard.memberSafetyNetIds.length, 1, 'alice in 1 safety net');
  }

  function test_GetMemberDashboard_MemberInMultipleSafetyNets() external {
    // Create a second safety net for alice
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);

    address[] memory members = new address[](2);
    members[0] = _alice;
    members[1] = _bob;
    ISafetyNet.SafetyNet memory snConfig2 = ISafetyNet.SafetyNet({
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
      redeemRatio: 1,
      autoThreshold: 50 ether,
      contestWindow: 3 days,
      votingWindow: 7 days,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });
    uint256 snId2 = _sn.create(snConfig2);

    ISafetyNetViewer.MemberDashboard memory dashboard = _viewer.getMemberDashboard(_snId, _alice);

    assertEq(dashboard.memberSafetyNetIds.length, 2, 'alice is in 2 safety nets');
    assertEq(dashboard.memberSafetyNetIds[0], _snId, 'first safety net');
    assertEq(dashboard.memberSafetyNetIds[1], snId2, 'second safety net');
  }
}
