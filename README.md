# Los Santos GPS — v0.1 (iPhone PWA)

OpenStreetMap tabanlı, GTA V estetiğinden esinlenen mobil navigasyon prototipi.

## Windows'tan iPhone'a kurulum

1. Bu klasörün **içindeki dosyaları** yeni bir **herkese açık GitHub deposuna** yükleyin (repo kök dizinine).
2. GitHub → Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save.
3. GitHub Pages tarafından verilen **HTTPS adresini** iPhone Safari'de açın. Yayına alınması zaman alabilir.
4. Safari → Paylaş → Ana Ekrana Ekle.
5. Uygulamayı açın, `◎` düğmesine basın, konum izni verin; arama yapın veya haritada bir noktaya dokunun.

Alternatif: VS Code + Live Server veya `python -m http.server 8000` ile Windows bilgisayarda haritayı görüntüleyebilirsiniz. iPhone GPS için HTTPS yayını gereklidir. `file://` ile GPS/PWA düzgün çalışmaz.

## Bu ilk sürümde bulunanlar

- Gerçek vektör haritası: OpenFreeMap + MapLibre, GTA esintili katman rengi
- iPhone Safari'nin izin verdiği ölçüde canlı GPS konumu ve hız
- Gerçek yol ağından **araç** rota hesaplama: OSRM herkese açık demo API
- Yol geometrisi üstünde mor GPS çizgisi, mesafe/süre tahminleri
- Adres/yer ismi arama: Nominatim (arama düğmesiyle kullanıcı isteği)
- Tam ekran/minimap modu, kamera yönü ve konum takibi
- Ana ekrana eklenebilir PWA, yerel uygulama kabuğu önbelleği

## Henüz bulunmayanlar ve sınırlamalar

- Ekran kilitliyken güvenilir navigasyon ve Türkçe arka plan sesli yönlendirme **YOK** (iPhone Safari PWA arka plan kısıtları)
- Trafik, hız limiti, yürüyüş/bisiklet profilleri, çevrimdışı yol hesaplama, POI kategorisi ikonları **YOK**
- Servis üzerindeki rota, GPS, arama ve harita verileri **internet gerektirir**. Yalnızca uygulama kabuğu önbelleğe alınır.
- OSRM demo servisi: ticari olmayan ölçülü kullanım, **saniyede en fazla 1 istek**, süreklilik garantisi yok. V0.1 otomatik yeniden hesaplama en sık 30 saniyede birdir.
- Nominatim halka açık sunucusu: adil kullanım ve en fazla 1 sorgu/sn, üretim/yoğun kullanım için kendiniz barındırdığınız ya da lisanslı hizmete geçin.
- Harita veri sağlayıcılarını ve kaynak atıflarını koruyun.
- GTA V'in mülkiyetindeki görsel varlıklar kullanılmaz; tema yalnızca esinlenmedir.
- Uygulama fiziksel iPhone'da henüz test edilmemiştir; güvenlik kritik araç yönlendirmesi için tek başına kullanmayın.

## Sonraki aşama

Gerçek güvenilir ekran kilitli navigasyon için native SwiftUI/MapLibre Native iOS sürümü ve Mac/macOS üzerinde Xcode veya uygun bir macOS bulut derleme ortamı gerekir.

## Kaynaklar

- https://maplibre.org/maplibre-gl-js/docs/
- https://openfreemap.org/quick_start/
- https://project-osrm.org/docs/
- https://operations.osmfoundation.org/policies/nominatim/
