import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { bildirimMetni } from './bildirim-metin';
import type { Eslesme } from './tipler';

/**
 * BİLDİRİM — yeni eşleşmeleri Firebase Cloud Messaging "konu"larına gönderir.
 * Konu adı = taramaId (ör. "topuk-donusu"); kullanıcı uygulamada hangi
 * taramaya abone olduysa o konuya kayıtlıdır. Token saklayan sunucu yok.
 *
 * Gerekli gizli değer: FCM_SERVIS_HESABI (service account JSON, base64).
 * Yoksa sessizce atlanır; tarama yine çalışır.
 */
// npm betikleri proje kökünden çalışır.
const KOK = process.cwd();

async function erisimAnahtari(hesap: { client_email: string; private_key: string; token_uri: string }): Promise<string> {
  const simdi = Math.floor(Date.now() / 1000);
  const baslik = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const govde = b64(JSON.stringify({
    iss: hesap.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: hesap.token_uri,
    iat: simdi,
    exp: simdi + 3600,
  }));
  const { createSign } = await import('node:crypto');
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

const b64 = (s: string) => Buffer.from(s).toString('base64url');

async function main() {
  const ham = process.env.FCM_SERVIS_HESABI;
  if (!ham) {
    console.log('FCM_SERVIS_HESABI yok, bildirim atlandı.');
    return;
  }
  const hesap = JSON.parse(Buffer.from(ham, 'base64').toString('utf8')) as { project_id: string; client_email: string; private_key: string; token_uri: string };
  const { eslesmeler } = JSON.parse(readFileSync(join(KOK, 'docs', 'tarama', 'yeni.json'), 'utf8')) as { eslesmeler: Eslesme[] };
  const alSinyalleri = eslesmeler.filter((e) => e.yon === 'al' || e.yon === 'sat');
  if (!alSinyalleri.length) {
    console.log('Yeni al/sat eşleşmesi yok.');
    return;
  }
  const anahtar = await erisimAnahtari(hesap);
  // Konu başına tek bildirim: "3 hisse Topuk Dönüşü stratejisine uydu: THYAO, SISE, EREGL."
  const konular = new Map<string, Eslesme[]>();
  for (const e of alSinyalleri) konular.set(e.taramaId, [...(konular.get(e.taramaId) ?? []), e]);
  for (const [konu, liste] of konular) {
    const metin = bildirimMetni(konu, liste);
    if (!metin) continue;
    const govde = {
      message: {
        topic: konu,
        notification: { title: metin.baslik, body: metin.govde },
        data: { taramaId: konu },
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
