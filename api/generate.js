// api/generate.js - Vercel serverless function
import formidable from 'formidable';
import fs from 'fs';

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
        const mimeType = imageFile.mimetype || 'image/jpeg';

        console.log(`Generating scene for style: ${style}`);

        // Call OpenAI DALL-E 3 API
        const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
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
