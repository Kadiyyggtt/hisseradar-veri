import type { Seriler, Tarayici } from '../tipler';
import { fib, geriAlma, hacimOrt, pivotlar, yakin } from '../gostergeler/pivot';
import { eslesme, f2, HEDEF_ESIK } from './ortak';

/**
 * 1-2-3 döngüsü: son onaylı dip (1) ve sonrasındaki tepe (2). Yükseliş en az
 * %15 olsun ki Fibonacci bantları anlamlı olsun.
 */
function sonDongu(s: Seriler) {
  const m = s['1d'];
  const p = pivotlar(m, 5);
  for (let j = p.length - 2; j >= 1; j--) {
    const bir = p[j - 1];
    const iki = p[j];
    if (bir.tur !== 'dip' || iki.tur !== 'tepe') continue;
    if (iki.fiyat / bir.fiyat - 1 < 0.15) continue;
    return { bir, iki, sonrasi: p.slice(j + 1) };
  }
  return null;
}

/** 1.1 — Fiyat alış maliyeti (%61,8) bandında. */
export const dongu123: Tarayici = {
  id: '123-dongusu',
  tara(s) {
    const d = sonDongu(s);
    if (!d) return null;
    const m = s['1d'];
    const son = m[m.length - 1];
    const maliyet = fib(d.iki.fiyat, d.bir.fiyat, 0.618);
    if (!yakin(son.k, maliyet, 2.5)) return null;
    const hacimDusuk = son.h < hacimOrt(m, 20, m.length - 2);
    return eslesme(s, '123-dongusu', '1d', 'izle', 75,
      [
        `1 noktası ${f2(d.bir.fiyat)} dip, 2 noktası ${f2(d.iki.fiyat)} tepe. Yüzde 61,8 alış maliyeti ${f2(maliyet)}.`,
        `Kapanış ${f2(son.k)} ile maliyet bandının içinde.`,
        hacimDusuk ? 'Hacim 20 günlük ortalamanın altında. Satış tükeniyor olabilir.' : 'Hacim ortalamanın üstünde. Maliyetin kırılma riski var.',
      ],
      { '1 noktası (dip)': d.bir.fiyat, '2 noktası (tepe)': d.iki.fiyat, 'Maliyet (%61,8)': maliyet, '%38,2 seviyesi': fib(d.iki.fiyat, d.bir.fiyat, 0.382) });
  },
};

/** 1.3 — Üç Bant Testi: tepeden gelen düşüş %38,2'ye son 3 mumda ilk kez değdi. */
export const ucBantTesti: Tarayici = {
  id: 'uc-bant-testi',
  tara(s) {
    const d = sonDongu(s);
    if (!d) return null;
    const m = s['1d'];
    const s382 = fib(d.iki.fiyat, d.bir.fiyat, 0.382);
    const i = m.length - 1;
    for (let g = 0; g < 3; g++) {
      const j = i - g;
      if (m[j].d <= s382 && m[j - 1].d > s382) {
        // Daha önce (tepeden sonra) değmemiş olsun.
        const onceDegdi = m.slice(d.iki.i + 1, j).some((x) => x.d <= s382);
        if (onceDegdi) return null;
        return eslesme(s, 'uc-bant-testi', '1d', 'izle', 100,
          [`${f2(d.iki.fiyat)} tepesinden gelen düşüş, yüzde 38,2 bandına (${f2(s382)}) ${g === 0 ? 'bugün' : g + ' gün önce'} ilk kez değdi.`, 'Kural bu dokunuşu ara düzeltme saymaz; sıradaki ölçü yüzde 61,8 maliyet bandıdır.'],
          { '%38,2 seviyesi': s382, '%50 seviyesi': fib(d.iki.fiyat, d.bir.fiyat, 0.5), 'Maliyet (%61,8)': fib(d.iki.fiyat, d.bir.fiyat, 0.618) });
      }
    }
    return null;
  },
};

/** Sahte Çıkış maliyet bandının genişliği (yüzde, iki yana). */
export const SAHTE_BANT = 3;

/**
 * 1.2 — Sahte Çıkış: maliyetten dönüş başladı, hedef %38,2; satış maliyeti tavan.
 * Şartlar (gerekçe metni grafikle çelişmesin diye her biri ölçülür):
 *  1. Tepeden sonraki en düşük mum (dip) maliyet bandında (yüzde 61,8 ± yüzde 3), en çok 15 mum önce.
 *  2. Satış bantta durdu: dip bandın içinde olduğu için tepeden bugüne hiçbir kapanış (son kapanış dahil) bandın
 *     altında değil. Bandın altına inen seri "maliyetin kırıldığı" seridir, sahte çıkış değil.
 *  3. Gerçek dönüş: dip en az 1 gün önce ve kapanış o dipten en az yüzde 3 yukarıda.
 *     "N gün önce" sayısı bu dipten sayılır; dip bugünse dönüş yoktur.
 *  4. Hedef (yüzde 38,2) fiyatın en az yüzde 1,5 üstünde, kapanış satış maliyetinin altında.
 */
