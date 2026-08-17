import uniTokenAbiJson from "./abi/UNIToken.json" with { type: "json" }
import courseMarketAbiJson from "./abi/CourseMarket.json" with { type: "json" }
import certificateAbiJson from "./abi/CourseCertificate.json" with { type: "json" }
export * from "./uniswap"
export const CHAIN_ID = 11155111 as const
export const ydTokenAbi = uniTokenAbiJson
export const courseMarketAbi = courseMarketAbiJson
export const certificateAbi = certificateAbiJson

export const addresses = {
  11155111: {
    uniToken: "0xE8D3268314eA1e4Fc7d829d793Fbc4771BE70D65" as const,
    courseMarket: "0x20F516bDB1539d4d608E1EF72dB2754a680Cade2" as const,
    certificate: null as `0x${string}` | null,
  },
} as const
