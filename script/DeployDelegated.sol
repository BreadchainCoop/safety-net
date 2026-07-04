// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from 'forge-std/Script.sol';
import {DelegatedSafetyNet} from 'src/contracts/DelegatedSafetyNet.sol';

/**
 * @title DeployDelegated
 * @notice Deploys the standalone {DelegatedSafetyNet} extension pointed at an existing SafetyNet proxy.
 * @dev Set `SAFETY_NET_ADDRESS` to the deployed SafetyNet proxy. Optionally set `PRIVATE_KEY`.
 */
contract DeployDelegated is Script {
  function run() public {
    uint256 _privateKey = vm.envOr('PRIVATE_KEY', uint256(0));
    address _safetyNet = vm.envAddress('SAFETY_NET_ADDRESS');

    if (_privateKey == 0) {
      vm.startBroadcast();
    } else {
      vm.startBroadcast(_privateKey);
    }

    new DelegatedSafetyNet(_safetyNet);

    vm.stopBroadcast();
  }
}
