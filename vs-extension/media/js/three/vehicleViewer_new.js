// Statik importlar bazı VSCode webview ortamlarında specifier hatası ürettiği için
// dinamik import fallback uygulanıyor.
let THREE, GLTFLoader;
async function loadThreeStack(){
  if(THREE && GLTFLoader) return;
  try {
  const m = await import('./vendor/three.module.js');
    THREE = m;
  } catch(e){
    console.error('[viewer] three.module dyn import fail:', e.message);
    throw e;
  }
  try {
    console.time('[viewer] GLTFLoader import');
    // Mutlak yol sağlam import için
  const absPath = new URL('./vendor/GLTFLoader.js', import.meta.url).href;
  console.log('[viewer] GLTFLoader yolu:', absPath);
  const gltfMod = await import(absPath);
    console.timeEnd('[viewer] GLTFLoader import');
    if (!gltfMod || !gltfMod.GLTFLoader) throw new Error('GLTFLoader export missing');
    GLTFLoader = gltfMod.GLTFLoader;
    console.log('[viewer] Full GLTFLoader yüklendi (tam özellik)');
  } catch(fullErr){
    console.warn('[viewer] Full GLTFLoader import HATA:', fullErr && fullErr.message);
    // Kullanıcıya kısa not
    try {
      const absPathMinimal = new URL('./vendor/gltfMinimalLoader.js', import.meta.url).href;
      console.log('[viewer] MinimalLoader yolu:', absPathMinimal);
      const { GLTFMinimalLoader } = await import(absPathMinimal + '?v=3');
      GLTFLoader = GLTFMinimalLoader;
      console.warn('[viewer] Minimal loader devrede (sınırlı özellik).');
      if (this && typeof this.notice === 'function') {
        this.notice('Basit modeller (tam olmayan kalite)');
      }
    } catch(minErr){
      console.error('[viewer] Minimal loader da import edilemedi:', minErr && minErr.stack);
      throw minErr;
    }
  }
}

export class VehicleViewer {
  constructor(canvas, noticeEl, modelUri){
    this.canvas=canvas; 
    this.noticeEl=noticeEl; 
    this.modelUri=modelUri; 
    this.initialized=false;
    this.handleResize=()=>this.resize();
  }
  
