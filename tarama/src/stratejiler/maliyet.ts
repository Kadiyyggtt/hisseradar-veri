import type { Seriler, Tarayici } from '../tipler';
import { fib, geriAlma, hacimOrt, pivotlar, yakin } from '../gostergeler/pivot';
import { eslesme, f2 } from './ortak';

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
        `1 = ${f2(d.bir.fiyat)} dip, 2 = ${f2(d.iki.fiyat)} tepe; alış maliyeti (%61,8) ${f2(maliyet)}.`,
        `Kapanış ${f2(son.k)} maliyet bandında.`,
        hacimDusuk ? 'Hacim 20 gün ortalamasının altında: satış tükeniyor olabilir.' : 'Hacim ortalamanın üstünde: maliyetin kırılma riski var.',
      ],
      { '1 (dip)': d.bir.fiyat, '2 (tepe)': d.iki.fiyat, 'Maliyet %61,8': maliyet, '%38,2': fib(d.iki.fiyat, d.bir.fiyat, 0.382) });
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
          [`Tepe ${f2(d.iki.fiyat)} sonrası düşüş %38,2 bandına (${f2(s382)}) ${g === 0 ? 'bugün' : g + ' gün önce'} ilk kez değdi.`, 'Ara düzeltme değil; maliyete (%61,8) kadar inmeye aday.'],
          { '%38,2': s382, '%50': fib(d.iki.fiyat, d.bir.fiyat, 0.5), 'Maliyet %61,8': fib(d.iki.fiyat, d.bir.fiyat, 0.618) });
      }
    }
    return null;
  },
};

/** 1.2 — Sahte Çıkış: maliyetten dönüş başladı, hedef %38,2; satış maliyeti tavan. */
export const sahteCikis: Tarayici = {
  id: 'sahte-cikis',
  tara(s) {
    const d = sonDongu(s);
    if (!d) return null;
    const m = s['1d'];
    const i = m.length - 1;
    const maliyet = fib(d.iki.fiyat, d.bir.fiyat, 0.618);
    // Tepeden sonra maliyet bandına inmiş (3) ve son 5 mumda oradan en az %3 yukarı dönmüş.
    let uc = -1;
    for (let j = d.iki.i + 1; j <= i; j++) if (yakin(m[j].d, maliyet, 3)) uc = j;
    if (uc < 0 || i - uc > 15) return null;
    const dip = Math.min(...m.slice(uc, i + 1).map((x) => x.d));
    if (m[i].k < dip * 1.03) return null;
    const hedef = fib(d.iki.fiyat, d.bir.fiyat, 0.382);
    const satisMaliyeti = fib(dip, d.iki.fiyat, 0.618);
    if (m[i].k > satisMaliyeti) return null; // artık sahte çıkış değil
    return eslesme(s, 'sahte-cikis', '1d', 'al', 70,
      [`Satış maliyet bandında (${f2(maliyet)}) durdu, ${i - uc} gündür yukarı dönüyor.`, `Hedef %38,2: ${f2(hedef)} (kâr stopu en az buraya).`, `Tavan: satış maliyeti ${f2(satisMaliyeti)}; hacimli aşılırsa yeni döngü ihtimali.`],
      { 'Hedef %38,2': hedef, 'Satış maliyeti': satisMaliyeti, 'Maliyet %61,8': maliyet });
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
        `3 = ${f2(uc.fiyat)}, maliyete (${f2(maliyet)}) inmedi: satış isteksiz.`,
        gecti ? `Satış maliyeti ${f2(satisMaliyeti)} bugün geçildi.` : `Zirve ${f2(d.iki.fiyat)} geçildi: pozisyon arttırma bölgesi.`,
        `Hacim ortalamanın ${kat.toFixed(1).replace('.', ',')} katı${kat >= 1.5 ? ': iştahlı.' : ': zayıf, ikili tepe riski.'}`,
      ],
      { 'Satış maliyeti': satisMaliyeti, 'Zirve (2)': d.iki.fiyat, 'Maliyet %61,8': maliyet });
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
            [`Aylık 1-2-3: dip ${f2(p[j - 1].fiyat)}, tepe ${f2(p[j].fiyat)}, maliyet ${f2(maliyet)}.`, 'Son ay mumu pozitif kapattı ve maliyet bölgesinde.', 'Büyük plan: takip listesine.'],
            { 'Aylık maliyet': maliyet });
        return null;
      }
    }
    return null;
  },
};

export { geriAlma };
