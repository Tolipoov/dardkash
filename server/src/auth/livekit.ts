import { AccessToken } from "livekit-server-sdk";

const API_KEY = process.env.LIVEKIT_API_KEY as string;
const API_SECRET = process.env.LIVEKIT_API_SECRET as string;

// Har bir foydalanuvchi uchun, faqat MA'LUM bir xonaga kirishga ruxsat
// beruvchi, vaqtinchalik (1 soatlik) token yaratadi.
export async function createLiveKitToken(roomName: string, userId: string, nickname: string) {
  const token = new AccessToken(API_KEY, API_SECRET, {
    identity: userId,
    name: nickname,
    ttl: "1h",
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  return token.toJwt();
}
