// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ───────────────────────────── Imports ─────────────────────────────
import {Test} from "forge-std/Test.sol";

import {Breadfund} from "src/contracts/Breadfund.sol";
import {IBreadfund} from "src/interfaces/IBreadfund.sol";

import {TransparentUpgradeableProxy} from "@openzeppelin/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/proxy/transparent/ProxyAdmin.sol";

import {MockERC20} from "test/mocks/MockERC20.sol";

// ─────────────────────── Breadfund Fuzz Skeleton ───────────────────────
contract BreadfundFuzz is Test {
  // Implementation / proxy
  Breadfund internal implementation;
  Breadfund internal breadfund; // proxy address, cast to implementation ABI
  ProxyAdmin internal proxyAdmin;
  TransparentUpgradeableProxy internal proxy;

  // Token
  MockERC20 internal token;

  // Members
  address internal owner_;
  address internal member1;
  address internal member2;
  address internal member3;
  address[] internal defaultMembers;

  // Safe default template (filled in setUp)
  IBreadfund.Breadfund internal safeCfg;

  // Handy safe defaults (can be overridden inside individual fuzz tests later)
  uint256 internal constant SAFE_MIN_MEMBERS = 3;
  uint256 internal constant SAFE_MAX_MEMBERS = 10;
  uint256 internal constant SAFE_CONSENSUS = 51; // percentage
  uint256 internal constant SAFE_INITIAL_DEPOSIT = 1e16;
  uint256 internal constant SAFE_FIXED_DEPOSIT = 1e16;
  uint256 internal constant SAFE_RATIO = 1; // 1x
  uint256 internal constant SAFE_AUTO_THRESHOLD = 5e17;
  uint256 internal constant SAFE_CONTEST_WINDOW = 1 days;
  uint256 internal constant SAFE_VOTING_WINDOW = 3 days;
  uint256 internal constant SAFE_EPOCH_DURATION = 30 days;
  uint256 internal constant SAFE_SMALL_WITHDRAWS_LIMIT = 3;

  // ─────────────────────────── setUp ───────────────────────────
  function setUp() public {
    // actors
    member1 = address(0xA11CE);
    member2 = address(0xB0B);
    member3 = address(0xC0C0A);

    owner_ = address(this);
    defaultMembers = _threeMembers();

    // deploy mock token
    token = new MockERC20("Mock", "MOCK");
    vm.label(address(token), "MockERC20");

    // deploy implementation
    implementation = new Breadfund();
    vm.label(address(implementation), "Breadfund_Impl");

    // deploy proxy admin
    proxyAdmin = new ProxyAdmin(owner_);
    vm.label(address(proxyAdmin), "ProxyAdmin");

    // prepare initializer
    bytes memory initData = abi.encodeWithSelector(Breadfund.initialize.selector, owner_);

    // deploy proxy pointing to implementation
    proxy = new TransparentUpgradeableProxy(address(implementation), address(proxyAdmin), initData);
    vm.label(address(proxy), "Breadfund_Proxy");

    // interact with proxy via implementation ABI
    breadfund = Breadfund(address(proxy));
    vm.label(address(breadfund), "Breadfund");

    // allow token
    breadfund.setTokenAllowed(address(token), true);

    // build safe default config template
    IBreadfund.Breadfund memory cfg;
    cfg.id = 0; // filled by create()
    cfg.owner = owner_;
    cfg.minimumMembers = SAFE_MIN_MEMBERS;
    cfg.maximumMembers = SAFE_MAX_MEMBERS;
    cfg.consensusThreshold = SAFE_CONSENSUS;
    cfg.breadfundStart = block.timestamp + 1 days; // in the future
    cfg.token = address(token);
    cfg.members = defaultMembers;
    cfg.initialDeposit = SAFE_INITIAL_DEPOSIT;
    cfg.fixedDeposit = SAFE_FIXED_DEPOSIT;
    cfg.ratio = SAFE_RATIO;
    cfg.autoThreshold = SAFE_AUTO_THRESHOLD;
    cfg.contestWindow = SAFE_CONTEST_WINDOW;
    cfg.votingWindow = SAFE_VOTING_WINDOW;
    cfg.currentEpoch = 0;
    cfg.epochDuration = SAFE_EPOCH_DURATION;
    cfg.smallWithdrawsLimit = SAFE_SMALL_WITHDRAWS_LIMIT;

    safeCfg = cfg;

    // nice labels for actors
    vm.label(owner_, "Owner");
    vm.label(member1, "Member1");
    vm.label(member2, "Member2");
    vm.label(member3, "Member3");
  }

  // ──────────────────────── Category 1: Membership rules ────────────────────────

  function testFuzz_Membership_minimumMembers(uint256 minimumMembers) public {
      // Start from the safe template
      IBreadfund.Breadfund memory cfg = safeCfg;

      // Use explicit, non-zero member addresses to satisfy create() checks
      address[] memory members = _threeMembers();
      cfg.members = members;

      // Ensure the array length isn't the reason for revert:
      // bound min to [0..3] so we can still hit the <2 revert and the valid path.
      if (minimumMembers > 3) {
        minimumMembers = 3;
      }

      cfg.minimumMembers = minimumMembers;
      cfg.maximumMembers = minimumMembers; // boundary: max == min

      if (minimumMembers < 2) {
        vm.expectRevert(IBreadfund.InvalidMinimumMembers.selector);
        breadfund.create(cfg);
      } else {
        breadfund.create(cfg);
      }
  }

  function testFuzz_Membership_minimumVsMaximum(uint256 minimumMembers, uint256 maximumMembers) public {
      IBreadfund.Breadfund memory cfg = safeCfg;
      cfg.members = defaultMembers;

      // Keep min >=2 to avoid trivial revert unrelated to max relationship
      minimumMembers = bound(minimumMembers, 2, type(uint256).max);
      // Ensure max is at least members.length so an eventual revert is about min/max ordering, not array length
      vm.assume(maximumMembers >= defaultMembers.length);

      cfg.minimumMembers = minimumMembers;
      cfg.maximumMembers = maximumMembers;

      if (maximumMembers < minimumMembers) {
        vm.expectRevert(IBreadfund.InvalidMaximumMembers.selector);
        breadfund.create(cfg);
      } else {
        breadfund.create(cfg); // should succeed
      }
  }

  function testFuzz_Membership_maximumMembers(uint256 maximumMembers) public {
      IBreadfund.Breadfund memory cfg = safeCfg;
      cfg.members = defaultMembers;

      // Keep minimumMembers fixed to a safe value (3)
      cfg.minimumMembers = SAFE_MIN_MEMBERS;
      // Exercise wide range, but also make sure we can test both revert and success:
      // If max < 3 → revert; otherwise, success — and members.length == 3 won't be the unrelated cause.
      cfg.maximumMembers = maximumMembers;

      if (maximumMembers < SAFE_MIN_MEMBERS) {
        vm.expectRevert(IBreadfund.InvalidMaximumMembers.selector);
        breadfund.create(cfg);
      } else {
        breadfund.create(cfg);
      }
  }

  function testFuzz_Membership_membersArray(address[] memory members) public {
      IBreadfund.Breadfund memory cfg = safeCfg;

      // Focus this test on members[] shape/content (non-zero, reasonable size, no duplicates)
      vm.assume(members.length >= SAFE_MIN_MEMBERS && members.length <= SAFE_MAX_MEMBERS);
      for (uint256 i = 0; i < members.length; i++) {
        vm.assume(members[i] != address(0));
      }
      vm.assume(_allDistinct(members));

      cfg.members = members;

      // Keep min/max fixed and consistent
      cfg.minimumMembers = SAFE_MIN_MEMBERS;
      cfg.maximumMembers = SAFE_MAX_MEMBERS;

      breadfund.create(cfg); // should succeed with non-zero, distinct members
  }

  // ──────────────────────── Category 2: Economic parameters ────────────────────────

  function testFuzz_Economics_initialDeposit(uint256 initialDeposit) public {
      IBreadfund.Breadfund memory cfg = safeCfg;
      cfg.initialDeposit = initialDeposit;

      if (initialDeposit == 0) {
        vm.expectRevert(IBreadfund.InvalidInitialDeposit.selector);
        breadfund.create(cfg);
      } else {
        breadfund.create(cfg);
      }
  }

  function testFuzz_Economics_fixedDeposit(uint256 fixedDeposit) public {
      IBreadfund.Breadfund memory cfg = safeCfg;
      cfg.fixedDeposit = fixedDeposit;

      if (fixedDeposit == 0) {
        vm.expectRevert(IBreadfund.InvalidFixedDeposit.selector);
        breadfund.create(cfg);
      } else {
        breadfund.create(cfg);
      }
  }

  function testFuzz_Economics_ratio(uint256 ratio) public {
      // No create()-time validation on ratio; any uint256 should succeed.
      IBreadfund.Breadfund memory cfg = safeCfg;
      cfg.ratio = ratio;
      breadfund.create(cfg);
  }

  function testFuzz_Economics_autoThreshold(uint256 autoThreshold) public {
      IBreadfund.Breadfund memory cfg = safeCfg;
      cfg.autoThreshold = autoThreshold;

      if (autoThreshold == 0) {
        vm.expectRevert(IBreadfund.InvalidThreshold.selector);
        breadfund.create(cfg);
      } else {
        breadfund.create(cfg);
      }
  }

  function testFuzz_Economics_smallWithdrawsRespectLimit(uint256 daysRequested) public {
    // Make daysRequested small enough to be "small" (<= autoThreshold) for safeCfg
    daysRequested = bound(daysRequested, 1, 3); // tiny pulls per call

    // Create fund, start now
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers;
    cfg.ratio = 1;
    cfg.breadfundStart = block.timestamp;
    uint256 id = breadfund.create(cfg);

    // Give member1 a deposit so they have withdrawable
    uint256 dep = cfg.autoThreshold / 30 + 1; // daily * daysRequested <= autoThreshold
    uint256 totalNeeded = dep + cfg.initialDeposit + cfg.fixedDeposit;

    _mintApprove(member1, totalNeeded, address(breadfund));
    vm.prank(member1);
    breadfund.deposit(id, dep);

    // Do small withdraws up to the limit
    for (uint256 i = 0; i < cfg.smallWithdrawsLimit; i++) {
      vm.prank(member1);
      breadfund.withdraw(id, daysRequested); // should succeed while count <= limit
    }

    // Next small withdrawal in the same epoch should revert
    vm.prank(member1);
    vm.expectRevert(IBreadfund.ExceedsSmallWithdrawalLimit.selector);
    breadfund.withdraw(id, daysRequested);

    // Warp to the next epoch; counter resets
    vm.warp(block.timestamp + cfg.epochDuration + 1);
    vm.prank(member1);
    breadfund.withdraw(id, daysRequested); // should succeed again
  }

  function testFuzz_Economics_largeWithdrawal_RequestAndAutoExecute(uint256 depositValue) public {
    // Make a decent deposit so large withdraw is definitely > autoThreshold
    depositValue = bound(depositValue, 1e18, 1e21);

    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers;
    cfg.ratio = 1; // simple
    cfg.breadfundStart = block.timestamp;
    uint256 id = breadfund.create(cfg);

    // Member1 deposits
    uint256 totalNeeded = depositValue + cfg.initialDeposit + cfg.fixedDeposit;
    _mintApprove(member1, totalNeeded, address(breadfund));
    vm.prank(member1);
    breadfund.deposit(id, depositValue);

    // Choose days large enough to exceed autoThreshold
    // monthly withdraw = value * ratio, daily = / 30 → amount = (depositValue / 30) * days
    uint256 minDaysToBeLarge = (cfg.autoThreshold * 30) / depositValue + 1;
    uint256 daysRequested = minDaysToBeLarge + 1;

    // 1) Large withdraw should create a request (no transfer and no revert)
    vm.prank(member1);
    breadfund.withdraw(id, daysRequested);

    uint256 reqId = breadfund.nextIdRequest() - 1;

    // 2) No auto-exec yet: we are inside the contest window. Warp past contestWindow
    vm.warp(block.timestamp + cfg.contestWindow + 1);

    // 3) Since not contested, executeContestedWithdrawl should auto-execute the pending request
    uint256 balBefore = token.balanceOf(member1);
    vm.prank(member1); // any caller can trigger
    breadfund.executeContestedWithdrawl(reqId);
    uint256 balAfter = token.balanceOf(member1);
    assertGt(balAfter, balBefore, "expected auto-executed transfer");
    assertTrue(breadfund.isExecuted(reqId), "flag should be set");
  }

  // ──────────────────────── Category 3: Governance timing ────────────────────────

  function testFuzz_Governance_contestWindow(uint256 contestWindow) public {
    // contestWindow has no create()-time validation; any uint is accepted
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers;
    cfg.contestWindow = contestWindow;
    breadfund.create(cfg); // should not revert for any value
  }

  function testFuzz_Governance_votingWindow(uint256 votingWindow) public {
    // votingWindow has no create()-time validation; any uint is accepted
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers;
    cfg.votingWindow = votingWindow;
    breadfund.create(cfg); // should not revert for any value
  }

  function testFuzz_Governance_epochDuration(uint256 epochDuration) public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers;
    cfg.epochDuration = epochDuration;

    if (epochDuration == 0) {
      vm.expectRevert(IBreadfund.InvalidEpochDuration.selector);
      breadfund.create(cfg);
    } else {
      breadfund.create(cfg); // should succeed for any non-zero epoch duration
    }
  }

  // ──────────────────────── Category 4: Withdraw limits ────────────────────────

  function testFuzz_Withdraw_smallWithdrawsLimit(uint256 smallWithdrawsLimit) public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers;
    cfg.smallWithdrawsLimit = smallWithdrawsLimit;

    if (smallWithdrawsLimit == 0) {
      // If your interface exposes a dedicated selector, prefer it:
      // vm.expectRevert(IBreadfund.InvalidSmallWithdrawsLimit.selector);
      vm.expectRevert();
      breadfund.create(cfg);
    } else {
      breadfund.create(cfg); // should succeed for any non-zero limit
    }
  }
  
  // ──────────────────────── Extras ────────────────────────

  function testFuzz_Extras_consensusThreshold(uint256 consensusThreshold) public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers;

    // Prefer bound over assume to avoid discarded runs
    consensusThreshold = bound(consensusThreshold, 1, 100);
    cfg.consensusThreshold = consensusThreshold;

    breadfund.create(cfg); // should succeed for valid consensusThreshold
  }

  function testFuzz_Extras_breadfundStart(uint256 breadfundStart) public {
    IBreadfund.Breadfund memory cfg = safeCfg;
    cfg.members = defaultMembers;

    // Ensure breadfundStart is in the future using bound (prevents discarded runs)
    breadfundStart = bound(breadfundStart, block.timestamp + 1, type(uint256).max);
    cfg.breadfundStart = breadfundStart;

    breadfund.create(cfg); // should succeed for valid breadfundStart
  }

  // ──────────────────────── Ratio tests ────────────────────────

  /// @notice Demonstrates that a large ratio can make withdrawable > actual balance
  function testFuzz_Ratio_CanBreakConservation(uint256 ratio) public {
    ratio = bound(ratio, 2, 100); // ensure >1 while keeping runs efficient

    (Breadfund localFund, MockERC20 localToken) = _deployIsolatedFund();

    // Define members
    address[] memory members = _threeMembers();

    IBreadfund.Breadfund memory cfg = IBreadfund.Breadfund({
      id: 0,
      owner: address(this),
      minimumMembers: 3,
      maximumMembers: 5,
      consensusThreshold: 50,
      breadfundStart: block.timestamp,
      token: address(localToken),
      members: members,
      initialDeposit: 1e16,
      fixedDeposit:   1e16,
      ratio: ratio,
      autoThreshold: 5e17,
      contestWindow: 1 days,
      votingWindow: 3 days,
      currentEpoch: 0,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });

    uint256 idLocal = localFund.create(cfg);

    uint256 depositValue = 1e18;
    _mintApproveLocal(localToken, member1, depositValue + cfg.initialDeposit + cfg.fixedDeposit, address(localFund));
    vm.prank(member1);
    localFund.deposit(idLocal, depositValue);

    uint256 contractHeld = localToken.balanceOf(address(localFund));
    uint256 withdrawable = localFund.memberWithdrawableBalance(idLocal, member1);

    assertLt(contractHeld, withdrawable, "Expected withdrawable to exceed held tokens for ratio > 1");
  }

  function testFuzz_Conservation_Holds_ForSaneRatio(uint256 value) public {
    uint256 ratio = 1;
    value = bound(value, 1e16, 5e18);

    (Breadfund localFund, MockERC20 localToken) = _deployIsolatedFund();

    address[] memory members = _threeMembers();

    IBreadfund.Breadfund memory cfg = IBreadfund.Breadfund({
      id: 0,
      owner: address(this),
      minimumMembers: 3,
      maximumMembers: 5,
      consensusThreshold: 50,
      breadfundStart: block.timestamp,
      token: address(localToken),
      members: members,
      initialDeposit: 1e16,
      fixedDeposit:   1e16,
      ratio: ratio,
      autoThreshold: 5e17,
      contestWindow: 1 days,
      votingWindow: 3 days,
      currentEpoch: 0,
      epochDuration: 30 days,
      smallWithdrawsLimit: 3
    });

    uint256 idLocal = localFund.create(cfg);

    _mintApproveLocal(localToken, member1, value + cfg.initialDeposit + cfg.fixedDeposit, address(localFund));
    vm.prank(member1);
    localFund.deposit(idLocal, value);

    uint256 contractHeld = localToken.balanceOf(address(localFund));
    uint256 withdrawable = localFund.memberWithdrawableBalance(idLocal, member1);
    assertGe(contractHeld, withdrawable, "conservation should hold for ratio <= 1");
  }

  // ─────────────────────────── Helpers ───────────────────────────

  function _threeMembers() internal view returns (address[] memory m) {
    m = new address[](3);
    m[0] = member1;
    m[1] = member2;
    m[2] = member3;
  }

  function _allDistinct(address[] memory a) internal pure returns (bool) {
    for (uint256 i = 0; i < a.length; ++i) {
      for (uint256 j = i + 1; j < a.length; ++j) {
        if (a[i] == a[j]) return false;
      }
    }
    return true;
  }

  function _mintApprove(address who, uint256 amount, address spender) internal {
    token.mint(who, amount);
    vm.startPrank(who);
    token.approve(spender, type(uint256).max);
    vm.stopPrank();
  }

  function _deployIsolatedFund() internal returns (Breadfund localFund, MockERC20 localToken) {
    localToken = new MockERC20("TestToken", "TST");
    vm.label(address(localToken), "Local_TestToken");

    Breadfund impl = new Breadfund();
    vm.label(address(impl), "Local_Breadfund_Impl");
    bytes memory init = abi.encodeWithSelector(Breadfund.initialize.selector, address(this));

    address proxyAdminAddr = address(0xA11C3);
    vm.label(proxyAdminAddr, "Local_ProxyAdmin");

    TransparentUpgradeableProxy localProxy =
      new TransparentUpgradeableProxy(address(impl), proxyAdminAddr, init);
    vm.label(address(localProxy), "Local_Breadfund_Proxy");

    localFund = Breadfund(address(localProxy));
    vm.label(address(localFund), "Local_Breadfund");

    localFund.setTokenAllowed(address(localToken), true);
  }

  function _mintApproveLocal(MockERC20 tkn, address who, uint256 amount, address spender) internal {
    tkn.mint(who, amount);
    vm.startPrank(who);
    tkn.approve(spender, type(uint256).max);
    vm.stopPrank();
  }
}
