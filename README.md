# Los Santos GPS v5.0

Mevcut v4.1 projesi üzerinden düzenlenen, iPhone Safari ve GitHub Pages için statik uygulama. Eski sohbetin tamamı ve tüm görsel referanslar erişilebilir değildi; erişilen gereksinimler ve v0.1–v4.1 paketleri esas alındı.

## Kurulum

1. ZIP'i aç. `los-santos-gps-v5.0` klasörünün **içindekileri**, `vendor` klasörü dahil, mevcut sitenin köküne yükle. `index.html` kökte olmalı.
2. Dosyaları birlikte güncelle; yalnızca app.js dosyasını değiştirmek yeterli değil. Artık `v3-engine.js` kullanılmıyor.
3. HTTPS siteni Safari'de aç. Üstte **v5.0** yazmalı. Eski sürüm görünürse sayfayı kapatıp yeniden aç veya özel sekmede kontrol et.
4. Konum için ◎, cihaz pusulası için ◢ düğmesine dokun. Adres ara veya haritada hedef seç. ◷ düğmesi araç/yürüyüş seçimini açar.
5. Safari paylaşım menüsünden Ana Ekrana Ekle kullanılabilir.

Bilgisayarda önizleme: bu klasörde `python3 -m http.server 8000`, ardından `http://localhost:8000`. iPhone'da GPS için HTTPS gerekir.

## Değişiklikler

- Kıyı efekti artık su döşemelerinin sınırlarından türetilmiyor. OSM'nin gerçek `natural=coastline` çizgisinin deniz tarafına yaklaşık 40 metre uzanan 16 kademeli renk geçişi çiziliyor. Açık deniz düz ve koyu kalır. Kıyı servisi erişilemezse tüm denize desen basılmaz. Bu stilizasyon gerçek deniz derinliği değildir.
- Three.js sahnesi yerel koordinatlar kullanıyor; büyük dünya koordinatlarından doğan hassasiyet kaybı azaltıldı. Sabit sahnede sürekli yeniden çizim isteği kaldırıldı.
- Ağaçlar sabit dünya ızgarasından seçiliyor; kaydırma/zoom sırasında yeniden rastgele yerleştirilmiyor. Orman poligonlarının iç boşluklarına ağaç yerleştirilmiyor.
- Modeller ortak gri malzeme kullanıyor. Gece pencereleri sabit sarı. İkonik yapı modelleri hâlâ temsili şablonlar; her yapının birebir mimari modeli yok.
- Alt haritadaki mevcut 3D bina katmanı kaldırılıp tek bina katmanı kullanıldı; iki yüzeyin aynı yerde çizilmesinden doğan titreme giderildi.
- Bina yüksekliklerinde sıfır değer sorunu düzeltildi. Yükseklik verisi yoksa kat sayısı, o da yoksa 9 metre kullanılıyor. Bu değer tahmindir. Pencereler aynı yüksekliği kullanır, cepheden hafifçe dışarı taşınır ve bina başına tek geometri halinde çizilir.
- Yakın planda OSM'deki bina ayak izleri ayrıca sorgulanır; vektör haritada zaten bulunanlarla çakışanlar eklenmez. OSM'de de bulunmayan binalar üretilemez. Bu nedenle belirli sokağındaki bütün binaların varlığı doğrulanmış değildir.
- Arama sonucu rota hedefini gerçekten seçer. Kategori ikonları ve bilgi kartları korunur. Çalışma saati, fotoğraf, menü gibi ayrıntılar yalnızca kaynakta varsa görünür; vektör döşemelerde bu alanlar sıkça eksiktir.
- Araç ve gerçek yol ağı kullanan ayrı yürüyüş rotası seçimi vardır. Eski kuş uçuşu yürüyüş tahmini kaldırıldı.
- Gecikmiş rota yanıtları yeni hedefi veya silinmiş rotayı geri getiremez. Rotadan sapma artık yalnızca rota köşe noktalarına değil yol parçalarına uzaklıkla ölçülür.
- Otomatik, yazısız GPS sinematiği; gerçek hava durumu, gün döngüsü, pusula, minimap, sokak isimleri ve yasak bölge katmanı korunur. Manuel efekt paneli yoktur.
- Harita ve 3D motorları pakete dahil edildi. Service worker sürümü ve sorgu ekli dosyaların önbellek eşleşmesi düzeltildi.

## Kullanım sınırları

Harita, kıyı/bina ayrıntıları, rota, arama ve hava durumu internet servislerine bağlıdır. Uygulama kabuğunun önbelleğe alınması çevrimdışı navigasyon anlamına gelmez. Canlı trafik, toplu taşıma tarifeleri ve ekran kilitliyken güvenilir arka plan navigasyonu yoktur. Fiziksel iPhone GPS/pusula testi yapılmadı. Referans görsellerin tamamına erişilmediği için birebir görsel eşleşme doğrulanmadı.

Nominatim araması yalnızca ARA düğmesiyle çalışır, otomatik tamamlama yapmaz, tekrarları önbelleğe alır ve saniyede bir isteği aşmayacak şekilde sınırlandırılır. Bu paket kişisel ve düşük trafikli kullanım içindir. Paylaşımlı/yoğun kullanımda ayrı arama hizmeti gerekir. Adresi `config.js` içindeki `searchURL` alanından değiştirilebilir. Kullanım koşulları: https://operations.osmfoundation.org/policies/nominatim/

## Dosyalar ve kontroller

- `app.js`: harita, GPS, rota, hava durumu, bilgi kartları.
- `scene.js`: kıyı, ormanlar, modeller, ek binalar, arama ve kategori filtreleri.
- `geo.js`: bağımsız geometri hesapları.
- `tests/geometry.cjs`: `node --test tests/geometry.cjs` ile çalıştırılır.
- `TEST-REPORT.md`: yapılan kontroller ve doğrulanamayan kısımlar.

Kaynaklar: OpenStreetMap / OpenFreeMap, MapLibre GL JS 5.12.0, Three.js r149, OSRM, FOSSGIS yürüyüş servisi, Open-Meteo. Harita üzerindeki kaynak atıfları korunmuştur.
