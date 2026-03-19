# AgriConnect AI Vision Service

Python FastAPI microservice for crop disease detection and quality grading using Groq Vision AI.

## Setup

```bash
cd python-ai-service

# Create virtual environment
python3 -m venv venv
source venv/bin/activate        # Mac/Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Add your GROQ_API_KEY to .env

# Run
python main.py
# Service starts at http://localhost:5000
```

## API

### POST /analyze

Analyze a crop image or video for disease or grading.

**Form fields:**
- `file` — image (jpg/png/webp) or video (mp4/mov/avi)
- `mode` — `"disease"` or `"grade"`

**Example with curl:**
```bash
# Disease detection
curl -X POST http://localhost:5000/analyze \
  -F "file=@/path/to/crop.jpg" \
  -F "mode=disease"

# Crop grading
curl -X POST http://localhost:5000/analyze \
  -F "file=@/path/to/crop.mp4" \
  -F "mode=grade"
```

## Models Used
- Vision: `meta-llama/llama-4-scout-17b-16e-instruct` (Groq)
- Video: Extracts 5 evenly-spaced frames, analyzes all simultaneously
- Images: Resized to max 1024px for optimal API performance
