import {
  createWalletClient,
  hexToBigInt,
  http,
  numberToHex,
  SwitchChainError,
  type Address,
  type Chain,
  type EIP1193Parameters,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createConnector } from "wagmi";

type DevProvider = {
  request(args: EIP1193Parameters): Promise<unknown>;
};

/**
 * VERIFY-MODE ONLY. A wagmi connector backed by a local viem account built
 * from a private key, so the app can sign and send real transactions on
 * Gnosis without a browser extension (used for E2E onchain testing).
 *
 * It exposes a minimal EIP-1193 provider: account/sign/send requests are
 * served by the local wallet client, everything else is proxied to the RPC.
 * All app hooks (useWriteContract, useSignTypedData, …) work unchanged.
 */
export function devWalletConnector({
  privateKey,
  chain,
  rpcUrl,
}: {
  privateKey: Hex;
  chain: Chain;
  rpcUrl: string;
}) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
  const rpc = http(rpcUrl)({ chain });

  const provider: DevProvider = {
    async request({ method, params }: EIP1193Parameters): Promise<unknown> {
      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return [account.address];
        case "eth_chainId":
          return numberToHex(chain.id);
        case "eth_sendTransaction": {
          const [tx] = params as [
            { to?: Address; data?: Hex; value?: Hex; gas?: Hex },
          ];
          return walletClient.sendTransaction({
            to: tx.to,
            data: tx.data,
            value: tx.value ? hexToBigInt(tx.value) : undefined,
            gas: tx.gas ? hexToBigInt(tx.gas) : undefined,
          });
        }
        case "personal_sign": {
          const [message] = params as [Hex, Address];
          return walletClient.signMessage({ message: { raw: message } });
        }
        case "eth_signTypedData_v4": {
          const [, typedData] = params as [Address, string];
          return walletClient.signTypedData(JSON.parse(typedData));
        }
        default:
          return rpc.request({ method, params } as EIP1193Parameters);
      }
    },
  };

  return createConnector<DevProvider>((config) => ({
    id: "devWallet",
    name: "Dev Wallet (verify mode)",
    type: "devWallet" as const,
    async connect<withCapabilities extends boolean = false>(parameters?: {
      chainId?: number | undefined;
      isReconnecting?: boolean | undefined;
      withCapabilities?: withCapabilities | boolean | undefined;
    }) {
      const accounts = (parameters?.withCapabilities
        ? [{ address: account.address, capabilities: {} }]
        : [account.address]) as unknown as withCapabilities extends true
        ? readonly {
            address: Address;
            capabilities: Record<string, unknown>;
          }[]
        : readonly Address[];
      return { accounts, chainId: chain.id };
    },
    async disconnect() {},
    async getAccounts() {
      return [account.address];
    },
    async getChainId() {
      return chain.id;
    },
    async getProvider() {
      return provider;
    },
    async isAuthorized() {
      return true;
    },
    async switchChain({ chainId }) {
      const target = config.chains.find((c) => c.id === chainId);
      if (!target)
        throw new SwitchChainError(new Error(`Chain ${chainId} not supported`));
      return target;
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}
