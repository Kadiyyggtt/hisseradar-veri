import { appendFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

import { sessizSaatMi, type BildirimMetni } from './bildirim-metin';

/**
 * FCM GÖNDERİCİ — servis hesabından erişim anahtarı alır ve konuya mesaj atar.
 * bildirim.ts (yeni eşleşme, hedef) ve brifing.ts (sabah/hafta) ortak kullanır.
 */
/**
 * İş özeti: GitHub Actions'ta koşunun özet sayfasına (GITHUB_STEP_SUMMARY) satır yazar, günlüğe de basar.
 * "Bildirim gitmedi" gibi durumlar uyarı satırları arasında kaybolmasın, her koşunun özetinde görünsün.
 */
export function ozetYaz(satir: string): void {
  console.log(satir);
  const yol = process.env.GITHUB_STEP_SUMMARY;
  if (!yol) return;
  try { appendFileSync(yol, `${satir}\n`); } catch { /* özet yazılamazsa günlük yeter */ }
}

/** Son kapı: sessiz saatte (22:00-08:00 TR) hiçbir mesaj çıkmaz. Kuyruk kararı taramada; bu yalnız güvence. */
export function gonderimSerbestMi(simdiMs = Date.now()): boolean {
  return !sessizSaatMi(Math.floor(simdiMs / 1000));
}

export type Hesap = { project_id: string; client_email: string; private_key: string; token_uri: string };

/** Asılı kalan istek iş akışını (10 dk sınırı) yemesin. */
const ZAMAN_ASIMI_MS = 15000;

export function hesabiOku(): Hesap | null {
  const ham = process.env.FCM_SERVIS_HESABI;
  if (!ham) return null;
  let h: Partial<Hesap>;
  try {
    h = JSON.parse(Buffer.from(ham, 'base64').toString('utf8')) as Partial<Hesap>;
  } catch {
    // Sabit mesaj: ayrıştırıcı hatası gizli değerin bir parçasını günlüğe basabilir.
    throw new Error('FCM_SERVIS_HESABI çözülemedi: base64 kodlu servis hesabı JSON bekleniyor.');
  }
  if (!h.project_id || !h.client_email || !h.private_key || !h.token_uri) throw new Error('FCM_SERVIS_HESABI eksik alan içeriyor (project_id, client_email, private_key, token_uri).');
  return h as Hesap;
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
    signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
  });
  const j = (await c.json()) as { access_token?: string; error?: string };
  if (!j.access_token) throw new Error(`erişim anahtarı alınamadı: ${j.error}`);
  return j.access_token;
}

/** Konuya tek mesaj. Başarılıysa true; hata fırlatmaz (bir konunun düşmesi ötekileri durdurmasın), çağıran sayar. */
export async function gonder(hesap: Hesap, anahtar: string, konu: string, metin: BildirimMetni, veri: Record<string, string>): Promise<boolean> {
  if (!gonderimSerbestMi()) {
    console.error(konu, 'gönderilmedi: sessiz saat (22:00-08:00 TR).');
    return false;
  }
  // Öncelik ve ses korunur: sessiz saat kuralıyla bildirim zaten gündüz (sabah) gider.
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
  try {
    const c = await fetch(`https://fcm.googleapis.com/v1/projects/${hesap.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${anahtar}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(govde),
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    });
    console.log(konu, c.status, c.ok ? 'gönderildi' : await c.text());
    return c.ok;
  } catch (e) {
    console.error(konu, 'gönderilemedi:', (e as Error).name === 'TimeoutError' ? 'zaman aşımı' : (e as Error).message);
    return false;
  }
}
