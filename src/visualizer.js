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
            glitchEnabled: false // Add glitch toggle parameter
        };

        this.currentVertexData = null; // To store displaced vertex heights for decay

        this._initThree();
        this._setupGrid();
        this._setupPostProcessing();
        this._setupGUI();
        this._addEventListeners();
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

        const audioFolder = this.gui.addFolder('Audio Reactivity');
        audioFolder.add(this.params, 'amplitude', 0, 20, 0.1).name('Amplitude');
        audioFolder.add(this.params, 'decay', 0.8, 0.999, 0.001).name('Peak Decay');

        const appearanceFolder = this.gui.addFolder('Appearance');
        appearanceFolder.add(this.params, 'hue', 0, 1, 0.01).name('Hue').onChange(this._updateMaterialColor.bind(this));
        appearanceFolder.add(this.params, 'brightness', 0, 1, 0.01).name('Brightness').onChange(this._updateMaterialColor.bind(this));
        // appearanceFolder.add(this.params, 'lineThickness', 1, 10, 1).name('Line Thickness (Limited)'); // Needs advanced lines

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
            this.gridMesh.scale.set(this.params.scale, this.params.scale, this.params.scale);
            // Optionally, update a GUI slider if you add one for scale later
            // if (this.gui) { /* update scale slider */ }
        }
    }

    // Main update method called in the animation loop
    update() {
        const frequencyData = this.audioProcessor.getFrequencyData();
        if (!frequencyData) return; // Exit if audio not ready

        const positions = this.gridGeometry.attributes.position;
        const vertexCount = positions.count;
        const freqBinCount = this.audioProcessor.getFrequencyBinCount();
        const divisions = this.params.gridResolution;
        const pointsPerSlice = divisions + 1;

        // Map frequency data to grid vertices
        for (let i = 0; i < vertexCount; i++) {
            const currentY = this.currentVertexData[i] || 0;
            let targetY = 0;

            // Map frequency bins along the Z axis (rows of the grid)
            const zIndex = Math.floor(i / pointsPerSlice);
            // Distribute available frequency bins across the grid depth
            const freqIndex = Math.floor((zIndex / pointsPerSlice) * freqBinCount * 0.8); // Use ~80% of bins (skip highest)

            if (freqIndex < freqBinCount) {
                const freqValue = frequencyData[freqIndex] / 255; // Normalize 0-1
                targetY = freqValue * this.params.amplitude;
            }

            // Apply decay: move current towards 0, but jump up if target is higher
            const newY = Math.max(targetY, currentY * this.params.decay);
            positions.setY(i, newY);
            this.currentVertexData[i] = newY; // Store for next frame's decay
        }

        positions.needsUpdate = true; // VERY important: tells Three.js to update buffer

        // Update line thickness if we were using advanced lines
        // this.gridMaterial.linewidth = this.params.lineThickness;

        this.controls.update(); // Update OrbitControls damping
    }

    // Animation loop
    animate() {
        requestAnimationFrame(this.animate.bind(this));

        this.update(); // Update geometry based on audio

        // Render using the composer (which includes post-processing)
        this.composer.render();
        // this.renderer.render(this.scene, this.camera); // Use this if NOT using composer
    }
} 