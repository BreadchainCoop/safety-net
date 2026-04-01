import { defineChain } from "viem";
import { foundry } from "wagmi/chains";

export const foundryChain = defineChain({
  ...foundry,
  id: 31337,
});
