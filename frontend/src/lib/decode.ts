export function base64ToUint8Array(base64: string): Uint8Array {
	const binaryString = atob(base64)
	return new Uint8Array(binaryString.length).map((_, i) => binaryString.charCodeAt(i))
}
