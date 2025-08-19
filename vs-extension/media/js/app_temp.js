import { now } from './core/chartCore.js';
import { SpeedChart } from './charts/speedChart.js';
import { RpmChart }   from './charts/rpmChart.js';
import { GpsChart }   from './charts/gpsChart.js';
import { PressureChart } from './charts/pressureChart.js';
import { FuelRateChart } from './charts/fuelRateChart.js';
import { renderJSONTree } from './core/jsonTree.js';
import { VehicleViewer } from './three/vehicleViewer_new.js';
import { FuelGauge } from './charts/arcGauge.js';
import { TemperatureGauges } from './charts/tempGauges.js';

// Tabs - performans iyileştirmeli
const tabs = document.querySelectorAll('.tab');
const pages = { dash: document.getElementById('page-dash'), feed: document.getElementById('page-feed') };
let isTabSwitching = false;

tabs.forEach(t => t.addEventListener('click', () => {
  if (isTabSwitching) return; // Sekme geçişi sırasında yeni tıklamaları engelle
  isTabSwitching = true;

  // Aktif sekmeyi değiştir
  tabs.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  
  // Sayfaları değiştir - RAF kullanarak tarayıcı render sürecini optimize et
  requestAnimationFrame(() => {
    Object.values(pages).forEach(p => p.classList.remove('active'));
    pages[t.dataset.tab]?.classList.add('active');
    localStorage.setItem('can.tab', t.dataset.tab);
    
    // Görünür sayfadaki canvas elementleri için yeniden boyutlandırma tetikle
    if (t.dataset.tab === 'dash') {
      speed.draw();
      rpm.draw();
      gps.draw();
      pressure.draw(); 
      fuelRate.draw();
      fuelGauge.draw();
      tGauges.draw();
    }

    // İşlem tamamlandıktan sonra kilit kaldır
    setTimeout(() => {
      isTabSwitching = false;
    }, 100);
  });
}));

// Kayıtlı sekmeyi yükle
const savedTab = localStorage.getItem('can.tab'); 
if(savedTab && pages[savedTab]) {
  // Sayfa yüklendikten sonra sekmeye geç (gecikme ile)
  setTimeout(() => {
    document.querySelector(`.tab[data-tab="${savedTab}"]`)?.click();
  }, 100);
}

// Chips persistence
['busSel','decodeSel','viewSel','rateSel','idFilter'].forEach(id=>{
  const el = document.getElementById(id);
  const key = 'can.'+id;
  const v = localStorage.getItem(key);
  if(v != null) el.value = v;
  el.addEventListener('change',()=>localStorage.setItem(key, el.value));
});
const decodeSel = document.getElementById('decodeSel');
const signalSel = document.getElementById('signalSel');
decodeSel.addEventListener('change',()=>{ signalSel.disabled = decodeSel.value !== 'DBC'; });

document.getElementById('pauseBtn').addEventListener('click', (e)=>{
  paused = !paused; e.currentTarget.textContent = paused ? '▶ Resume' : '⏸ Pause';
});

// Sayfa görünürlüğünü takip ederek performans optimizasyonu yap
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Sayfa gizli ise güncelleme sıklığını azalt
    console.log('Sayfa gizli, performans optimizasyonu aktif');
    window.canAppHidden = true;
  } else {
    // Sayfa görünür ise normal güncelleme
    console.log('Sayfa görünür, normal performansa dönülüyor');
    window.canAppHidden = false;
    
    // Görünür durumdaki charları hemen güncelle
    if (document.getElementById('page-dash').classList.contains('active')) {
      speed.draw();
      rpm.draw();
      gps.draw();
      pressure.draw(); 
      fuelRate.draw();
      fuelGauge.draw();
      tGauges.draw();
    }
  }
});

// Status counters
let total = 0, tickCount=0, paused=false;
const mqttDot = document.getElementById('mqttDot');
const canDot = document.getElementById('canDot');
const connTxt = document.getElementById('connTxt');
const mpsEl = document.getElementById('mps'); 
const totalEl = document.getElementById('total'); 
const lastTopicEl = document.getElementById('lastTopic');

