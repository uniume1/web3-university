import type { ConnectedWallet } from "@privy-io/react-auth";
import {
	type Address,
	createPublicClient,
	createWalletClient,
	custom,
	http,
} from "viem";
import { sepolia } from "viem/chains";

const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL;
if (!rpcUrl) throw new Error("VITE_SEPOLIA_RPC_URL is required");

export const publicClient = createPublicClient({
	chain: sepolia,
	transport: http(rpcUrl),
});

export async function getWalletClient(wallet: ConnectedWallet) {
	await wallet.switchChain(sepolia.id);
	const provider = await wallet.getEthereumProvider();
	return createWalletClient({
		account: wallet.address as Address,
		chain: sepolia,
		transport: custom(provider),
	});
}
