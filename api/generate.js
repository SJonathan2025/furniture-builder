// api/generate.js - Vercel serverless function with FLUX
import formidable from 'formidable';
import fs from 'fs';

// Scene configurations optimized for FLUX
const SCENE_CONFIGS = {
    studio_wit: {
        prompt: "Place this furniture in a clean white photography studio with soft professional lighting, keep the furniture design and colors identical, minimal white background, product photography style",
        lighting: "soft studio lighting",
        background: "clean white backdrop",
        camera: "product photography angle",
        mood: "clean and minimal"
    },
    scandinavisch: {
        prompt: "Place this furniture in a cozy Scandinavian living room with natural wood elements, white walls, minimal Nordic decor, warm natural lighting, keep the furniture design identical",
        lighting: "warm natural window light",
        background: "scandinavian interior with white walls and wood accents",
        camera: "lifestyle photography angle",
        mood: "cozy and natural"
    },
    modern_minimaal: {
        prompt: "Place this furniture in a modern minimalist living room with clean lines, neutral colors, contemporary architecture, bright natural lighting, keep the furniture design identical",
        lighting: "bright clean lighting",
        background: "minimalist interior with clean lines",
        camera: "architectural photography angle",
        mood: "sleek and minimal"
    },
    warm_industrieel: {
        prompt: "Place this furniture in a warm industrial loft with exposed brick walls, metal accents, Edison bulb lighting, urban atmosphere, keep the furniture design identical",
        lighting: "warm ambient lighting with Edison bulbs",
        background: "industrial loft with exposed brick and metal",
        camera: "atmospheric photography angle",
        mood: "warm and industrial"
    },
    japandi: {
        prompt: "Place this furniture in a Japandi style room with natural materials, neutral earth tones, plants, zen minimalist aesthetics, soft natural lighting, keep the furniture design identical",
        lighting: "soft natural lighting",
        background: "japandi interior with natural materials and plants",
        camera: "zen lifestyle photography angle",
        mood: "calm and natural"
    }
};

// Disable body parser for file uploads
export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Parse form data
        const form = formidable({
            maxFileSize: 10 * 1024 * 1024, // 10MB
            keepExtensions: true,
        });

        const [fields, files] = await form.parse(req);
        
        const style = Array.isArray(fields.style) ? fields.style[0] : fields.style;
        const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;

        // Validation
        if (!imageFile) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        if (!style || !SCENE_CONFIGS[style]) {
            return res.status(400).json({ error: 'Invalid or missing style parameter' });
        }

        const config = SCENE_CONFIGS[style];
        
        // Read and convert image to base64
        const imageBuffer = fs.readFileSync(imageFile.filepath);
        const base64Image = imageBuffer.toString('base64');
        const dataUrl = `data:${imageFile.mimetype || 'image/jpeg'};base64,${base64Image}`;

        console.log(`Generating scene with FLUX for style: ${style}`);

        // Call Replicate FLUX API
        const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                version: "black-forest-labs/flux-dev",
                input: {
                    image: dataUrl,
                    prompt: config.prompt,
                    num_inference_steps: 28,
                    guidance_scale: 3.5,
                    aspect_ratio: "1:1"
                }
            })
        });

        if (!replicateResponse.ok) {
            const errorData = await replicateResponse.json();
            console.error('Replicate API Error:', errorData);
            return res.status(replicateResponse.status).json({ 
                error: errorData.detail || 'Failed to generate image' 
            });
        }

        const prediction = await replicateResponse.json();
        
        // Poll for completion
        let result = prediction;
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max

        while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
            
            const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
                headers: {
                    'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
                }
            });

            if (pollResponse.ok) {
                result = await pollResponse.json();
            }
            attempts++;
        }

        if (result.status === 'failed') {
            console.error('FLUX generation failed:', result.error);
            return res.status(500).json({ 
                error: 'Image generation failed',
                details: result.error 
            });
        }

        if (result.status !== 'succeeded') {
            console.error('FLUX generation timed out');
            return res.status(500).json({ 
                error: 'Image generation timed out' 
            });
        }

        // Get the generated image URL
        const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output;

        // Prepare response with scene metadata
        const sceneData = {
            style: style,
            config: config,
            timestamp: new Date().toISOString(),
            imageUrl: imageUrl,
            model: 'flux-dev'
        };

        console.log(`Scene generated successfully with FLUX for style: ${style}`);
        
        res.json({
            success: true,
            imageUrl: imageUrl,
            sceneData: sceneData,
            metadata: {
                style: style.replace('_', ' '),
                generatedAt: new Date().toLocaleString('nl-NL'),
                prompt: config.prompt,
                model: 'FLUX-dev'
            }
        });

        // Clean up temp file
        try {
            fs.unlinkSync(imageFile.filepath);
        } catch (err) {
            console.warn('Could not delete temp file:', err);
        }

    } catch (error) {
        console.error('Generation error:', error);
        res.status(500).json({ 
            error: 'Internal server error during image generation',
            details: error.message 
        });
    }
}
