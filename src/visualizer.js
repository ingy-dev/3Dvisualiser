// console.log("Visualizer module loaded.");
// // Three.js visualization logic will go here.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmShader } from 'three/examples/jsm/shaders/FilmShader.js'; // For CRT
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js'; // For Chromatic Aberration
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js'; // For Motion Blur
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js'; // For Glitch Effect
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; // Import GLTFLoader
import GUI from 'lil-gui';

export class Visualizer {
    constructor(canvasElement, audioProcessor) {
        this.canvas = canvasElement;
        this.audioProcessor = audioProcessor;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.composer = null;
        this.bloomPass = null;
        this.filmPass = null;
        this.rgbShiftPass = null;
        this.afterimagePass = null;
        this.glitchPass = null;
        this.gridMesh = null;
        this.gridGeometry = null;
        this.gridMaterial = null;
        this.gui = null;
        this.gltfLoader = null; // Add loader instance
        this.loadedObject = null; // To store the loaded model group
        this.originalModelPositions = null; // To store original vertex data
        this.originalModelNormals = null; // Store original normals
        this.modelIsLoaded = false; // Flag
        this.reactiveMeshesData = []; // Array to hold data for all reactive meshes { mesh, geometry, originalPositions, originalNormals, currentVertexData }
        this.isFullscreen = false; // Track fullscreen state

        this.params = {
            hue: 0.6, // Start with blue/cyan
            brightness: 0.5,
            glow: 1.0,
            amplitude: 5.0,
            lineThickness: 1, // Note: WebGL line width support is limited
            crtAmount: 0.2, // Intensity of scan lines/noise
            chromaticAberration: 0.0015,
            gridResolution: 10, // Segments along width/height
            decay: 0.95, // How fast peaks fall (closer to 1 is slower)
            scale: 1.0,
            motionBlur: 0.85, // Add motion blur parameter (0 = none, closer to 1 = more blur)
            glitchEnabled: false, // Add glitch toggle parameter
            autoRotate: true, // Add auto-rotate toggle
            autoRotateSpeed: 0.005, // Add auto-rotate speed
            autoRotateReverse: false // Add reverse rotation toggle
        };

        this.currentVertexData = null; // To store displaced vertex heights for decay

        this._initThree();
        this._setupGrid();
        this._setupPostProcessing();
        this._setupGUI();
        this._addEventListeners();
        this._initLoaders(); // Initialize loaders
    }

    _initThree() {
        // Scene
        this.scene = new THREE.Scene();

        // Camera
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        this.camera.position.set(0, 30, 50); // Position camera slightly above and back
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Lights (optional, basic material doesn't need much)
        // const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        // this.scene.add(ambientLight);
    }

    _setupGrid() {
        const size = 10;
        const divisions = this.params.gridResolution;
        this.gridGeometry = new THREE.PlaneGeometry(size, size, divisions, divisions);

        this.gridMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setHSL(this.params.hue, 1.0, this.params.brightness),
            wireframe: true,
            // linewidth: this.params.lineThickness // Often ignored by WebGL
        });

        this.gridMesh = new THREE.Mesh(this.gridGeometry, this.gridMaterial);
        this.gridMesh.rotation.x = -Math.PI / 2; // Rotate plane to be flat on XZ
        this.scene.add(this.gridMesh);

