import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { bildirimMetni, hedefBildirimMetni, hedefKonusu } from './bildirim-metin';
import { erisimAnahtari, gonder, hesabiOku } from './fcm';
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

function oku<T>(ad: string): T | null {
  const yol = join(KOK, 'docs', 'tarama', ad);
  if (!existsSync(yol)) return null;
  return JSON.parse(readFileSync(yol, 'utf8')) as T;
}

async function main() {
  const hesap = hesabiOku();
  if (!hesap) {
    console.log('FCM_SERVIS_HESABI yok, bildirim atlandı.');
    return;
  }
  const yeni = oku<{ uretildi: number; eslesmeler: Eslesme[] }>('yeni.json');
  if (!yeni) throw new Error('yeni.json yok; önce tarama koşmalı.');
  // yeni.json bu koşunun değilse (hafta sonu koşusu boş farkla eskisini korur) aynı bildirim ikinci kez gitmesin.
  const ozet = oku<{ uretildi: number }>('ozet.json');
  if (ozet && ozet.uretildi !== yeni.uretildi) {
    console.log('yeni.json bu koşudan değil; bildirim atlandı.');
    return;
  }
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
  let gonderilen = 0;
  let basarisiz = 0;
  const say = (tamam: boolean) => (tamam ? gonderilen++ : basarisiz++);
  for (const [konu, liste] of konular) {
    const metin = bildirimMetni(konu, liste);
    if (metin) say(await gonder(hesap, anahtar, konu, metin, { tur: 'eslesme', taramaId: konu }));
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
    if (metin) say(await gonder(hesap, anahtar, hedefKonusu(piyasa, sembol), metin, { tur: 'hedef', piyasa, sembol }));
  }
  console.log(`Bildirim: ${gonderilen} gönderildi, ${basarisiz} başarısız.`);
  if (basarisiz) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
