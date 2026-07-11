/**
 * Minimal BREAD token ABI.
 *
 * BREAD (Breadchain) is minted 1:1 from xDAI by sending native value to the
 * payable `mint(address receiver)` function — mirrors app-stacks'
 * `src/lib/abis/bread-abi.ts` (used by use-auto-bake-bread / use-watch-funded-xdai):
 *
 *   { name: "mint", stateMutability: "payable",
 *     inputs: [{ name: "receiver", type: "address" }], outputs: [] }
 *
 * We include `balanceOf` too so callers don't need a second ERC20 ABI import.
 */
export const breadAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [{ name: "receiver", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
