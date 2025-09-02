import { now, ctx2d } from './core/chartCore.js';
import { SpeedChart } from './charts/speedChart.js';
import { RpmChart }   from './charts/rpmChart.js';
import { NavMap } from './maps/navMap.js';
import { PressureChart } from './charts/pressureChart.js';
import { FuelRateChart } from './charts/fuelRateChart.js';
import { renderJSONTree } from './core/jsonTree.js';
import { VehicleViewer } from './three/vehicleViewer_new.js';
import { FuelGauge } from './charts/arcGauge.js';
import { EngineGauges } from './charts/engineGauges.js';
import { AreaMultiChart } from './charts/areaMultiChart.js';
import { MultiSignalChart } from './charts/multiSignalChart.js';

// =================== FILTRE YARDIMCI FONKSIYONLARI ===================
function getIdFilter(){
  const el = document.getElementById('idFilter');
  return (el?.value || '').trim();
}

function normalizeHex(str){
  return str.replace(/^0x/i,'').toUpperCase();
}

function passesIdFilter(entry){
  const f = getIdFilter();
  if(!f) return true; // boş filtre
  const fUpper = f.toUpperCase();

  const { topic, payload } = entry;
  // 1) Mesaj name tam eşleşme
  if(payload?.name && payload.name.toUpperCase() === fUpper) return true;

  // 2) Topic içinde arama (PGN / raw id kısmı)
  if(topic && topic.toUpperCase().includes(fUpper)) return true;

  // 3) Hex veya decimal ID eşleşmesi (payload.id varsa)
  if(payload && payload.id != null){
    const decId = String(payload.id);
    if(decId === f) return true;
    // Hexe çevir (8+ karakter olabilir)
    const hexId = payload.id.toString(16).toUpperCase();
    if(hexId === normalizeHex(fUpper)) return true;
  }

  // 4) Filtre hex görünümlü ise topic'te hex parça kontrolü
  if(/^(0x)?[0-9a-fA-F]+$/.test(f)){ // sadece hex karakterler
    const hexFrag = normalizeHex(f);
    if(topic && topic.toUpperCase().includes(hexFrag)) return true;
  }

  return false;
}

function reRenderFeed(){
  const f = getIdFilter();
  feedEl.innerHTML = '';
  const data = f ? feedArr.filter(e=>passesIdFilter(e)) : feedArr; // mevcut ham dizi üzerinden filtrele
  const fragment = document.createDocumentFragment();
  const items = data.slice(-200);
  for(const item of items){
    fragment.prepend(buildFeedRow(item));
  }
  feedEl.prepend(fragment);
}

// Tabs - performans iyileştirmeli
const tabs = document.querySelectorAll('.tab');
const pages = { 
  dash: document.getElementById('page-dash'), 
  feed: document.getElementById('page-feed'),
  signals: document.getElementById('page-signals'), // Signals sayfasını ekledik
  dtc: document.getElementById('page-dtc'),
  sim: document.getElementById('page-sim'),
  log: document.getElementById('page-log'),
  script: document.getElementById('page-script')
};
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
      // Sekme geçişinde layout hesaplamasının tamamlanması için iki aşamalı redraw
      speed.draw();
      rpm.draw();
      navMap.draw();
      pressure.draw(); 
      fuelRate.draw();
      fuelGauge.draw();
      engineGauges.draw();
      // Ek: bazı tarayıcılarda gizli tab -> görünür geçişte ilk frame ölçümleri eksen/padding'i yanlış hesaplayabiliyor.
      // Bir sonraki layout flush sonrasında zorunlu tekrar çiz.
      requestAnimationFrame(()=>{
        speed.draw();
      });
      // Layout stabil olduktan sonra (örn. CSS transition) yeniden boyutlandırma
      setTimeout(()=>{
        speed.draw();
        rpm.draw();
        navMap.draw();
        pressure.draw();
        fuelRate.draw();
        fuelGauge.draw();
        engineGauges.draw();
      },120);
    } 
    // Signals sekmesine geçildiğinde multiSignalChart'ı aktifleştir
    else if (t.dataset.tab === 'signals' && multiSignalChart) {
      console.log('Signal Analysis sekmesine geçildi, grafiği etkinleştiriliyor');
      multiSignalChart.setVisible(true);
      // Multiple timed attempts to resize & draw to handle CSS transitions / webview sizing races
      const tryDraw = () => {
        try {
          if (multiSignalChart && typeof multiSignalChart.draw === 'function') multiSignalChart.draw();
          if (multiSignalChart && multiSignalChart.chart) {
            try { multiSignalChart.chart.resize(); multiSignalChart.chart.update('none'); } catch(e){}
          }
        } catch(e){ /* ignore */ }
      };
      requestAnimationFrame(tryDraw);
      setTimeout(tryDraw, 50);
      setTimeout(tryDraw, 150);
      setTimeout(tryDraw, 350);
    } 
    // Sinyal sekmesinden çıkıldığında grafiği pasifleştir (performans için)
    else if (multiSignalChart) {
      multiSignalChart.setVisible(false);
    }

    // İşlem tamamlandıktan sonra kilit kaldır
    setTimeout(() => {
      isTabSwitching = false;
    }, 100);
  });
}));

// Her açılışta Overview (dash) sekmesini zorla; önceki kaydedilmiş sekmeyi dikkate almayacağız
setTimeout(() => {
  const dash = document.querySelector('.tab[data-tab="dash"]');
  if (dash) {
    dash.click();
    try { localStorage.setItem('can.tab', 'dash'); } catch (e) { /* ignore */ }
  }
}, 80);

