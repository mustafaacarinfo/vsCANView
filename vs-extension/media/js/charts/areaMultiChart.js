// Live Monitor için çoklu sinyal alan grafiği bileşeni
// Maksimum 5 sinyal serisi destekler

import { now } from '../core/chartCore.js';

export class AreaMultiChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.series = new Map(); // Sinyal serilerini saklar
    this.maxSeries = 5; // Maksimum izin verilen sinyal sayısı
    this.dataPoints = 100; // Gösterilecek maksimum veri noktası sayısı
    this.timeWindow = 60000; // Milisaniye cinsinden gösterilecek zaman penceresi (1 dakika)
    
    // Grafik renk paleti (profesyonel görünüm için)
    this.colorPalette = [
      {fill: 'rgba(66, 133, 244, 0.2)', line: 'rgb(66, 133, 244)'}, // Google Mavi
      {fill: 'rgba(219, 68, 55, 0.2)', line: 'rgb(219, 68, 55)'}, // Google Kırmızı
      {fill: 'rgba(244, 180, 0, 0.2)', line: 'rgb(244, 180, 0)'}, // Google Sarı
      {fill: 'rgba(15, 157, 88, 0.2)', line: 'rgb(15, 157, 88)'}, // Google Yeşil
      {fill: 'rgba(171, 71, 188, 0.2)', line: 'rgb(171, 71, 188)'} // Mor
    ];
    
    // Grafik konfigürasyonu
    this.padding = {top: 20, right: 20, bottom: 30, left: 40};
    this.gridLines = 5; // Yatay ızgara çizgi sayısı
    
    // Ölçeklendirme ve değer aralığı
    this.minY = 0;
    this.maxY = 100;
    this.autoScale = true; // Otomatik ölçeklendirme
    
    // Ölçü birimini belirten etiket
    this.unitLabel = '';
    
    // Grafik başlığı
    this.title = 'Sinyal İzleme';
    
    // Animasyon durumu
    this.animationFrame = null;
    this.visible = false;
    
    // Ölçeklendirme geçmişi için tampon
    this._scaleBuffer = {
      minY: [],
      maxY: [],
      samples: 0
    };
  }
  
  // Seriyi ekler veya günceller
  addSeries(id, label, color = null) {
    if (this.series.size >= this.maxSeries && !this.series.has(id)) {
      console.warn(`Maksimum seri sayısına ulaşıldı (${this.maxSeries}). Yeni seri eklenemiyor.`);
      return false;
    }
    
    const colorIndex = this.series.size % this.colorPalette.length;
    const seriesColor = color || this.colorPalette[colorIndex];
    
    this.series.set(id, {
      id,
      label,
      color: seriesColor,
      data: [], // [zaman, değer] çiftlerinden oluşan veri noktaları
      visible: true,
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
      current: null
    });
    
    return true;
  }
  
  // Seriyi kaldırır
  removeSeries(id) {
    return this.series.delete(id);
  }
  
  // Tüm serileri temizler
  clearAllSeries() {
    this.series.clear();
    this._resetScaleBuffer();
    this.draw();
  }
  
  // Belirli bir seriye veri ekler
  pushSample(id, timestamp, value) {
    if (!this.series.has(id)) {
      return false;
    }
    
    const series = this.series.get(id);
    const time = timestamp || now();
    
    // Sayısal değere dönüştür
    const numValue = Number(value);
    
    if (isNaN(numValue)) {
      return false;
    }
    
    // Veriyi ekle
    series.data.push([time, numValue]);
    series.current = numValue;
    
    // Min/max değerlerini güncelle
    series.min = Math.min(series.min, numValue);
    series.max = Math.max(series.max, numValue);
    
    // Eski verileri temizle (zaman penceresinden eskiler)
    const cutoffTime = time - this.timeWindow;
    while (series.data.length > 0 && series.data[0][0] < cutoffTime) {
      series.data.shift();
    }
    
    // Veri noktası sınırını kontrol et
    if (series.data.length > this.dataPoints) {
      series.data.shift();
    }
    
    // Ölçeklendirme tamponunu güncelle
    this._updateScaleBuffer(numValue);
    
    return true;
  }
  
  // Seri görünürlüğünü değiştirir
  toggleSeries(id, visible = null) {
    if (!this.series.has(id)) {
      return false;
    }
    
    const series = this.series.get(id);
    series.visible = (visible !== null) ? visible : !series.visible;
    
    return series.visible;
  }
  
  // Ölçeklendirme tamponunu sıfırlar
  _resetScaleBuffer() {
    this._scaleBuffer = {
      minY: [],
      maxY: [],
      samples: 0
    };
  }
  
  // Ölçeklendirme tamponunu günceller
  _updateScaleBuffer(value) {
    if (!this.autoScale) return;
    
    const buffer = this._scaleBuffer;
    
    buffer.minY.push(value);
    buffer.maxY.push(value);
    buffer.samples++;
    
    // Tampon boyutunu sınırla
    const bufferSize = 20;
    if (buffer.minY.length > bufferSize) buffer.minY.shift();
    if (buffer.maxY.length > bufferSize) buffer.maxY.shift();
    
    // Yeterli örnek toplandıysa otomatik ölçeklendirmeyi uygula
    if (buffer.samples >= 10) {
      const minValue = Math.min(...buffer.minY);
      const maxValue = Math.max(...buffer.maxY);
      
      if (maxValue > minValue) {
        // Değer aralığına %10 marj ekle
        const range = maxValue - minValue;
        const margin = range * 0.1;
        this.minY = Math.max(0, minValue - margin); // Negatif değilse 0'dan başlat
        this.maxY = maxValue + margin;
      }
    }
  }
  
  // Grafiği çizer
  draw() {
    if (!this.canvas || !this.ctx) return;
    
    const ctx = this.ctx;
    const canvas = this.canvas;
    const padding = this.padding;
    
    // Ölçeklendirme değerlerini kontrol et
    if (this.minY === this.maxY) {
      this.maxY = this.minY + 1; // Eşit değerler varsa, görüntülemek için fark oluştur
    }
    
    // Canvas boyutunu ayarla
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Canvas boyutlarını ayarla
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    // Canvas'ı temizle
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Çizim alanı boyutlarını hesapla
    const width = rect.width;
    const height = rect.height;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Başlık çiz
    if (this.title) {
      ctx.font = 'bold 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(this.title, width / 2, padding.top - 5);
    }
    
    // Arkaplan ızgarasını çiz
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Yatay ızgaralar
    for (let i = 0; i <= this.gridLines; i++) {
      const y = padding.top + chartHeight * (1 - i / this.gridLines);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
      
      // Y ekseni değerlerini çiz
      const value = this.minY + (i / this.gridLines) * (this.maxY - this.minY);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(value.toFixed(1), padding.left - 5, y + 4);
    }
    
    // Dikey ızgaralar
    const timeRanges = [0, 0.25, 0.5, 0.75, 1]; // Zaman aralığı yüzdeleri
    for (const t of timeRanges) {
      const x = padding.left + chartWidth * t;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
    }
    
    // Zaman etiketi (X ekseni)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Zaman (saniye)', width / 2, height - 8);
    
    // X ekseni zaman değerlerini çiz
    const now = Date.now();
    const secInMs = 1000;
    for (const t of timeRanges) {
      const x = padding.left + chartWidth * t;
      const secAgo = ((1 - t) * this.timeWindow) / secInMs;
      const label = secAgo === 0 ? 'şimdi' : `-${secAgo.toFixed(0)}s`;
      ctx.fillText(label, x, height - padding.bottom + 15);
    }
    
    // Birim etiketi (Y ekseni)
    if (this.unitLabel) {
      ctx.save();
      ctx.translate(15, height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillText(this.unitLabel, 0, 0);
      ctx.restore();
    }
    
    // Görünür serilerin sayısını kontrol et
    let visibleSeries = 0;
    this.series.forEach(series => {
      if (series.visible && series.data.length > 0) visibleSeries++;
    });
    
    if (visibleSeries === 0) {
      // Veri yoksa bilgi mesajı göster
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Veri yok veya sinyal seçilmedi', width / 2, height / 2);
      return;
    }
    
    // Her seri için alan grafiği çiz
    const currentTime = now();
    let legendY = padding.top + 15;
    
    this.series.forEach(series => {
      if (!series.visible || series.data.length === 0) return;
      
      const points = [];
      
      // Veri noktalarını ekran koordinatlarına dönüştür
      for (const [timestamp, value] of series.data) {
        const timeRatio = (currentTime - timestamp) / this.timeWindow;
        if (timeRatio > 1 || timeRatio < 0) continue; // Zaman penceresi dışındaysa atla
        
        const x = padding.left + chartWidth * (1 - timeRatio);
        const valueRatio = (value - this.minY) / (this.maxY - this.minY);
        const y = padding.top + chartHeight * (1 - valueRatio);
        
        points.push({x, y});
      }
      
      if (points.length === 0) return; // Geçerli nokta yoksa çizme
      
      // Önce çizgi çiz
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      
      ctx.strokeStyle = series.color.line;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Sonra alan dolgusu çiz
      ctx.beginPath();
      ctx.moveTo(points[0].x, padding.top + chartHeight); // Başlangıçta taban çizgisine
      
      // Veri noktalarını bağla
      for (const point of points) {
        ctx.lineTo(point.x, point.y);
      }
      
      // Alanı kapat
      ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
      ctx.closePath();
      
      // Alanı doldur
      ctx.fillStyle = series.color.fill;
      ctx.fill();
      
      // Seri için gösterge çiz
      ctx.fillStyle = series.color.line;
      ctx.fillRect(padding.left + 5, legendY - 8, 12, 3);
      
      // Etiket ve güncel değer
      ctx.textAlign = 'left';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.fillText(`${series.label}: ${series.current?.toFixed(2) || 'N/A'}`, padding.left + 22, legendY);
      
      legendY += 20; // Sonraki gösterge için dikey konumu güncelle
    });
  }
  
  // Grafiği canlı olarak günceller
  startLiveUpdate() {
    if (this.animationFrame) return; // Zaten çalışıyorsa çıkış yap
    
    const updateFrame = () => {
      if (this.visible) {
        this.draw();
      }
      this.animationFrame = requestAnimationFrame(updateFrame);
    };
    
    this.animationFrame = requestAnimationFrame(updateFrame);
  }
  
  // Canlı güncellemeyi durdurur
  stopLiveUpdate() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
  
  // Grafik görünürlüğünü ayarla
  setVisible(visible) {
    this.visible = visible;
    
    if (visible && !this.animationFrame) {
      this.startLiveUpdate();
    } else if (!visible && this.animationFrame) {
      this.stopLiveUpdate();
    }
  }
  
  // Tüm verileri temizler
  clearData() {
    this.series.forEach(series => {
      series.data = [];
      series.min = Number.POSITIVE_INFINITY;
      series.max = Number.NEGATIVE_INFINITY;
      series.current = null;
    });
    
    this._resetScaleBuffer();
    this.draw();
  }
  
  // Ölçek aralığını manuel olarak ayarlar
  setYRange(min, max, autoScale = false) {
    this.minY = min;
    this.maxY = max;
    this.autoScale = autoScale;
    this._resetScaleBuffer();
    this.draw();
  }
  
  // Birim etiketini ayarlar
  setUnitLabel(label) {
    this.unitLabel = label;
    this.draw();
  }
  
  // Başlık ayarla
  setTitle(title) {
    this.title = title;
    this.draw();
  }
}
