import { LineChart, now } from '../core/chartCore.js';

export class SpeedChart extends LineChart {
  constructor(canvas) {
    super(canvas, '#60a5fa', {
      name: 'Speed',
      yLabel: 'Speed (km/h)',
      referenceLines: [{ value:50, label:'50', color:'#64748b', dash:[6,4] }],
      showTimeAxis: true,
      timeAxisFormat: 'HH:MM',
      tooltipDateFormat: 'YYYY-MM-DD HH:MM:ss',
      smoothingFactor: 0.35,
      showLastTimestamp: true,
      liveMode: true,
      targetFps: 60,
      autoMidline: true,
      tightY: false,
      dynamicNiceY: true, 
      forceZeroMin: true,
      yTickStep: 20 // Her 20 km/h'de bir tick
    });
    
    // Speed chart için özel padding ayarı - SONRADAN değiştir
    // Bu padding, super() çağrısından sonra ayarlanmalı
    // Çünkü super() içinde padding hesaplaması yapılıyor
    
    this.points = [];
    this._primed = false;
    this.setRange(now()-60, now());
    
    // Padding'i constructor'ın sonunda ayarla
    this.pad.b = 80; // Time axis + timestamp için daha fazla alan
    // Titremeyi azaltmak için ekstra ölçek / manuel resize kaldırıldı.
    // Sadece görünür olduğunda yeniden çiz.
    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'visible') this.draw();
    });
    this._firstForceDrawDone = false;
  }
  
  pushSample(t, v) {
    // İlk gerçek veri: başlangıç üçgenini engelle
    if(!this._primed){
      this.data = [];
      this.points = [];
      // İlk 10 saniyeyi geçmişe yayarak daha dolu bir başlangıç görünümü
  const start = t-60;
  // İlk nokta eksen çizgilerinin görünmesi için ufak offset ile (1s) kaydırılabilir
  for(let tt=start+1; tt<=t; tt+=5){
        this.push(tt, v);
        this.points.push({t:tt, v});
      }
      this._primed = true;
      this.setRange(start, t);
      return;
    }

    this.push(t, v);
    this.points.push({t, v});
    
    // Keep reasonable amount of data in memory
    if (this.points.length > 500) {
      this.points = this.points.slice(-500);
    }
    
    // Adjust time window
    this.setRange(t-60, t);
    // İlk force draw: görünürlük kontrolünü atlayarak eksen metriklerini hazırla
    if(!this._firstForceDrawDone){
      this._firstForceDrawDone = true;
      const origHidden = window.canAppHidden;
      window.canAppHidden = false; // geçici
      this._drawNow();
      window.canAppHidden = origHidden;
    }
  }
  
  // Proper implementation of clearData
  clearData() {
    // Clear underlying chart data
    this.data = [];
    this.points = [];
  this._primed = false;
    
    // Set initial empty state with current time range
    const currentTime = now();
    this.push(currentTime-60, 0);
    this.push(currentTime, 0);
    this.setRange(currentTime-60, currentTime);
  }
  
  // Cleanup fonksiyonu
  destroy() {
  // Ek cleanup gerekmiyor; temel sınıfta destroy yok.
  }
}
