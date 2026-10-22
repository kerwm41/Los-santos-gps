# v5.0 doğrulama raporu

## Geçen kontroller

- `node --check`: app.js, scene.js, geo.js, sw.js ve config.js.
- Beş bağımsız geometri testi: sıfır/eksik bina yüksekliği, sabit ağaç yerleşimi ve orman boşlukları, doğuya giden kıyının güney tarafındaki 40 m bandı, kuzeye giden kıyının doğu tarafı ve tekrarlanan düğümler, uzun yol parçasının ortasında doğru rota mesafesi.
- Gerçek Chromium/WebGL üzerinde kontrollü servis yanıtlarıyla: arama sonucunun hedef olması, rota isteği sürerken iptal, yürüyüş modu ve rota etiketi, kategori kontrolleri, Three.js ağaç ve küçük bina pencere geometrisi, service worker etkinleşmesi. Yakalanan JavaScript çalışma zamanı hatası: 0.
- 430 × 932 mobil görünüm görsel kontrolü: arama alanı, hava durumu düğmeleri, gün döngüsü, harita kontrolleri ve alt HUD. Düğmelerin arama alanını örtmesi giderildi.
- Gerçek OpenFreeMap haritası Chromium'da yüklendi: 122 katman, yakalanan konsol hatası 0. Ortamın ağ proxy ayarı verilince önceki bağlantı hatası giderildi.
- Darıca 16,7 zoom / 52° eğim testinde çok parçalı bina kayıtları ayrıştırıldı; sahne 211 model/ışık grubu çizdi. Yerel pencere konumları görsel olarak incelendi.
- FOSSGIS yürüyüş servisine gerçek örnek istek: başarılı `Ok` yanıtı, 849,6 metre / 679,5 saniye. Bu yalnızca servisin örnek sorguya yanıt verdiğini doğrular.

## Doğrulama sınırları

- Eski sohbetin tamamı ve bütün referans görseller erişilebilir değildi. Tüm taleplerin eksiksiz karşılandığı veya görsellerin birebir eşleştiği iddia edilmiyor.
- Gerçek iPhone GPS/pusula izinleri, hareket hâlindeki takip, uzun süreli bellek/pil kullanımı, arka plan ve ekran kilidi davranışı test edilmedi.
- Yakın plan canlı haritada bazı kaynak özellikleri için `Expected value to be of type number, but found null instead` uyarıları görüldü. Harita çizilmeye devam etti; bu veri uyarılarının tamamı giderilmiş değildir.
- Canlı testte hava durumu isteği zaman aşımına uğradı; ek bina servisi HTTP 502 döndürdü ve kıyı kaynağında veri yüklenmedi. Bu özelliklerin canlı veriyle uçtan uca çalışması bu ortamda doğrulanamadı.
- Canlı servislerin her bölgede yanıt vermesi ve OSM bina/POI kapsamı garanti edilemez.
- İkonik yapı modelleri ayrıntılı birebir rekonstrüksiyon değildir. Bina ayak izi bulunmayan yerler hâlâ eksik kalabilir.
- Kıyı çizgisinin güncelliği ve keskin girintilerde bant geometrisinin yerel uyumu tüm dünya için doğrulanmadı.

## Yeniden çalıştırma

Geometri: `node --test tests/geometry.cjs`.

Tarayıcı: Node ortamında Playwright ve Chromium kurulu olmalı; `node tests/browser.cjs`. Gerekirse tarayıcı yolu `BROWSER_EXECUTABLE` ortam değişkeniyle verilebilir. Bu test Python 3 ile 8766 portunda geçici sunucu başlatır ve harici yanıtları kontrollü test verileriyle değiştirir. Gerçek harita/servis testi yerine geçmez.