  async init(){
    try{
      // Performance check before starting process
      if (!window.performanceWarningShown) {
        console.log('Performance measurements starting...');
        window.performanceWarningShown = true;
        this._startTime = performance.now();
      }
      
      console.log('VehicleViewer initializing...');
      console.log('Model URI:', this.modelUri);
      
  await loadThreeStack();
  console.log('Three.js & GLTFLoader dinamik yüklendi');
  this.THREE = THREE;
      console.log('Canvas element:', this.canvas);
  // Renderer oluşturulurken antialias ve shadow gibi pahalı opsiyonları
  // cihaz kapasitesine göre sonradan açıp kapatabileceğimiz bir yapı kuruyoruz.
  // Renderer kalitesi artırıldı - antialiasing açıldı (daha keskin görüntü)
  this.renderer = new THREE.WebGLRenderer({ 
    canvas: this.canvas, 
    antialias: true, // Kenarları yumuşat
    alpha: true, 
    powerPreference:'high-performance',
    precision: 'highp' // Yüksek hassasiyet
  });
  this._maxPixelRatio = Math.min(1.5, window.devicePixelRatio || 1); // Üst sınır
  this._minPixelRatio = 0.8; // Alt sınır (çok düşmesin)
  this._currentPixelRatio = Math.min(window.devicePixelRatio || 1, this._maxPixelRatio);
  this.renderer.setPixelRatio(this._currentPixelRatio);
  
  // Gölge kalitesi - gerekirse aktifleştirebiliriz
  this.renderer.shadowMap.enabled = false; 
  this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // Panel arka plan rengi ile eşleştir (#0e131a) - mavi-siyah karışımı
  this.renderer.setClearColor(0x0e131a, 1);
  this.renderer.outputEncoding = THREE.sRGBEncoding; // Doğru renk
  console.log('WebGL Renderer oluşturuldu:', this.renderer);
      
  this.scene = new THREE.Scene();
  // Chart/panel teması ile aynı arka plan
  this.scene.background = new THREE.Color(0x0e131a);
  
  // Hafif bir sis efekti - derinlik hissi
  this.scene.fog = new THREE.Fog(0x0e131a, 10, 25);
      console.log('Scene oluşturuldu:', this.scene);
      
  // Tüm modeli taşıyacağımız kök grup (rota/zoom buna uygulanacak)
  this.root = new THREE.Group();
  this.scene.add(this.root);
      
      this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      this.camera.position.set(5, 3, 5);
      this.camera.lookAt(0, 0, 0);
      console.log('Kamera ayarlandı:', this.camera.position);
      
      // Mouse kontrolleri ekle (basit versiyonu)
      this.addMouseControls();
      
      // Işıklandırma sistemi iyileştirildi - 3 nokta aydınlatma
      
      // 1. Ana Dolgu Işığı (Environment) - Gölgeleri hafifletip genel aydınlatma
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Güç arttı
      this.scene.add(ambientLight);
      
      // 2. Ana Işık (Key Light) - Önden/üstten gelen ana ışık
      const mainLight = new THREE.DirectionalLight(0xffffff, 0.8); // Beyaz, güçlü
      mainLight.position.set(3, 6, 8); // Önden ve yukarıdan
      mainLight.castShadow = false; // Gölge isteğe bağlı aktifleştirilebilir
      this.scene.add(mainLight);
      
      // 3. Dolgu Işık (Fill Light) - Gölgeleri yumuşatmak için
      const fillLight = new THREE.DirectionalLight(0xccccff, 0.5); // Hafif mavi ton
      fillLight.position.set(-6, 2, -2); // Ters açıdan
      this.scene.add(fillLight);
      
      // 4. Vurgu Işığı (Rim Light) - Arkadan gelip konturu vurgular
      const rimLight = new THREE.DirectionalLight(0xffffee, 0.6); // Hafif sarı ton
      rimLight.position.set(0, 8, -12); // Arkadan ve yukarıdan
      this.scene.add(rimLight);
      
      console.log('Işıklar eklendi');
      
      // GLTF Loader ile modeli yükle
      console.log('GLTF Loader oluşturuluyor...');
  const loader = new GLTFLoader();
      console.log('Model yükleme başlıyor, URI:', this.modelUri);
      
      loader.load(
        this.modelUri, 
        (gltf) => { 
          console.log('Model başarıyla yüklendi:', gltf);
          console.log('Model sahne objeleri:', gltf.scene.children);
          
          // Model boyutunu hesapla ve ortala
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          
          console.log('Model merkezi:', center);
          console.log('Model boyutu:', size);
          
          // Önce merkezi resetleyip doğru konumlandırma
          gltf.scene.position.set(0, 0, 0);
          
          // Model yönlendirmeyi düzelt (aracı doğru açıda göster)
          gltf.scene.rotation.set(0, Math.PI * 0.5, 0); // 90 derece döndür (yan değil önden görünüm)
          
          // Sonra modeli dünya orijinine ortala
          gltf.scene.position.sub(center);
          // Y eksenini hafifçe yukarı kaydır (yer düzleminden yukarıda göster)
          gltf.scene.position.y += size.y * 0.4;
          
          // Model çok büyükse ölçekle
          const maxDimension = Math.max(size.x, size.y, size.z);
          if (maxDimension > 3) {
            const scale = 3 / maxDimension;
            gltf.scene.scale.setScalar(scale);
            console.log('Model ölçeklendirildi:', scale);
          }
          
          // Malzeme kalitesini artır
          gltf.scene.traverse(obj => {
            if (obj.isMesh) {
              // Gölgeler için
              obj.castShadow = true;
              obj.receiveShadow = true;
              
              // Materyal varsa kaliteyi artır
              if (obj.material) {
                if (Array.isArray(obj.material)) {
                  obj.material.forEach(mat => {
                    mat.envMapIntensity = 0.8;
                    mat.needsUpdate = true;
                  });
                } else {
                  obj.material.envMapIntensity = 0.8;
                  obj.material.needsUpdate = true;
                }
              }
            }
          });
          
          this.root.add(gltf.scene);
          this.vehicleModel = gltf.scene;
          console.log('Model sahneye eklendi');
          
          // Kamerayı model boyutuna göre ayarla: daha yakın başlasın
          const fitBox = new THREE.Box3().setFromObject(gltf.scene);
          const fitSphere = fitBox.getBoundingSphere(new THREE.Sphere());
          const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
          let fitDist = fitSphere.radius / Math.tan(fovRad * 0.5);
          fitDist = Math.max(fitDist * 0.85, 0.75); // bir tık daha yakın ve minimum mesafe
          const dir = this.camera.position.clone().normalize();
          this.camera.position.copy(dir.multiplyScalar(fitDist));
          this.camera.lookAt(0,0,0);
          this.camera.updateProjectionMatrix();
          // Derinlik materyalleri vs derlenerek ilk kare gecikmesi azaltılır
          this.renderer.compile(this.scene, this.camera);
          this.animate(); 
        }, 
        (progress) => {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          console.log('Model loading:', percent + '%');
          this.notice(`Loading model: ${percent}%`);
          
          // Clear message when loading is complete
          if (percent === 100) {
            setTimeout(() => {
              this.notice('');
              if (this.noticeEl) this.noticeEl.style.display = 'none';
            }, 500);
          }
        },
        (error) => { 
          console.error('Model loading error:', error);
          this.notice('GLB could not be loaded: ' + error.message); 
        }
      );
      
      this.resize(); 
      window.addEventListener('resize', this.handleResize);
      this.initialized = true; 
      this.notice('');
      
      // Kullanıcıya görünür bir uyarı olmadan temizle
      if (this.noticeEl) this.noticeEl.style.display = 'none';
      
      // Performans ölçüm sonucu
      if (this._startTime) {
        const loadTime = performance.now() - this._startTime;
        console.log(`VehicleViewer initialization completed - time: ${loadTime.toFixed(2)}ms`);
      }
      
    } catch(e) { 
      console.error('VehicleViewer initialization error:', e);
      this.notice('Error: ' + e.message);
    }
  }
  
