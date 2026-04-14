import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export interface TokenPayload extends JWTPayload {
  sub: string;
  email: string;
}

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signToken(
  payload: { sub: string; email: string },
  secret: string,
  expiresIn: string,
): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(encodeSecret(secret));
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, encodeSecret(secret));
  return payload as TokenPayload;
}
