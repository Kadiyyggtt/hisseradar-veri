/**
 * TARANAN EVREN. Ücretsiz veri kaynağında "BIST 100 listesini ver" diye
 * bir uç nokta yok; liste burada elle tutuluyor ve çeyrekte bir gözden
 * geçirilmeli (endeks değişiklikleri KAP'ta duyuruluyor).
 */
export const BIST: string[] = [
  'THYAO','ASELS','GARAN','AKBNK','EREGL','KCHOL','SAHOL','BIMAS','TUPRS','SISE','YKBNK','ISCTR','PETKM','TCELL','TTKOM',
  'FROTO','TOASO','ARCLK','KOZAL','KOZAA','PGSUS','TAVHL','EKGYO','HEKTS','SASA','ASTOR','ENKAI','GUBRF','ODAS','KRDMD',
  'VESTL','DOHOL','TKFEN','ALARK','MGROS','SOKM','ULKER','AEFES','CCOLA','OYAKC','AKSEN','ZOREN','SMRTG','KONTR','EUPWR',
  'YEOTK','CWENE','AGHOL','BRSAN','TTRAK','OTKAR','BRYAT','DOAS','ENJSA','ISGYO','HALKB','VAKBN','TSKB','ALBRK','SKBNK',
  'KCAER','GESAN','CANTE','REEDR','TUKAS','MAVI','BIENY','KLSER','EGEEN','KARSN','TRGYO','AKSA','ALFAS','BAGFS','CIMSA',
  'AKCNS','GOLTS','NUHCM','ISMEN','QUAGR','PENTA','MIATK','TABGD','TURSG','ANSGR','AGESA','AKFYE','AYDEM','BERA','BFREN',
  'BTCIM','CEMTS','DEVA','ECILC','EGEPO','ENERY','GENIL','GLYHO','GWIND','HLGYP','IPEKE','ISDMR','IZENR','KARTN','KONYA',
  'KORDS','KOZAL','LMKDC','MPARK','NTHOL','OBAMS','PAPIL','PSGYO','RYGYO','SDTTR','SELEC','SNGYO','TATEN','TMSN','TUPRS',
  'VESBE','YATAS','YYLGD','ZRGYO',
];

/** S&P 100 çekirdeği + Nasdaq'ın en bilinenleri. */
export const ABD: string[] = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','BRK-B','AVGO','JPM','LLY','V','UNH','XOM','MA','COST','HD','PG','JNJ','NFLX',
  'ABBV','WMT','BAC','CRM','KO','CVX','ORCL','MRK','AMD','PEP','ADBE','CSCO','TMO','ACN','LIN','MCD','ABT','GE','WFC','TXN',
  'DHR','PM','INTU','IBM','QCOM','CAT','VZ','AMGN','ISRG','NOW','DIS','GS','SPGI','PFE','UBER','RTX','AMAT','CMCSA','NEE','BKNG',
  'LOW','T','HON','UNP','PGR','AXP','BLK','ETN','TJX','SYK','COP','BSX','MS','VRTX','ADP','PANW','LRCX','MDT','SCHW','GILD',
  'C','MU','ADI','MMC','BX','PLTR','KLAC','ANET','CB','SBUX','DE','FI','SO','MO','PLD','ICE','DUK','BMY','INTC','SHW',
  'CRWD','SNPS','CDNS','MELI','MRVL','ABNB','COIN','MSTR','ARM','SMCI',
];

export const ENDEKSLER = { XU100: 'XU100.IS', SPX: '^GSPC' } as const;

export function yahooSembol(sembol: string, piyasa: 'BIST' | 'ABD'): string {
  return piyasa === 'BIST' ? `${sembol}.IS` : sembol;
}
