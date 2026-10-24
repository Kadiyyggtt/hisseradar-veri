import { createSign } from 'node:crypto';

import type { BildirimMetni } from './bildirim-metin';

/**
 * FCM GÖNDERİCİ — servis hesabından erişim anahtarı alır ve konuya mesaj atar.
 * bildirim.ts (yeni eşleşme, hedef) ve brifing.ts (sabah/hafta) ortak kullanır.
 */
export type Hesap = { project_id: string; client_email: string; private_key: string; token_uri: string };

export function hesabiOku(): Hesap | null {
  const ham = process.env.FCM_SERVIS_HESABI;
  if (!ham) return null;
  return JSON.parse(Buffer.from(ham, 'base64').toString('utf8')) as Hesap;
}

const b64 = (s: string) => Buffer.from(s).toString('base64url');

export async function erisimAnahtari(hesap: Hesap): Promise<string> {
  const simdi = Math.floor(Date.now() / 1000);
  const baslik = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const govde = b64(JSON.stringify({
    iss: hesap.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: hesap.token_uri,
    iat: simdi,
    exp: simdi + 3600,
  }));
  const imza = createSign('RSA-SHA256').update(`${baslik}.${govde}`).sign(hesap.private_key);
  const jwt = `${baslik}.${govde}.${imza.toString('base64url')}`;
  const c = await fetch(hesap.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const j = (await c.json()) as { access_token?: string; error?: string };
  if (!j.access_token) throw new Error(`erişim anahtarı alınamadı: ${j.error}`);
  return j.access_token;
}

export async function gonder(hesap: Hesap, anahtar: string, konu: string, metin: BildirimMetni, veri: Record<string, string>): Promise<void> {
  const govde = {
    message: {
      topic: konu,
      notification: { title: metin.baslik, body: metin.govde },
      data: veri,
      // Android: küçük simge ve renk uygulamanın manifestindeki varsayılanla aynı (plugins/with-bildirim-simgesi.js);
      // aynı konunun yeni bildirimi eskisinin yerine geçer (tag).
      android: { priority: 'high', notification: { icon: 'ic_bildirim', color: '#22B383', tag: konu } },
      apns: { payload: { aps: { sound: 'default', 'thread-id': konu } } },
    },
  };
  const c = await fetch(`https://fcm.googleapis.com/v1/projects/${hesap.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${anahtar}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(govde),
  });
  console.log(konu, c.status, c.ok ? 'gönderildi' : await c.text());
}
