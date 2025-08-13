import { ArcGauge } from './arcGauge.js';

export class TemperatureGauges {
  constructor(coolantCanvas, oilCanvas, exhaustCanvas){
    // Daha modern ve özelleştirilmiş göstergeler
    this.coolant = new ArcGauge(coolantCanvas, {
      min: 60,
      max: 120,
      value: 90,
      unit: '°C',
      label: 'Motor Soğutma Sıvısı',
      bands: [
        {t: 0.33, col: '#10b981', gradient: '#34d399,#6ee7b7'}, // Yeşil - Normal
        {t: 0.66, col: '#f59e0b', gradient: '#f59e0b,#fbbf24'}, // Turuncu - Dikkat
        {t: 1, col: '#ef4444', gradient: '#f87171,#ef4444'}     // Kırmızı - Tehlikeli
      ],
      showNeedle: true
    });
    
    this.oil = new ArcGauge(oilCanvas, {
      min: 60,
      max: 140,
      value: 95,
      unit: '°C',
      label: 'Yağ Sıcaklığı',
      bands: [
        {t: 0.4, col: '#10b981', gradient: '#34d399,#6ee7b7'},  // Yeşil - Normal
        {t: 0.7, col: '#f59e0b', gradient: '#f59e0b,#fbbf24'},  // Turuncu - Dikkat
        {t: 1, col: '#ef4444', gradient: '#f87171,#ef4444'}     // Kırmızı - Tehlikeli
      ],
      showNeedle: true
    });
    
    this.exhaust = new ArcGauge(exhaustCanvas, {
      min: 200,
      max: 600,
      value: 320,
      unit: '°C',
      label: 'Egzoz Sıcaklığı',
      bands: [
        {t: 0.3, col: '#60a5fa', gradient: '#60a5fa,#93c5fd'},  // Mavi - Düşük
        {t: 0.6, col: '#10b981', gradient: '#34d399,#6ee7b7'},  // Yeşil - Normal
        {t: 0.8, col: '#f59e0b', gradient: '#f59e0b,#fbbf24'},  // Turuncu - Yüksek
        {t: 1, col: '#ef4444', gradient: '#f87171,#ef4444'}     // Kırmızı - Tehlikeli
      ],
      showNeedle: true
    });
  }
  
  setValues({coolant, oil, exhaust}){
    if(coolant != null) this.coolant.setValue(coolant);
    if(oil != null)     this.oil.setValue(oil);
    if(exhaust != null) this.exhaust.setValue(exhaust);
  }
  
  draw(){ 
    this.coolant.draw(); 
    this.oil.draw(); 
    this.exhaust.draw(); 
  }
  
  // Tüm değerleri temizler ve varsayılan değerlere döner
  clear() {
    this.coolant.setValue(90);
    this.oil.setValue(95);
    this.exhaust.setValue(320);
  }
}
