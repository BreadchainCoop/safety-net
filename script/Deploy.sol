// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TransparentUpgradeableProxy} from '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol';

import {Common} from 'script/Common.sol';
import {DelegatedSafetyNet} from 'src/contracts/DelegatedSafetyNet.sol';
import {SafetyNet} from 'src/contracts/SafetyNet.sol';

/**
 * @title Deploy
 * @notice Deploys the full SafetyNet stack in one broadcast: implementation + TransparentProxy
 *         (with its internal ProxyAdmin) and the standalone {DelegatedSafetyNet} extension
 *         pointed at the fresh proxy.
 * @dev Env:
 *      - PRIVATE_KEY     deployer key (optional; falls back to the script sender)
 *      - ADMIN_ADDRESS   proxy admin owner / SafetyNet owner (optional; defaults to deployer)
 *      - ALLOWED_TOKENS  comma-separated ERC20 addresses to allowlist (optional). Only applied
 *                        when the deployer is the admin — otherwise allowlisting stays a
 *                        documented post-deploy admin action.
 */
contract Deploy is Common {
  function run() public {
    uint256 _privateKey = vm.envOr('PRIVATE_KEY', uint256(0));
    address _deployer = _privateKey == 0 ? msg.sender : vm.addr(_privateKey);
    address _admin = vm.envOr('ADMIN_ADDRESS', _deployer);
    address[] memory _allowedTokens = vm.envOr('ALLOWED_TOKENS', ',', new address[](0));

    if (_privateKey == 0) {
      vm.startBroadcast();
    } else {
      vm.startBroadcast(_privateKey);
    }

    TransparentUpgradeableProxy _proxy = _deployContracts(_admin);

    new DelegatedSafetyNet(address(_proxy));

    if (_admin == _deployer) {
      for (uint256 i = 0; i < _allowedTokens.length; i++) {
        SafetyNet(address(_proxy)).setTokenAllowed(_allowedTokens[i], true);
      }
    }

    vm.stopBroadcast();
  }
}
