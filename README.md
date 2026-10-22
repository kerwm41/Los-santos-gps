LOS SANTOS GPS v4.0 — GÖRSEL GÜNCELLEME

Bu sürüm v3 üzerine hazırlanmıştır. ZIP içindeki dosyaları GitHub deponuzun ANA DİZİNİNE yükleyin, önce v3 yedeğinizi alın.

Geliştirmeler:
- Deniz: sabit çizgisel bantlar kaldırıldı; su alanlarında organik, yumuşak mavi tonlu desen (stilize, gerçek batimetri verisi değil).
- Orman: haritanın bildiği forest/wood poligonlarının içinde çok sayıda alçak poligonlu üç boyutlu ağaç modeli (veri varsa).
- Gece ışıkları: yakındaki bina poligonlarının cephelerine sarı geometrik pencere yüzeyleri; köprü verisi mevcutsa aydınlatma modelleri.
- Önceki v3 kategori filtreleri, arama ve saat sürgüsü korunur.

Sınırlamalar:
* Gerçek coğrafi veri olmayan orman/bina/yapılar çizilemez.
* İkonik yapılar için model şablonları kullanılır; Rio İsa Heykeli gibi her yapı için birebir elle hazırlanmış özgün varlıklar henüz mevcut değil.
* Deniz görseli organik stilize derinlik sanatıdır, batimetri haritası değildir; su deseninin tekrar ettiği bölgeler görülebilir.
* 3D çizimler MapLibre ve Three.js WebGL kütüphanelerine ve internet erişimine bağımlıdır.
* Gerçek cihazda iPhone performansı ve GitHub Pages yayını doğrulanmadı. Buradaki testler sözdizimi ve arşiv bütünlüğüyle sınırlıdır.
