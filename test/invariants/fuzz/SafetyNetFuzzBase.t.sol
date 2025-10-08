// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ───────────────────────────── Imports ─────────────────────────────

import {ProxyAdmin} from '@openzeppelin/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/proxy/transparent/TransparentUpgradeableProxy.sol';
import {Test} from 'forge-std/Test.sol';
import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

import {MockERC20} from 'test/mocks/MockERC20.sol';

/// @notice Shared base for all fuzz suites: deploys proxy + token, provides defaults & helpers.
abstract contract SafetyNetFuzzBase is Test {
  // Implementation / proxy
  SafetyNet internal _implementation;
  SafetyNet internal _safetyNet;
  ProxyAdmin internal _proxyAdmin;
  TransparentUpgradeableProxy internal proxy;

  // Token
  MockERC20 internal token;

  // Baseline members
  address internal owner_;
  address internal member1;
  address internal member2;
  address internal member3;
  address[] internal defaultMembers;

  // Safe default template (filled in setUp)
  ISafetyNet.SafetyNet internal safeCfg;

  // Defaults (chosen to be permissive but safe for fuzzing)
  uint256 internal constant _SAFE_MIN_MEMBERS = 3;
  uint256 internal constant _SAFE_MAX_MEMBERS = 10;
  uint256 internal constant _SAFE_CONSENSUS = 51; // percentage
  uint256 internal constant _SAFE_INITIAL_DEPOSIT = 225e18;
  uint256 internal constant _SAFE_FIXED_DEPOSIT = 50e18;
  uint256 internal constant _SAFE_RATIO = 1; // 1x
  uint256 internal constant _SAFE_AUTO_THRESHOLD = 150e18;
  uint256 internal constant _SAFE_CONTEST_WINDOW = 1 days;
  uint256 internal constant _SAFE_VOTING_WINDOW = 3 days;
  uint256 internal constant _SAFE_EPOCH_DURATION = 30 days;
  uint256 internal constant _SAFE_SMALL_WITHDRAWS_LIMIT = 3;

  /**
   * setUp
   * - Creates a proxy-admin + proxy-wrapped SafetyNet, initialized with `owner_`.
   * - Deploys and allow-lists a MockERC20 used across tests.
   * - Prepares a baseline config `safeCfg` reused by fuzz suites.
   */
  function setUp() public virtual {
    // actors
    member1 = address(0xA11CE);
    member2 = address(0xB0B);
    member3 = address(0xC0C0A);
    owner_ = address(this);
    defaultMembers = _threeMembers();

    // token
    token = new MockERC20('Mock', 'MOCK');
    vm.label(address(token), 'MockERC20');

    // implementation + proxy admin
    _implementation = new SafetyNet();
    vm.label(address(_implementation), 'SafetyNet_Impl');
    _proxyAdmin = new ProxyAdmin(owner_);
    vm.label(address(_proxyAdmin), 'ProxyAdmin');

    // proxy (initialize owner)
    bytes memory initData = abi.encodeWithSelector(SafetyNet.initialize.selector, owner_);
    proxy = new TransparentUpgradeableProxy(address(_implementation), address(_proxyAdmin), initData);
    vm.label(address(proxy), 'SafetyNet_Proxy');

    // use proxy via impl ABI
    _safetyNet = SafetyNet(address(proxy));
    vm.label(address(_safetyNet), 'SafetyNet');

    // allow token
    _safetyNet.setTokenAllowed(address(token), true);

    // default config template
    ISafetyNet.SafetyNet memory cfg;
    cfg.id = 0;
    cfg.owner = owner_;
    cfg.minimumMembers = _SAFE_MIN_MEMBERS;
    cfg.maximumMembers = _SAFE_MAX_MEMBERS;
    cfg.consensusThreshold = _SAFE_CONSENSUS;
    cfg.safetyNetStart = block.timestamp + 1 days; // future by default
    cfg.token = address(token);
    cfg.members = defaultMembers;
    cfg.initialDeposit = _SAFE_INITIAL_DEPOSIT;
    cfg.fixedDeposit = _SAFE_FIXED_DEPOSIT;
    cfg.ratio = _SAFE_RATIO;
    cfg.autoThreshold = _SAFE_AUTO_THRESHOLD;
    cfg.contestWindow = _SAFE_CONTEST_WINDOW;
    cfg.votingWindow = _SAFE_VOTING_WINDOW;
    cfg.currentEpoch = 0;
    cfg.epochDuration = _SAFE_EPOCH_DURATION;
    cfg.smallWithdrawsLimit = _SAFE_SMALL_WITHDRAWS_LIMIT;
    safeCfg = cfg;

    // labels (nice for traces)
    vm.label(owner_, 'Owner');
    vm.label(member1, 'Member1');
    vm.label(member2, 'Member2');
    vm.label(member3, 'Member3');
  }

  // ───────────── Helpers (reused across suites) ─────────────

  /// @dev Returns the canonical three default members.
  function _threeMembers() internal view returns (address[] memory _member) {
    _member = new address[](3);
    _member[0] = member1;
    _member[1] = member2;
    _member[2] = member3;
  }

  /// @dev Deterministically generates `n` pseudo-members for fuzzing.
  function _makeMembers(uint256 n) internal pure returns (address[] memory _member) {
    _member = new address[](n);
    for (uint256 i = 0; i < n; i++) {
      _member[i] = address(uint160(uint256(keccak256(abi.encodePacked(i, 'SAFETYNET_MEMBER')))));
    }
  }

  /// @dev Mint `amount` tokens to `who` and grant unlimited approval to `spender`.
  function _mintApprove(address who, uint256 amount, address spender) internal {
    token.mint(who, amount);
    vm.startPrank(who);
    token.approve(spender, type(uint256).max);
    vm.stopPrank();
  }

  /// @dev Convenience: mint + approve, then deposit `value` for `who` into fund `id`.
  function _depositAs(address who, uint256 id, uint256 value) internal {
    uint256 due = _safetyNet.duesRemainingThisEpoch(id, who);
    if (due == 0) return;

    uint256 amt = value > due ? due : value;
    // Onboarding: first deposit must be exactly initialDeposit
    if (!_safetyNet.hasMadeFirstDeposit(id, who)) {
      amt = safeCfg.initialDeposit;
    }

    uint256 needed = amt + safeCfg.fixedDeposit + safeCfg.initialDeposit;
    token.mint(who, needed);

    vm.startPrank(who);
    token.approve(address(_safetyNet), type(uint256).max);
    _safetyNet.deposit(id, amt);
    vm.stopPrank();
  }

  /**
   * @dev Deploys an *isolated* SafetyNet+token pair to avoid state coupling with the base instance.
   * Useful for tests that need independent economics (e.g., ratio experiments).
   */
  function _deployIsolatedFund() internal returns (SafetyNet localFund, MockERC20 localToken) {
    localToken = new MockERC20('TestToken', 'TST');
    vm.label(address(localToken), 'Local_TestToken');

    SafetyNet impl = new SafetyNet();
    vm.label(address(impl), 'Local_SafetyNet_Impl');
    bytes memory init = abi.encodeWithSelector(SafetyNet.initialize.selector, address(this));

    address proxyAdminAddr = address(0xA11C3);
    vm.label(proxyAdminAddr, 'Local_ProxyAdmin');

    TransparentUpgradeableProxy localProxy = new TransparentUpgradeableProxy(address(impl), proxyAdminAddr, init);
    vm.label(address(localProxy), 'Local_SafetyNet_Proxy');

    localFund = SafetyNet(address(localProxy));
    vm.label(address(localFund), 'Local_SafetyNet');
    localFund.setTokenAllowed(address(localToken), true);
  }

  /// @dev Local version of mint+approve for isolated token/fund pairs.
  function _mintApproveLocal(MockERC20 tkn, address who, uint256 amount, address spender) internal {
    tkn.mint(who, amount);
    vm.startPrank(who);
    tkn.approve(spender, type(uint256).max);
    vm.stopPrank();
  }

  /// @dev Picks an address from `arr` using `seed` (modulo).
  function _pick(address[] memory arr, uint256 seed) internal pure returns (address) {
    return arr[seed % arr.length];
  }

  /// @dev Helper to ensure the per-epoch small-withdraw counter never exceeds the limit.
  function _assertSmallCounterBound(uint256 _id, uint256 epochIdx, address who, uint256 limit) internal view {
    uint256 cnt = _safetyNet.smallWithdrawsCount(_id, epochIdx, who);
    assertLe(cnt, limit, 'small-withdraw counter bounded by limit');
  }
}
