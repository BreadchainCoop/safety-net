// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ProxyAdmin} from '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';
import {Test} from 'forge-std/Test.sol';

import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';
import {MockERC20} from 'test/mocks/MockERC20.sol';

contract SafetyNetCreditTest is Test {
  SafetyNet internal _sn;
  MockERC20 internal _token;

  address internal _owner;
  address internal _alice = makeAddr('alice');
  address internal _bob = makeAddr('bob');
  address internal _carol = makeAddr('carol');

  uint256 internal constant INITIAL_DEPOSIT = 100 ether;
  uint256 internal constant FIXED_DEPOSIT = 10 ether;
  uint256 internal constant EPOCH_DURATION = 30 days;

  uint256 internal _snId;

  function setUp() public {
    (_owner,) = makeAddrAndKey('owner');

    address impl = address(new SafetyNet());
    address admin = address(new ProxyAdmin(_owner));
    address proxy = address(
      new TransparentUpgradeableProxy(impl, admin, abi.encodeWithSelector(SafetyNet.initialize.selector, _owner))
    );
    _sn = SafetyNet(proxy);

    _token = new MockERC20('Mock', 'MOCK');
    vm.prank(_owner);
    _sn.setTokenAllowed(address(_token), true);

    // Fund all members generously
    _token.mint(_alice, 1_000_000 ether);
    _token.mint(_bob, 1_000_000 ether);
    _token.mint(_carol, 1_000_000 ether);

    vm.prank(_alice);
    _token.approve(address(_sn), type(uint256).max);
    vm.prank(_bob);
    _token.approve(address(_sn), type(uint256).max);
    vm.prank(_carol);
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
      initialDeposit: INITIAL_DEPOSIT,
      fixedDeposit: FIXED_DEPOSIT,
      redeemRatio: 1,
      autoThreshold: 50 ether,
      contestWindow: 3 days,
      votingWindow: 7 days,
      epochDuration: EPOCH_DURATION,
      smallWithdrawsLimit: 3
    });

    vm.prank(_owner);
    _snId = _sn.create(snConfig);

    // Onboard alice and bob in epoch 0
    vm.prank(_alice);
    _sn.deposit(_snId, INITIAL_DEPOSIT);
    vm.prank(_bob);
    _sn.deposit(_snId, INITIAL_DEPOSIT);
  }

  // ── Helper: advance to epoch N ──────────────────────────────────────────────

  function _advanceToEpoch(uint256 n) internal {
    vm.warp(block.timestamp + EPOCH_DURATION * n + 1);
  }

  // ── test_ExcessDepositStoresCredit ──────────────────────────────────────────
  // Depositing more than fixedDeposit stores the excess as credit instead of reverting.

  function test_ExcessDepositStoresCredit() external {
    _advanceToEpoch(1);

    uint256 creditBefore = _sn.memberDepositCredit(_snId, _alice);
    assertEq(creditBefore, 0, 'no credit before over-deposit');

    // Deposit double the fixedDeposit
    uint256 depositAmt = FIXED_DEPOSIT * 2;
    vm.prank(_alice);
    _sn.deposit(_snId, depositAmt);

    uint256 creditAfter = _sn.memberDepositCredit(_snId, _alice);
    assertEq(creditAfter, FIXED_DEPOSIT, 'excess stored as credit');

    // duesRemaining should be 0 (epoch fully paid)
    assertEq(_sn.duesRemainingThisEpoch(_snId, _alice), 0, 'epoch should be fully paid');

    // getMemberDepositCredit view function works
    assertEq(_sn.getMemberDepositCredit(_snId, _alice), FIXED_DEPOSIT, 'getMemberDepositCredit matches');
  }

  // ── test_CreditAppliedNextEpoch ─────────────────────────────────────────────
  // Credit from an over-deposit is automatically consumed the next epoch.

  function test_CreditAppliedNextEpoch() external {
    _advanceToEpoch(1);

    // Over-deposit: store fixedDeposit as credit
    vm.prank(_alice);
    _sn.deposit(_snId, FIXED_DEPOSIT * 2);

    uint256 creditAfterEpoch1 = _sn.memberDepositCredit(_snId, _alice);
    assertEq(creditAfterEpoch1, FIXED_DEPOSIT, 'credit stored for epoch 2');

    _advanceToEpoch(2);

    // Track state before the epoch-2 deposit
    uint256 withdrawableBefore = _sn.memberWithdrawableBalance(_snId, _alice);

    // Deposit exactly fixedDeposit again; credit will be consumed but the payment
    // already covers the dues by itself. The credit stays (nothing more to cover).
    // To see credit consumption, deposit less than fixedDeposit.
    uint256 smallDeposit = FIXED_DEPOSIT / 2;
    vm.prank(_alice);
    _sn.deposit(_snId, smallDeposit);

    uint256 creditAfterEpoch2 = _sn.memberDepositCredit(_snId, _alice);
    // Credit consumed: the smaller deposit left remaining = FIXED_DEPOSIT/2,
    // and credit covered that exactly (credit=FIXED_DEPOSIT >= FIXED_DEPOSIT/2).
    uint256 expectedCreditConsumed = FIXED_DEPOSIT / 2;
    assertEq(
      creditAfterEpoch2, creditAfterEpoch1 - expectedCreditConsumed, 'credit consumed to cover remaining dues'
    );

    // Epoch fully paid (credit + deposit = fixedDeposit)
    assertEq(_sn.duesRemainingThisEpoch(_snId, _alice), 0, 'epoch 2 fully paid with credit');

    // Withdrawable balance increased by (creditConsumed + smallDeposit) = fixedDeposit
    uint256 withdrawableAfter = _sn.memberWithdrawableBalance(_snId, _alice);
    assertEq(withdrawableAfter - withdrawableBefore, FIXED_DEPOSIT, 'withdrawable += creditConsumed + effectiveDeposit');
  }

  // ── test_CreditConsumptionPartial ───────────────────────────────────────────
  // Partial credit consumption: credit larger than dues uses only what's needed.

  function test_CreditConsumptionPartial() external {
    _advanceToEpoch(1);

    // Store 2x fixedDeposit as credit (deposit 3x total, 2x excess)
    vm.prank(_alice);
    _sn.deposit(_snId, FIXED_DEPOSIT * 3);
    uint256 credit = _sn.memberDepositCredit(_snId, _alice);
    assertEq(credit, FIXED_DEPOSIT * 2, '2x credit stored');

    _advanceToEpoch(2);

    // Deposit 1 token — credit should cover remaining FIXED_DEPOSIT - 1
    uint256 tinyDeposit = 1;
    vm.prank(_alice);
    _sn.deposit(_snId, tinyDeposit);

    // epochPaid should be FIXED_DEPOSIT (fully paid via credit + tinyDeposit)
    assertEq(_sn.duesRemainingThisEpoch(_snId, _alice), 0, 'epoch 2 fully covered');

    uint256 creditAfter = _sn.memberDepositCredit(_snId, _alice);
    // Credit used = FIXED_DEPOSIT - 1, credit remaining = 2*FIXED_DEPOSIT - (FIXED_DEPOSIT - 1)
    assertEq(creditAfter, FIXED_DEPOSIT + 1, 'partial credit consumed');
  }

  // ── test_ExcessDepositDoesNotRevert ─────────────────────────────────────────
  // Old behavior was to revert with ExceedsDepositAmount; now it stores as credit.

  function test_ExcessDepositDoesNotRevert() external {
    _advanceToEpoch(1);

    // First pay exact dues
    vm.prank(_alice);
    _sn.deposit(_snId, FIXED_DEPOSIT);
    assertEq(_sn.duesRemainingThisEpoch(_snId, _alice), 0, 'epoch paid');

    // Then deposit more — should NOT revert, goes to credit
    vm.prank(_alice);
    _sn.deposit(_snId, FIXED_DEPOSIT);

    assertEq(_sn.memberDepositCredit(_snId, _alice), FIXED_DEPOSIT, 'over-deposit goes to credit');
  }

  // ── test_DecommissionReturnsCredit ─────────────────────────────────────────
  // On decommission, any stored credit is returned to the member in addition
  // to their withdrawable balance.

  function test_DecommissionReturnsCredit() external {
    _advanceToEpoch(1);

    // Alice over-deposits, generating credit
    vm.prank(_alice);
    _sn.deposit(_snId, FIXED_DEPOSIT * 2);
    uint256 aliceCredit = _sn.memberDepositCredit(_snId, _alice);
    assertEq(aliceCredit, FIXED_DEPOSIT, 'alice has credit before decommission');

    // Bob pays normally
    vm.prank(_bob);
    _sn.deposit(_snId, FIXED_DEPOSIT);

    // Skip an epoch so bob misses a payment → safety net becomes decommissionable
    _advanceToEpoch(3);

    assertTrue(_sn.isDecommissionable(_snId), 'should be decommissionable');

    uint256 aliceTokensBefore = _token.balanceOf(_alice);
    uint256 aliceWithdrawable = _sn.memberWithdrawableBalance(_snId, _alice);

    _sn.decommission(_snId);

    uint256 aliceTokensAfter = _token.balanceOf(_alice);
    uint256 aliceReceived = aliceTokensAfter - aliceTokensBefore;

    // Alice should receive withdrawable balance + credit
    uint256 expectedMin = aliceWithdrawable + aliceCredit;
    assertGe(aliceReceived, expectedMin, 'alice receives withdrawable + credit on decommission');

    // Credit zeroed out
    assertEq(_sn.memberDepositCredit(_snId, _alice), 0, 'credit cleared after decommission');
  }
}
