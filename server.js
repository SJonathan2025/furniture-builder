// server.js - Backend for Furniture Scene Renderer
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Your OpenAI API Key - stored securely as environment variable
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Scene configurations
const SCENE_CONFIGS = {
    studio_wit: {
        prompt: "professional product photography in a clean white studio setting with soft even lighting",
        lighting: "soft studio lighting",
        background: "clean white backdrop",
        camera: "product photography angle",
        mood: "clean and minimal"
    },
    scandinavisch: {
        prompt: "cozy Scandinavian living room with natural wood, white walls, minimal decor, warm natural lighting",
        lighting: "warm natural window light",
        background: "scandinavian interior with white walls and wood accents",
        camera: "lifestyle photography angle",
        mood: "cozy and natural"
    },
    modern_minimaal: {
        prompt: "modern minimalist living room with clean lines, neutral colors, geometric shapes, bright lighting",
        lighting: "bright clean lighting",
        background: "minimalist interior with clean lines",
        camera: "architectural photography angle",
        mood: "sleek and minimal"
    },
    warm_industrieel: {
        prompt: "warm industrial loft with exposed brick, metal accents, Edison bulbs, warm ambient lighting",
        lighting: "warm ambient lighting with Edison bulbs",
        background: "industrial loft with exposed brick and metal",
        camera: "atmospheric photography angle",
        mood: "warm and industrial"
    },
    japandi: {
        prompt: "Japandi style room with natural materials, neutral tones, plants, zen aesthetics, soft lighting",
        lighting: "soft natural lighting",
        background: "japandi interior with natural materials and plants",
        camera: "zen lifestyle photography angle",
        mood: "calm and natural"
    }
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Main generation endpoint
app.post('/api/generate', upload.single('image'), async (req, res) => {
    try {
        const { style } = req.body;
        const imageFile = req.file;

        // Validation
        if (!imageFile) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        if (!style || !SCENE_CONFIGS[style]) {
            return res.status(400).json({ error: 'Invalid or missing style parameter' });
        }

        const config = SCENE_CONFIGS[style];
        
        // Convert image to base64
        const base64Image = imageFile.buffer.toString('base64');
        const mimeType = imageFile.mimetype;
        const dataUrl = `data:${mimeType};base64,${base64Image}`;

        console.log(`Generating scene for style: ${style}`);

        // Call OpenAI DALL-E 3 API
        const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: `Take this furniture piece and place it naturally in a ${config.prompt}. The furniture should be the main focal point and fit perfectly in the space. Make it look like professional interior design photography with realistic lighting and proportions. High quality, photorealistic, 4K resolution.`,
                n: 1,
                size: "1024x1024",
                quality: "standard",
                response_format: "url"
            })
        });

        if (!openaiResponse.ok) {
            const errorData = await openaiResponse.json();
            console.error('OpenAI API Error:', errorData);
            return res.status(openaiResponse.status).json({ 
                error: errorData.error?.message || 'Failed to generate image' 
            });
        }

        const openaiData = await openaiResponse.json();
        
        // Prepare response with scene metadata
        const sceneData = {
            style: style,
            config: config,
            timestamp: new Date().toISOString(),
            imageUrl: openaiData.data[0].url,
            revised_prompt: openaiData.data[0].revised_prompt || null
        };

        console.log(`Scene generated successfully for style: ${style}`);
        
        res.json({
            success: true,
            imageUrl: openaiData.data[0].url,
            sceneData: sceneData,
            metadata: {
                style: style.replace('_', ' '),
                generatedAt: new Date().toLocaleString('nl-NL'),
                prompt: config.prompt
            }
        });

    } catch (error) {
        console.error('Generation error:', error);
        res.status(500).json({ 
            error: 'Internal server error during image generation',
            details: error.message 
        });
    }
});

// Get available styles
app.get('/api/styles', (req, res) => {
    const styles = Object.keys(SCENE_CONFIGS).map(key => ({
        value: key,
        label: key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        config: SCENE_CONFIGS[key]
    }));
    
    res.json(styles);
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large (max 10MB)' });
        }
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
    console.log(`🚀 Furniture Renderer Server running on port ${PORT}`);
    console.log(`📱 Frontend available at: http://localhost:${PORT}`);
    console.log(`🔌 API endpoint: http://localhost:${PORT}/api/generate`);
});

module.exports = app;