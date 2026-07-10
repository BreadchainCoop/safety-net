// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity ^0.8.28;

/// @title FluClaimGroth16Verifier
/// @notice snarkjs-generated Groth16 verifier for the FluClaimV2 (two-email) circuit.
/// @dev GENERATED — do not edit. Rebuild via circuits/scripts/setup-v2.sh. Implements IGroth16Verifier.
contract FluClaimGroth16Verifier {
  // Scalar field size
  uint256 constant r = 21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;
  // Base field size
  uint256 constant q = 21_888_242_871_839_275_222_246_405_745_257_275_088_696_311_157_297_823_662_689_037_894_645_226_208_583;

  // Verification Key data
  uint256 constant alphax = 20_491_192_805_390_485_299_153_009_773_594_534_940_189_261_866_228_447_918_068_658_471_970_481_763_042;
  uint256 constant alphay = 9_383_485_363_053_290_200_918_347_156_157_836_566_562_967_994_039_712_273_449_902_621_266_178_545_958;
  uint256 constant betax1 = 4_252_822_878_758_300_859_123_897_981_450_591_353_533_073_413_197_771_768_651_442_665_752_259_397_132;
  uint256 constant betax2 = 6_375_614_351_688_725_206_403_948_262_868_962_793_625_744_043_794_305_715_222_011_528_459_656_738_731;
  uint256 constant betay1 = 21_847_035_105_528_745_403_288_232_691_147_584_728_191_162_732_299_865_338_377_159_692_350_059_136_679;
  uint256 constant betay2 = 10_505_242_626_370_262_277_552_901_082_094_356_697_409_835_680_220_590_971_873_171_140_371_331_206_856;
  uint256 constant gammax1 = 11_559_732_032_986_387_107_991_004_021_392_285_783_925_812_861_821_192_530_917_403_151_452_391_805_634;
  uint256 constant gammax2 = 10_857_046_999_023_057_135_944_570_762_232_829_481_370_756_359_578_518_086_990_519_993_285_655_852_781;
  uint256 constant gammay1 = 4_082_367_875_863_433_681_332_203_403_145_435_568_316_851_327_593_401_208_105_741_076_214_120_093_531;
  uint256 constant gammay2 = 8_495_653_923_123_431_417_604_973_247_489_272_438_418_190_587_263_600_148_770_280_649_306_958_101_930;
  uint256 constant deltax1 = 5_512_752_561_202_288_730_631_944_053_609_322_874_925_904_764_475_730_247_181_089_410_516_379_786_281;
  uint256 constant deltax2 = 21_277_874_513_143_019_850_768_459_020_805_631_793_485_264_228_009_524_422_182_616_649_160_745_960_567;
  uint256 constant deltay1 = 21_851_995_741_625_046_692_021_660_446_903_102_138_812_077_795_414_158_921_523_162_345_078_900_486_719;
  uint256 constant deltay2 = 20_337_342_148_709_230_241_529_020_584_997_765_080_757_430_024_545_967_779_241_597_747_815_482_435_595;

  uint256 constant IC0x = 6_257_369_414_290_716_832_084_589_835_871_671_797_583_645_620_530_905_791_812_718_631_212_215_637_259;
  uint256 constant IC0y = 4_942_981_644_846_299_833_549_354_790_787_580_992_427_727_884_225_897_219_233_357_429_539_703_178_033;

  uint256 constant IC1x = 11_728_203_670_139_646_157_827_979_431_189_969_553_387_820_141_400_137_478_093_485_540_490_446_984_717;
  uint256 constant IC1y = 12_786_765_748_680_937_692_603_422_960_082_303_097_559_820_017_382_179_095_358_468_578_468_882_015_305;

  uint256 constant IC2x = 11_663_109_546_427_018_202_883_034_215_939_120_919_463_729_175_886_692_124_043_902_823_473_632_169_945;
  uint256 constant IC2y = 1_358_695_511_221_849_361_954_039_899_663_807_478_234_130_366_014_423_234_569_262_291_348_022_145_740;

  uint256 constant IC3x = 1_349_065_628_236_652_843_642_718_299_813_817_048_066_001_399_976_841_060_570_559_248_145_411_793_990;
  uint256 constant IC3y = 9_049_416_795_015_552_728_755_273_740_510_341_252_637_876_855_804_062_789_571_384_590_852_369_900_521;

  uint256 constant IC4x = 16_423_917_022_627_260_895_908_400_096_083_768_085_390_525_641_260_261_845_348_609_777_483_412_360_402;
  uint256 constant IC4y = 177_925_955_356_795_367_623_850_123_193_971_896_250_588_243_824_395_819_851_960_408_664_068_769_292;

  uint256 constant IC5x = 10_520_717_399_892_111_678_297_920_122_352_045_226_306_625_526_912_735_401_922_240_247_100_546_418_306;
  uint256 constant IC5y = 7_747_390_276_954_319_130_156_851_057_866_966_931_239_652_546_060_631_235_336_463_317_808_158_262_263;

  uint256 constant IC6x = 9_469_825_807_004_052_860_223_433_011_121_320_736_648_859_200_529_988_035_034_064_901_632_979_343_993;
  uint256 constant IC6y = 736_227_342_068_682_936_901_721_750_855_341_213_434_581_295_328_545_598_370_099_217_382_025_004_318;

  // Memory data
  uint16 constant pVk = 0;
  uint16 constant pPairing = 128;

  uint16 constant pLastMem = 896;

  function verifyProof(
    uint256[2] calldata _pA,
    uint256[2][2] calldata _pB,
    uint256[2] calldata _pC,
    uint256[6] calldata _pubSignals
  ) public view returns (bool) {
    assembly {
      function checkField(v) {
        if iszero(lt(v, r)) {
          mstore(0, 0)
          return(0, 0x20)
        }
      }

      // G1 function to multiply a G1 value(x,y) to value in an address
      function g1_mulAccC(pR, x, y, s) {
        let success
        let mIn := mload(0x40)
        mstore(mIn, x)
        mstore(add(mIn, 32), y)
        mstore(add(mIn, 64), s)

        success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

        if iszero(success) {
          mstore(0, 0)
          return(0, 0x20)
        }

        mstore(add(mIn, 64), mload(pR))
        mstore(add(mIn, 96), mload(add(pR, 32)))

        success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

        if iszero(success) {
          mstore(0, 0)
          return(0, 0x20)
        }
      }

      function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
        let _pPairing := add(pMem, pPairing)
        let _pVk := add(pMem, pVk)

        mstore(_pVk, IC0x)
        mstore(add(_pVk, 32), IC0y)

        // Compute the linear combination vk_x

        g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))

        g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))

        g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))

        g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))

        g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))

        g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))

        // -A
        mstore(_pPairing, calldataload(pA))
        mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

        // B
        mstore(add(_pPairing, 64), calldataload(pB))
        mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
        mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
        mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

        // alpha1
        mstore(add(_pPairing, 192), alphax)
        mstore(add(_pPairing, 224), alphay)

        // beta2
        mstore(add(_pPairing, 256), betax1)
        mstore(add(_pPairing, 288), betax2)
        mstore(add(_pPairing, 320), betay1)
        mstore(add(_pPairing, 352), betay2)

        // vk_x
        mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
        mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))

        // gamma2
        mstore(add(_pPairing, 448), gammax1)
        mstore(add(_pPairing, 480), gammax2)
        mstore(add(_pPairing, 512), gammay1)
        mstore(add(_pPairing, 544), gammay2)

        // C
        mstore(add(_pPairing, 576), calldataload(pC))
        mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

        // delta2
        mstore(add(_pPairing, 640), deltax1)
        mstore(add(_pPairing, 672), deltax2)
        mstore(add(_pPairing, 704), deltay1)
        mstore(add(_pPairing, 736), deltay2)

        let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

        isOk := and(success, mload(_pPairing))
      }

      let pMem := mload(0x40)
      mstore(0x40, add(pMem, pLastMem))

      // Validate that all evaluations ∈ F

      checkField(calldataload(add(_pubSignals, 0)))

      checkField(calldataload(add(_pubSignals, 32)))

      checkField(calldataload(add(_pubSignals, 64)))

      checkField(calldataload(add(_pubSignals, 96)))

      checkField(calldataload(add(_pubSignals, 128)))

      checkField(calldataload(add(_pubSignals, 160)))

      // Validate all evaluations
      let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

      mstore(0, isValid)
      return(0, 0x20)
    }
  }
}
