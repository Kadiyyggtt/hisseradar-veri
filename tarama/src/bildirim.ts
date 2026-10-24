import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { bildirimMetni, hedefBildirimMetni, hedefKonusu, type BildirimMetni } from './bildirim-metin';
import type { Eslesme, HedefDosyasi, HedefUlasan } from './tipler';

/**
 * BİLDİRİM — Firebase Cloud Messaging "konu"larına iki tür mesaj gönderir:
 *   1. Yeni eşleşme: konu = taramaId (ör. "topuk-donusu"); yeni.json'dan.
 *   2. Hedefe ulaştı: konu = "hedef-BIST-THYAO"; hedef.json'dan. Uygulama bir
 *      hisseyi takibe alınca bu konuya abone olur.
 * Token saklayan sunucu yok.
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

type Hesap = { project_id: string; client_email: string; private_key: string; token_uri: string };

async function gonder(hesap: Hesap, anahtar: string, konu: string, metin: BildirimMetni, veri: Record<string, string>): Promise<void> {
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

function oku<T>(ad: string): T | null {
  const yol = join(KOK, 'docs', 'tarama', ad);
  if (!existsSync(yol)) return null;
  return JSON.parse(readFileSync(yol, 'utf8')) as T;
}

async function main() {
  const ham = process.env.FCM_SERVIS_HESABI;
  if (!ham) {
    console.log('FCM_SERVIS_HESABI yok, bildirim atlandı.');
    return;
  }
  const hesap = JSON.parse(Buffer.from(ham, 'base64').toString('utf8')) as Hesap;
  const yeni = oku<{ uretildi: number; eslesmeler: Eslesme[] }>('yeni.json');
  if (!yeni) throw new Error('yeni.json yok; önce tarama koşmalı.');
  const sinyaller = yeni.eslesmeler.filter((e) => e.yon === 'al' || e.yon === 'sat');
  // Hedef dosyası aynı koşudan olmalı; eski kalmışsa (deneme taraması) yeniden gönderilmez.
  const hedef = oku<HedefDosyasi>('hedef.json');
  const ulasanlar = hedef && hedef.uretildi === yeni.uretildi ? hedef.ulasanlar : [];
  if (!sinyaller.length && !ulasanlar.length) {
    console.log('Yeni al/sat eşleşmesi ve hedefe ulaşan yok.');
    return;
  }
  const anahtar = await erisimAnahtari(hesap);

  // 1. Konu başına tek bildirim: "3 hisse Topuk Dönüşü stratejisine uydu: THYAO, SISE, EREGL."
  const konular = new Map<string, Eslesme[]>();
  for (const e of sinyaller) konular.set(e.taramaId, [...(konular.get(e.taramaId) ?? []), e]);
  for (const [konu, liste] of konular) {
    const metin = bildirimMetni(konu, liste);
    if (metin) await gonder(hesap, anahtar, konu, metin, { tur: 'eslesme', taramaId: konu });
  }

  // 2. Hisse başına tek bildirim: "THYAO 312,50 ₺ ile Topuk Dönüşü hedefine ulaştı."
  const hisseler = new Map<string, HedefUlasan[]>();
  for (const u of ulasanlar) {
    const k = `${u.piyasa}:${u.sembol}`;
    hisseler.set(k, [...(hisseler.get(k) ?? []), u]);
  }
  for (const liste of hisseler.values()) {
    const metin = hedefBildirimMetni(liste);
    const { piyasa, sembol } = liste[0];
    if (metin) await gonder(hesap, anahtar, hedefKonusu(piyasa, sembol), metin, { tur: 'hedef', piyasa, sembol });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
