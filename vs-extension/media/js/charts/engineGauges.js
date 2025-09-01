import { ArcGauge } from './arcGauge.js';

export class EngineGauges {
  constructor(oilPressureCanvas, batteryVoltageCanvas, intakeManifoldCanvas, opts={}) {
    // Yağ basıncı göstergesi
    this.oilPressure = new ArcGauge(oilPressureCanvas, {
      min: 0,
      max: 1200,
      value: 0,
      unit: ' kPa',
      label: 'Oil Pressure',
      thresholds: { cold: 150, normal: 550, hot: 800 },
      showNeedle: true,
      showValue: false
    });
    
    // Akü voltaj göstergesi
    this.batteryVoltage = new ArcGauge(batteryVoltageCanvas, {
      min: 8,
      max: 32,
      value: 0,
      unit: ' V',
      label: 'Battery Voltage',
      thresholds: { cold: 11, normal: 27, hot: 29 },
      showNeedle: true,
      showValue: false
    });
    
    // Manifold basıncı göstergesi
    this.intakeManifold = new ArcGauge(intakeManifoldCanvas, {
      min: 0,
      max: 500,
      value: 0,
      unit: ' kPa',
      label: 'Manifold Pressure',
      thresholds: { cold: 120, normal: 250, hot: 400 },
      showNeedle: true,
      showValue: false
    });

    // Opsiyonel ek sıcaklık göstergeleri (ayrı panelde oluşturulan canvaslar)
    if(opts.coolantCanvas){
      this.coolantTemp = new ArcGauge(opts.coolantCanvas, {
  // Sadece negatif değerleri gösterecek form: -300 .. 0
  min: -300, max: 0, value: -300, unit: ' °C', label: 'Coolant Temp',
  // Tek renk (oil temp tarzı) – segmentler mavi tonunda ilerlesin
  colorStops: [ { upTo: 0, color:'#3b82f6' } ],
  showNeedle:true, showValue:false
      });
    }
    if(opts.oilTempCanvas){
      this.oilTemp = new ArcGauge(opts.oilTempCanvas, {
        min: 0, max: 150, value: 0, unit: ' °C', label: 'Oil Temp',
        thresholds: { cold: 50, normal: 110, hot: 130 }, showNeedle:true, showValue:false
      });
    }
    if(opts.exhaustTempCanvas){
      this.exhaustTemp = new ArcGauge(opts.exhaustTempCanvas, {
        min: 0, max: 800, value: 0, unit: ' °C', label: 'Exhaust Temp',
        thresholds: { cold: 150, normal: 400, hot: 650 }, showNeedle:true, showValue:false
      });
    }
  }
  
  setValues({ oilPressure, batteryVoltage, intakeManifold, coolantTemp, oilTemp, exhaustTemp }) {
    if (oilPressure != null) this.oilPressure.setValue(oilPressure);
    if (batteryVoltage != null) this.batteryVoltage.setValue(batteryVoltage);
    if (intakeManifold != null) this.intakeManifold.setValue(intakeManifold);
    // Sıcaklıklar için ham/şüpheli değer sanitizasyonu
    const sanitize = (val, min, max) => {
      if (val == null || isNaN(val)) return null;
      // Aşırı uç / muhtemel decode hataları: çok düşük (< min-20) veya çok yüksek (> max*1.5)
      if (val < (min - 20) || val > max * 1.5) return null;
      if (val < min) val = val; // negatifler tutulur, gauge min altında ise segmentte min'e oturacak
      if (val > max) val = max;
      return val;
    };
    if (coolantTemp != null && this.coolantTemp) { // null -> boş mod, gerçek veri gelince set edilecek
      const v = sanitize(coolantTemp, -300, 0);
      if(v!=null) this.coolantTemp.setValue(v);
    }
    if (oilTemp != null && this.oilTemp) {
      const v = sanitize(oilTemp, 0, 150);
      if(v!=null) this.oilTemp.setValue(v);
    }
    if (exhaustTemp != null && this.exhaustTemp) {
      const v = sanitize(exhaustTemp, 0, 800);
      if(v!=null) this.exhaustTemp.setValue(v);
    }
  }
  
  draw() {
    this.oilPressure.draw();
    this.batteryVoltage.draw();
    this.intakeManifold.draw();
    if(this.coolantTemp) this.coolantTemp.draw();
    if(this.oilTemp) this.oilTemp.draw();
    if(this.exhaustTemp) this.exhaustTemp.draw();
  }
}
