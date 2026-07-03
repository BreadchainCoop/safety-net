// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Common} from 'script/Common.sol';

contract Deploy is Common {
  function run() public {
    uint256 _privateKey = vm.envOr('PRIVATE_KEY', uint256(0));
    address _deployer = _privateKey == 0 ? msg.sender : vm.addr(_privateKey);
    address _admin = vm.envOr('ADMIN_ADDRESS', _deployer);

    if (_privateKey == 0) {
      vm.startBroadcast();
    } else {
      vm.startBroadcast(_privateKey);
    }

    _deployContracts(_admin);

    vm.stopBroadcast();
  }
}