// MQTTve CAN bağlantı durumu izleme
let lastCanMsgTime = 0;
let mqttConnected = false;

// Her saniye bağlantı durumunu güncelle
setInterval(() => { 
  mpsEl.textContent = tickCount.toString(); 
  
  // 5 saniyedir CAN mesajı gelmediyse CAN bağlantısı kesilmiş olabilir
  const now = Date.now();
  if (now - lastCanMsgTime > 5000) {
    canDot.className = 'dot fail';
  }
  
  // Bağlantı durumu metni
  if (mqttConnected && (now - lastCanMsgTime < 5000)) {
    connTxt.textContent = 'Bağlantı Kuruldu';
  } else if (mqttConnected) {
    connTxt.textContent = 'MQTT Bağlı, CAN Bekleniyor';
  } else {
    connTxt.textContent = 'Bağlantı Kesildi';
  }
  
  tickCount = 0; 
}, 1000);

// Charts - lazy loading ve performance tracking eklenmiş
const chartInitTime = performance.now();
console.log('Grafikler yükleniyor...');

const speed = new SpeedChart(document.getElementById('speed'));
const rpm   = new RpmChart(document.getElementById('rpm'));
const gps   = new GpsChart(document.getElementById('map'));
const pressure = new PressureChart(document.getElementById('pressure'));
const fuelRate = new FuelRateChart(document.getElementById('fuelRate'));
const fuelGauge = new FuelGauge(document.getElementById('fuel'));
const tGauges = new TemperatureGauges(document.getElementById('gCoolant'), document.getElementById('gOil'), document.getElementById('gExhaust'));

console.log(`Tüm grafikler yüklendi - süre: ${(performance.now() - chartInitTime).toFixed(2)}ms`);

// Grafikleri temizleme fonksiyonu
function clearAllCharts() {
  // Tüm grafiklerin veri noktalarını temizle
  speed.clearData();
  rpm.clearData();
  gps.clearData();
  pressure.clearData();
  fuelRate.clearData();
  
  // Dashboard göstergelerini sıfırla
  const kpiSpeed = document.getElementById('kpiSpeed');
  if (kpiSpeed) {
    kpiSpeed.textContent = "0 km/h";
  }
  
  // Göstergeleri varsayılan değerlere ayarla
  fuelGauge.setValue(50);
  tGauges.setValues({
    coolant: 90,  // Varsayılan motor sıcaklığı
    oil: 95,      // Varsayılan yağ sıcaklığı
    exhaust: 320  // Varsayılan egzoz sıcaklığı
  });
  
  // Grafikleri yeniden çiz
  speed.draw();
  rpm.draw();
  gps.draw();
  pressure.draw(); 
  fuelRate.draw();
  fuelGauge.draw();
  tGauges.draw();
}

// Temizleme butonuna tıklama işlevi ekle
document.getElementById('clearCharts').addEventListener('click', clearAllCharts);

// Grafiklerin ilk çizimini planla
requestAnimationFrame(() => {
  speed.draw();
  rpm.draw();
  gps.draw();
  pressure.draw(); 
  fuelRate.draw();
  fuelGauge.draw();
  tGauges.draw();
});

// Demo seeds
import('./seed.mjs').then(m=>m.seedAll({speed,rpm,gps,pressure,fuelRate,fuelGauge,tGauges}));

// 3D viewer - URI kontrolü ve başlatma
let vehicleUri = 'https://vscode-remote%2Bwsl-002bubuntu-002d18-002e04.vscode-resource.vscode-cdn.net/home/mustafa/C%2B%2B/vsCANView/vs-extension/media/vehicle.glb';
let viewer = null;

console.log('Vehicle URI kontrol ediliyor:', vehicleUri);

