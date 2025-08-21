import { now } from './core/chartCore.js';
import { SpeedChart } from './charts/speedChart.js';
import { RpmChart }   from './charts/rpmChart.js';
import { NavMap } from './maps/navMap.js';
import { PressureChart } from './charts/pressureChart.js';
import { FuelRateChart } from './charts/fuelRateChart.js';
import { renderJSONTree } from './core/jsonTree.js';
import { VehicleViewer } from './three/vehicleViewer_new.js';
import { FuelGauge } from './charts/arcGauge.js';
import { EngineGauges } from './charts/engineGauges.js';

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
    // Önce değeri set et, sonra geçici boş gösterim flaglerini ata (ilk gerçek veriyle kalkacak)
    engineGauges.coolantTemp.setValue(0);
    engineGauges.coolantTemp.zeroNoFill = true;      // segment boyama yok
    engineGauges.coolantTemp._tempZeroNoFill = true; // ilk sonraki setValue çağrısında kapanacak (0 dahil)
    engineGauges.coolantTemp.draw();
  }
  if(oilPressureValEl) oilPressureValEl.textContent = '0 kPa';
  if(batteryVoltageValEl) batteryVoltageValEl.textContent = '0 V';
  if(intakeManifoldValEl) intakeManifoldValEl.textContent = '0 kPa';
  if(coolantTempValEl) coolantTempValEl.textContent = '0 °C';
  if(oilTempValEl) oilTempValEl.textContent = '0 °C';
  if(exhaustTempValEl) exhaustTempValEl.textContent = '0 °C';
  
  // Grafikleri yeniden çiz
  speed.draw();
  rpm.draw();
  navMap.draw();
  pressure.draw(); 
  fuelRate.draw();
  fuelGauge.draw();
  engineGauges.draw();
}

// Temizleme butonuna tıklama işlevi ekle
document.getElementById('clearCharts').addEventListener('click', clearAllCharts);

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
let vehicleUri = '__VEHICLE_URI__';
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

  // Filtreyi geçmiş kayıtlara uygulamak için sadece ekranda göstereceğimiz öğeleri buffer'a koy
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
  navMap.draw(); 
      pressure.draw(); 
      fuelRate.draw(); 
  fuelGauge.draw(); 
    }
    resizeTimeout = null;
  }, 250); // 250ms gecikme ile yeniden boyutlandırma olaylarını birleştir
});
