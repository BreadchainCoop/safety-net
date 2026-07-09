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
/// @notice snarkjs-generated Groth16 verifier for the FluClaim circuit (demo-key build).
/// @dev GENERATED — do not edit. Rebuild via circuits/scripts/setup.sh. Implements
///      IGroth16Verifier (verifyProof signature matches). One per provider domain in prod.
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
  uint256 constant deltax1 = 17_411_717_933_588_046_537_165_013_954_895_824_738_872_803_576_279_896_457_906_441_805_328_545_149_587;
  uint256 constant deltax2 = 6_065_876_482_064_523_548_371_180_626_310_068_919_944_222_561_272_865_294_790_065_143_519_845_371_081;
  uint256 constant deltay1 = 12_604_978_658_886_783_238_069_015_450_747_050_441_035_331_210_841_889_902_675_224_218_173_256_447_440;
  uint256 constant deltay2 = 20_098_017_854_982_074_893_010_096_129_404_460_363_621_380_585_401_924_753_927_018_619_304_881_125_698;

  uint256 constant IC0x = 4_292_389_876_249_792_613_568_847_346_199_319_932_662_661_500_727_946_890_819_156_452_390_268_139_992;
  uint256 constant IC0y = 11_062_727_938_427_463_396_603_704_012_635_883_214_592_171_538_282_607_977_682_415_998_488_750_114_365;

  uint256 constant IC1x = 18_862_973_560_333_345_786_291_213_393_318_455_211_045_366_716_190_596_592_881_377_190_699_193_924_474;
  uint256 constant IC1y = 2_498_929_634_423_135_862_159_417_231_768_535_023_522_305_379_076_084_515_986_374_078_025_633_109_921;

  uint256 constant IC2x = 7_717_210_913_502_598_739_156_448_563_429_476_628_185_098_924_879_346_089_437_059_450_838_068_672_603;
  uint256 constant IC2y = 11_329_631_948_707_209_898_697_002_841_452_736_122_648_385_343_135_586_098_079_083_481_419_344_511_376;

  uint256 constant IC3x = 3_427_094_662_228_898_570_604_437_842_479_788_764_923_276_787_871_650_476_645_076_783_770_605_037_509;
  uint256 constant IC3y = 9_568_364_377_507_106_824_847_557_006_852_759_042_587_531_860_958_959_392_123_950_612_074_633_876_253;

  uint256 constant IC4x = 19_255_713_541_749_046_073_560_162_808_903_245_943_839_537_290_373_551_354_820_705_247_903_661_096_859;
  uint256 constant IC4y = 6_458_664_500_186_365_032_583_913_337_203_878_666_509_265_315_924_746_411_036_775_405_769_510_098_525;

  uint256 constant IC5x = 18_050_254_831_651_963_370_973_661_288_870_437_663_882_341_186_690_801_209_718_869_622_841_341_684_338;
  uint256 constant IC5y = 1_139_856_196_894_165_209_448_291_129_610_110_229_451_613_754_937_448_481_202_415_951_301_582_796_579;

  uint256 constant IC6x = 13_655_311_329_457_676_955_109_959_062_518_338_568_458_131_300_852_480_573_948_211_820_540_721_743_541;
  uint256 constant IC6y = 10_674_764_558_912_842_046_055_830_775_614_039_044_074_882_210_906_054_583_770_199_439_516_022_933_053;

  uint256 constant IC7x = 3_932_712_616_222_739_507_088_071_571_627_289_882_024_845_964_003_169_640_926_437_759_939_785_786_421;
  uint256 constant IC7y = 20_062_562_112_121_437_842_010_869_363_125_991_337_053_841_495_381_167_653_333_720_297_840_155_766_402;

  // Memory data
  uint16 constant pVk = 0;
  uint16 constant pPairing = 128;

  uint16 constant pLastMem = 896;

  function verifyProof(
    uint256[2] calldata _pA,
    uint256[2][2] calldata _pB,
    uint256[2] calldata _pC,
    uint256[7] calldata _pubSignals
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

        g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))

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

      checkField(calldataload(add(_pubSignals, 192)))

      // Validate all evaluations
      let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

      mstore(0, isValid)
      return(0, 0x20)
    }
  }
}
