import certificateAbiJson from "./abi/CourseCertificate.json" with {
	type: "json",
};
import courseMarketAbiJson from "./abi/CourseMarket.json" with { type: "json" };
import uniTokenAbiJson from "./abi/UNIToken.json" with { type: "json" };

export * from "./uniswap";

export const CHAIN_ID = 11155111 as const;

export const ydTokenAbi = uniTokenAbiJson;
export const courseMarketAbi = courseMarketAbiJson;
export const certificateAbi = certificateAbiJson;

export const addresses = {
	11155111: {
		// 你的 UNI 代币地址 (原名 UNIToken)
		uniToken: "0xE8D3268314eA1e4Fc7d829d793Fbc4771BE70D65" as const,
		// mUSDC 地址
		mUSDC: "0xed7D31ECd4CBb628aa98270Cd00700E4f1de03c7" as const,
		// WETH 地址
		weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as const,
		// CourseMarket 地址
		courseMarket: "0x20F516bDB1539d4d608E1EF72dB2754a680Cade2" as const,
		// 证书合约地址 (如果已部署)
		certificate: "0x5809bd5ab25479D8E911CEFbe569198A95fDeeac" as
			| `0x${string}`
			| null,
		// Uniswap Router 地址
		swapRouter02: "0x3bFA4769FB09eefC5a80d6E87C3B9C650f7Ae48E" as const,
		// Uniswap Quoter 地址
		quoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3" as const,
	},
} as const;
