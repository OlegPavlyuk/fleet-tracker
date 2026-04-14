import argon2 from 'argon2';

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, plaintext);
}
