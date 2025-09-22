// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;



// ───────────────────────────── Imports ─────────────────────────────
import {Test} from "forge-std/Test.sol";
import {SafetyNet} from "src/contracts/SafetyNet.sol";
import {ISafetyNet} from "src/interfaces/ISafetyNet.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/proxy/transparent/ProxyAdmin.sol";
import {MockERC20} from "test/mocks/MockERC20.sol";

/// @notice Shared base for all fuzz suites: deploys proxy + token, provides defaults & helpers.
abstract contract SafetyNetFuzzBase is Test {
  // Implementation / proxy
  SafetyNet internal implementation;
  SafetyNet internal safetyNet;
  ProxyAdmin internal proxyAdmin;
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
    token = new MockERC20("Mock", "MOCK");
    vm.label(address(token), "MockERC20");

    // implementation + proxy admin
    implementation = new SafetyNet();
    vm.label(address(implementation), "SafetyNet_Impl");
    proxyAdmin = new ProxyAdmin(owner_);
    vm.label(address(proxyAdmin), "ProxyAdmin");

    // proxy (initialize owner)
    bytes memory initData = abi.encodeWithSelector(SafetyNet.initialize.selector, owner_);
    proxy = new TransparentUpgradeableProxy(address(implementation), address(proxyAdmin), initData);
    vm.label(address(proxy), "SafetyNet_Proxy");

    // use proxy via impl ABI
    safetyNet = SafetyNet(address(proxy));
    vm.label(address(safetyNet), "SafetyNet");

    // allow token
    safetyNet.setTokenAllowed(address(token), true);

    // default config template
    ISafetyNet.SafetyNet memory cfg;
    cfg.id = 0;
    cfg.owner = owner_;
    cfg.minimumMembers = SAFE_MIN_MEMBERS;
    cfg.maximumMembers = SAFE_MAX_MEMBERS;
    cfg.consensusThreshold = SAFE_CONSENSUS;
    cfg.safetyNetStart = block.timestamp + 1 days; // future by default
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

    // labels (nice for traces)
    vm.label(owner_, "Owner");
    vm.label(member1, "Member1");
    vm.label(member2, "Member2");
    vm.label(member3, "Member3");
  }

  // ───────────── Helpers (reused across suites) ─────────────

  /// @dev Returns the canonical three default members.
  function _threeMembers() internal view returns (address[] memory m) {
    m = new address[](3);
    m[0] = member1; m[1] = member2; m[2] = member3;
  }

  /// @dev Deterministically generates `n` pseudo-members for fuzzing.
  function _makeMembers(uint256 n) internal pure returns (address[] memory m) {
    m = new address[](n);
    for (uint256 i = 0; i < n; i++) {
      m[i] = address(uint160(uint256(keccak256(abi.encodePacked(i, "SAFETYNET_MEMBER")))));
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
    uint256 needed = value + safeCfg.initialDeposit + safeCfg.fixedDeposit;
    token.mint(who, needed);
    vm.startPrank(who);
    token.approve(address(safetyNet), type(uint256).max);
    safetyNet.deposit(id, value);
    vm.stopPrank();
  }

  /**
   * @dev Deploys an *isolated* SafetyNet+token pair to avoid state coupling with the base instance.
   * Useful for tests that need independent economics (e.g., ratio experiments).
   */
  function _deployIsolatedFund() internal returns (SafetyNet localFund, MockERC20 localToken) {
    localToken = new MockERC20("TestToken", "TST");
    vm.label(address(localToken), "Local_TestToken");

    SafetyNet impl = new SafetyNet();
    vm.label(address(impl), "Local_SafetyNet_Impl");
    bytes memory init = abi.encodeWithSelector(SafetyNet.initialize.selector, address(this));

    address proxyAdminAddr = address(0xA11C3);
    vm.label(proxyAdminAddr, "Local_ProxyAdmin");

    TransparentUpgradeableProxy localProxy =
      new TransparentUpgradeableProxy(address(impl), proxyAdminAddr, init);
    vm.label(address(localProxy), "Local_SafetyNet_Proxy");

    localFund = SafetyNet(address(localProxy));
    vm.label(address(localFund), "Local_SafetyNet");
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
  function _assertSmallCounterBound(
    uint256 _id, uint256 epochIdx, address who, uint256 limit
  ) internal view {
    uint256 cnt = safetyNet.smallWithdrawsCount(_id, epochIdx, who);
    assertLe(cnt, limit, "small-withdraw counter bounded by limit");
  }
}