// Chips persistence
['busSel','decodeSel','viewSel','rateSel','idFilter'].forEach(id=>{
  const el = document.getElementById(id);
  const key = 'can.'+id;
  const v = localStorage.getItem(key);
  if(v != null) el.value = v;
  if(id === 'idFilter'){
    // Dinamik filtre: yazdıkça yeniden render
    el.addEventListener('input', ()=>{ localStorage.setItem(key, el.value); reRenderFeed(); });
  } else {
    el.addEventListener('change',()=>localStorage.setItem(key, el.value));
  }
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
    // Sayfa görünür ise normal güncelle
    console.log('Sayfa görünür, normal performansa dönülüyor');
    window.canAppHidden = false;
    
    // Görünür durumdaki charları hemen güncelle
    if (document.getElementById('page-dash').classList.contains('active')) {
  speed.draw();
  rpm.draw();
  navMap.draw();
      pressure.draw(); 
      fuelRate.draw();
  fuelGauge.draw();
    }
  }
});

// Status counters & connection state
let total = 0, tickCount=0, paused=false;
const mqttDot = document.getElementById('mqttDot');
const canDot = document.getElementById('canDot');
const connTxt = document.getElementById('connTxt');
const mpsEl = document.getElementById('mps'); 
const totalEl = document.getElementById('total'); 
const lastTopicEl = document.getElementById('lastTopic');
// KPI element refs
const kpiDistance = document.getElementById('kpiDistance');
const kpiOperation = document.getElementById('kpiOperation');
const kpiFuelRate = document.getElementById('kpiFuelRate');
const kpiEco = document.getElementById('kpiEco');
const kpiSpeed = document.getElementById('kpiSpeed');

// Aggregated state for derived KPIs
let lastDistanceRaw = null; // SPN 245 raw (km) or already km
let totalDistanceKm = 0;
let lastOdoUpdateTime = null;
let lastEngineHoursRaw = null; // If available (SPN 247), not yet provided
let engineHours = 0; // Fallback incremental (rough)
let lastFuelUsedLiters = null; // If cumulative fuel used available later
let instFuelRateLph = 0; // For fuel economy calculation
let rollingSpeedForEco = 0; // current speed
let lastSpeedForTrend = 0;
let lastEcoForTrend = 0;
let lastFuelRateForTrend = 0; // fuel rate trend karşılaştırması

// Connection tracking
let lastCanMsgTime = 0;
let mqttConnected = false;      // Explicit conn mesajı ile veya CAN aktivitesi ile tetiklenecek
let canActive = false;

function updateConnectionUI(){
  const now = Date.now();
  // CAN inactivity check
  if (now - lastCanMsgTime > 5000) {
    canActive = false;
    canDot.className = 'dot fail';
  }
  // Eğer explicit MQTT conn mesajı gelmediyse ve CAN mesajı alıyorsak (köprü çalışıyor varsay) MQTT'yi yeşile çek
  if(!mqttConnected && canActive){
    mqttConnected = true;
    mqttDot.className = 'dot ok';
  }
  if (mqttConnected && canActive) {
    connTxt.textContent = 'Connected';
  } else if (mqttConnected) {
    connTxt.textContent = 'MQTT connected, waiting CAN';
  } else {
    connTxt.textContent = 'Disconnected';
  }
}

// Her saniye bağlantı durumunu güncelle
setInterval(() => { 
  mpsEl.textContent = tickCount.toString(); 
  updateConnectionUI();
  tickCount = 0; 
}, 1000);

// Charts - lazy loading ve performance tracking eklenmiş
const chartInitTime = performance.now();
console.log('Grafikler yükleniyor...');

const speed = new SpeedChart(document.getElementById('speed'));
const rpm   = new RpmChart(document.getElementById('rpm'));
const navMap = new NavMap(document.getElementById('navMap'));
const pressure = new PressureChart(document.getElementById('pressure'));
const fuelRate = new FuelRateChart(document.getElementById('fuelRate'));
const fuelGauge = new FuelGauge(document.getElementById('fuel'));
const engineGauges = new EngineGauges(
  document.getElementById('oilPressure'),
  document.getElementById('batteryVoltage'),
  document.getElementById('intakeManifold'),
  {
    coolantCanvas: document.getElementById('coolantTemp'),
    oilTempCanvas: document.getElementById('oilTemp'),
    exhaustTempCanvas: document.getElementById('exhaustTemp')
  }
);
if(navMap) navMap.draw();

// Çoklu Sinyal İzleme grafiği
let multiSignalChart = null;
if (document.getElementById('multiSignalAreaChart')) {
  multiSignalChart = new MultiSignalChart('multiSignalAreaChart', 'signalLegend');
  // Grafik başlatıldıktan sonra çiz ve görünürlüğünü sayfa durumuna göre ayarla
  const isSignalsTabActive = document.querySelector('.tab[data-tab="signals"]')?.classList.contains('active');
  multiSignalChart.draw();
  multiSignalChart.setVisible(isSignalsTabActive);
  console.log('MultiSignalChart başlatıldı ve çizildi:', isSignalsTabActive ? 'görünür' : 'gizli');
}

