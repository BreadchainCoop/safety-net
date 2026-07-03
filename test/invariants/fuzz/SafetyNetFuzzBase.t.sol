// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ───────────────────────────── Imports ─────────────────────────────

import {ProxyAdmin} from '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol';
import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';
import {Test} from 'forge-std/Test.sol';

import {InviteGenerator} from 'script/InviteGenerator.sol';
import {SafetyNet} from 'src/contracts/SafetyNet.sol';
import {ISafetyNet} from 'src/interfaces/ISafetyNet.sol';

import {MockERC20} from 'test/mocks/MockERC20.sol';

/// @notice Shared base for all fuzz suites: deploys proxy + token, provides defaults & helpers.
abstract contract SafetyNetFuzzBase is Test {
  // Implementation / proxy
  SafetyNet internal _implementation;
  SafetyNet internal _safetyNet;
  ProxyAdmin internal _proxyAdmin;
  TransparentUpgradeableProxy internal _proxy;

  // Token
  MockERC20 internal _token;

  // Invite signing helper (nets are populated via owner-signed invites)
  InviteGenerator internal _inviteGenerator;
  uint256 internal _inviteNonce;

  // Baseline members; _member1 owns the nets under test and signs invites, so it has a key
  address internal _owner;
  address internal _member1;
  uint256 internal _member1Key;
  address internal _member2;
  address internal _member3;
  address[] internal _defaultMembers;

  // Safe default template (filled in setUp)
  ISafetyNet.SafetyNet internal _safeCfg;

  // Defaults (chosen to be permissive but safe for fuzzing)
  uint256 internal constant _SAFE_MIN_MEMBERS = 3;
  uint256 internal constant _SAFE_MAX_MEMBERS = 10;
  uint256 internal constant _SAFE_CONTEST = 33; // percentage
  uint256 internal constant _SAFE_INITIAL_DEPOSIT = 225e18;
  uint256 internal constant _SAFE_FIXED_DEPOSIT = 50e18;
  uint256 internal constant _SAFE_RATIO = 1; // 1x
  uint256 internal constant _SAFE_AUTO_THRESHOLD = 150e18;
  uint256 internal constant _SAFE_CONTEST_WINDOW = 1 days;
  uint256 internal constant _SAFE_EPOCH_DURATION = 30 days;
  uint256 internal constant _SAFE_SMALL_WITHDRAWS_LIMIT = 3;

  /**
   * setUp
   * - Creates a proxy-admin + proxy-wrapped SafetyNet, initialized with `_owner`.
   * - Deploys and allow-lists a MockERC20 used across tests.
   * - Prepares a baseline config `safeCfg` reused by fuzz suites.
   */
  function setUp() public virtual {
    // actors (_member1 signs invites and calls start() as the per-net owner)
    (_member1, _member1Key) = makeAddrAndKey('member1');
    _member2 = address(0xB0B);
    _member3 = address(0xC0C0A);
    _owner = address(this);
    _defaultMembers = _threeMembers();

    // token
    _token = new MockERC20('Mock', 'MOCK');
    vm.label(address(_token), 'MockERC20');

    // invite generator (must match the contract's EIP-712 invite domain)
    _inviteGenerator = new InviteGenerator('SafetyNetInvite', '1', 'safetyNet');

    // implementation + proxy admin
    _implementation = new SafetyNet();
    vm.label(address(_implementation), 'SafetyNet_Impl');
    _proxyAdmin = new ProxyAdmin(_owner);
    vm.label(address(_proxyAdmin), 'ProxyAdmin');

    // proxy (initialize owner)
    bytes memory initData = abi.encodeWithSelector(SafetyNet.initialize.selector, _owner);
    _proxy = new TransparentUpgradeableProxy(address(_implementation), address(_proxyAdmin), initData);
    vm.label(address(_proxy), 'SafetyNet_Proxy');

    // use proxy via impl ABI
    _safetyNet = SafetyNet(address(_proxy));
    vm.label(address(_safetyNet), 'SafetyNet');

    // allow token
    _safetyNet.setTokenAllowed(address(_token), true);

    // default config template (creation shape: empty members, zero start time)
    ISafetyNet.SafetyNet memory cfg;
    cfg.id = 0;
    cfg.owner = _member1;
    cfg.minimumMembers = _SAFE_MIN_MEMBERS;
    cfg.maximumMembers = _SAFE_MAX_MEMBERS;
    cfg.contestThreshold = _SAFE_CONTEST;
    cfg.safetyNetStart = 0; // stamped by start()
    cfg.token = address(_token);
    cfg.members = new address[](0);
    cfg.initialDeposit = _SAFE_INITIAL_DEPOSIT;
    cfg.fixedDeposit = _SAFE_FIXED_DEPOSIT;
    cfg.redeemRatio = _SAFE_RATIO;
    cfg.autoThreshold = _SAFE_AUTO_THRESHOLD;
    cfg.contestWindow = _SAFE_CONTEST_WINDOW;
    cfg.epochDuration = _SAFE_EPOCH_DURATION;
    cfg.smallWithdrawsLimit = _SAFE_SMALL_WITHDRAWS_LIMIT;
    _safeCfg = cfg;

    // labels (nice for traces)
    vm.label(_owner, 'Owner');
    vm.label(_member1, 'Member1');
    vm.label(_member2, 'Member2');
    vm.label(_member3, 'Member3');
  }

  // ───────────── Helpers (reused across suites) ─────────────

  /// @dev Returns the canonical three default members.
  function _threeMembers() internal view returns (address[] memory _member) {
    _member = new address[](3);
    _member[0] = _member1;
    _member[1] = _member2;
    _member[2] = _member3;
  }

  /// @dev Deterministically generates `n` pseudo-members for fuzzing.
  ///      Slot 0 is `_member1` (the keyed net owner) so member counts match the desired size.
  function _makeMembers(uint256 n) internal view returns (address[] memory _member) {
    _member = new address[](n);
    _member[0] = _member1;
    for (uint256 i = 1; i < n; i++) {
      _member[i] = address(uint160(uint256(keccak256(abi.encodePacked(i, 'SAFETYNET_MEMBER')))));
    }
  }

  /**
   * @dev Creates a net owned by `_member1`, joins every other listed member via an
   *      owner-signed invite, then start()s it — mirroring the production onboarding flow.
   *      `allMembers` must include `_member1` and fit within `cfg.maximumMembers`.
   */
  function _createStarted(ISafetyNet.SafetyNet memory cfg, address[] memory allMembers) internal returns (uint256 _id) {
    cfg.owner = _member1;
    cfg.members = new address[](0);
    cfg.safetyNetStart = 0;
    _id = _safetyNet.create('', cfg);

    for (uint256 i = 0; i < allMembers.length; i++) {
      if (allMembers[i] == _member1) continue;
      uint256 nonce = ++_inviteNonce;
      bytes memory signature = _inviteGenerator.generateInvite(_member1Key, _id, nonce, address(_safetyNet));
      vm.prank(allMembers[i]);
      _safetyNet.redeemInvite(ISafetyNet.Invite(_id, nonce), signature);
    }

    vm.prank(_member1);
    _safetyNet.start(_id);
  }

  /// @dev Mint `amount` tokens to `who` and grant unlimited approval to `spender`.
  function _mintApprove(address who, uint256 amount, address spender) internal {
    _token.mint(who, amount);
    vm.startPrank(who);
    _token.approve(spender, type(uint256).max);
    vm.stopPrank();
  }

  /// @dev Convenience: mint + approve, then deposit `value` for `who` into fund `id`.
  function _depositAs(address who, uint256 id, uint256 value) internal {
    uint256 due = _safetyNet.duesRemainingThisEpoch(id, who);
    if (due == 0) return;

    uint256 amt = value > due ? due : value;
    // Onboarding: first deposit must be exactly initialDeposit
    if (_safetyNet.safetyNetMemberContribute(id, who) == 0) {
      amt = _safeCfg.initialDeposit;
    }

    uint256 needed = amt + _safeCfg.fixedDeposit + _safeCfg.initialDeposit;
    _token.mint(who, needed);

    vm.startPrank(who);
    _token.approve(address(_safetyNet), type(uint256).max);
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