        // Initialize data for decay calculation
        const vertexCount = this.gridGeometry.attributes.position.count;
        this.currentVertexData = new Float32Array(vertexCount); // Store Y values
    }

    _setupPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        // 1. Render Pass (renders the original scene)
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // 2. Bloom Pass (Glow)
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            this.params.glow, // strength
            0.4, // radius (adjust as needed)
            0.85 // threshold (adjust as needed)
        );
        this.composer.addPass(this.bloomPass);

        // 3. Film Pass (CRT Effect)
        this.filmPass = new ShaderPass(FilmShader);

        // Set available uniforms
        if (this.filmPass.uniforms.intensity) {
            this.filmPass.uniforms.intensity.value = this.params.crtAmount * 0.5; // Use intensity for overall effect
        } else {
            console.warn('FilmShader uniform \'intensity\' not found!');
        }
        // Keep grayscale setting if needed, otherwise remove
        if (this.filmPass.uniforms.grayscale) {
            this.filmPass.uniforms.grayscale.value = 0; // 0 = color, 1 = grayscale
        } else {
            console.warn('FilmShader uniform \'grayscale\' not found!');
        }

        this.composer.addPass(this.filmPass);

        // 4. RGB Shift Pass (Chromatic Aberration)
        this.rgbShiftPass = new ShaderPass(RGBShiftShader);
        this.rgbShiftPass.uniforms['amount'].value = this.params.chromaticAberration;
        this.composer.addPass(this.rgbShiftPass);

        // 5. Afterimage Pass (Motion Blur)
        this.afterimagePass = new AfterimagePass(this.params.motionBlur); // Pass initial damp factor
        this.composer.addPass(this.afterimagePass);

        // 6. Glitch Pass
        this.glitchPass = new GlitchPass();
        this.glitchPass.enabled = this.params.glitchEnabled; // Initially disabled
        this.composer.addPass(this.glitchPass);
    }

    _setupGUI() {
        this.gui = new GUI();
        this.gui.title('Visual Controls');

        // --- Model Loading Button ---
        const modelActions = {
            uploadModel: () => {
                document.getElementById('model-upload').click(); // Trigger hidden input
            }
        };
        this.gui.add(modelActions, 'uploadModel').name('Upload Model (.glb)');
        // ---------------------------

        const audioFolder = this.gui.addFolder('Audio Reactivity');
        audioFolder.add(this.params, 'amplitude', 0, 20, 0.1).name('Amplitude');
        audioFolder.add(this.params, 'decay', 0.8, 0.999, 0.001).name('Peak Decay');

        const appearanceFolder = this.gui.addFolder('Appearance');
        appearanceFolder.add(this.params, 'hue', 0, 1, 0.01).name('Hue').onChange(this._updateMaterialColor.bind(this));
        appearanceFolder.add(this.params, 'brightness', 0, 1, 0.01).name('Brightness').onChange(this._updateMaterialColor.bind(this));
        // appearanceFolder.add(this.params, 'lineThickness', 1, 10, 1).name('Line Thickness (Limited)'); // Needs advanced lines

        // --- Auto Rotation Controls ---
        const rotationFolder = this.gui.addFolder('Rotation');
        rotationFolder.add(this.params, 'autoRotate').name('Auto Rotate');
        rotationFolder.add(this.params, 'autoRotateSpeed', 0, 0.05, 0.001).name('Rotate Speed');
        rotationFolder.add(this.params, 'autoRotateReverse').name('Reverse');
        // -----------------------------

        const effectsFolder = this.gui.addFolder('Effects');
        effectsFolder.add(this.params, 'glow', 0, 3, 0.05).name('Glow Strength').onChange(val => {
            if (this.bloomPass) this.bloomPass.strength = val;
        });
        effectsFolder.add(this.params, 'crtAmount', 0, 1, 0.01).name('CRT Effect').onChange(val => {
            // Update the 'intensity' uniform
            if (this.filmPass && this.filmPass.uniforms.intensity) {
                this.filmPass.uniforms.intensity.value = val * 0.5; // Adjust multiplier as needed
            }
        });
        effectsFolder.add(this.params, 'chromaticAberration', 0, 0.01, 0.0001).name('Chromatic Aberration').onChange(val => {
            if (this.rgbShiftPass && this.rgbShiftPass.uniforms.amount) {
                this.rgbShiftPass.uniforms.amount.value = val;
            }
        });
        // Add Motion Blur Slider
        effectsFolder.add(this.params, 'motionBlur', 0, 0.99, 0.01).name('Motion Blur').onChange(val => {
            if (this.afterimagePass) {
                this.afterimagePass.uniforms['damp'].value = val;
            }
        });
        // Add Glitch Toggle
        effectsFolder.add(this.params, 'glitchEnabled').name('Enable Glitch').onChange(val => {
            if (this.glitchPass) {
                this.glitchPass.enabled = val;
            }
        });

        // Note: Changing grid resolution requires recreating geometry, more complex
        // appearanceFolder.add(this.params, 'gridResolution', 10, 100, 1).name('Grid Resolution (Requires Reload)');
    }

    _updateMaterialColor() {
        this.gridMaterial.color.setHSL(this.params.hue, 1.0, this.params.brightness);
    }

    _addEventListeners() {
        window.addEventListener('resize', this._onWindowResize.bind(this), false);
        // Add wheel listener for scaling
        this.canvas.addEventListener('wheel', this._onMouseWheel.bind(this), { passive: false });
        // Add listener for file input change
        document.getElementById('model-upload').addEventListener('change', this._onFileSelected.bind(this), false);

        // Fullscreen listeners
        this.canvas.addEventListener('dblclick', this._toggleFullScreen.bind(this), false);
        window.addEventListener('keydown', this._onKeyDown.bind(this), false);
        document.addEventListener('fullscreenchange', this._onFullScreenChange.bind(this), false);
    }

    _onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);

        // Update bloom pass resolution if needed
        this.bloomPass.resolution.set(width, height);
    }

    // Add wheel handler
    _onMouseWheel(event) {
        event.preventDefault(); // Prevent default page scrolling

        const scaleFactor = 0.1; // How much to scale per wheel tick
        const delta = event.deltaY > 0 ? -scaleFactor : scaleFactor; // Negative deltaY for scroll down (zoom out)

        let newScale = this.params.scale + delta;
        newScale = Math.max(0.1, Math.min(newScale, 5.0)); // Clamp scale between 0.1 and 5.0

        if (newScale !== this.params.scale) {
            this.params.scale = newScale;
            // Apply scale to the correct object
            const targetObject = this.modelIsLoaded ? this.loadedObject : this.gridMesh;
            if (targetObject) {
                targetObject.scale.set(this.params.scale, this.params.scale, this.params.scale);
            }
            // Optionally, update a GUI slider if you add one for scale later
            // if (this.gui) { /* update scale slider */ }
        }
    }

    // --- Fullscreen Handling ---
    _onKeyDown(event) {
        if (event.code === 'Space') {
            event.preventDefault(); // Prevent space bar from scrolling page
            this._toggleFullScreen();
        }
    }

    _toggleFullScreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                alert(`Could not enter fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    _onFullScreenChange() {
        this.isFullscreen = !!document.fullscreenElement;
        if (this.isFullscreen) {
            this.gui.hide();
            this.canvas.style.cursor = 'none';
        } else {
            this.gui.show();
            this.canvas.style.cursor = 'auto';
        }
        // It might be necessary to trigger a resize event handler after a short delay
        // to ensure canvas/renderer size is correct after fullscreen change, especially exit.
        setTimeout(() => this._onWindowResize(), 50);
    }
    // --- End Fullscreen Handling ---

    // Add file selection handler
    _onFileSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Basic check for .glb extension (optional but good practice)
        if (!file.name.toLowerCase().endsWith('.glb')) {
            console.warn('Selected file is not a .glb file:', file.name);
            alert('Please select a .glb file.');
             // Clear the input value 
            event.target.value = null;
            return;
        }

        console.log(`File selected: ${file.name}, type: ${file.type}`);

        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            const contents = loadEvent.target.result; // This should be an ArrayBuffer for GLB
            const fileName = file.name;
            console.log(`Reading GLB file: ${fileName}`);
            this._loadModel(contents, fileName); // Pass ArrayBuffer directly
        };

        reader.onerror = (errorEvent) => {
            console.error("FileReader error:", errorEvent);
            alert("Error reading file.");
        };

        // Read as ArrayBuffer initially, works for GLB and can be decoded for GLTF
        reader.readAsArrayBuffer(file);
    }

    // Add loader initialization
    _initLoaders() {
        this.gltfLoader = new GLTFLoader();
    }

    // Add model loading placeholder
    _loadModel(data, fileName) {
        console.log(`Attempting to load model: ${fileName}`);
        // Loader logic will go here in the next step
        this.gltfLoader.parse(data, '', 
            (gltf) => {
                console.log('GLTF loaded successfully:', gltf);
                // Process the loaded model (next step)
                this._processLoadedModel(gltf);
            },
            (error) => {
                console.error('Error loading GLTF model:', error);
                alert(`Failed to load model: ${error.message || error}`);
            }
        );
    }

    _processLoadedModel(gltf) {
        console.log('Processing loaded model...');

        // 1. Cleanup previous model if any
        if (this.loadedObject) {
            this.scene.remove(this.loadedObject);
            // Optional: Dispose geometry/material if needed
            this.loadedObject = null;
        }
        // Clear reactive mesh data
        this.reactiveMeshesData = [];
        this.modelIsLoaded = false;

        const loadedScene = gltf.scene || gltf.scenes[0];
        let foundMesh = false; // Track if at least one mesh was found

        // 2. Find ALL Meshes, apply material, store data, remove lights
        loadedScene.traverse((child) => {
            if (child.isMesh) {
                console.log('Found mesh in loaded model:', child);
                foundMesh = true;
                child.material = this.gridMaterial; // Apply override material

                // Ensure geometry has normals
                if (!child.geometry.attributes.normal) {
                    console.log('Geometry missing normals, computing for:', child.name);
                    child.geometry.computeVertexNormals();
                }

                 // Store data for this mesh
                const geometry = child.geometry;
                const originalPositions = geometry.attributes.position.clone();
                const originalNormals = geometry.attributes.normal.clone();
                const vertexCount = originalPositions.count;
                const currentVertexData = new Float32Array(vertexCount); // Initialize decay data

                this.reactiveMeshesData.push({
                    mesh: child,
                    geometry: geometry,
                    originalPositions: originalPositions,
                    originalNormals: originalNormals,
                    currentVertexData: currentVertexData
                });
                console.log(`Stored data for mesh: ${child.name || 'Unnamed'}, Vertex count: ${vertexCount}`);

            } else if (child.isLight) {
                console.log('Removing light found in loaded model:', child);
                child.removeFromParent(); // Remove lights from the loaded scene group
            }
        });

        if (!foundMesh) {
            console.error('No mesh found in the loaded GLTF scene.');
            alert('Could not find a usable mesh within the loaded model.');
            this._setupGrid(); // Re-add grid if no model mesh found
            return;
        }

        // 3. Store the whole group, add to scene, remove grid
        this.loadedObject = loadedScene;

        if (this.gridMesh) {
            this.scene.remove(this.gridMesh);
            this.gridMesh = null; // Make sure we don't try to update it
        }
        this.scene.add(this.loadedObject);

        // 4. Apply current scale to the parent object
        this.loadedObject.scale.set(this.params.scale, this.params.scale, this.params.scale);

        // 5. Set flag
        this.modelIsLoaded = true;
        console.log(`Model processed successfully. Found ${this.reactiveMeshesData.length} meshes.`);

        // Optional: Adjust camera to frame the model
        // this._frameObject(this.loadedObject);
    }

    // Optional helper to frame the object
    _frameObject(object) {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Basic framing logic (adjust as needed)
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5; // Zoom out a bit

        this.camera.position.set(center.x, center.y, center.z + cameraZ);
        this.controls.target.copy(center);
        this.controls.update();
    }

    // Main update method called in the animation loop
    update() {
        const frequencyData = this.audioProcessor.getFrequencyData();
        if (!frequencyData) return; // Exit if audio not ready

        const freqBinCount = this.audioProcessor.getFrequencyBinCount();

        if (this.modelIsLoaded && this.reactiveMeshesData.length > 0) {
            // --- Update Vertices for EACH Reactive Model Mesh ---
            const targetAmplitude = this.params.amplitude / 5; // Scale amplitude for model displacement
            const tempPosition = new THREE.Vector3();
            const tempNormal = new THREE.Vector3();

            // Iterate through each mesh we stored data for
            this.reactiveMeshesData.forEach(meshData => {
                const { geometry, originalPositions, originalNormals, currentVertexData } = meshData;
                const positions = geometry.attributes.position;
                const normals = geometry.attributes.normal; // Use computed/loaded normals
                const vertexCount = positions.count;

                for (let i = 0; i < vertexCount; i++) {
                    const currentDisplacement = currentVertexData[i] || 0;
                    let targetDisplacement = 0;

                    // Map frequency bins sequentially to vertices (simple mapping for this mesh)
                    // Use ~80% of bins (skip highest frequencies)
                    const freqIndex = i % Math.floor(freqBinCount * 0.8);

                    if (freqIndex < freqBinCount) {
                        const freqValue = frequencyData[freqIndex] / 255; // Normalize 0-1
                        targetDisplacement = freqValue * targetAmplitude;
                    }

                    // Apply decay
                    const displacement = Math.max(targetDisplacement, currentDisplacement * this.params.decay);
                    currentVertexData[i] = displacement; // Store for next frame's decay

                    // Get original position and normal for this vertex
                    tempPosition.fromBufferAttribute(originalPositions, i);
                    tempNormal.fromBufferAttribute(originalNormals, i);

                    // Calculate new position along the normal
                    tempPosition.addScaledVector(tempNormal, displacement);

                    // Update the geometry attribute for this mesh
                    positions.setXYZ(i, tempPosition.x, tempPosition.y, tempPosition.z);
                }

                positions.needsUpdate = true; // VERY important for this mesh's geometry
            });

        } else if (this.gridMesh && this.gridGeometry) {
            // --- Update Grid Vertices (Fallback Logic) ---
            const positions = this.gridGeometry.attributes.position;
            const vertexCount = positions.count;
            const divisions = this.params.gridResolution;
            const pointsPerSlice = divisions + 1;
            const targetAmplitude = this.params.amplitude; // Use original amplitude for grid
            // Get the single currentVertexData array for the grid (assuming it's still needed if grid exists)
            let gridVertexData = this.currentVertexData; // We need to ensure this exists if grid is active
             if (!gridVertexData && vertexCount > 0) { // Initialize if somehow missing
                 console.warn("Re-initializing grid vertex data.");
                 gridVertexData = new Float32Array(vertexCount);
                 this.currentVertexData = gridVertexData; // Store it back if we created it
             }

            // Map frequency data to grid vertices
            for (let i = 0; i < vertexCount; i++) {
                const currentY = gridVertexData[i] || 0;
                let targetY = 0;

                // Map frequency bins along the Z axis (rows of the grid)
                const zIndex = Math.floor(i / pointsPerSlice);
                // Distribute available frequency bins across the grid depth
                const freqIndex = Math.floor((zIndex / pointsPerSlice) * freqBinCount * 0.8); // Use ~80% of bins

                if (freqIndex < freqBinCount) {
                    const freqValue = frequencyData[freqIndex] / 255; // Normalize 0-1
                    targetY = freqValue * targetAmplitude;
                }

                // Apply decay: move current towards 0, but jump up if target is higher
                const newY = Math.max(targetY, currentY * this.params.decay);
                positions.setY(i, newY);
                gridVertexData[i] = newY; // Store for next frame's decay
            }

            positions.needsUpdate = true; // VERY important
        }

        // Update line thickness if we were using advanced lines
        // this.gridMaterial.linewidth = this.params.lineThickness;

        this.controls.update(); // Update OrbitControls damping
    }

    // Animation loop
    animate() {
        requestAnimationFrame(this.animate.bind(this));

        // Update controls (for damping)
        this.controls.update();

        // Auto-rotate logic
        if (this.params.autoRotate && this.loadedObject && !this.controls.active) { // Rotate only if enabled, model exists, and user isn't interacting
            const rotationDirection = this.params.autoRotateReverse ? -1 : 1;
            this.loadedObject.rotation.y += this.params.autoRotateSpeed * rotationDirection;
        }

        // Get audio data
        const frequencyData = this.audioProcessor.getFrequencyData();

        this.update(); // Update geometry based on audio

        // Render using the composer (which includes post-processing)
        this.composer.render();
        // this.renderer.render(this.scene, this.camera); // Use this if NOT using composer
    }
} 