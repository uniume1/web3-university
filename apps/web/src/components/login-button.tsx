import { usePrivy } from "@privy-io/react-auth";

export function LoginButton() {
	const { ready, authenticated, login, logout } = usePrivy();

	if (!ready)
		return (
			<button type="button" disabled>
				初始化钱包…
			</button>
		);

	return authenticated ? (
		<button type="button" onClick={logout}>
			退出
		</button>
	) : (
		<button type="button" onClick={login}>
			登录
		</button>
	);
}
