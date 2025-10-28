﻿import { v4 as uuid } from "uuid";
import { getUserByAddress } from "./client.js";

const SESSION_KEY = "fc_session";

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function signInWithWallet() {
  if (!window.ethereum) {
    throw new Error("Кошелёк не найден (window.ethereum отсутствует)");
  }
  
  const [address] = await window.ethereum.request({ method: "eth_requestAccounts" });
  const siweLikeMessage = [
    "Sign-in with Ethereum (mock, no server verification).",
    `Address: ${address}`,
    `Nonce: ${uuid()}`,
    `IssuedAt: ${new Date().toISOString()}`,
    "Domain: localhost"
  ].join("\n");
  
  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: [siweLikeMessage, address]
  });

  // Получаем профиль Farcaster
  let farcasterProfile = null;
  try {
    const userData = await getUserByAddress(address);
    if (userData?.user) {
      farcasterProfile = {
        fid: userData.user.fid,
        username: userData.user.username,
        display_name: userData.user.display_name,
        pfp_url: userData.user.pfp_url
      };
    }
  } catch (error) {
    console.warn("Не удалось получить профиль Farcaster:", error);
  }

  const session = {
    schemaVersion: "1.0.0",
    address,
    signature,
    issuedAt: new Date().toISOString(),
    farcaster: farcasterProfile,
    mock: import.meta.env.VITE_FARCASTER_MOCK === "true"
  };
  
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
}
