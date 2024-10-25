export function base64ToUint8Array(base64: string): Uint8Array {
	const binaryString = atob(base64);
	return new Uint8Array(binaryString.length).map((_, i) =>
		binaryString.charCodeAt(i),
	);
}

const encoder = new TextEncoder();

export async function hashData(data: string) {
	const dataBuffer = encoder.encode(data);
	const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