// URI placeholder değiştirilmişse direkt başlat
if (vehicleUri && vehicleUri !== '__VEHICLE_URI__') {
  console.log('Vehicle URI bulundu, VehicleViewer başlatılıyor:', vehicleUri);
  startVehicleViewer(vehicleUri);
} else {
  console.log('Vehicle URI placeholder henüz değiştirilmemiş');
  const noticeEl = document.getElementById('vehicleNotice');
  if (noticeEl) noticeEl.textContent = 'Vehicle model yükleniyor...';
}

function startVehicleViewer(uri) {
  // Modeli yükleme işlemi başlıyor - notice'ı tamamen gizle
  const noticeEl = document.getElementById('vehicleNotice');
  if (noticeEl) {
    noticeEl.textContent = '';
    noticeEl.style.display = 'none'; // Tamamen gizle
  }
  
  viewer = new VehicleViewer(
    document.getElementById('vehicleCanvas'), 
    document.getElementById('vehicleNotice'), 
    uri
  );
  console.log('VehicleViewer oluşturuluyor...');
  viewer.init().then(() => {
    // Başarıyla yüklenince notice elementinin stil özelliklerini temizle
    if (noticeEl) noticeEl.style.display = 'none';
    console.log('VehicleViewer başarıyla başlatıldı');
  }).catch(err => {
    // Sadece hata durumunda göster
    if (noticeEl) {
      noticeEl.textContent = 'Hata: ' + err.message;
      noticeEl.style.display = 'block';
    }
    console.error('VehicleViewer başlatma hatası:', err);
  });
}

// Feed
const feedEl = document.getElementById('feed');
const feedArr = [];
// Feed DOM güncellemeleri için performans optimizasyonu
let feedUpdateScheduled = false;
let feedBuffer = [];

function pushFeed(topic, payload){
  const ts = new Date().toLocaleTimeString();
  
  // Önce verilerı tampona ekle
  feedBuffer.push({ts, topic, payload});
  feedArr.push({ts, topic, payload});
  
  // Fazla verileri temizle
  while(feedArr.length > 400) feedArr.shift();
  
  // Eğer planlı bir güncelleme yoksa, bir tane planla
  if (!feedUpdateScheduled) {
    feedUpdateScheduled = true;
    
    // requestAnimationFrame ile DOM güncellemelerini optimize et
    requestAnimationFrame(() => {
      // Tampondaki tüm verileri ekle
      const fragment = document.createDocumentFragment();
      
      // Son 25 öğeyi ekle (performans için sınırla)
      const itemsToAdd = feedBuffer.slice(-25);
      
      for (const item of itemsToAdd) {
        const row = document.createElement('div');
        row.className = 'row';
        
        const cTime = document.createElement('div');
        cTime.textContent = item.ts;
        
        const cTopic = document.createElement('div');
        cTopic.className = 'topic';
        cTopic.textContent = item.topic;
        
        const cJson = document.createElement('div');
        const holder = document.createElement('div');
        renderJSONTree(holder, item.payload);
        cJson.appendChild(holder);
        
        row.appendChild(cTime);
        row.appendChild(cTopic);
        row.appendChild(cJson);
        
        fragment.prepend(row);
      }
      
      // Fragment'ı bir kerede ekle
      feedEl.prepend(fragment);
      
      // Fazla DOM node'larını temizle
      while (feedEl.childElementCount > 400) {
        feedEl.removeChild(feedEl.lastChild);
      }
      
      // Tamponu temizle ve planlama durumunu sıfırla
      feedBuffer = [];
      feedUpdateScheduled = false;
    });
  }
}
document.getElementById('clearFeed').addEventListener('click', ()=>{ feedEl.innerHTML=''; feedArr.length=0; });
document.getElementById('exportFeed').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(feedArr, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='can-feed.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
});