// Fullscreen / minimize / layout change handler: bazı webview ve tarayıcılarda
// fullscreen/minimize sırasında canvas CSS/internal pixel boyutları uyumsuz olabiliyor.
// document fullscreen değişiminde tüm grafikleri yeniden boyutlandır ve çiz.
function onLayoutChangeForceResize() {
  try {
    console.log('Layout change detected: forcing chart resize/draw');
    // First, ensure all canvas elements have their CSS size / backing store synchronized
    try {
      const canvases = document.querySelectorAll('canvas');
      canvases.forEach(c => {
        try { ctx2d(c); } catch(e) { /* ignore individual canvas errors */ }
      });
    } catch(e) { /* ignore */ }
    // dashboard charts
    try { speed.draw(); } catch(e){}
    try { rpm.draw(); } catch(e){}
    try { navMap.draw(); } catch(e){}
    try { pressure.draw(); } catch(e){}
    try { fuelRate.draw(); } catch(e){}
    try { fuelGauge.draw(); } catch(e){}
    try { engineGauges.draw(); } catch(e){}
    // area / signal charts
    try { if(areaChart) areaChart.draw(); } catch(e){}
    try { if(multiSignalChart) { multiSignalChart.initChart(); multiSignalChart.draw(); } } catch(e){}
  } catch (err) { console.warn('onLayoutChangeForceResize failed', err); }
}

// Listen to fullscreenchange and visibilitychange (some hosts use visibility)
document.addEventListener('fullscreenchange', onLayoutChangeForceResize);
document.addEventListener('webkitfullscreenchange', onLayoutChangeForceResize);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) onLayoutChangeForceResize();
});

// Engine parametre value elementleri
const oilPressureValEl = document.getElementById('oilPressureVal');
const batteryVoltageValEl = document.getElementById('batteryVoltageVal');
const intakeManifoldValEl = document.getElementById('intakeManifoldVal');
const coolantTempValEl = document.getElementById('coolantTempVal');
const oilTempValEl = document.getElementById('oilTempVal');
const exhaustTempValEl = document.getElementById('exhaustTempVal');

console.log(`Tüm grafikler yüklendi - süre: ${(performance.now() - chartInitTime).toFixed(2)}ms`);

// Grafikleri temizleme fonksiyonu
function clearAllCharts() {
  // Tüm grafiklerin veri noktalarını temizle
  speed.clearData();
  rpm.clearData();
  pressure.clearData();
  fuelRate.clearData();
  // Nav map route temizliği
  navMap.setPoints([]);
  
  // Dashboard göstergelerini sıfırla
  // KPI'ler reset
  if (kpiSpeed) kpiSpeed.textContent = '0 km/h';
  if (kpiDistance) kpiDistance.textContent = '0 Mm';
  // Başlangıçta Mega-metre (Mm) yerine km göster
  if (kpiDistance) kpiDistance.textContent = '0 km';
  if (kpiOperation) kpiOperation.textContent = '0 h';
  if (kpiFuelRate) kpiFuelRate.textContent = '0 l/h';
  if (kpiEco) kpiEco.textContent = '0 km/l';

  // Mesaj sayaçlarını da sıfırla (istek üzerine)
  total = 0; tickCount = 0;
  if (totalEl) totalEl.textContent = '0';
  if (mpsEl) mpsEl.textContent = '0';
  
  // Göstergeleri varsayılan değerlere ayarla
  fuelGauge.setValue(0);
  engineGauges.setValues({
    oilPressure: 0,
    batteryVoltage: 0,
    intakeManifold: 0,
      coolantTemp: 0,
      oilTemp: 0,
      exhaustTemp: 0
  });
  if(engineGauges.coolantTemp){
    // Başlangıçta veri yok modunda: değer 0 (üst sınır) fakat segment boyanmasın
    engineGauges.coolantTemp.zeroNoFill = true;
    engineGauges.coolantTemp._tempZeroNoFill = true;
  // Animasyonsuz direkt çizim için value ve animation senkron ayarla
  engineGauges.coolantTemp.value = 0;
  engineGauges.coolantTemp.animation.current = 0;
  engineGauges.coolantTemp.animation.target = 0;
  engineGauges.coolantTemp.draw(0); // Segment çizilmemeli
  }
  if(oilPressureValEl) oilPressureValEl.textContent = '0 kPa';
  if(batteryVoltageValEl) batteryVoltageValEl.textContent = '0 V';
  if(intakeManifoldValEl) intakeManifoldValEl.textContent = '0 kPa';
  if(coolantTempValEl) coolantTempValEl.textContent = '0 °C';
  if(oilTempValEl) oilTempValEl.textContent = '0 °C';
  if(exhaustTempValEl) exhaustTempValEl.textContent = '0 °C';
  
  // Sinyal grafiklerini temizle
  if (multiSignalChart) {
    multiSignalChart.clearData();
  }
  
  // Grafikleri yeniden çiz
  speed.draw();
  rpm.draw();
  navMap.draw();
  pressure.draw(); 
  fuelRate.draw();
  fuelGauge.draw();
  engineGauges.draw();
  if (multiSignalChart) multiSignalChart.draw();
}

// Ana temizleme butonu ile tüm grafikleri temizle, bu butonu Signal Analysis sekmesi için de kullanacağız
document.getElementById('clearCharts')?.addEventListener('click', () => {
  clearAllCharts();
  console.log('Tüm grafikler ve göstergeler sıfırlandı');
});

// Grafiklerin ilk çizimini planla
requestAnimationFrame(() => {
  speed.draw();
  rpm.draw();
  navMap.draw();
  pressure.draw(); 
  fuelRate.draw();
  fuelGauge.draw();
  
});

