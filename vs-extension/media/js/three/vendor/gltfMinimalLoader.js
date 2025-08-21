// Minimal GLB loader (binary) just to load single scene without full GLTF features.
// Not spec-complete; only handles simple .glb with JSON + BIN buffer, meshes with single bufferView/accessor.
import * as THREE from './three.module.js';
// v2: index (UNSIGNED_INT / UNSIGNED_SHORT) ve normals desteği eklendi

export class GLTFMinimalLoader {
  load(url, onLoad, onProgress, onError){
    fetch(url).then(r=>r.arrayBuffer()).then(ab=>{
      try {
        const dv = new DataView(ab);
        const magic = dv.getUint32(0,true); // 'glTF'
        const version = dv.getUint32(4,true);
        if(version < 2) throw new Error('Unsupported glb version');
        let offset = 12;
        let json=null, bin=null;
        while(offset < ab.byteLength){
          const chunkLen = dv.getUint32(offset,true); offset+=4;
          const chunkType = dv.getUint32(offset,true); offset+=4;
          const chunkData = ab.slice(offset, offset+chunkLen); offset+=chunkLen;
          if(chunkType === 0x4E4F534A){ json = JSON.parse(new TextDecoder().decode(new Uint8Array(chunkData))); }
          else if(chunkType === 0x004E4942){ bin = chunkData; }
        }
        if(!json) throw new Error('No JSON chunk');
        const scene = new THREE.Group();
        // Extremely naive: traverse nodes, build basic Mesh for primitives with POSITION only.
        const buffers = [bin];
        const bufferViews = (json.bufferViews||[]).map(v=> new Uint8Array(buffers[v.buffer], v.byteOffset||0, v.byteLength));
        const accessors = (json.accessors||[]).map(a=>{
          const bv = bufferViews[a.bufferView];
          if(!bv){ console.warn('MinimalLoader: bufferView missing for accessor', a); return null; }
          const compTypeMap = {
            5126: Float32Array, // FLOAT
            5125: Uint32Array,  // UNSIGNED_INT (indices)
            5123: Uint16Array,  // UNSIGNED_SHORT
            5121: Uint8Array    // UNSIGNED_BYTE
          };
          const Comp = compTypeMap[a.componentType];
          if(!Comp){ console.warn('MinimalLoader: unsupported componentType', a.componentType, a); return null; }
          const compCount = bv.byteLength / Comp.BYTES_PER_ELEMENT;
          const arr = new Comp(bv.buffer, bv.byteOffset||0, compCount);
          let itemSize = 3;
          switch(a.type){
            case 'SCALAR': itemSize=1; break;
            case 'VEC2': itemSize=2; break;
            case 'VEC3': itemSize=3; break;
            case 'VEC4': itemSize=4; break;
          }
          return { array: arr, itemSize, componentType:a.componentType, type:a.type };
        });
        (json.meshes||[]).forEach(meshDef=>{
          (meshDef.primitives||[]).forEach(p=>{
            const geo = new THREE.BufferGeometry();
            const posAcc = accessors[p.attributes.POSITION];
            if(posAcc && posAcc.array){
              geo.setAttribute('position', new THREE.BufferAttribute(posAcc.array, posAcc.itemSize));
            }
            // Indices
            if(typeof p.indices === 'number'){
              const idxAcc = accessors[p.indices];
              if(idxAcc && idxAcc.array){
                // Eğer Uint32 ise ve destek yoksa three otomatik extension açmaya çalışır.
                geo.setIndex(new THREE.BufferAttribute(idxAcc.array, 1));
              }
            }
            // Normals varsa ekle, yoksa hesapla (pozisyon var ise)
            if(p.attributes.NORMAL !== undefined){
              const nAcc = accessors[p.attributes.NORMAL];
              if(nAcc && nAcc.array){
                geo.setAttribute('normal', new THREE.BufferAttribute(nAcc.array, nAcc.itemSize));
              }
            } else if(posAcc){
              geo.computeVertexNormals();
            }
            geo.computeBoundingSphere();
            const mat = new THREE.MeshStandardMaterial({color:0x6699cc, roughness:0.9, metalness:0});
            const mesh = new THREE.Mesh(geo, mat);
            scene.add(mesh);
          });
        });
        onLoad && onLoad({ scene });
      } catch(e){ onError && onError(e); }
    }).catch(err=> onError && onError(err));
  }
}
