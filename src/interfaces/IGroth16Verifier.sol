// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Groth16 Verifier Interface
/// @notice Minimal interface of a snarkjs-generated Groth16 verifier (`snarkjs zkey export solidityverifier`)
/// @dev One verifier is deployed per compiled ZK Email flu blueprint (one per healthcare sender domain).
///      The public-signal array size is fixed by the canonical flu blueprint layout — see
///      {IZkEmailFluVerifier} for the layout and docs/zk-email-flu-claims.md for the blueprint spec.
/// @author @RonTuretzky
interface IGroth16Verifier {
  /// @notice Verifies a Groth16 proof against the verifier's embedded verification key
  /// @param _pA The proof's A point
  /// @param _pB The proof's B point
  /// @param _pC The proof's C point
  /// @param _pubSignals The circuit's public signals (FluClaimV2 layout, 6 signals)
  /// @return _valid True when the proof is valid for the given public signals
  function verifyProof(
    uint256[2] calldata _pA,
    uint256[2][2] calldata _pB,
    uint256[2] calldata _pC,
    uint256[6] calldata _pubSignals
  ) external view returns (bool _valid);
}