// Demo seeds
import('./seed.mjs').then(m=>m.seedAll({speed,rpm,pressure,fuelRate,fuelGauge,navMap}));

// 3D viewer - URI kontrolü ve başlatma
// Replaced with token so extension can inject a webview-safe URI at runtime
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
// Ham mesajların tamamı tutulur (maks 1200)
const feedArr = [];
// Feed DOM güncellemeleri için performans optimizasyonu
let feedUpdateScheduled = false;
let feedBuffer = [];

function buildFeedRow(item){
  const row = document.createElement('div'); row.className='row';
  const cTime = document.createElement('div'); cTime.textContent = item.ts;
  const cTopic = document.createElement('div'); cTopic.className='topic'; cTopic.textContent = item.topic;
  const cJson = document.createElement('div'); const holder=document.createElement('div');
  // ID'yi sadece gösterimde hex'e çevir (filtre orijinal sayısal değeri kullanmaya devam etsin)
  let displayPayload = item.payload;
  if(displayPayload && typeof displayPayload.id === 'number') {
    const rawId = displayPayload.id >>> 0; // 32-bit unsigned
    const id29 = rawId & 0x1FFFFFFF; // J1939 29-bit ID
    displayPayload = { 
      ...displayPayload, 
      id: '0x' + id29.toString(16).toUpperCase().padStart(8,'0'),
      rawIdHex: '0x' + rawId.toString(16).toUpperCase(),
      // İsteğe bağlı: PGN hesapla (PDU Format + PDU Specific) => üst 18 bitin orta 16 biti
      pgn: '0x' + ((id29 >> 8) & 0x3FFFF).toString(16).toUpperCase().padStart(5,'0')
    };
  }
  renderJSONTree(holder, displayPayload); cJson.appendChild(holder);
  row.appendChild(cTime); row.appendChild(cTopic); row.appendChild(cJson);
  return row;
}