  notice(msg) { 
    if(this.noticeEl) {
      if (msg && msg.trim() !== '') {
        this.noticeEl.textContent = msg;
        this.noticeEl.style.display = 'block';
      } else {
        this.noticeEl.textContent = '';
        this.noticeEl.style.display = 'none';
      }
    }
  }
  
  addMouseControls() {
    // Durum değişkenleri (animate içinde de kullanılacak)
    this.isMouseDown = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.targetRotationX = 0;
    this.targetRotationY = 0;
    this.lastMouseActivity = Date.now();
    this.autoRotationSpeed = 0.01; // Otomatik dönme hızı (biraz artırıldı)
    
    this.canvas.addEventListener('mousedown', (event) => {
      this.isMouseDown = true;
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
      this.lastMouseActivity = Date.now();
    });
    
    this.canvas.addEventListener('mousemove', (event) => {
      this.lastMouseActivity = Date.now();
      if (!this.isMouseDown) return;
      
      const deltaX = event.clientX - this.mouseX;
      const deltaY = event.clientY - this.mouseY;
      
      this.targetRotationY += deltaX * 0.01;
      this.targetRotationX += deltaY * 0.01;
      
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
    });
    
    this.canvas.addEventListener('mouseup', () => {
      this.isMouseDown = false;
      this.lastMouseActivity = Date.now();
    });
    this.canvas.addEventListener('mouseleave', () => { this.isMouseDown = false; });
    
    this.canvas.addEventListener('wheel', (event) => {
      const delta = event.deltaY * 0.001;
      this.camera.position.multiplyScalar(1 + delta);
      this.lastMouseActivity = Date.now();
      event.preventDefault();
    });
  }
  
