// console.log("Main script loaded.");
// // Import modules and initialize the app here.
import './style.css';
import { AudioProcessor } from './audio.js';
import { Visualizer } from './visualizer.js';

let audioProcessor = null;
let visualizer = null;

async function initApp() {
    // 1. Get the canvas element
    const canvas = document.getElementById('visualizer-canvas');
    if (!canvas) {
        console.error("Canvas element #visualizer-canvas not found!");
        return;
    }

    // Add a user interaction prompt for AudioContext
    const startButton = document.createElement('button');
    startButton.textContent = 'Click to Start Visualizer';
    startButton.style.position = 'absolute';
    startButton.style.top = '50%';
    startButton.style.left = '50%';
    startButton.style.transform = 'translate(-50%, -50%)';
    startButton.style.padding = '20px';
    startButton.style.fontSize = '20px';
    startButton.style.cursor = 'pointer';
    document.body.appendChild(startButton);

    startButton.addEventListener('click', async () => {
        startButton.style.display = 'none'; // Hide button after click

        try {
            // 2. Initialize Audio Processor
            audioProcessor = new AudioProcessor(1024); // Use fewer bins (512) for less detail/more performance
            const audioReady = await audioProcessor.init();

            if (!audioReady) {
                console.error("Failed to initialize audio. Aborting.");
                // Optionally display a message to the user
                const errorMsg = document.createElement('p');
                errorMsg.textContent = 'Failed to access microphone. Please check permissions and refresh.';
                errorMsg.style.color = 'red';
                errorMsg.style.textAlign = 'center';
                errorMsg.style.position = 'absolute';
                errorMsg.style.top = '60%';
                errorMsg.style.left = '50%';
                errorMsg.style.transform = 'translate(-50%, -50%)';
                document.body.appendChild(errorMsg);
                return;
            }

            // 3. Initialize Visualizer (pass canvas and audio processor)
            visualizer = new Visualizer(canvas, audioProcessor);

            // 4. Start the animation loop
            visualizer.animate();

        } catch (error) {
            console.error("Error during initialization:", error);
            // Handle potential errors during Visualizer setup
        }
    }, { once: true }); // Ensure the listener runs only once
}

// Start the initialization process when the DOM is ready
document.addEventListener('DOMContentLoaded', initApp); 