function pushFeed(topic, payload){
  const ts = new Date().toLocaleTimeString();
  const entry = {ts, topic, payload};
  feedArr.push(entry);
  while(feedArr.length > 1200) feedArr.shift();

    // Sinyalleri sinyal monitörü için işle
    if (payload.signals) {
      const availableSignals = [];
      
      // Her gelen sinyal grubunda, yeni gelen sinyalleri topla
      Object.entries(payload.signals).forEach(([signalName, value]) => {
        // Sadece sayısal değerler için ekle
        if (typeof value === 'number' && !isNaN(value)) {
          availableSignals.push({
            id: signalName,
            name: signalName
          });
          
          // Eğer multiSignalChart mevcutsa sinyali güncelle
          if (multiSignalChart) {
            multiSignalChart.updateSignalData(signalName, value);
          }
        }
      });
      
      // Her veri paketinden sonra multiSignalChart'ı güncellemek yerine,
      // belli aralıklarla liste güncellemesini yap
      if (multiSignalChart && availableSignals.length > 0) {
        // Son güncelleme zamanından bu yana en az 1 saniye geçtiyse güncelle
        if (!window._lastSignalListUpdateTime || (Date.now() - window._lastSignalListUpdateTime) > 1000) {
          multiSignalChart.updateAvailableSignals(availableSignals);
          window._lastSignalListUpdateTime = Date.now();
        }
      }
    }  // Filtreyi geçmiş kayıtlara uygulamak için sadece ekranda göstereceğimiz öğeleri buffer'a koy
  if(!passesIdFilter(entry)) return; // filtre dışı ise ekrana ekleme
  feedBuffer.push(entry);

  if(!feedUpdateScheduled){
    feedUpdateScheduled = true;
    requestAnimationFrame(()=>{
      const fragment = document.createDocumentFragment();
      const itemsToAdd = feedBuffer.slice(-25);
      for(const item of itemsToAdd){
        fragment.prepend(buildFeedRow(item));
      }
      feedEl.prepend(fragment);
      while(feedEl.childElementCount > 400) feedEl.removeChild(feedEl.lastChild);
      feedBuffer = []; feedUpdateScheduled = false;
    });
  }
}
document.getElementById('clearFeed').addEventListener('click', ()=>{ feedEl.innerHTML=''; feedArr.length=0; feedBuffer.length=0; });
document.getElementById('exportFeed').addEventListener('click', ()=>{
  // Sadece ekranda görünen filtreli içerik
  const f = getIdFilter();
  const data = f ? feedArr.filter(e=>passesIdFilter(e)) : feedArr;
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
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
    mqttConnected = ok;
    mqttDot.className = 'dot ' + (ok ? 'ok' : 'fail');
    updateConnectionUI();
    return; 
  }
  if(msg.type === 'can' && !paused){
    const { topic, payload } = msg;
  // Filtre kontrolü (mesajı tamamen yok say)
  if(!passesIdFilter({topic, payload})) return;
    const t = (payload.t) ? +payload.t : now();
    total++; tickCount++; totalEl.textContent = total.toString(); lastTopicEl.textContent = topic;
    
  // CAN mesajı alındı, CAN bağlantısını güncelle
  lastCanMsgTime = Date.now();
  canActive = true;
  canDot.className = 'dot ok';
  updateConnectionUI();

    // Aktif sekmeyi ve sayfa durumunu kontrol et
    const isActiveDashboard = document.getElementById('page-dash').classList.contains('active');
    const isActiveSignals = document.getElementById('page-signals').classList.contains('active');
    const isPageVisible = !window.canAppHidden;

    // Çizim optimizasyonu
    let shouldDrawDashboard = isActiveDashboard && isPageVisible;
    let shouldDrawSignals = isActiveSignals && isPageVisible;
    const messageRate = tickCount; // Saniyedeki mesaj sayısı
    
    // Mesaj hızına göre adaptif çizim stratejisi
    if (messageRate < 10) {
      shouldDrawDashboard = shouldDrawDashboard && true; // Her mesajı çiz
      shouldDrawSignals = shouldDrawSignals && true;
    } else if (messageRate < 30) {
      shouldDrawDashboard = shouldDrawDashboard && (tickCount % 3 === 0); // Her 3 mesajda bir
      shouldDrawSignals = shouldDrawSignals && (tickCount % 2 === 0);
    } else if (messageRate < 60) {
      shouldDrawDashboard = shouldDrawDashboard && (tickCount % 5 === 0); // Her 5 mesajda bir
      shouldDrawSignals = shouldDrawSignals && (tickCount % 3 === 0);
    } else {
      shouldDrawDashboard = shouldDrawDashboard && (tickCount % 10 === 0); // Her 10 mesajda bir
      shouldDrawSignals = shouldDrawSignals && (tickCount % 5 === 0);
    }
    
    // Veri ekle ve gerektiğinde çiz
    // Veri işleme ve çizim işlemleri
    let updatedCharts = new Set();
    
  // Hız verisi (SPN 84 Vehicle Speed)
    if((/speed/i.test(topic) && typeof payload.speedKmh === 'number') || 
       (payload.signals && typeof payload.signals.WheelBasedVehicleSpeed === 'number')) {
      const speedValue = payload.speedKmh || 
                        (payload.signals ? payload.signals.WheelBasedVehicleSpeed : undefined);
      if (speedValue !== undefined) {
        // Grafik güncelleme
        speed.pushSample(t, +speedValue);
        updatedCharts.add(speed);
        
        // Dashboard hız göstergesi güncelleme
        if (kpiSpeed) {
          const sp = Math.round(speedValue);
            kpiSpeed.textContent = `${sp} km/h`;
            const kpiCard = kpiSpeed.closest('.kpi');
            if(kpiCard){
              if(sp > lastSpeedForTrend) kpiCard.dataset.trend = 'up';
              else if(sp < lastSpeedForTrend) kpiCard.dataset.trend = 'down';
            }
            lastSpeedForTrend = sp;
        }
        rollingSpeedForEco = +speedValue;
        
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
    
  // Yakıt tüketimi (SPN 183 Fuel Rate) - l/h
    let fuelRateValue = null;
    if(payload.lph != null) {
      fuelRateValue = +payload.lph;
    } else if(payload.signals && typeof payload.signals.EngFuelRate === 'number') {
      fuelRateValue = +payload.signals.EngFuelRate;
    }
    if(fuelRateValue != null) {
      fuelRate.pushSample(t, fuelRateValue);
      updatedCharts.add(fuelRate);
      instFuelRateLph = fuelRateValue;
      if (kpiFuelRate) {
        kpiFuelRate.textContent = `${Math.round(fuelRateValue)} l/h`;
        const kpiCard = kpiFuelRate.closest('.kpi');
        if(kpiCard){
          // Küçük dalgalanmaları filtrelemek için ±0.5 eşiği
          if(fuelRateValue > lastFuelRateForTrend + 0.5) kpiCard.dataset.trend = 'up';
          else if(fuelRateValue < lastFuelRateForTrend - 0.5) kpiCard.dataset.trend = 'down';
        }
        lastFuelRateForTrend = fuelRateValue;
      }
    }
    
    // Motor parametreleri
    if(payload.signals) {
      const signals = payload.signals;
      let engineUpdated = false;
      const engineValues = {};
      // Aliases
      const oilPress = signals.EngOilPress ?? signals.EngineOilPressure;
      if(typeof oilPress === 'number') { engineValues.oilPressure = oilPress; engineUpdated = true; }
      const battV = signals.BatteryPotential_PowerInput1 ?? signals.BattVolt ?? signals.BatteryVoltage;
      if(typeof battV === 'number') { engineValues.batteryVoltage = battV; engineUpdated = true; }
  const mapP = signals.EngIntakeManifold1Press ?? signals.EngineIntakeManifold1Press ?? signals.IntakeManifoldPress ?? signals.EngAirIntakePress;
  if(typeof mapP === 'number') { engineValues.intakeManifold = mapP; engineUpdated = true; }
  const coolant = signals.EngCoolantTemp ?? signals.EngineCoolantTemp;
  // Yalnız negatif değerler gösterilecek (0 ve üzeri yok sayılır)
  if(typeof coolant === 'number' && coolant < 0 && coolant > -400){ engineValues.coolantTemp = coolant; engineUpdated = true; }
      const oilT = signals.EngOilTemp ?? signals.EngOilTemp1;
      if(typeof oilT === 'number' && oilT > -60 && oilT < 250){ engineValues.oilTemp = oilT; engineUpdated = true; }
  const exhaustT = signals.EngExhaustGasTemp ?? signals.EngTurboOilTemp ?? signals.ExhaustTemp ?? signals.EGT;
      if(typeof exhaustT === 'number' && exhaustT > -60 && exhaustT < 900){ engineValues.exhaustTemp = exhaustT; engineUpdated = true; }
      if(engineUpdated) {
        engineGauges.setValues(engineValues);
        updatedCharts.add(engineGauges);
        if(engineValues.oilPressure != null && oilPressureValEl) oilPressureValEl.textContent = engineValues.oilPressure.toFixed(0) + ' kPa';
        if(engineValues.batteryVoltage != null && batteryVoltageValEl) batteryVoltageValEl.textContent = engineValues.batteryVoltage.toFixed(1) + ' V';
        if(engineValues.intakeManifold != null && intakeManifoldValEl) intakeManifoldValEl.textContent = engineValues.intakeManifold.toFixed(0) + ' kPa';
  const tempLimit = (v, max)=>{ if(v==null||isNaN(v)) return null; if(v>max) v=max; return v; };
  if(engineValues.coolantTemp != null && coolantTempValEl){ const v=tempLimit(engineValues.coolantTemp,0); if(v!=null) coolantTempValEl.textContent = v.toFixed(0) + ' °C'; }
  if(engineValues.oilTemp != null && oilTempValEl){ const v=tempLimit(engineValues.oilTemp,150); if(v!=null) oilTempValEl.textContent = v.toFixed(0) + ' °C'; }
  if(engineValues.exhaustTemp != null && exhaustTempValEl){ const v=tempLimit(engineValues.exhaustTemp,800); if(v!=null) exhaustTempValEl.textContent = v.toFixed(0) + ' °C'; }
      }
    }
  // Temperature gauges removed
    
    // Yakıt seviyesi (çeşitli isimler + raw -> %)
    let fuelLvl = null; // SPN 96 Fuel Level %
    if(payload.signals){
      const s = payload.signals;
      if(typeof s.FuelLevelPercent === 'number') fuelLvl = s.FuelLevelPercent; // doğrudan %
      else if(typeof s.FuelLevel === 'number') fuelLvl = s.FuelLevel; // alias
      else if(typeof s.FuelLevel1 === 'number') fuelLvl = s.FuelLevel1; // yeni ad
      else if(typeof s.FuelLevel2 === 'number' && s.FuelLevel2 > 0) fuelLvl = s.FuelLevel2; // ikinci tank vb.
    }
    if(fuelLvl == null && payload.fractionFuel != null){
      fuelLvl = +payload.fractionFuel * 100; // 0-1 -> %
    }
    // Eğer 100'den büyük ve 255'e kadar ise raw değerdir (0.4 %/bit). 255 ham -> 102% civarı.
    if(fuelLvl != null){
      if(fuelLvl > 100 && fuelLvl <= 255) fuelLvl = fuelLvl * 0.4; // raw -> %
      // İkinci bir olasılık: yanlışlıkla zaten % ama >100 (uç değer), clamp et.
      fuelLvl = Math.max(0, Math.min(100, fuelLvl));
      fuelGauge.setValue(fuelLvl);
      updatedCharts.add(fuelGauge);
    }

    // Toplam araç mesafesi (SPN 245 Total Vehicle Distance) -> km
    if(payload.signals) {
      // Muhtemel aliaslar: TotalVehicleDistance, VehDist, DistanceTotal
      const distSig = payload.signals.TotalVehicleDistance ?? payload.signals.VehTotalDistance ?? payload.signals.VehicleTotalDistance ?? payload.signals.DistanceTotal;
      if(typeof distSig === 'number') {
      const distKm = distSig; // decoder ölçeklediyse zaten km
      if(lastDistanceRaw == null) {
        lastDistanceRaw = distKm;
      } else if(distKm >= lastDistanceRaw) {
        totalDistanceKm += (distKm - lastDistanceRaw);
        lastDistanceRaw = distKm;
      } else {
        // sayaç reset / overflow
        lastDistanceRaw = distKm;
      }
      if(kpiDistance) kpiDistance.textContent = `${Math.round(totalDistanceKm)} km`;
      }
    }

    // Engine hours (SPN 247) - aliaslar: EngineTotalHours, EngTotalHours, TotalEngineHours
    if(payload.signals){
      const rawHours = payload.signals.EngineHours ?? payload.signals.EngineTotalHours ?? payload.signals.EngTotalHours ?? payload.signals.TotalEngineHours;
      if(typeof rawHours === 'number') {
        // Ölçekli ise direkt saat. Daha önceki ham değer düşerse reset.
        if(lastEngineHoursRaw == null || rawHours < lastEngineHoursRaw) {
          lastEngineHoursRaw = rawHours;
          engineHours = rawHours;
        } else if(rawHours >= lastEngineHoursRaw) {
          engineHours += (rawHours - lastEngineHoursRaw);
          lastEngineHoursRaw = rawHours;
        }
        if(kpiOperation) kpiOperation.textContent = `${engineHours.toFixed(1)} h`;
      }
    }

    // Eğer gerçek SPN 247 gelmiyorsa fallback tahmin: hız >0 veya rpm > idle kabul edilirse zaman ekle
    if(lastEngineHoursRaw == null && typeof rpmValue === 'number' && rpmValue > 600) {
      if(lastOdoUpdateTime == null) lastOdoUpdateTime = t;
      const dtH = (now() - lastOdoUpdateTime)/3600000; // ms -> hour
      if(dtH > 0.0001){
        engineHours += dtH;
        lastOdoUpdateTime = now();
        if(kpiOperation) kpiOperation.textContent = `${engineHours.toFixed(1)} h`;
      }
    } else {
      lastOdoUpdateTime = now();
    }

    // Fuel economy (km/l) = hız (km/h) / (l/h)
    if(instFuelRateLph > 0 && rollingSpeedForEco != null) {
      const eco = rollingSpeedForEco / instFuelRateLph;
      if(kpiEco){
        const prev = lastEcoForTrend;
        kpiEco.textContent = `${eco.toFixed(2)} km/l`;
        const kpiCard = kpiEco.closest('.kpi');
        if(kpiCard){
          if(eco > prev + 0.05) kpiCard.dataset.trend='up';
          else if(eco < prev - 0.05) kpiCard.dataset.trend='down';
        }
        lastEcoForTrend = eco;
      }
    }
    
    // GPS konumu (şimdilik sadece merkez güncelle - gerçek marker çizimi sonra)
    if(payload.gps && payload.gps.lat != null && payload.gps.lon != null) {
      navMap.setCenter(+payload.gps.lat, +payload.gps.lon);
      updatedCharts.add(navMap);
    }
    
    // Toplu çizim güncelleme - dashboard
    if(shouldDrawDashboard && updatedCharts.size > 0) {
      requestAnimationFrame(() => {
        updatedCharts.forEach(chart => chart.draw());
      });
    }
    
    // Sinyal izleme grafiğini güncelleme - ayrı koşul
    if(shouldDrawSignals && multiSignalChart) {
      requestAnimationFrame(() => {
        multiSignalChart.draw();
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

// Webview yüklendiğini uzantıya bildir (acquireVsCodeApi tercih edilir)
try {
  const vscode = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
  if (vscode && typeof vscode.postMessage === 'function') {
    vscode.postMessage({ type: 'ready' });
  } else {
    window.parent?.postMessage?.({ type: 'ready' }, '*');
  }
} catch (e) { /* ignore */ }

// Uzantı tarafından gönderilen showOverview mesajını dinle
window.addEventListener('message', (ev) => {
  const msg = ev.data; if(!msg) return;
  if (msg.type === 'showOverview') {
    try {
      const overviewTab = document.querySelector('.tab[data-tab="dash"]');
      if (overviewTab && !overviewTab.classList.contains('active')) {
        overviewTab.click();
  try { localStorage.setItem('can.tab', 'dash'); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      // ignore
    }
  }
});

// Çoklu sinyal grafiği için değişkenler
let areaChart = null;
let selectedSignals = new Set(); // Seçili sinyalleri izlemek için
const maxSelectedSignals = 5; // Maksimum seçilebilecek sinyal sayısı
let signalData = {}; // Son gelen sinyal değerlerini saklamak için
let signalDataHistory = {}; // Sinyal geçmişi için
let signalCheckboxes = null;
let monitoredSignals = []; // İzlenen sinyal listesi

// Sinyal seçim arayüzünü oluştur
function initializeSignalMonitor() {
  // Sinyal grafiğini oluştur
  const signalChartCanvas = document.getElementById('signalAreaChart');
  if (!signalChartCanvas) return;
  
  areaChart = new AreaMultiChart(signalChartCanvas);
  areaChart.setTitle('Signal Monitor');
  areaChart.startLiveUpdate();
  
  // Sinyal seçim konteynerini al
  signalCheckboxes = document.getElementById('signalCheckboxes');
  
  // Temizleme düğmesi olayını dinle
  document.getElementById('clearChartData')?.addEventListener('click', () => {
    if (areaChart) {
      areaChart.clearData();
    }
  });
}

// Bir sinyali ekle veya güncelle
function updateSignalList(signalName, value) {
  if (!signalData) signalData = {};
  
  // Sinyal değerini kaydet
  signalData[signalName] = value;
  
  // Sinyalin geçmiş verisini sakla
  if (!signalDataHistory[signalName]) {
    signalDataHistory[signalName] = [];
  }
  
  // Sinyal seçim UI'da yoksa ekle
  if (signalCheckboxes && !document.getElementById(`signal-${signalName}`)) {
    const signalId = `signal-${signalName}`;
    const colorIndex = monitoredSignals.length % 5;
    
    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'signal-checkbox';
    
    const colorIndicator = document.createElement('span');
    colorIndicator.className = 'color-indicator';
    colorIndicator.style.backgroundColor = getColorForIndex(colorIndex).line;
    checkboxContainer.appendChild(colorIndicator);
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = signalId;
    checkbox.dataset.signal = signalName;
    
    // Seçim değişikliğini izle
    checkbox.addEventListener('change', (e) => {
      const signalName = e.target.dataset.signal;
      if (e.target.checked) {
        if (selectedSignals.size >= maxSelectedSignals) {
          alert(`En fazla ${maxSelectedSignals} sinyal seçilebilir.`);
          e.target.checked = false;
          return;
        }
        selectedSignals.add(signalName);
        areaChart.addSeries(signalName, signalName, getColorForIndex(selectedSignals.size - 1));
      } else {
        selectedSignals.delete(signalName);
        areaChart.removeSeries(signalName);
      }
    });
    
    const label = document.createElement('label');
    label.htmlFor = signalId;
    label.textContent = signalName;
    
    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(label);
    signalCheckboxes.appendChild(checkboxContainer);
    
    // İzlenen sinyaller listesine ekle
    if (!monitoredSignals.includes(signalName)) {
      monitoredSignals.push(signalName);
    }
  }
  
  // Seçili ise grafikteki seriyi güncelle
  if (selectedSignals.has(signalName) && typeof value === 'number' && !isNaN(value)) {
    areaChart.pushSample(signalName, Date.now(), value);
  }
}

// Renk indeksine göre renk döndür
function getColorForIndex(index) {
  const colors = [
    {fill: 'rgba(66, 133, 244, 0.2)', line: 'rgb(66, 133, 244)'}, // Mavi
    {fill: 'rgba(219, 68, 55, 0.2)', line: 'rgb(219, 68, 55)'}, // Kırmızı
    {fill: 'rgba(244, 180, 0, 0.2)', line: 'rgb(244, 180, 0)'}, // Sarı
    {fill: 'rgba(15, 157, 88, 0.2)', line: 'rgb(15, 157, 88)'}, // Yeşil
    {fill: 'rgba(171, 71, 188, 0.2)', line: 'rgb(171, 71, 188)'} // Mor
  ];
  return colors[index % colors.length];
}

// Sayfa yüklendiğinde sinyal monitörünü başlat
document.addEventListener('DOMContentLoaded', () => {
  initializeSignalMonitor();
  
  // Sekmeler arasında geçiş yaparken grafiğin görünürlüğünü güncelle
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'feed' && areaChart) {
        areaChart.setVisible(true);
      } else if (areaChart) {
        areaChart.setVisible(false);
      }
      // 3D araç modeli için: Dash sekmesi tekrar aktif olduğunda yeniden boyutlandır & tek kare render et
      if (tab.dataset.tab === 'dash' && viewer && viewer.initialized) {
        // Geçişi hafiflet: önce hızlı refresh, sonra idle zamanı bekle
        viewer.refresh && viewer.refresh();
        const idleCb = window.requestIdleCallback || function(cb){setTimeout(cb,90)};
        idleCb(()=> viewer.refresh && viewer.refresh());
      }
      // Sekme değişiminde grafik redraw'u iste fakat yığılmasını engelle
      forceChartRedraw();
    });
  });
  
  // Başlangıçta aktif sekmeyi kontrol et
  const activeTab = document.querySelector('.tab.active')?.dataset?.tab;
  if (activeTab === 'feed' && areaChart) {
    areaChart.setVisible(true);
  }
});

// Gelişmiş resize handler - canvas boyutlandırma ve grid layout sorunlarını çözer
let resizeTimeout = null;
let layoutChangeTimeout = null;

function forceCanvasResize() {
  // Tüm canvas elementlerini bul ve boyutlarını yeniden hesapla
  const canvases = document.querySelectorAll('canvas');
  canvases.forEach(canvas => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      // Canvas'ın CSS boyutlarını zorla güncelle
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      // Kısa bir süre sonra DPR ve backing store'u yeniden hesapla
      setTimeout(() => {
        try {
          ctx2d(canvas);
        } catch(e) { /* ignore */ }
      }, 10);
    }
  });
}

function forceChartRedraw() {
  const activeTab = document.querySelector('.tab.active')?.dataset?.tab;
  // Tek seferlik planlanmış redraw (debounce + batching)
  if (!window._dashRedrawScheduled) {
    window._dashRedrawScheduled = true;
    requestAnimationFrame(() => {
      if (activeTab === 'dash' || !activeTab) {
        try { speed.draw(); } catch(e) {}
        try { rpm.draw(); } catch(e) {}
        try { pressure.draw(); } catch(e) {}
        try { fuelRate.draw(); } catch(e) {}
        try { fuelGauge.draw(); } catch(e) {}
        try { engineGauges.draw(); } catch(e) {}
        try { navMap.draw(); } catch(e) {}
        // Stabilizasyon için ikinci hafif tur yalnızca harita & kritik göstergeler
        requestAnimationFrame(() => {
          try { navMap.draw(); } catch(e) {}
          try { speed.draw(); } catch(e) {}
          window._dashRedrawScheduled = false;
        });
      } else if (activeTab === 'signals' && multiSignalChart) {
        try { multiSignalChart.draw(); } catch(e) {}
        window._dashRedrawScheduled = false;
      } else {
        window._dashRedrawScheduled = false;
      }
    });
  }
}

window.addEventListener('resize', () => { 
  // Hızlı tepki için canvas boyutlarını anında güncelle
  forceCanvasResize();
  
  // Debounced resize işlemi
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    forceCanvasResize(); // tek tekrar
    forceChartRedraw();  // hafif redraw
    resizeTimeout = null;
  }, 100);
  
  // Layout değişikliği için ek kontrol
  if (layoutChangeTimeout) clearTimeout(layoutChangeTimeout);
  layoutChangeTimeout = setTimeout(() => {
    // Eğer ilk debounce henüz çalıştıysa ekstra yük bindirme
    if (!window._dashRedrawScheduled) {
      forceCanvasResize();
      forceChartRedraw();
    }
    layoutChangeTimeout = null;
  }, 220);
});

// Fullscreen değişikliklerini özel olarak ele al
['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(event => {
  document.addEventListener(event, () => {
    setTimeout(() => {
      forceCanvasResize();
      forceChartRedraw();
    }, 100);
    
    setTimeout(() => {
      forceCanvasResize();
      forceChartRedraw();
    }, 500);
  });
});

// Ekstra güvenlik: window focus ve visibility değişikliklerinde de kontrol et
window.addEventListener('focus', () => {
  setTimeout(() => {
    forceCanvasResize();
    forceChartRedraw();
  }, 100);
});

// Developer tools açılıp kapandığında da kontrol et
let lastWindowHeight = window.innerHeight;
let lastWindowWidth = window.innerWidth;

setInterval(() => {
  if (window.innerHeight !== lastWindowHeight || window.innerWidth !== lastWindowWidth) {
    lastWindowHeight = window.innerHeight;
    lastWindowWidth = window.innerWidth;
    forceCanvasResize();
    forceChartRedraw();
  }
}, 500);
