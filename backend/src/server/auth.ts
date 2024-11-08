export async function handleAuth(request: Request, url: URL): Promise<Response> {
  if (url.pathname === "/auth/login/wallet") {
    return new Response("Not Implemented", { status: 501 });
	}
	return new Response("Not Found", { status: 404 });
}
