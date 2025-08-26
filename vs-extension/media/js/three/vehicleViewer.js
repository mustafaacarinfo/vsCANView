export class VehicleViewer {
  constructor(canvas, noticeEl, modelUri){
    this.canvas=canvas; this.noticeEl=noticeEl; this.modelUri=modelUri; this.initialized=false;
    this.handleResize=()=>this.resize();
  }
  async init(){
    try{
      console.log('VehicleViewer başlatılıyor...');
      console.log('Model URI:', this.modelUri);
      // ES6 modül yaklaşımı
  console.log('Three.js ES6 modül olarak yükleniyor (yerel)...');
  // Local module imports to ensure single Three instance in webview
  const THREE = await import(new URL('./vendor/three.module.js', import.meta.url).href);
  console.log('THREE.js yüklendi (local):', THREE);
  const gltfLoaderMod = await import(new URL('./vendor/GLTFLoader.js', import.meta.url).href);
  const { GLTFLoader } = gltfLoaderMod;
  console.log('GLTFLoader yüklendi (local):', GLTFLoader);
      console.log('GLTFLoader yüklendi');
      console.log('GLTFLoader yüklendi');
      this.THREE=THREE;
      this.renderer = new THREE.WebGLRenderer({ canvas:this.canvas, antialias:true, alpha:true });
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      this.camera.position.set(3,2.2,4);
      this.scene.add(new THREE.AmbientLight(0xffffff,0.7));
      const dir=new THREE.DirectionalLight(0xffffff,0.7); dir.position.set(4,8,6); this.scene.add(dir);
      const loader=new GLTFLoader();
      loader.load(this.modelUri, 
        (g)=>{ 
          console.log('Model başarıyla yüklendi');
          this.scene.add(g.scene); 
          this.animate(); 
        }, 
        (progress)=>{
          console.log('Model yükleniyor:', (progress.loaded / progress.total * 100) + '%');
        },
        (e)=>{ 
          console.error('Model yükleme hatası:', e);
          this.notice('GLB yüklenemedi: '+e.message); 
        });
      this.resize(); window.addEventListener('resize', this.handleResize); this.initialized=true; this.notice('');
    }catch(e){ 
      console.error('VehicleViewer başlatma hatası:', e);
      this.notice('Hata: ' + e.message);
    }
  }
  notice(msg){ if(this.noticeEl) this.noticeEl.textContent=msg; }
  resize(){ const r=this.canvas.getBoundingClientRect(), ratio=window.devicePixelRatio||1;
    this.canvas.width=Math.max(1,Math.round(r.width*ratio)); this.canvas.height=Math.max(1,Math.round(r.height*ratio));
    if(this.renderer&&this.camera){ this.renderer.setPixelRatio(ratio); this.renderer.setSize(r.width,r.height,false); this.camera.aspect=r.width/Math.max(1,r.height); this.camera.updateProjectionMatrix(); } }
  animate(){ if(!this.renderer) return; const render=()=>{ requestAnimationFrame(render); this.scene.rotation.y += 0.002; this.renderer.render(this.scene,this.camera); }; render(); }
}
