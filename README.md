# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create a `.env.local` file in the root directory and set your Gemini API key:
   ```
   VITE_GEMINI_API_KEY=your_api_key_here
   ```
   **Note:** The variable must be prefixed with `VITE_` for Vite to expose it to the client.
3. Run the app:
   `npm run dev`

## Deploy to Vercel

1. Push your code to GitHub
2. Import your repository in Vercel
3. **Important:** Add the environment variable in Vercel:
   - Go to your project settings → Environment Variables
   - Add `VITE_GEMINI_API_KEY` with your Gemini API key value
   - Make sure it's available for Production, Preview, and Development
4. Deploy - Vercel will automatically detect Vite and build your app

**Note:** The environment variable must be prefixed with `VITE_` for Vite to expose it to the client-side code.
