// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Common} from 'script/Common.sol';
import {GNOSIS_BREAD, GNOSIS_XDAI} from 'script/Registry.sol';

contract Deploy is Common {
  function run() public {
    address admin = vm.envAddress('ADMIN_ADDRESS');
    vm.startBroadcast();

    address[] memory tokens = new address[](2);
    tokens[0] = GNOSIS_BREAD;
    tokens[1] = GNOSIS_XDAI;

    _deployContracts(admin, tokens);

    vm.stopBroadcast();
  }
}