export const sahteCikis: Tarayici = {
  id: 'sahte-cikis',
  tara(s) {
    const d = sonDongu(s);
    if (!d) return null;
    const m = s['1d'];
    const i = m.length - 1;
    const maliyet = fib(d.iki.fiyat, d.bir.fiyat, 0.618);
    if (d.iki.i >= i) return null;
    // Tepeden sonraki en düşük mum (3 noktası) bandın içinde olmalı. Kapanış hiçbir zaman o mumun dibinden aşağıda
    // olamayacağı için bu şart, tepeden bugüne hiçbir kapanışın (son kapanış dahil) bandın altına inmediğini de garanti eder.
    let dipI = d.iki.i + 1;
    for (let j = dipI; j <= i; j++) if (m[j].d < m[dipI].d) dipI = j;
    const dip = m[dipI].d;
    if (!yakin(dip, maliyet, SAHTE_BANT) || i - dipI > 15) return null;
    // Dönüş: dip en az 1 gün önce ve kapanış dipten en az yüzde 3 yukarıda. "N gün" bu dipten sayılır.
    const gun = i - dipI;
    if (gun < 1 || m[i].k < dip * 1.03) return null;
    const hedef = fib(d.iki.fiyat, d.bir.fiyat, 0.382);
    if (hedef < m[i].k * HEDEF_ESIK) return null; // hedefe gelinmiş: dönüş artık başlangıçta değil
    const satisMaliyeti = fib(dip, d.iki.fiyat, 0.618);
    if (m[i].k > satisMaliyeti) return null; // artık sahte çıkış değil
    const yukari = ((m[i].k / dip - 1) * 100).toFixed(1).replace('.', ',');
    return eslesme(s, 'sahte-cikis', '1d', 'al', 70,
      [`Satış, maliyet bandında (${f2(maliyet)}) durdu: fiyat bandın altına inmedi. Dip ${f2(dip)}, ${gun} gün önce; kapanış o dipten yüzde ${yukari} yukarıda.`, `Yüzde 38,2 hedefi ${f2(hedef)}. Kurala göre kâr stopu bu seviyeye çekilir.`, `Tavan, ${f2(satisMaliyeti)} satış maliyetidir. Hacimli aşılırsa yeni döngü ihtimali doğar.`],
      { '%38,2 hedefi': hedef, 'Satış maliyeti': satisMaliyeti, 'Maliyet (%61,8)': maliyet });
  },
};

/** 1.5 — Sahte çıkış yapmayan yapı: 3 maliyete inmedi, satış maliyeti hacimle geçildi. */
export const yeniDongu: Tarayici = {
  id: 'yeni-dongu',
  tara(s) {
    const d = sonDongu(s);
    if (!d || d.sonrasi.length < 1) return null;
    const uc = d.sonrasi[0];
    if (uc.tur !== 'dip') return null;
    const m = s['1d'];
    const i = m.length - 1;
    const maliyet = fib(d.iki.fiyat, d.bir.fiyat, 0.618);
    if (uc.fiyat <= maliyet * 1.01) return null; // maliyete indi, bu başka hikâye
    const satisMaliyeti = fib(uc.fiyat, d.iki.fiyat, 0.618);
    const gecti = m[i].k > satisMaliyeti && m[i - 1].k <= satisMaliyeti;
    const zirveGecti = m[i].k > d.iki.fiyat;
    if (!gecti && !zirveGecti) return null;
    const kat = m[i].h / (hacimOrt(m, 20, i - 1) || 1);
    return eslesme(s, 'yeni-dongu', '1d', 'al', kat >= 1.5 ? 85 : 55,
      [
        `3 noktası ${f2(uc.fiyat)} ile maliyete (${f2(maliyet)}) inmedi. Satış isteksiz.`,
        gecti ? `${f2(satisMaliyeti)} satış maliyeti bugün geçildi.` : `${f2(d.iki.fiyat)} zirvesi geçildi. Kural kitabında bu bölge ekleme bölgesi sayılır.`,
        `Hacim ortalamanın ${kat.toFixed(1).replace('.', ',')} katı${kat >= 1.5 ? ', iştahlı bir geçiş.' : ', zayıf bir geçiş. İkili tepe riski var.'}`,
      ],
      { 'Satış maliyeti': satisMaliyeti, 'Zirve (2 noktası)': d.iki.fiyat, 'Maliyet (%61,8)': maliyet });
  },
};

/** 1.7 — Ay sonu taraması: son ay mumu pozitif ve kapanış aylık 1-2-3 maliyet bandında. */
export const aySonu: Tarayici = {
  id: 'ay-sonu-taramasi',
  tara(s) {
    const m = s['1mo'];
    if (m.length < 24) return null;
    const p = pivotlar(m, 10);
    const i = m.length - 1;
    for (let j = p.length - 2; j >= 1; j--) {
      if (p[j - 1].tur === 'dip' && p[j].tur === 'tepe') {
        const maliyet = fib(p[j].fiyat, p[j - 1].fiyat, 0.618);
        const pozitif = m[i].k > m[i].a;
        if (pozitif && yakin(m[i].k, maliyet, 6))
          return eslesme(s, 'ay-sonu-taramasi', '1mo', 'izle', 100,
            [`Aylık 1-2-3 döngüsü: dip ${f2(p[j - 1].fiyat)}, tepe ${f2(p[j].fiyat)}, maliyet ${f2(maliyet)}.`, 'Son ay mumu pozitif kapattı ve fiyat maliyet bölgesinde.', 'Büyük plana göre takip listesi adayı.'],
            { 'Aylık maliyet': maliyet });
        return null;
      }
    }
    return null;
  },
};

export { geriAlma };
