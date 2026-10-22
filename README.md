# Los Santos GPS v3.0 — Görsel harita altyapısı (deneysel)

## Eklenen / değiştirilen
- Vektör harita koordinatlarına bağlı POI noktaları, mekan adları ve kategori renkleri (kaynak: açık OSM / OpenFreeMap vektör döşemeleri)
- Sağda açılır hastane, eczane, kafe, restoran, okul, kültür, ibadet, mağaza, doğa, anıt filtre paneli
- Bölge merkezli ve kategori odaklı arama; yakın sonuçları önceleme
- Açık turkuazdan laciverte kıyıya paralel stilize su konturu bantları
- Gerçek geocoordinate konumuna sabitlenen, Three.js (harita WebGL sahnesi) ile üretilen geometrik low-poly ağaç, cami, kale, heykel, köprü örnek modelleri
- Gün döngüsü çubuğunda otomatik/manual saat sürgüsü
- Yakında gece binaları çevresinde temsili sabit sarı pencere ışığı noktaları
- Daha az DOM marker işaretleri; hareket ederken daha stabil çizim amaçlanıyor

## Önemli sınırlar
- Temsili 3D modeller gerçeğe özel üç boyutlu mimari rekonstrüksiyon DEĞİLDİR. Camiler ve başka binalar çeşidine göre şablon. Her ikon her yerde bulunmayabilir.
- Stilize su bantları gerçekte ölçülen deniz derinliği ya da batimetrik eşyükselti değildir. Gerçek derinlik için bölgesel batimetri verisi gerekir.
- POI ve model görünmesi haritanın sunabildiği vektör döşemelerdeki POI ve orman verisine ve zoom'a bağlıdır.
- Three.js CDN ağı erişimi kesilirse 3D sahne kapalı kalır, harita ve filtreler çalışmaya devam eder.
- Gerçek cihazda / GitHub Pages üzerinden manuel görsel doğrulama yapılmadı. Canlı sistemde çalışması garantilenemez.

## Kurulum
ZIP içindeki dosyaların tamamını `Los-santos-gps` deposunun KÖK dizinine yükleyin. `v3-engine.js` mutlaka aynı dizinde olmalıdır. Servis işçisi v30 cache anahtarıyla yenilenir. GitHub Pages deployed olduktan sonra Ctrl+Shift+R yapın.