  resize() {
    // requestAnimationFrame ile resize işlemini optimize et 
    if (this._resizeScheduled) return;
    this._resizeScheduled = true;
    
    requestAnimationFrame(() => {
      this._resizeScheduled = false;
      if (!this.canvas) return;
      
      const rect = this.canvas.getBoundingClientRect();
      // Performans için cihaz piksel oranını düşük değerde sabitleyebiliriz
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5); // Maksimum 1.5x piksel oranı kullan
      this.canvas.width = Math.max(1, Math.round(rect.width * ratio)); 
      this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
      
      if(this.renderer && this.camera) { 
        this.renderer.setPixelRatio(ratio); 
        this.renderer.setSize(rect.width, rect.height, false); 
        this.camera.aspect = rect.width / Math.max(1, rect.height); 
        this.camera.updateProjectionMatrix(); 
        // Yeniden boyutlandırma sonrası bir kerelik render
        if (this.scene) this.renderer.render(this.scene, this.camera);
      }
    });
  }
  
  animate() { 
    if(!this.renderer) return; 
    console.log('Animasyon başlatılıyor...');
    
    // Performans için değişkenler
  this.lastFrameTime = 0;
  this.frameDelta = 0;
  this.targetFps = 60; // Daha akıcı hedef FPS
  this.frameInterval = 1000 / this.targetFps;
  this.isVisible = true;
  this._adaptiveCounter = 0; // Adaptif kalite kontrol
  this._slowFrames = 0;
  this._fastFrames = 0;
  this._qualityLevel = 1; // 0: düşük, 1: orta, 2: yüksek
    
    // Görünürlük durumu takibi için
    this.visibilityObserver = new IntersectionObserver((entries) => {
      this.isVisible = entries[0].isIntersecting;
    }, { threshold: 0.1 });
    
    if (this.canvas) {
      this.visibilityObserver.observe(this.canvas);
    }
    
    const render = (timestamp) => { 
      requestAnimationFrame(render);
      if (!this.isVisible) return; // Görünmüyorsa hiçbir şey yapma

      // FPS sınırlama & ölçüm
      this.frameDelta = timestamp - this.lastFrameTime;
      if (this.frameDelta < this.frameInterval) return; // hedef FPS üzerinde çalış
      const realFps = 1000 / this.frameDelta;
      this.lastFrameTime = timestamp - (this.frameDelta % this.frameInterval);

      // Adaptif kalite (her 60 ölçümde bir ayar dene)
      this._adaptiveCounter++;
      if (realFps < this.targetFps * 0.7) this._slowFrames++; else this._slowFrames = Math.max(0, this._slowFrames-1);
      if (realFps > this.targetFps * 0.9) this._fastFrames++; else this._fastFrames = Math.max(0, this._fastFrames-1);
      if (this._adaptiveCounter >= 60) { // ~1 sn (60 fps hedefi varsayımı)
        if (this._slowFrames > 15 && this._currentPixelRatio > this._minPixelRatio) {
          // Yavaş -> kalite düşür
            this._currentPixelRatio = Math.max(this._minPixelRatio, (this._currentPixelRatio - 0.1));
            this.renderer.setPixelRatio(this._currentPixelRatio);
            // Çok yavaşsa gölgeleri kapat
            if (this.renderer.shadowMap.enabled && this._currentPixelRatio <= (this._minPixelRatio + 0.05)) {
              this.renderer.shadowMap.enabled = false;
            }
        } else if (this._fastFrames > 40 && this._currentPixelRatio < this._maxPixelRatio) {
          // Hızlı -> kalite artır (güneş gölgesi isteğe bağlı tekrar açılabilir)
            this._currentPixelRatio = Math.min(this._maxPixelRatio, (this._currentPixelRatio + 0.1));
            this.renderer.setPixelRatio(this._currentPixelRatio);
            if (!this.renderer.shadowMap.enabled && this._currentPixelRatio > 1.2) {
              this.renderer.shadowMap.enabled = true; // yeterince hızlıysa aç
            }
        }
        this._adaptiveCounter = 0; this._slowFrames = 0; this._fastFrames = 0;
      }

      // Auto-rotate: 3sn inaktif ise hedef dönüşü arttır
      if (this.vehicleModel && this.root) {
        const idle = Date.now() - (this.lastMouseActivity||0) > 3000 && !this.isMouseDown;
        if (idle) this.targetRotationY += this.autoRotationSpeed;
        // Lerp ile yumuşak hareket
        this.root.rotation.y += (this.targetRotationY - this.root.rotation.y) * 0.12;
        this.root.rotation.x += (this.targetRotationX - this.root.rotation.x) * 0.12;
      }

      this.renderer.render(this.scene, this.camera);
    }; 
    
    render(0); 
    console.log('Render döngüsü başladı');
  }
}
