import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET as string;

export function signSession(userId: string): string {
  // 30 kun amal qiladigan token — foydalanuvchi qayta-qayta login qilmasin
  return jwt.sign({ userId }, SECRET, { expiresIn: "30d" });
}

export function verifySession(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, SECRET) as { userId: string };
  } catch {
    return null;
  }
}
