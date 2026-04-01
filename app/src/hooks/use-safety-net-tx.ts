import { ContractFunctionName, ContractFunctionArgs } from "viem";
import { safetyNetAbi } from "@/lib/abis/safety-net";
import { SAFETY_NET_ADDRESS } from "@/lib/constants";
import { useSimulateAndSponsorTx } from "./use-simulate-and-sponsor-tx";
import { useSponsoredTx } from "./use-sponsored-tx";

type SafetyNetAbi = typeof safetyNetAbi;

export const useSafetyNetTx = () => {
  const { simulateAndSponsorTx } = useSimulateAndSponsorTx();
  const { sendSponsoredTransaction } = useSponsoredTx();

  const sendSafetyNetTx = async <
    TFunctionName extends ContractFunctionName<SafetyNetAbi, "nonpayable">,
  >(params: {
    functionName: TFunctionName;
    args: ContractFunctionArgs<SafetyNetAbi, "nonpayable", TFunctionName>;
    options?: Parameters<typeof sendSponsoredTransaction>[1];
  }) => {
    return simulateAndSponsorTx({
      address: SAFETY_NET_ADDRESS,
      abi: safetyNetAbi,
      ...params,
    });
  };

  return { sendSafetyNetTx };
};