// MQTT bridge - vehicleUri mesajını da yakalayacak şekilde güncellenmiş
window.addEventListener('message', (ev) => {
  const msg = ev.data; if(!msg) return;
  
  // Vehicle URI mesajı kontrolü ekle
  if (msg.type === 'vehicleUri' && msg.uri) {
    console.log('MQTT Listener\'da Vehicle URI alındı:', msg.uri);
    if (!viewer) {
      // Yazıyı gizle
      const noticeEl = document.getElementById('vehicleNotice');
      if (noticeEl) {
        noticeEl.textContent = '';
        noticeEl.style.display = 'none';
      }
      
      viewer = new VehicleViewer(
        document.getElementById('vehicleCanvas'), 
        document.getElementById('vehicleNotice'), 
        msg.uri
      );
      console.log('VehicleViewer oluşturuluyor...');
      viewer.init().then(() => {
        console.log('VehicleViewer başlatıldı');
        // Burada da gizle
        if (noticeEl) noticeEl.style.display = 'none';
      }).catch(err => {
        console.error('VehicleViewer başlatma hatası:', err);
        // Sadece hata durumunda göster
        if (noticeEl) {
          noticeEl.textContent = 'Hata: ' + err.message;
          noticeEl.style.display = 'block';
        }
      });
    }
    return;
  }
  
  if(msg.type === 'conn'){ 
    const ok = !!msg.ok; 
    mqttDot.className = 'dot ' + (ok ? 'ok' : 'fail');
    mqttConnected = ok;
    return; 
  }
  if(msg.type === 'can' && !paused){
    const { topic, payload } = msg;
    const t = (payload.t) ? +payload.t : now();
    total++; tickCount++; totalEl.textContent = total.toString(); lastTopicEl.textContent = topic;
    
    // CAN mesajı alındı, CAN bağlantısını güncelle
    lastCanMsgTime = Date.now();
    canDot.className = 'dot ok';

    // Aktif sekmeyi ve sayfa durumunu kontrol et
    const isActiveDashboard = document.getElementById('page-dash').classList.contains('active');
    const isPageVisible = !window.canAppHidden;

    // Çizim optimizasyonu
    let shouldDraw = isActiveDashboard && isPageVisible;
    const messageRate = tickCount; // Saniyedeki mesaj sayısı
    
    // Mesaj hızına göre adaptif çizim stratejisi
    if (messageRate < 10) {
      shouldDraw = shouldDraw && true; // Her mesajı çiz
    } else if (messageRate < 30) {
      shouldDraw = shouldDraw && (tickCount % 3 === 0); // Her 3 mesajda bir
    } else if (messageRate < 60) {
      shouldDraw = shouldDraw && (tickCount % 5 === 0); // Her 5 mesajda bir
    } else {
      shouldDraw = shouldDraw && (tickCount % 10 === 0); // Her 10 mesajda bir
    }
    
    // Veri ekle ve gerektiğinde çiz
    // Veri işleme ve çizim işlemleri
    let updatedCharts = new Set();
    
    // Hız verisi
    if((/speed/i.test(topic) && typeof payload.speedKmh === 'number') || 
       (payload.signals && typeof payload.signals.WheelBasedVehicleSpeed === 'number')) {
      const speedValue = payload.speedKmh || 
                        (payload.signals ? payload.signals.WheelBasedVehicleSpeed : undefined);
      if (speedValue !== undefined) {
        // Grafik güncelleme
        speed.pushSample(t, +speedValue);
        updatedCharts.add(speed);
        
        // Dashboard hız göstergesi güncelleme
        const kpiSpeed = document.getElementById('kpiSpeed');
        if (kpiSpeed) {
          const roundedSpeed = Math.round(speedValue);
          kpiSpeed.textContent = `${roundedSpeed} km/h`;
        }
        
        console.log('Hız değeri güncellendi:', speedValue);
      }
    }
    
    // Motor RPM
    if((/rpm/i.test(topic) && typeof payload.rpm === 'number') || 
       (payload.signals && typeof payload.signals.EngSpeed === 'number')) {
      const rpmValue = payload.rpm || (payload.signals ? payload.signals.EngSpeed : undefined);
      if (rpmValue !== undefined) {
        rpm.pushSample(t, +rpmValue);
        updatedCharts.add(rpm);
        console.log('RPM değeri güncellendi:', rpmValue);
      }
    }
    
    // Basınç değeri
    if(payload.kpa != null) {
      pressure.pushSample(t, +payload.kpa);
      updatedCharts.add(pressure);
    }
    
    // Yakıt tüketimi
    if(payload.lph != null) {
      fuelRate.pushSample(t, +payload.lph);
      updatedCharts.add(fuelRate);
    }
    
    // Sıcaklık göstergeleri
    if(payload.coolant != null || payload.oil != null || payload.exhaust != null) {
      tGauges.setValues({
        coolant: payload.coolant,
        oil: payload.oil,
        exhaust: payload.exhaust
      });
      updatedCharts.add(tGauges);
    }
    
    // Yakıt seviyesi
    if(payload.fractionFuel != null) {
      fuelGauge.setValue(+payload.fractionFuel * 100);
      updatedCharts.add(fuelGauge);
    }
    
    // GPS konumu
    if(payload.gps && payload.gps.lat != null && payload.gps.lon != null) {
      gps.setPoints([...(gps.points||[]), {
        lat: +payload.gps.lat,
        lon: +payload.gps.lon
      }]);
      updatedCharts.add(gps);
    }
    
    // Toplu çizim güncelleme
    if(shouldDraw && updatedCharts.size > 0) {
      requestAnimationFrame(() => {
        updatedCharts.forEach(chart => chart.draw());
      });
    }
    
    // Feed verilerini her zaman sakla
    // Mesaj hızına göre adaptif güncelleme
    if (messageRate < 20) {
      // Düşük hızda tüm mesajları ekle
      pushFeed(topic, payload);
    } else if (messageRate < 50) {
      // Orta hızda her 2 mesajda bir ekle
      tickCount % 2 === 0 && pushFeed(topic, payload);
    } else {
      // Yüksek hızda her 3 mesajda bir ekle
      tickCount % 3 === 0 && pushFeed(topic, payload);
    }
    
    // Feed görünür durumdaysa DOM'u güncelle
    const isActiveFeed = document.getElementById('page-feed').classList.contains('active');
    if (isActiveFeed && !feedUpdateScheduled) {
      feedUpdateScheduled = true;
      requestAnimationFrame(() => {
        // Son mesajları görüntüle
        const fragment = document.createDocumentFragment();
        const itemsToShow = feedArr.slice(-25);
        
        for (const item of itemsToShow) {
          const row = document.createElement('div');
          row.className = 'row';
          
          const cTime = document.createElement('div');
          cTime.textContent = item.ts;
          
          const cTopic = document.createElement('div');
          cTopic.className = 'topic';
          cTopic.textContent = item.topic;
          
          const cJson = document.createElement('div');
          const holder = document.createElement('div');
          renderJSONTree(holder, item.payload);
          cJson.appendChild(holder);
          
          row.appendChild(cTime);
          row.appendChild(cTopic);
          row.appendChild(cJson);
          
          fragment.appendChild(row);
        }
        
        // Feed içeriğini temizle ve yeni mesajları ekle
        feedEl.innerHTML = '';
        feedEl.appendChild(fragment);
        
        feedUpdateScheduled = false;
      });
    }
  }
});

// Resize - performans optimizasyonlu
let resizeTimeout = null;
window.addEventListener('resize', () => { 
  // Resize işlemlerini optimize et - çoklu çağrıları engelle
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const activeTab = document.querySelector('.tab.active')?.dataset?.tab;
    if (activeTab === 'dash' || !activeTab) {
      // Görünür sayfadaki canvas elementleri için yeniden boyutlandırma tetikle
      speed.draw(); 
      rpm.draw(); 
      gps.draw(); 
      pressure.draw(); 
      fuelRate.draw(); 
      fuelGauge.draw(); 
      tGauges.draw();
    }
    resizeTimeout = null;
  }, 250); // 250ms gecikme ile yeniden boyutlandırma olaylarını birleştir
});
