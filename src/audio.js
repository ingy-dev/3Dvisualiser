// console.log("Audio module loaded.");
// // Web Audio API logic will go here.

export class AudioProcessor {
    constructor(fftSize = 2048) { // fftSize determines the number of frequency bins
        this.fftSize = fftSize;
        this.audioContext = null;
        this.analyserNode = null;
        this.dataArray = null; // Uint8Array for frequency data
        this.timeDomainArray = null; // Uint8Array for waveform data
        this.isInitialized = false;
        this.stream = null;
        this.source = null;
    }

    async init() {
        if (this.isInitialized) return true;

        try {
            // Request microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    // Optional: Disable noise suppression/echo cancellation for raw data
                    // noiseSuppression: false,
                    // echoCancellation: false
                },
                video: false
            });

            // Create AudioContext and AnalyserNode
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = this.fftSize; // Power of 2, min 32, max 32768

            // Connect the microphone stream to the analyser
            this.source = this.audioContext.createMediaStreamSource(this.stream);
            this.source.connect(this.analyserNode);
            // Note: We don't connect the analyser to destination, as we only want analysis data

            // Prepare data arrays
            const bufferLength = this.analyserNode.frequencyBinCount; // half of fftSize
            this.dataArray = new Uint8Array(bufferLength);
            this.timeDomainArray = new Uint8Array(bufferLength); // For waveform

            this.isInitialized = true;
            console.log("AudioProcessor initialized successfully.");
            return true;

        } catch (err) {
            console.error('Error initializing audio:', err);
            alert(`Could not initialize audio: ${err.message}. Please allow microphone access.`);
            this.isInitialized = false;
            return false;
        }
    }

    getFrequencyData() {
        if (!this.isInitialized || !this.analyserNode) return null;
        this.analyserNode.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    getTimeDomainData() {
        if (!this.isInitialized || !this.analyserNode) return null;
        this.analyserNode.getByteTimeDomainData(this.timeDomainArray);
        return this.timeDomainArray;
    }

    getFrequencyBinCount() {
        return this.analyserNode ? this.analyserNode.frequencyBinCount : 0;
    }

    // Optional: Method to stop the audio stream
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.source) {
            this.source.disconnect();
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.isInitialized = false;
        console.log("AudioProcessor stopped.");
    }
} 